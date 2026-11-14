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
//   - PREPARED: since v2.0 R1 it scans (rules.ts, SCANS_PER_NIGHT): one
//     signature in each drawn track, then the next in each, as far as the
//     night's pulses go, and it reads TONIGHT only for what it identified
//     (a fixed slot is CONFIRMED and known). Through v1.7 it ordered the
//     paid brief every night and read every move. A drone on turn 1, then, slot by
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
//   - RANDOM LEGAL: each defense and asset kind offered in a
//     random order, each taken on a coin of 3 in 10 while REMAINING stays
//     at 0 or more and, for a defense, while tonight has no new one yet. A
//     coin decides the debris call.
//   - NOTHING: orders nothing, and holds.

import { adversaryPicks } from '../src/engine/adversary'
import { mulberry32, type Rng } from '../src/engine/rng'
import { chainBonusOf, countersAfter, defenseOpen, eventById, gnssDenied, mitigationOf, orderCost, scanPulses } from '../src/engine/rules'
import { planFor } from '../src/engine/campaign'
import { worstCase } from '../src/engine/worstCase'
import { WIN_SCRIPT } from './scripts'
import type { Responder } from '../src/engine/responses'
import type { AssetKind, CountermeasureId, GameState, TurnActions } from '../src/engine/types'

export type Policy = (state: GameState) => TurnActions

// HOW EACH LINE ANSWERS IN THE NIGHT (v1.7 R1): when a move would land,
// the night offers its responses (src/engine/responses.ts) and the line's
// responder picks one, or rides it out.
//   - RIDE: never answers. Nothing's, and the prepared script's, which is
//     one written order of defenses and nothing else.
//   - SENSIBLE: the strongest response the budget can meet, a block before
//     a halving. Prepared's and Buy everything's.
//   - CARELESS: answers two moves in three, on a stream of its own, with
//     the strongest response the budget can meet, and rides the third out.
//     Novice's and Random legal's: a beginner who taps the answer that
//     sounds best most nights, with no eye on what it leaves for later.
export const ride: Responder = () => null
export const sensible: Responder = ({ options }) => options.find((o) => o.fits)?.id ?? null
export const careless: Responder = ({ state, index, options }) => {
  const r = mulberry32((Math.imul(state.seed ^ 0x5eedbead, 2654435761) ^ Math.imul(state.turn * 8 + index + 1, 40503)) >>> 0)
  return r.chance(2 / 3) ? (options.find((o) => o.fits)?.id ?? null) : null
}
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
// THE SCAN A CAREFUL PLAYER MAKES (v2.0 R1): one signature in each drawn
// track before a second in any, in the night's order, for as many pulses
// as the watch has. `all` is the expert's read: a player who knows every
// signature on sight (the Dossier's lesson) needs no pulse to name one.
export function scanFor(state: GameState): string[] {
  const drawn = (planFor(state, state.turn)?.slots ?? []).filter((s) => !s.fixed).map((s) => s.drawFrom ?? [])
  const out: string[] = []
  for (let depth = 0; depth < 4; depth += 1) for (const ids of drawn) if (ids[depth] && !out.includes(ids[depth])) out.push(ids[depth])
  return out.slice(0, scanPulses(state))
}

function preparedLine(answer: 'once' | 'follow', sight: 'scan' | 'all' = 'scan'): Policy {
  return (state) => {
    // TONIGHT names a move only once the scan has identified it (v2.0 R1).
    const scans = scanFor(state)
    const fixed = (planFor(state, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [s.fixed] : []))
    const known = (id: string) => sight === 'all' || scans.includes(id) || fixed.includes(id)
    let actions: TurnActions = { ...NO_ORDERS, scans }
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
        // The flag shows on a signature the scan identified: LIKELY TARGET,
        // or the first of EITHER it can name. A track whose favored move is
        // still unidentified gets no order tonight.
        const target = adversaryPicks(state, counters)[i].least.find(known)
        if (!target || blocked(target, counters)) continue
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
        const target = adversaryPicks(state, counters)[i].least.find((id) => known(id) && !blocked(id, counters) && nextDefenseFor(id, state, counters))
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
// The expert (v2.0 R1): Prepared's orders with every signature known on
// sight, which is v1.7's Prepared without the brief's 8 CR a night.
export const expert: Policy = preparedLine('once', 'all')

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
  type Option = { kind: 'counter'; id: CountermeasureId } | { kind: 'asset'; asset: AssetKind }
  const options: Option[] = [
    ...state.scenario.countermeasures.filter((cm) => !state.counters.includes(cm.id)).map((cm) => ({ kind: 'counter' as const, id: cm.id })),
    ...KINDS.map((asset) => ({ kind: 'asset' as const, asset })),
  ]
  // A Fisher-Yates shuffle on the policy's own stream.
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = r.int(i + 1)
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  for (const option of options) {
    if (!r.chance(0.3)) continue
    if (option.kind === 'counter' && !defenseOpen(state, actions)) continue
    const next = option.kind === 'counter' ? withCounter(actions, option.id) : withAsset(actions, option.asset)
    if (fits(state, next)) actions = next
  }
  return debrisTonight(state) ? { ...actions, debris: r.chance(0.5) ? 'burn' : 'hold' } : actions
}

// Buy everything was reported with no target in v1.4.0 (it won 99.6
// percent on STANDARD as one fixed order); since v1.5 R1, with the IR
// retainer's recovery at 4, it is gated again (tests/sweep.spec.ts) and
// back in the grade calibration's population (Ken, 24 October 2026).
// `reported` marks a line the sweep plays outside the gate.
export const POLICIES: readonly { name: PolicyName; label: string; policy: Policy; respond: Responder; reported?: true }[] = [
  { name: 'buyEverything', label: 'Buy everything', policy: buyEverything, respond: sensible },
  { name: 'prepared', label: 'Prepared', policy: prepared, respond: sensible },
  { name: 'novice', label: 'Novice', policy: novice, respond: careless },
  { name: 'randomLegal', label: 'Random legal', policy: randomLegal, respond: careless },
  { name: 'nothing', label: 'Nothing', policy: nothing, respond: ride },
]

// Lines the sweep plays and reports beside the gated ones, outside the
// gate's targets and outside the grade calibration's population
// (tests/grade.spec.ts reads POLICIES): measurements for a ruling, not
// part of the balance yet.
export const REPORTED: readonly { name: string; label: string; policy: Policy; respond: Responder; timing?: 1 | 2 }[] = [
  // THE TIMED BLOCK'S LIFT (v2.0 R1): the gated lines with a tap on every
  // move, good (the Assist rate) and perfect. The gate's own lines take
  // none, so the balance never rests on reflexes; these say what the bonus
  // is worth at its most.
  { name: 'noviceAssist', label: 'Novice, Assist rate on every move', policy: novice, respond: careless, timing: 1 },
  { name: 'novicePerfect', label: 'Novice, a perfect tap on every move', policy: novice, respond: careless, timing: 2 },
  { name: 'preparedPerfect', label: 'Prepared, a perfect tap on every move', policy: prepared, respond: sensible, timing: 2 },
  // THE EXPERT (v2.0 R1): every signature known on sight, no pulse spent.
  { name: 'expert', label: 'Expert (knows every signature on sight)', policy: expert, respond: sensible },
  { name: 'preparedFollow', label: 'Prepared, following the flag (R0b)', policy: preparedFollow, respond: sensible },
  // Prepared's orders with every move ridden out (v1.7 R1): what the
  // responses are worth to a player who orders well.
  { name: 'preparedRide', label: 'Prepared, riding every move out', policy: prepared, respond: ride },
  // No orders at all, and the strongest response every time (v1.7 R1):
  // whether the night's answers alone carry a game. The gate holds it
  // under Novice (tests/sweep.spec.ts): orders have to matter.
  { name: 'respondOnly', label: 'Orders nothing, answers every move', policy: nothing, respond: sensible },
  // THE PREPARED SCRIPT (tests/scripts.ts WIN_SCRIPT), one written order of
  // six defenses played on every seed whatever TONIGHT says. It won all
  // 500 seeds on STANDARD through v1.5; since v1.6 R1 (Ken's ruling of 26
  // October 2026, each seed plays its own order of the campaign) the
  // sweep holds it to no more wins than Prepared (tests/sweep.spec.ts).
  { name: 'preparedScript', label: 'Prepared script (one written order)', policy: (state) => WIN_SCRIPT[state.turn] ?? NO_ORDERS, respond: ride },
]

// ====================================================================
// THE 3D GAME'S LINES (v2.0 R2, Ken's rulings of 14 November 2026). The
// gate now plays the rules the 3D game plays (GameState.watch 2): the
// answers are a pool for the operation, a defense hardens the asset it
// sits on, and the policy engine's holds ask for a call. Each line below
// is one of the orders above, with where it sets its defense down and how
// it calls a hold. The lists above stay as they were: the classic board's
// suites read them as a population of lines.
//
// WHERE A LINE PLACES ITS DEFENSE.
//   - SPOT: the spot the piece's card recommends (src/ui/three/gameModel.ts,
//     spotFor), which is what a tap on its first PLACE button does.
//   - RANDOM: any asset the piece can sit on, on a stream of its own.
// HOW A LINE CALLS A HOLD.
//   - READS: the evidence settles it (src/engine/holds.ts), and this line
//     reads it right every time. Prepared's.
//   - SHAKY: right 2 times in 3. The beginner's.
//   - ALWAYS and NEVER: overrides every hold, or lets every block stand
//     (which is also what making no call does). The two extremes the sweep
//     holds under the line that reads.
// HOW A LINE SPENDS ITS ANSWERS.
//   - SENSIBLE (above): answers each move that would land while it has
//     one. Prepared's.
//   - CARELESS (above): answers 2 moves in 3 while it has one. The
//     beginner's.
//   - SAVER: keeps its answers for a move that would land at 2 points or
//     more, or for the last night. The expert's, reported.

import { holdTonight, rightCall } from '../src/engine/holds'
import { domainOf, newDefenses } from '../src/engine/rules'
import { spotFor } from '../src/ui/three/gameModel'
import type { HoldCall } from '../src/engine/types'

export type Caller = (state: GameState) => HoldCall | null
export const reads: Caller = (s) => {
  const h = holdTonight(s)
  return h ? rightCall(h) : null
}
export const alwaysOverride: Caller = () => 'override'
export const neverOverride: Caller = () => 'stand'
export const noCall: Caller = () => null
export const shaky =
  (p: number): Caller =>
  (s) => {
    const h = holdTonight(s)
    if (!h) return null
    const right = rightCall(h)
    return streamFor(s, 0x0ddba115).chance(p) ? right : right === 'override' ? 'stand' : 'override'
  }

export type Placer = (state: GameState, actions: TurnActions) => string | undefined
export const atSpot: Placer = (state, actions) => {
  const id = newDefenses(state, actions)[0]
  return id ? spotFor(state, { defense: null, assets: actions.buyAssets.map((b) => b.kind), scans: actions.scans ?? [] }, id) : undefined
}
export const atRandom: Placer = (state, actions) => {
  const id = newDefenses(state, actions)[0]
  if (!id) return undefined
  const domain = domainOf(state.scenario, id)
  const pool = state.assets.filter((a) => a.integrity > 0 && domain.includes(a.kind))
  return pool.length ? streamFor(state, 0x1234abcd).pick(pool).id : undefined
}

// An orders policy with its placement and its call on tonight's hold.
export const onWatch =
  (orders: Policy, place: Placer, call: Caller): Policy =>
  (state) => {
    const a = orders(state)
    const id = newDefenses(state, a)[0]
    const where = id ? place(state, a) : undefined
    return { ...a, ...(id && where ? { placeOn: { [id]: where } } : {}), tiebreak: call(state) }
  }

export const saver: Responder = ({ state, ev, options }) => {
  const exposed = Math.max(0, ev.baseSeverity + ev.chainBonus - ev.mitigation - (ev.hardened ?? 0))
  const last = state.turn >= state.scenario.totalTurns
  return exposed >= 2 || last ? (options.find((o) => o.fits)?.id ?? null) : null
}

// THE BEGINNER OF THE 3D GAME. The R1 Novice ordered a defense at random
// each night, which was a fair picture of the pixel board's PROCURE list.
// The 3D game's first night teaches three steps by doing (scan, place,
// respond), and its tray lights the pieces that answer what the scan has
// named, so a beginner here does this: scans the first 2 signatures it
// sees, places a piece the tray lights for one of them when there is one,
// and otherwise a piece at random on half the nights; a drone on night 1
// (FIRST ORDERS); WORST CASE kept at 0 or more; a coin on the debris call.
// It never reads which move COLDVEIL favors beyond the tray's light. The
// R1 line is still played and reported beside it (noviceR1 below).
export const beginner: Policy = (state) => {
  const r = streamFor(state, 0x0b5e55ed)
  const slots = planFor(state, state.turn)?.slots ?? []
  const scans = slots.flatMap((s) => (s.fixed ? [] : (s.drawFrom ?? []))).slice(0, scanPulses(state))
  let actions: TurnActions = { ...NO_ORDERS, scans }
  if (state.turn === 1 && safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
  const denied = gnssDenied(state.conditions, state.scenario)
  const hot: CountermeasureId[] = []
  for (const read of adversaryPicks(state, state.counters)) {
    for (const c of read.candidates) {
      if (!scans.includes(c.id) || !read.least.includes(c.id)) continue
      const ev = eventById(state.scenario, c.id)
      if (ev.baseSeverity + chainBonusOf(ev, denied) - c.mitigation <= 0) continue
      const d = ev.counters.find((x) => !state.counters.includes(x))
      if (d && !hot.includes(d) && safe(state, withCounter(actions, d))) hot.push(d)
    }
  }
  if (hot.length) actions = withCounter(actions, r.pick(hot))
  else if (r.chance(0.5)) {
    const options = state.scenario.countermeasures.map((cm) => cm.id).filter((id) => !state.counters.includes(id) && safe(state, withCounter(actions, id)))
    if (options.length) actions = withCounter(actions, r.pick(options))
  }
  return debrisTonight(state) ? { ...actions, debris: r.chance(0.5) ? 'burn' : 'hold' } : actions
}

// THE THRIFTY LINES (the R1 finding, Ken's ruling: a bug). Scan the first
// drawn track as far as the pulses go, place a defense only against a move
// that track favors and the scan named, a drone on night 1, and nothing
// else. `strict` places only against a move flagged alone (LIKELY TARGET);
// otherwise the first of EITHER the scan named, which is the line that won
// all 500 seeds under the R1 rules. `max` caps its defenses.
export const thrifty =
  (strict: boolean, max = 99): Policy =>
  (state) => {
    const slots = planFor(state, state.turn)?.slots ?? []
    const track = slots.findIndex((s) => !s.fixed)
    const scans = track >= 0 ? (slots[track].drawFrom ?? []).slice(0, scanPulses(state)) : []
    let actions: TurnActions = { ...NO_ORDERS, scans }
    if (state.turn === 1 && safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
    const denied = gnssDenied(state.conditions, state.scenario)
    if (track >= 0 && state.counters.length < max) {
      const read = adversaryPicks(state, countersAfter(state, actions))[track]
      const fav = strict ? (read.least.length === 1 ? read.least[0] : undefined) : read.least.find((id) => scans.includes(id))
      if (fav && scans.includes(fav)) {
        const ev = eventById(state.scenario, fav)
        const d = ev.counters.find((c) => !state.counters.includes(c))
        if (d && ev.baseSeverity + chainBonusOf(ev, denied) - mitigationOf(ev, state.counters) > 0 && safe(state, withCounter(actions, d))) actions = withCounter(actions, d)
      }
    }
    return debrisTonight(state) ? { ...actions, debris: safe(state, actions) ? 'burn' : 'hold' } : actions
  }

// A line with a drone ordered on top each night through `until`, while
// WORST CASE stays at 0 or more: the fleet as a place to bank credits.
export const withDrones =
  (base: Policy, until: number): Policy =>
  (state) => {
    const a = base(state)
    return state.turn <= until && !a.buyAssets.some((b) => b.kind === 'drone') && safe(state, withAsset(a, 'drone')) ? withAsset(a, 'drone') : a
  }

export interface WatchLine {
  name: string
  label: string
  policy: Policy
  respond: Responder
  timing?: 1 | 2
}
// THE GATED LINES: the brief's rows, on the 3D game's rules.
export const WATCH: readonly WatchLine[] = [
  { name: 'prepared', label: 'Prepared', policy: onWatch(prepared, atSpot, reads), respond: sensible },
  { name: 'novice', label: 'Novice', policy: onWatch(beginner, atSpot, shaky(2 / 3)), respond: careless },
  { name: 'buyEverything', label: 'Buy everything', policy: onWatch(buyEverything, atSpot, reads), respond: sensible },
  { name: 'randomLegal', label: 'Random legal', policy: onWatch(randomLegal, atRandom, shaky(1 / 2)), respond: careless },
  { name: 'nothing', label: 'Nothing', policy: onWatch(nothing, atSpot, noCall), respond: ride },
]
// THE FIXED LINES NO ONE OF WHICH MAY WIN MORE OFTEN THAN PREPARED (Ken's
// ruling of 14 November 2026). Each does less than Prepared somewhere and
// answers the way Prepared answers: fewer defenses, no defenses, credits
// banked in drones, a written order, answers and nothing else, a call
// made without reading, a piece set down anywhere.
export const FIXED: readonly WatchLine[] = [
  { name: 'thrifty', label: 'Thrifty (the R1 line: 1 track, the first move the scan names)', policy: onWatch(thrifty(false), atSpot, reads), respond: sensible },
  { name: 'thriftyStrict', label: 'Thrifty, only against a move flagged alone', policy: onWatch(thrifty(true), atSpot, reads), respond: sensible },
  { name: 'thrifty2', label: 'Thrifty, 2 defenses at most', policy: onWatch(thrifty(false, 2), atSpot, reads), respond: sensible },
  { name: 'thriftyDrones', label: 'Thrifty, a drone a night', policy: onWatch(withDrones(thrifty(false), 4), atSpot, reads), respond: sensible },
  { name: 'dronesOnly', label: 'No defenses, a drone a night', policy: onWatch(withDrones(nothing, 5), atSpot, reads), respond: sensible },
  { name: 'respondOnly', label: 'Orders nothing, answers every move', policy: onWatch(nothing, atSpot, reads), respond: sensible },
  { name: 'preparedScript', label: 'Prepared script (one written order)', policy: onWatch((state) => WIN_SCRIPT[state.turn] ?? NO_ORDERS, atSpot, reads), respond: sensible },
  { name: 'alwaysOverride', label: 'Prepared, overriding every hold', policy: onWatch(prepared, atSpot, alwaysOverride), respond: sensible },
  { name: 'neverOverride', label: 'Prepared, letting every block stand', policy: onWatch(prepared, atSpot, neverOverride), respond: sensible },
  { name: 'randomPlace', label: 'Prepared, placing at random', policy: onWatch(prepared, atRandom, reads), respond: sensible },
  { name: 'preparedRide', label: 'Prepared, riding every move out', policy: onWatch(prepared, atSpot, reads), respond: ride },
]
// THE SAME, ANSWERING AS THE EXPERT ANSWERS (saving the pool for a move
// worth an answer), held under the Expert: a line that fields less than
// Prepared and spends its answers better is measured against Prepared
// spending them as well.
export const FIXED_SAVING: readonly WatchLine[] = [
  { name: 'thriftySaver', label: 'Thrifty, saving its answers', policy: onWatch(thrifty(false), atSpot, reads), respond: saver },
  { name: 'thrifty2Saver', label: 'Thrifty, 2 defenses at most, saving its answers', policy: onWatch(thrifty(false, 2), atSpot, reads), respond: saver },
  { name: 'thriftyDronesSaver', label: 'Thrifty, a drone a night, saving its answers', policy: onWatch(withDrones(thrifty(false), 4), atSpot, reads), respond: saver },
  { name: 'dronesOnlySaver', label: 'No defenses, a drone a night, saving its answers', policy: onWatch(withDrones(nothing, 5), atSpot, reads), respond: saver },
  { name: 'scriptSaver', label: 'Prepared script, saving its answers', policy: onWatch((state) => WIN_SCRIPT[state.turn] ?? NO_ORDERS, atSpot, reads), respond: saver },
]
// Reported beside them, held to no band.
export const WATCH_REPORTED: readonly WatchLine[] = [
  { name: 'expert', label: 'Expert (Prepared, saving answers for moves of 2 or more)', policy: onWatch(prepared, atSpot, reads), respond: saver },
  { name: 'expertSight', label: 'Expert who also knows every signature on sight', policy: onWatch(expert, atSpot, reads), respond: saver },
  { name: 'preparedDrones', label: 'Prepared, a drone a night as well', policy: onWatch(withDrones(prepared, 4), atSpot, reads), respond: sensible },
  { name: 'noviceReads', label: 'Novice, reading every hold right', policy: onWatch(beginner, atSpot, reads), respond: careless },
  { name: 'noviceR1', label: 'The R1 Novice (a defense at random each night)', policy: onWatch(novice, atRandom, shaky(2 / 3)), respond: careless },
  { name: 'noviceAssist', label: 'Novice, Assist rate on every move', policy: onWatch(beginner, atSpot, shaky(2 / 3)), respond: careless, timing: 1 },
  { name: 'novicePerfect', label: 'Novice, a perfect tap on every move', policy: onWatch(beginner, atSpot, shaky(2 / 3)), respond: careless, timing: 2 },
  { name: 'preparedPerfect', label: 'Prepared, a perfect tap on every move', policy: onWatch(prepared, atSpot, reads), respond: sensible, timing: 2 },
]
