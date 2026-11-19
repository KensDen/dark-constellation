// THE WHOLE RECORD OF A RUN, AND THE GHOST (v2.0 R1 to R4; a module of
// their own since v2.0 R6). The debrief and the after-action replay read
// these and a night never does, so they ride in the rooms' chunk and not
// in the one the game and its rooms share (./gameModel.ts has the model a
// night is played through).

import { adversaryPicks } from '../../engine/adversary'
import { planFor } from '../../engine/campaign'
import { holdTonight, rightCall } from '../../engine/holds'
import { newGame, resolveTurn } from '../../engine/reducer'
import { answered, responseOptions } from '../../engine/responses'
import { turnRng } from '../../engine/rng'
import { chainBonusOf, gnssDenied, mitigationOf, orderCost } from '../../engine/rules'
import type { AssetKind, CountermeasureId, GameState, ResolvedEvent, TurnActions } from '../../engine/types'
import { worstCase } from '../../engine/worstCase'
import { nightOf, type Night } from '../night/nightModel'
import { NO_ORDERS, eventDef, exposedOf, spotFor } from './gameModel'

const lastEvents = (after: GameState): ResolvedEvent[] => after.history[after.history.length - 1].events

// Each turn's inputs as the record has them, as the engine takes them:
// read from the events' own fields, so a record replays to itself.
export function inputsOf(state: GameState): TurnActions[] {
  const kindOf = (id: string) => /^t\d+-([A-Za-z]+)-\d+$/.exec(id)?.[1] as AssetKind | undefined
  return state.history.map((r, t) => {
    const buyCounters = state.scenario.countermeasures.filter((c) => r.purchases.some((p) => p.startsWith(`${c.name} (`))).map((c) => c.id)
    // The assets ordered that turn, by the ids the engine gave them.
    const ids = new Set<string>()
    for (const later of state.history.slice(t)) for (const id of later.ledger.arrivals) if (id.startsWith(`t${r.turn}-`)) ids.add(id)
    for (const p of state.pipeline) if (p.id.startsWith(`t${r.turn}-`)) ids.add(p.id)
    for (const a of state.assets) if (a.id.startsWith(`t${r.turn}-`)) ids.add(a.id)
    const buyAssets = [...ids].sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop())).flatMap((id) => (kindOf(id) ? [{ kind: kindOf(id) as AssetKind }] : []))
    const debris = r.events.find((e) => e.debris)?.debris?.choice
    return {
      buyAssets,
      buyCounters,
      ...(debris ? { debris } : {}),
      responses: r.events.map((e) => e.response?.id ?? null),
      timing: r.events.map((e) => e.timing ?? 0),
      scans: r.scanned ?? [],
      ...(r.sighted ? { sighted: r.sighted } : {}),
      // Where that night's defense was set down, and the call on its hold.
      placeOn: { ...state.placed },
      tiebreak: r.hold && r.hold.call !== 'none' ? r.hold.call : null,
    }
  })
}

// The game played from its seed with these inputs: every state on the way,
// the opening first. Stops where the engine refuses a turn.
export function timeline(state: GameState, inputs: readonly TurnActions[]): GameState[] {
  const out = [newGame(state.scenario, state.seed, state.difficulty, state.posture)]
  try {
    for (let t = 0; out[out.length - 1].status === 'playing' && t < state.scenario.totalTurns; t += 1) {
      const s = out[out.length - 1]
      out.push(resolveTurn(s, inputs[t] ?? { buyAssets: [], buyCounters: [], scans: [] }, turnRng(s.seed, s.turn)))
    }
  } catch {
    // The run so far stands.
  }
  return out
}

// THE NIGHTS OF A RUN, for the after-action replay: each night as the
// night's own model reads it, between the states either side.
export function nightsOf(states: readonly GameState[]): Night[] {
  const out: Night[] = []
  for (let t = 1; t < states.length; t += 1) out.push(nightOf(states[t - 1], states[t]))
  return out
}

// THE WATCH THAT HAS SEEN IT BEFORE: a careful line for the ghost run when
// the debrief has no single change to show. Each night it places the
// defense that answers the move COLDVEIL favors on the first track that
// needs one, while WORST CASE stays at 0 or more, takes the strongest
// answer the budget meets, and burns when the fuel is safe.
function coachOrders(state: GameState): TurnActions {
  let actions: TurnActions = { buyAssets: [], buyCounters: [], scans: [] }
  const denied = gnssDenied(state.conditions, state.scenario)
  for (const read of adversaryPicks(state, state.counters)) {
    const def = eventDef(state, read.least[0])
    if (def.effect.special === 'debrisStrike') continue
    if (def.baseSeverity + chainBonusOf(def, denied) - mitigationOf(def, state.counters) <= 0) continue
    const id = def.counters.find((c) => !state.counters.includes(c))
    if (!id) continue
    const where = spotFor(state, NO_ORDERS, id)
    const next = { ...actions, buyCounters: [id], ...(where ? { placeOn: { [id]: where } } : {}) }
    if (state.credits - orderCost(state, next) >= 0 && worstCase(state, next).value >= 0) {
      actions = next
      break
    }
  }
  // It reads the evidence on a hold, and makes the right call.
  const hold = holdTonight(state)
  if (hold) actions = { ...actions, tiebreak: rightCall(hold) }
  const debris = (planFor(state, state.turn)?.slots ?? []).some((s) => s.fixed === 'debris-conjunction')
  return debris ? { ...actions, debris: worstCase(state, actions).value >= 0 ? 'burn' : 'hold' } : actions
}

export function coachRun(state: GameState): GameState[] {
  const out = [newGame(state.scenario, state.seed, state.difficulty, state.posture)]
  while (out[out.length - 1].status === 'playing') {
    const s = out[out.length - 1]
    const actions = coachOrders(s)
    let responses: (string | null)[] = []
    let after = resolveTurn(s, { ...actions, responses }, turnRng(s.seed, s.turn))
    for (;;) {
      const events = lastEvents(after)
      const i = events.findIndex((ev, k) => ev.left !== undefined && responses[k] === undefined)
      if (i < 0) break
      // It keeps its answers for moves worth one.
      const worth = exposedOf(events[i]) >= 2 || s.turn >= s.scenario.totalTurns
      const pick = worth ? (responseOptions(eventDef(s, events[i].eventId), events[i]).find((o) => o.fits)?.id ?? null) : null
      responses = answered(responses, i, pick)
      after = resolveTurn(s, { ...actions, responses }, turnRng(s.seed, s.turn))
    }
    out.push(after)
  }
  return out
}

export const finalScore = (states: readonly GameState[]): number => states[states.length - 1].history[states[states.length - 1].history.length - 1]?.maiScore ?? 0

// What a run ordered on a night, by short piece name, for the replay.
export function placedOn(night: Night): CountermeasureId[] {
  return night.closing.counters.filter((c) => !night.before.counters.includes(c))
}
