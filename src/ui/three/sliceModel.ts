// THE 3D SLICE'S MODEL (experiment, exp/3d-slice). One night of the real
// game, played through the real engine: nothing here decides an outcome,
// it only asks the engine and reads its record. Pure, so the suite can
// hold it (tests/slice3d.spec.ts) and the scene can be thrown away.
//
// WHICH NIGHT. The slice plays the campaign's third night, from a fresh
// board. Night 1 has one move, so it can show a block or a response and
// never both; night 3 has two tracks (RF pressure on a link, and a quiet
// one against the data), which puts the game's whole decision in one
// minute: one new defense, one response, two moves. The moves are named
// tonight, as the first night of a real run names them (the intel brief
// is free through this turn).

import { DEFAULT_SCENARIO } from '../../content'
import { adversaryPicks } from '../../engine/adversary'
import { newGame, resolveTurn } from '../../engine/reducer'
import { answered, openChoice, responseOptions, type ResponseOption } from '../../engine/responses'
import { turnRng } from '../../engine/rng'
import { countersAfter, exposedOf, mitigationOf } from '../../engine/rules'
import type { Asset, Countermeasure, CountermeasureId, Difficulty, GameState, ResolvedEvent, ThreatEvent, TurnActions } from '../../engine/types'
import { nightOf, type Night, type NightStep } from '../night/nightModel'
import { stopVerb } from '../board/boardModel'

export const SLICE_TURN = 3

export function sliceStart(seed: number, difficulty: Difficulty = 'easy'): GameState {
  return { ...newGame(DEFAULT_SCENARIO, seed, difficulty), turn: SLICE_TURN, briefFreeThrough: SLICE_TURN }
}

export const ordersFor = (defense: CountermeasureId | null): TurnActions => ({ buyAssets: [], buyCounters: defense ? [defense] : [], intelBrief: false })

const resolve = (state: GameState, orders: TurnActions, responses: readonly (string | null)[]): GameState =>
  resolveTurn(state, { ...orders, responses: [...responses] }, turnRng(state.seed, state.turn))

const lastEvents = (after: GameState): ResolvedEvent[] => after.history[after.history.length - 1].events

export const eventDef = (state: GameState, id: string): ThreatEvent => state.scenario.events.find((e) => e.id === id) as ThreatEvent
export const defenseDef = (state: GameState, id: CountermeasureId): Countermeasure => state.scenario.countermeasures.find((c) => c.id === id) as Countermeasure

// A MOVE AS IT IS AIMED, BEFORE THE NIGHT. With the orders as they stand,
// the engine is asked what COLDVEIL plays and at which tile; the answer is
// exactly what the night will do, since the night is the same call.
export interface Aim {
  // Its place in the night, which is also its slot.
  index: number
  def: ThreatEvent
  targetId: string | undefined
  strength: number
  // What the defenses owned once the orders land take off it.
  mitigation: number
  exposed: number
  // The defenses that answer it, best first, with what each does alone.
  answers: { cm: Countermeasure; verb: 'stops' | 'blunts'; ordered: boolean }[]
  // The other moves this slot could have played instead.
  alternatives: ThreatEvent[]
}

export function aimsFor(state: GameState, defense: CountermeasureId | null): Aim[] {
  const orders = ordersFor(defense)
  const events = lastEvents(resolve(state, orders, []))
  const counters = countersAfter(state, orders)
  const reads = adversaryPicks(state, counters)
  const out: Aim[] = []
  events.forEach((ev, index) => {
    const def = eventDef(state, ev.eventId)
    if ((def.kind ?? 'threat') !== 'threat' || def.effect.special === 'debrisStrike') return
    const strength = ev.baseSeverity + ev.chainBonus
    const mitigation = mitigationOf(def, counters)
    out.push({
      index,
      def,
      targetId: ev.targetAssetId,
      strength,
      mitigation,
      exposed: exposedOf(ev),
      answers: def.counters.map((id) => ({ cm: defenseDef(state, id), verb: stopVerb(id, def) === 'stops' ? 'stops' : 'blunts', ordered: defense === id })),
      alternatives: (reads[index]?.candidates ?? []).filter((c) => c.id !== def.id).map((c) => eventDef(state, c.id)),
    })
  })
  return out
}

// THE HAND: the defenses worth offering tonight, which are the ones that
// answer a move COLDVEIL could play in any of tonight's slots, best
// first. Three or four cards, never the catalog of eleven.
export function handFor(state: GameState): Countermeasure[] {
  const seen = new Set<CountermeasureId>()
  for (const read of adversaryPicks(state, state.counters)) {
    for (const c of read.candidates) for (const id of eventDef(state, c.id).counters) seen.add(id)
  }
  return state.scenario.countermeasures.filter((c) => seen.has(c.id) && c.cost <= state.credits)
}

// THE NIGHT, AS FAR AS IT HAS BEEN ANSWERED. The engine resolves the whole
// night with the answers so far; the first move still waiting on one is
// where the night stands (src/engine/responses.ts).
export interface NightNow {
  after: GameState
  night: Night
  // The step waiting on the player, or -1 when every choice is made.
  open: number
}

export function nightNow(state: GameState, defense: CountermeasureId | null, responses: readonly (string | null)[]): NightNow {
  const after = resolve(state, ordersFor(defense), responses)
  return { after, night: nightOf(state, after), open: openChoice(lastEvents(after), responses) }
}

// One answer the night offers, with what the engine says it would do.
export interface Choice {
  // null rides it out.
  id: string | null
  effect: 'block' | 'halve' | 'ride'
  cost: number
  fits: boolean
  why?: 'used' | 'budget'
  // The score's change and the repair bill under this answer.
  score: number
  repair: number
}

export function choicesFor(state: GameState, defense: CountermeasureId | null, responses: readonly (string | null)[], index: number, step: NightStep): Choice[] {
  const outcome = (id: string | null) => {
    const ev = lastEvents(resolve(state, ordersFor(defense), answered(responses, index, id)))[index]
    return { score: Math.round((ev.scoreAfter - ev.scoreBefore) * 10) / 10, repair: ev.repairCost }
  }
  const options: ResponseOption[] = responseOptions(step.def, step.ev, state.difficulty)
  return [
    ...options.map((o): Choice => ({ id: o.id, effect: o.effect, cost: o.cost, fits: o.fits, why: o.why, ...(o.fits ? outcome(o.id) : { score: 0, repair: 0 }) })),
    { id: null, effect: 'ride', cost: 0, fits: true, ...outcome(null) },
  ]
}

export { answered }

// How a step ended, in one word the scene and the cards both read.
export type Verdict = 'blocked' | 'halved' | 'partial' | 'hit'
export function verdictOf(ev: ResolvedEvent): Verdict {
  if (ev.effectiveSeverity === 0) return 'blocked'
  if (ev.response?.effect === 'halve') return 'halved'
  return ev.mitigation > 0 ? 'partial' : 'hit'
}

// Who stopped a blocked move: the response taken tonight, or a defense.
export const blockedBy = (ev: ResolvedEvent): 'response' | 'defense' => (ev.response?.effect === 'block' ? 'response' : 'defense')

export const assetById = (state: GameState, id: string | undefined): Asset | undefined => (id === undefined ? undefined : state.assets.find((a) => a.id === id))

// THE SEED AND THE DOSSIER, HERE AND NOT IMPORTED. The slice's chunk must
// not reach modules the first download carries on their own (the title's
// session and the Dossier's store): a second importer makes the bundler
// split each into a chunk of its own, and the first download has under
// 600 bytes to spare. So the two small things the slice needs of them are
// restated, and tests/slice3d.spec.ts holds each to the original.
export function randomSeed(): number {
  return Math.floor(Math.random() * 999_999_998) + 1
}
export function parseSeed(text: string): number | null {
  return /^\d{1,9}$/.test(text.trim()) && Number(text) > 0 ? Number(text) : null
}
const DOSSIER_KEY = 'dc-dossier'
export function dossier(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(DOSSIER_KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}
export function fileCard(id: string): void {
  const filed = dossier()
  if (filed.has(id)) return
  filed.add(id)
  try {
    localStorage.setItem(DOSSIER_KEY, JSON.stringify([...filed].sort()))
  } catch {
    // Best effort, as the game's own store is.
  }
}
