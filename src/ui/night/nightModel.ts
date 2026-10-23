// THE NIGHT, AS THE PLAYER SEES IT (v1.3 brief 5.5). EXECUTE resolves the
// whole turn in the engine at once; the night then shows it one event at a
// time: the strike on the board, the hit card, and at the close END OF
// TURN with every line that made the budget.
//
// Everything a card says comes from the engine's record of the turn
// (TurnRecord and its ResolvedEvents): which move landed, its strength,
// what was blocked, the target and its integrity either side, the
// condition it left, the points saved, the debris call, the repair bills
// and the whole ledger. Two figures the engine does not record per event,
// so this module carries them forward from the record, with the engine's
// own exported rules:
//   - the board between events, for the score either side of a hit (the
//     hit card's "-d", brief 5.5 item 2) and the tiles and chips the strip
//     shows as each event lands;
//   - the defense streak after each event, which the engine counts the
//     same way and records only at the turn's end.
// tests/night-model.spec.ts proves both land on the engine's after-state
// on every turn of hundreds of games: the board, closed with the ledger,
// is the engine's next state, and the last streak is the record's.
//
// Pure, so the suite sweeps it without a DOM. Since v1.3 Round 3 it
// replaces the v1.1 director's beat derivation (src/director, retired).

import { CONDITION_PRESSURE_PER_SEVERITY, DEPLOY_TURNS, METER_DAMAGE_PER_SEVERITY, mitigationOf, scaled } from '../../engine/reducer'
import { maiScore } from '../../engine/scoring'
import type { AssetKind, Countermeasure, GameState, PendingAsset, ResolvedEvent, ThreatEvent, TurnRecord } from '../../engine/types'
import { callIndex, shortName, stopVerb } from '../board/boardModel'
import type * as copy from './nightCopy'

export type StepKind = 'threat' | 'debris' | 'opportunity'

export interface NightStep {
  kind: StepKind
  ev: ResolvedEvent
  def: ThreatEvent
  // The board either side of this event.
  before: GameState
  after: GameState
  scoreBefore: number
  scoreAfter: number
  // The defense streak after this event (brief 6.8): a threat with
  // nothing through extends it, any point through resets it, and the
  // debris call and an opportunity leave it where it was.
  streak: number
}

export interface Night {
  turn: number
  // The engine's state EXECUTE resolved from.
  before: GameState
  record: TurnRecord
  // The board as the first event arrives: tonight's orders landed and the
  // live conditions pressed.
  opening: GameState
  // The conditions that pressed as it opened, by name (JAMMED), for the
  // HUD's labelled change under COLDVEIL IS MOVING (v1.3 R5).
  pressed: string[]
  steps: NightStep[]
  // The engine's own next state, by identity: END OF TURN shows it.
  closing: GameState
}

const eventDef = (state: GameState, id: string): ThreatEvent => {
  const ev = state.scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`night: unknown event ${id}`)
  return ev
}

// A copy of the fields the night changes; the scenario and the history
// are shared, since nothing here writes them.
function copyBoard(s: GameState): GameState {
  return {
    ...s,
    assets: s.assets.map((a) => ({ ...a })),
    meters: { ...s.meters },
    conditions: s.conditions.map((c) => ({ ...c })),
    pipeline: s.pipeline.map((p) => ({ ...p })),
    counters: [...s.counters],
  }
}

const isOpportunity = (def: ThreatEvent) => (def.kind ?? 'threat') === 'opportunity'

// The assets tonight's orders put in the pipeline, read off the engine's
// ids (t<turn>-<kind>-<n>), wherever they are by the close.
function orderedTonight(after: GameState, turn: number): PendingAsset[] {
  const out: PendingAsset[] = []
  for (const id of [...after.pipeline.map((p) => p.id), ...after.assets.map((a) => a.id)]) {
    const m = /^t(\d+)-([A-Za-z]+)-(\d+)$/.exec(id)
    if (!m || Number(m[1]) !== turn) continue
    const kind = m[2] as AssetKind
    out.push({ id, kind, etaTurns: DEPLOY_TURNS[kind] })
  }
  return out.sort((x, y) => Number(x.id.split('-').pop()) - Number(y.id.split('-').pop()))
}

export function nightOf(before: GameState, after: GameState): Night {
  const record = after.history[after.history.length - 1]
  if (!record || record.turn !== before.turn || after.history.length !== before.history.length + 1) {
    throw new Error('night: after is not the resolution of before')
  }
  const { difficulty } = before
  const board = copyBoard(before)
  // EXECUTE: the orders land.
  board.counters = [...after.counters]
  board.credits = before.credits - record.ledger.ordered
  board.pipeline = [...board.pipeline, ...orderedTonight(after, before.turn)]
  // The live conditions press, read against the defenses owned now.
  const pressed: string[] = []
  for (const c of board.conditions) {
    const def = eventDef(before, c.eventId)
    const pressure = Math.max(0, c.baseSeverity - mitigationOf(def, board.counters))
    if (pressure === 0) continue
    if (!pressed.includes(c.name)) pressed.push(c.name)
    for (const m of def.effect.meters) board.meters[m] = Math.max(0, board.meters[m] - scaled(CONDITION_PRESSURE_PER_SEVERITY * pressure, difficulty))
  }
  const opening = copyBoard(board)

  const steps: NightStep[] = []
  let streak = before.streak
  let shown = opening
  for (const ev of record.events) {
    const def = eventDef(before, ev.eventId)
    const next = copyBoard(shown)
    let kind: StepKind
    if (isOpportunity(def)) {
      kind = 'opportunity'
      next.credits += record.ledger.windfall
    } else if (ev.debris) {
      kind = 'debris'
      next.credits -= ev.debris.fuel
      if (ev.debris.lost && ev.debris.assetId) {
        const a = next.assets.find((x) => x.id === ev.debris!.assetId)
        if (a) a.integrity = 0
      }
    } else {
      kind = 'threat'
      if (ev.effectiveSeverity > 0) {
        for (const m of def.effect.meters) {
          next.meters[m] = Math.max(0, next.meters[m] - scaled(METER_DAMAGE_PER_SEVERITY * ev.effectiveSeverity, difficulty))
        }
      }
      if (ev.integrityAfter !== undefined && ev.targetAssetId !== undefined) {
        const a = next.assets.find((x) => x.id === ev.targetAssetId)
        if (a) a.integrity = ev.integrityAfter
      }
      if (ev.condition) {
        const existing = next.conditions.find((c) => c.eventId === ev.eventId)
        if (existing) existing.remainingTurns = Math.max(existing.remainingTurns, ev.condition.turns)
        else
          next.conditions.push({
            instanceId: `${ev.eventId}-t${before.turn}`,
            eventId: ev.eventId,
            name: ev.condition.name,
            startedTurn: before.turn,
            remainingTurns: ev.condition.turns,
            baseSeverity: def.baseSeverity,
          })
      }
      streak = ev.effectiveSeverity === 0 ? streak + 1 : 0
    }
    next.streak = streak
    steps.push({ kind, ev, def, before: shown, after: next, scoreBefore: maiScore(shown), scoreAfter: maiScore(next), streak })
    shown = next
  }
  return { turn: before.turn, before, record, opening, pressed, steps, closing: after }
}

// THE RESULT PANEL (brief 5.5 item 2): one tile per point of strength,
// the blocked ones first, and the verdict.
export interface Result {
  strength: number
  blocked: number
  through: number
  chained: boolean
  verdict: copy.Verdict
}
export function resultOf(ev: ResolvedEvent): Result {
  const strength = ev.baseSeverity + ev.chainBonus
  const through = ev.effectiveSeverity
  return {
    strength,
    blocked: strength - through,
    through,
    chained: ev.chainBonus > 0,
    verdict: through === 0 ? 'BLOCKED' : through < strength ? 'PARTIAL' : 'HIT',
  }
}

// The score a step cost, to one decimal: 0 when nothing got through.
export const scoreDelta = (step: Pick<NightStep, 'scoreBefore' | 'scoreAfter'>) => Math.round((step.scoreAfter - step.scoreBefore) * 10) / 10

// Which defense the outcome block names: the first in the threat's own
// order that was owned tonight (the engine credits the same one), and the
// first that was not.
export function defensesFor(def: ThreatEvent, owned: readonly string[], scenario: GameState['scenario']) {
  const by = (id: string) => scenario.countermeasures.find((c) => c.id === id) as Countermeasure
  const held = def.counters.find((c) => owned.includes(c))
  const missing = def.counters.find((c) => !owned.includes(c))
  return { held: held ? by(held) : undefined, missing: missing ? by(missing) : undefined }
}

// What a defense answers that the player can name: met or named threats
// only (ruling R1), split into what it stops alone and what it only blunts
// (the stops rule, R6 question 2), this move's group and this move first.
export function stopsKnown(cm: Countermeasure, def: ThreatEvent, scenario: GameState['scenario'], known: ReadonlySet<string>) {
  const all = [def, ...scenario.events.filter((e) => e.id !== def.id && e.counters.includes(cm.id) && known.has(e.id))]
  const of = (verb: 'stops' | 'blunts') => all.filter((e) => (stopVerb(cm.id, e) === 'stops') === (verb === 'stops')).map(shortName)
  const first = stopVerb(cm.id, def) === 'stops' ? 'stops' : 'blunts'
  const second = first === 'stops' ? 'blunts' : 'stops'
  return [
    [first, of(first)],
    [second, of(second)],
  ] as const
}

// THE DEBRIS CALL (brief 5.5 item 5): where the call sits in the night is
// the board's rule (callIndex), since EXECUTE asks it before this chunk
// plays anything.
export { callIndex }
