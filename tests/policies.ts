// THE LINES OF THE SWEEP GATE (v1.3 brief 7; the 3D game's since v2.0 R2,
// and the only rules since v2.0 R3). Each is a function of the state the
// player sees, returning tonight's orders: the same calls the game makes,
// through the engine's own pick (src/engine/adversary.ts) and worst case
// (src/engine/worstCase.ts), so a line reads the signatures and WORST CASE
// exactly as a player would. Any randomness comes from a stream seeded by
// the game's seed and the turn, so a sweep replays.
//
// Every line plans under the engine's cap, one new defense a night
// (NEW_DEFENSES_PER_NIGHT in src/engine/rules.ts): each chooses its one
// defense itself, and resolveTurn refuses a night with more, so a line
// that broke the cap would stop the sweep rather than move it quietly.
//
// THE ORDERS, each wrapped below with where it sets its piece down and how
// it calls a hold (onWatch):
//   - PREPARED: scans one signature in each drawn track, then the next in
//     each, as far as the night's pulses go, and reads only what it
//     identified (a fixed slot is CONFIRMED and known). A drone on night
//     1, then, on the first track that needs one, the primary defense (or
//     the next one listed) of the move COLDVEIL will take, while that move
//     is not already blocked and WORST CASE stays at 0 or more. It burns
//     on the debris night when the fuel keeps WORST CASE at 0 or more, and
//     holds otherwise.
//   - THE BEGINNER (the gate's Novice): see `beginner` below.
//   - BUY EVERYTHING: the priciest defense it can afford each night, the
//     IR retainer among them, and nothing else. It burns on the debris
//     night. It never reads WORST CASE.
//   - RANDOM LEGAL: each defense and asset kind offered in a random order,
//     each taken on a coin of 3 in 10 while the budget stays at 0 or more
//     and, for a defense, while tonight has no new one yet. A coin decides
//     the debris call.
//   - NOTHING: orders nothing, and holds.

import { adversaryPicks } from '../src/engine/adversary'
import { planFor } from '../src/engine/campaign'
import { holdTonight, rightCall } from '../src/engine/holds'
import type { Responder } from '../src/engine/responses'
import { mulberry32, type Rng } from '../src/engine/rng'
import { chainBonusOf, countersAfter, defenseOpen, domainOf, eventById, gnssDenied, mitigationOf, newDefenses, orderCost, scanPulses } from '../src/engine/rules'
import type { AssetKind, CountermeasureId, GameState, HoldCall, TurnActions } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import { spotFor } from '../src/ui/three/gameModel'
import { WIN_SCRIPT } from './scripts'

export type Policy = (state: GameState) => TurnActions

// HOW EACH LINE ANSWERS IN THE NIGHT (v1.7 R1; a pool since v2.0 R2): when
// a move would land, the night offers its responses
// (src/engine/responses.ts) and the line's responder picks one, or rides
// it out.
//   - RIDE: never answers. Nothing's.
//   - SENSIBLE: answers each move that would land while it has an answer,
//     a block before a halving. Prepared's and Buy everything's.
//   - CARELESS: answers two moves in three while it has an answer, on a
//     stream of its own, and rides the third out. The beginner's and
//     Random legal's: a player who taps the answer that sounds best most
//     nights, with no eye on what it leaves for later.
//   - SAVER (below): keeps its answers for a move worth one. The Expert's.
export const ride: Responder = () => null
export const sensible: Responder = ({ options }) => options.find((o) => o.fits)?.id ?? null
export const careless: Responder = ({ state, index, options }) => {
  const r = mulberry32((Math.imul(state.seed ^ 0x5eedbead, 2654435761) ^ Math.imul(state.turn * 8 + index + 1, 40503)) >>> 0)
  return r.chance(2 / 3) ? (options.find((o) => o.fits)?.id ?? null) : null
}
export type PolicyName = 'buyEverything' | 'prepared' | 'novice' | 'randomLegal' | 'nothing'

export const NO_ORDERS: TurnActions = { buyAssets: [], buyCounters: [] }

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

// THE SCAN A CAREFUL PLAYER MAKES (v2.0 R1): one signature in each drawn
// track before a second in any, in the night's order, for as many pulses
// as the watch has.
export function scanFor(state: GameState): string[] {
  const drawn = (planFor(state, state.turn)?.slots ?? []).filter((s) => !s.fixed).map((s) => s.drawFrom ?? [])
  const out: string[] = []
  for (let depth = 0; depth < 4; depth += 1) for (const ids of drawn) if (ids[depth] && !out.includes(ids[depth])) out.push(ids[depth])
  return out.slice(0, scanPulses(state))
}

// HOW A LINE KNOWS A SIGNATURE IT DID NOT SCAN (v2.0 R3, the name on
// sight: src/engine/rules.ts). 'scan': it does not. 'all': it names every
// one from its look, as a player who has learned the Dossier can. 'guess':
// it knows none of them and names anyway, in the night's order, right 1
// time in 4 (the game offers 4 names), until its first wrong name ends
// naming for the night, as the game ends it. What it names goes to the
// engine with the orders (TurnActions.sighted).
export type Sight = 'scan' | 'all' | 'guess'
export const GUESS_RATE = 1 / 4
function sightedBy(state: GameState, scans: readonly string[], sight: Sight): string[] {
  if (sight === 'scan') return []
  const drawn = (planFor(state, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [] : (s.drawFrom ?? []))).filter((id) => !scans.includes(id))
  if (sight === 'all') return drawn
  const r = streamFor(state, 0x516e7ed)
  const out: string[] = []
  for (const id of drawn) {
    if (!r.chance(GUESS_RATE)) break
    out.push(id)
  }
  return out
}

function preparedLine(sight: Sight = 'scan'): Policy {
  return (state) => {
    // A signature is read only once it is identified (v2.0 R1).
    const scans = scanFor(state)
    const sighted = sightedBy(state, scans, sight)
    const fixed = (planFor(state, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [s.fixed] : []))
    const known = (id: string) => scans.includes(id) || sighted.includes(id) || fixed.includes(id)
    let actions: TurnActions = { ...NO_ORDERS, scans, ...(sighted.length ? { sighted } : {}) }
    if (state.turn === 1 && safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
    const denied = gnssDenied(state.conditions, state.scenario)
    const blocked = (eventId: string, counters: readonly CountermeasureId[]) => {
      const ev = eventById(state.scenario, eventId)
      return ev.effect.special === 'debrisStrike' || ev.baseSeverity + chainBonusOf(ev, denied) - mitigationOf(ev, counters) <= 0
    }
    const reads = adversaryPicks(state, countersAfter(state, actions))
    // One new defense a night: the first track that takes an order takes
    // tonight's.
    for (let i = 0; i < reads.length && defenseOpen(state, actions); i += 1) {
      // The primary (or the next one listed) of the move COLDVEIL will take
      // there: the one flagged alone, or the first of several it can name.
      // A track whose favored move is still unidentified gets no order.
      const counters = countersAfter(state, actions)
      const target = adversaryPicks(state, counters)[i].least.find(known)
      if (!target || blocked(target, counters)) continue
      const defense = nextDefenseFor(target, state, counters)
      const next = defense ? withCounter(actions, defense) : undefined
      if (next && safe(state, next)) actions = next
    }
    if (!debrisTonight(state)) return actions
    return { ...actions, debris: safe(state, actions) ? 'burn' : 'hold' }
  }
}

export const prepared: Policy = preparedLine()
// Prepared's orders with every signature named on sight, and with a guess
// at each (v2.0 R3).
export const preparedSight: Policy = preparedLine('all')
export const preparedGuess: Policy = preparedLine('guess')

// THE R1 NOVICE: a drone and a defense against one move it picks at random
// on night 1, then one random affordable defense a night while WORST CASE
// allows, and a coin on the debris call. A fair picture of a list of
// defenses with nothing lit; reported beside the beginner since v2.0 R2.
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
  return id ? spotFor(state, { defense: null, assets: actions.buyAssets.map((b) => b.kind), scans: actions.scans ?? [], sighted: actions.sighted ?? [] }, id) : undefined
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

// THE BEGINNER. The R1 Novice ordered a defense at random each night,
// which was a fair picture of a list of defenses with nothing lit. The
// game's first night teaches three steps by doing (scan, place,
// respond), and its tray lights the pieces that answer what the scan has
// named, so a beginner here does this: scans the first 2 signatures it
// sees, places a piece the tray lights for one of them when there is one,
// and otherwise a piece at random on half the nights; a drone on night 1
// (FIRST ORDERS); WORST CASE kept at 0 or more; a coin on the debris call.
// It never reads which move COLDVEIL favors beyond the tray's light. The
// R1 line is still played and reported beside it (noviceR1 below). With
// `sight`, it also names what it did not scan (sightedBy, above), and the
// tray lights for those too.
const beginnerLine =
  (sight: Sight = 'scan'): Policy =>
  (state) => {
    const r = streamFor(state, 0x0b5e55ed)
    const slots = planFor(state, state.turn)?.slots ?? []
    const scans = slots.flatMap((s) => (s.fixed ? [] : (s.drawFrom ?? []))).slice(0, scanPulses(state))
    const sighted = sightedBy(state, scans, sight)
    const named = [...scans, ...sighted]
    let actions: TurnActions = { ...NO_ORDERS, scans, ...(sighted.length ? { sighted } : {}) }
    if (state.turn === 1 && safe(state, withAsset(actions, 'drone'))) actions = withAsset(actions, 'drone')
    const denied = gnssDenied(state.conditions, state.scenario)
    const hot: CountermeasureId[] = []
    for (const read of adversaryPicks(state, state.counters)) {
      for (const c of read.candidates) {
        if (!named.includes(c.id) || !read.least.includes(c.id)) continue
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
export const beginner: Policy = beginnerLine()

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
// THE GATED LINES: the brief's rows.
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
  // THE NAME ON SIGHT (v2.0 R3): what knowing the signatures is worth, to
  // each kind of player, and what guessing at them is worth.
  { name: 'preparedSight', label: 'Prepared, naming every signature on sight', policy: onWatch(preparedSight, atSpot, reads), respond: sensible },
  { name: 'preparedGuess', label: 'Prepared, guessing names until one is wrong (right 1 in 4)', policy: onWatch(preparedGuess, atSpot, reads), respond: sensible },
  { name: 'expertSight', label: 'Expert, naming every signature on sight', policy: onWatch(preparedSight, atSpot, reads), respond: saver },
  { name: 'noviceSight', label: 'Novice, naming every signature on sight', policy: onWatch(beginnerLine('all'), atSpot, shaky(2 / 3)), respond: careless },
  { name: 'noviceGuess', label: 'Novice, guessing names until one is wrong (right 1 in 4)', policy: onWatch(beginnerLine('guess'), atSpot, shaky(2 / 3)), respond: careless },
  { name: 'preparedDrones', label: 'Prepared, a drone a night as well', policy: onWatch(withDrones(prepared, 4), atSpot, reads), respond: sensible },
  { name: 'noviceReads', label: 'Novice, reading every hold right', policy: onWatch(beginner, atSpot, reads), respond: careless },
  { name: 'noviceR1', label: 'The R1 Novice (a defense at random each night)', policy: onWatch(novice, atRandom, shaky(2 / 3)), respond: careless },
  { name: 'noviceAssist', label: 'Novice, Assist rate on every move', policy: onWatch(beginner, atSpot, shaky(2 / 3)), respond: careless, timing: 1 },
  { name: 'novicePerfect', label: 'Novice, a perfect tap on every move', policy: onWatch(beginner, atSpot, shaky(2 / 3)), respond: careless, timing: 2 },
  { name: 'preparedPerfect', label: 'Prepared, a perfect tap on every move', policy: onWatch(prepared, atSpot, reads), respond: sensible, timing: 2 },
]

// The gated lines under the name other suites have always read them by.
export const POLICIES = WATCH
