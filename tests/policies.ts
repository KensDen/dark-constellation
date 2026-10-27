// THE POLICIES OF THE SWEEP GATE (v1.3 brief 7): five, which with Prepared
// also played on EASY are the six rows of the brief's table, and the sweep
// plays all five on both difficulties. Each is a function of
// the state the player sees, returning tonight's orders: the same calls
// the board makes, through the engine's own pick (src/engine/adversary.ts)
// and worst case (src/engine/worstCase.ts), so a policy reads TONIGHT and
// WORST CASE exactly as a player would. Any randomness comes from a
// stream seeded by the game's seed and the turn, so a sweep replays.
//
// Every line plans under the engine's cap, one new defense a night (v1.4,
// NEW_DEFENSES_PER_NIGHT in src/engine/rules.ts): each chooses its one
// defense itself, and nothing cuts its orders afterwards (the R6b
// measurement cut them after the fact, and the record's streak guard
// failed under it). resolveTurn refuses a night with more, so a line that
// broke the cap would stop the sweep rather than move it quietly.
//
// What each one does, as the brief's table says it, and where the brief
// left a choice, the choice made:
//   - BUY EVERYTHING: under the cap, as Ken redefined the row on 24
//     October 2026, the priciest defense it can afford each night, the IR
//     retainer among them (ties in the deck's order), and nothing else.
//     Before the cap it ordered every defense and then assets to the
//     bottom of the budget; spending the rest on assets under the cap goes
//     insolvent in every run, which the v1.4 report records beside it. It
//     burns on the debris night. It never reads WORST CASE.
//   - PREPARED: reads TONIGHT, which names the moves only under the intel
//     brief, so it orders the brief on every night it is not free (while
//     WORST CASE stays at 0 or more). A drone on turn 1, then, slot by
//     slot, the primary defense (or the next one listed) of the move
//     COLDVEIL will take (LIKELY TARGET, or the first of EITHER) while that
//     move is not already blocked and WORST CASE stays at 0 or more, on the
//     first slot that needs one: one order a night under the cap (see
//     preparedLine for the R0b finding, and the line that follows the
//     flag, which the sweep reports beside it). It
//     burns on the debris night when the fuel keeps WORST CASE at 0 or
//     more, and holds otherwise; it never buys the SSA subscription, since
//     at 10 CR and 2 CR a turn to keep it costs more than the one burn it
//     makes free.
//   - NOVICE: follows FIRST ORDERS on turn 1 (a drone, and the primary
//     defense of one exposed move it picks at random, kept only while
//     WORST CASE stays at 0 or more), then one random affordable defense a
//     turn while WORST CASE allows. A coin decides the debris call.
//   - RANDOM LEGAL: each defense, asset kind and the brief offered in a
//     random order, each taken on a coin of 3 in 10 while REMAINING stays
//     at 0 or more and, for a defense, while tonight has no new one yet. A
//     coin decides the debris call.
//   - NOTHING: orders nothing, and holds.

import { adversaryPicks } from '../src/engine/adversary'
import { mulberry32, type Rng } from '../src/engine/rng'
import { briefFree, chainBonusOf, countersAfter, defenseOpen, eventById, gnssDenied, mitigationOf, orderCost } from '../src/engine/rules'
import { planFor } from '../src/engine/campaign'
import { worstCase } from '../src/engine/worstCase'
import { WIN_SCRIPT } from './scripts'
import type { AssetKind, CountermeasureId, GameState, TurnActions } from '../src/engine/types'

export type Policy = (state: GameState) => TurnActions
export type PolicyName = 'buyEverything' | 'prepared' | 'novice' | 'randomLegal' | 'nothing'

export const NO_ORDERS: TurnActions = { buyAssets: [], buyCounters: [], intelBrief: false }

const KINDS: readonly AssetKind[] = ['drone', 'groundStation', 'sat', 'rpoSat']

// A stream of the policy's own, seeded by the game and the turn and salted
// per policy, so it never shares a draw with the engine's streams.
const streamFor = (state: GameState, salt: number): Rng =>
  mulberry32((Math.imul(state.seed ^ salt, 2654435761) ^ Math.imul(state.turn + 1, 40503)) >>> 0)

const fits = (state: GameState, actions: TurnActions) => state.credits - orderCost(state, actions) >= 0
const safe = (state: GameState, actions: TurnActions) => fits(state, actions) && worstCase(state, actions).value >= 0
const withCounter = (actions: TurnActions, id: CountermeasureId): TurnActions => ({ ...actions, buyCounters: [...actions.buyCounters, id] })
const withAsset = (actions: TurnActions, kind: AssetKind): TurnActions => ({ ...actions, buyAssets: [...actions.buyAssets, { kind }] })
const debrisTonight = (state: GameState) =>
  (planFor(state, state.turn)?.slots ?? []).some((s) => s.fixed && eventById(state.scenario, s.fixed).effect.special === 'debrisStrike')

export const nothing: Policy = () => NO_ORDERS

export const buyEverything: Policy = (state) => {
  let actions: TurnActions = { ...NO_ORDERS }
  const priciest = state.scenario.countermeasures
    .filter((cm) => !state.counters.includes(cm.id) && fits(state, withCounter(actions, cm.id)))
    .reduce<(typeof state.scenario.countermeasures)[number] | undefined>((best, cm) => (!best || cm.cost > best.cost ? cm : best), undefined)
  if (priciest) actions = withCounter(actions, priciest.id)
  return debrisTonight(state) ? { ...actions, debris: 'burn' } : actions
}

// The primary defense, or the next one listed, that a move still lacks.
function nextDefenseFor(eventId: string, state: GameState, counters: readonly CountermeasureId[]): CountermeasureId | undefined {
  return eventById(state.scenario, eventId).counters.find((id) => !counters.includes(id))
}

// How a prepared player answers the flag on each slot. 'once': one order
// against the move flagged before it, as the gated Prepared line has
// played since R0. 'follow': again each time the flag moves, as the board
// moves it the moment an order is queued (brief 5.3), until the move it
// lands on is blocked, nothing listed is left for it, or WORST CASE would
// go below 0.
//
// THE R0b FINDING. With 'once', no order for a drawn slot took a point off
// the move that landed there that night, over 500 seeds on both
// difficulties: the reacting adversary (brief 6.3) took the next least
// covered move instead. Four of its seven defenses never touched an event
// in any run, it blocked 1.67 of 9 threats a run, its best streak was 1 in
// every run, and its wins topped out at 75.1 (graded 77.0), under S. That
// is why it graded below Novice on STANDARD (S 0 A 39 against S 30 A 85).
// 'follow' is the same player reading the same board: 100 percent wins and
// 500 S on both difficulties, best streak 4 to 7, which is outside the
// section 7 band of 65 to 85. Which line is the gate's Prepared is Ken's
// ruling; until then the gate keeps 'once' and the sweep reports 'follow'.
// Under one new defense a night (v1.4) the flag can be answered once a
// night, so the two lines meet: both win 79.6 percent on STANDARD with the
// same grades (S 0, A 46), and 100 percent on EASY.
function preparedLine(answer: 'once' | 'follow'): Policy {
  return (state) => {
    // TONIGHT names the moves only under the intel brief (brief 5.3), so a
    // player who reads it orders the brief on every night it is not free.
    let actions: TurnActions = { ...NO_ORDERS, intelBrief: !briefFree(state) && safe(state, { ...NO_ORDERS, intelBrief: true }) }
    if (state.turn === 1 && safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
    const denied = gnssDenied(state.conditions, state.scenario)
    const blocked = (eventId: string, counters: readonly CountermeasureId[]) => {
      const ev = eventById(state.scenario, eventId)
      return ev.effect.special === 'debrisStrike' || ev.baseSeverity + chainBonusOf(ev, denied) - mitigationOf(ev, counters) <= 0
    }
    const reads = adversaryPicks(state, countersAfter(state, actions))
    // One new defense a night: the first slot that takes an order takes
    // tonight's, on either line.
    for (let i = 0; i < reads.length && defenseOpen(state, actions); i += 1) {
      if (answer === 'once') {
        // One defense a slot: the primary (or the next one listed) of the
        // move COLDVEIL will take there, the LIKELY TARGET or the first of
        // EITHER, while that move is not already blocked.
        const counters = countersAfter(state, actions)
        const target = adversaryPicks(state, counters)[i].least[0]
        if (blocked(target, counters)) continue
        const defense = nextDefenseFor(target, state, counters)
        const next = defense ? withCounter(actions, defense) : undefined
        if (next && safe(state, next)) actions = next
        continue
      }
      // Follow the flag: the LIKELY TARGET, or the first open move of
      // EITHER, re-read after every order, until none is left to answer
      // or tonight's one new defense is ordered.
      for (let order = 0; order < state.scenario.countermeasures.length && defenseOpen(state, actions); order += 1) {
        const counters = countersAfter(state, actions)
        const target = adversaryPicks(state, counters)[i].least.find((id) => !blocked(id, counters) && nextDefenseFor(id, state, counters))
        if (!target) break
        const next = withCounter(actions, nextDefenseFor(target, state, counters)!)
        if (!safe(state, next)) break
        actions = next
      }
    }
    if (!debrisTonight(state)) return actions
    return { ...actions, debris: safe(state, actions) ? 'burn' : 'hold' }
  }
}

export const prepared: Policy = preparedLine('once')
export const preparedFollow: Policy = preparedLine('follow')

export const novice: Policy = (state) => {
  const r = streamFor(state, 0x0b5e55ed)
  let actions: TurnActions = { ...NO_ORDERS }
  if (state.turn === 1) {
    // FIRST ORDERS: a drone, a defense that blocks one red move, and WORST
    // CASE kept at 0 or more.
    if (safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
    const moves = adversaryPicks(state, countersAfter(state, actions)).flatMap((read) => read.candidates.map((c) => c.id))
    const move = moves.length > 0 ? r.pick(moves) : undefined
    const defense = move ? nextDefenseFor(move, state, countersAfter(state, actions)) : undefined
    if (defense && safe(state, withCounter(actions, defense))) actions = withCounter(actions, defense)
  } else {
    const options = state.scenario.countermeasures
      .map((cm) => cm.id)
      .filter((id) => !state.counters.includes(id) && safe(state, withCounter(actions, id)))
    if (options.length > 0) actions = withCounter(actions, r.pick(options))
  }
  return debrisTonight(state) ? { ...actions, debris: r.chance(0.5) ? 'burn' : 'hold' } : actions
}

export const randomLegal: Policy = (state) => {
  const r = streamFor(state, 0x7a11d0e5)
  let actions: TurnActions = { ...NO_ORDERS }
  type Option = { kind: 'counter'; id: CountermeasureId } | { kind: 'asset'; asset: AssetKind } | { kind: 'brief' }
  const options: Option[] = [
    ...state.scenario.countermeasures.filter((cm) => !state.counters.includes(cm.id)).map((cm) => ({ kind: 'counter' as const, id: cm.id })),
    ...KINDS.map((asset) => ({ kind: 'asset' as const, asset })),
    { kind: 'brief' },
  ]
  // A Fisher-Yates shuffle on the policy's own stream.
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = r.int(i + 1)
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  for (const option of options) {
    if (!r.chance(0.3)) continue
    if (option.kind === 'counter' && !defenseOpen(state, actions)) continue
    const next =
      option.kind === 'counter' ? withCounter(actions, option.id) : option.kind === 'asset' ? withAsset(actions, option.asset) : { ...actions, intelBrief: true }
    if (fits(state, next)) actions = next
  }
  return debrisTonight(state) ? { ...actions, debris: r.chance(0.5) ? 'burn' : 'hold' } : actions
}

// Buy everything was reported with no target in v1.4.0 (it won 99.6
// percent on STANDARD as one fixed order); since v1.5 R1, with the IR
// retainer's recovery at 4, it is gated again (tests/sweep.spec.ts) and
// back in the grade calibration's population (Ken, 24 October 2026).
// `reported` marks a line the sweep plays outside the gate.
export const POLICIES: readonly { name: PolicyName; label: string; policy: Policy; reported?: true }[] = [
  { name: 'buyEverything', label: 'Buy everything', policy: buyEverything },
  { name: 'prepared', label: 'Prepared', policy: prepared },
  { name: 'novice', label: 'Novice', policy: novice },
  { name: 'randomLegal', label: 'Random legal', policy: randomLegal },
  { name: 'nothing', label: 'Nothing', policy: nothing },
]

// Lines the sweep plays and reports beside the gated ones, outside the
// gate's targets and outside the grade calibration's population
// (tests/grade.spec.ts reads POLICIES): measurements for a ruling, not
// part of the balance yet.
export const REPORTED: readonly { name: string; label: string; policy: Policy }[] = [
  { name: 'preparedFollow', label: 'Prepared, following the flag (R0b)', policy: preparedFollow },
  // THE PREPARED SCRIPT (tests/scripts.ts WIN_SCRIPT), one written order of
  // six defenses played on every seed whatever TONIGHT says. It won all
  // 500 seeds on STANDARD through v1.5; since v1.6 R1 (Ken's ruling of 26
  // October 2026, each seed plays its own order of the campaign) the
  // sweep holds it to no more wins than Prepared (tests/sweep.spec.ts).
  { name: 'preparedScript', label: 'Prepared script (one written order)', policy: (state) => WIN_SCRIPT[state.turn] ?? NO_ORDERS },
]
