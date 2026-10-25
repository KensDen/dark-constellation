// THE BOARD'S MODEL (v1.3 brief 5.3, 5.4): what the TONIGHT card, the
// orders card and PROCURE read, as pure functions of the engine's state and
// tonight's orders, and the words they print. The components render these
// strings and src/ui/brief.ts counts them, so the reading budget measures
// the screen and nothing else. The board never
// re-derives the engine: which move COLDVEIL plays is adversaryPicks with
// the queued defenses included (the same set resolveTurn reads at
// EXECUTE), and a move's status is mitigationOf at the strength it would
// land. tests/adversary.spec.ts holds these flags to the engine's pick over
// 200 seeds of every policy.

import { adversaryPicks } from '../../engine/adversary'
import { worstCase } from '../../engine/worstCase'
import { COVERAGE_PER_KIND, coverage } from '../../engine/scoring'
import { ASSET_HEAL_PER_TURN, CHAIN_BONUS, NEW_DEFENSES_PER_NIGHT, PRIMARY_MITIGATION, SECONDARY_MITIGATION, briefActive, chainBonusOf, countersAfter, eventById, gnssDenied, mitigationOf, planFor } from '../../engine/rules'
import { answerKey } from '../../engine/learning'
import type { ActiveCondition, AssetKind, Countermeasure, CountermeasureId, GameState, ThreatEvent, TurnActions } from '../../engine/types'
import type { WorstCase } from '../../engine/worstCase'
import { vectorsOf } from './board'
import { ICON_BURN, ICON_CALL, ICON_CHECK, ICON_HALF, ICON_WARN } from '../sprites/icons'
import type { Sprite, Token } from '../sprites/sprite'
import { vectorLabels } from '../labels'
import { SQUADRON } from '../../config'

// A move's status, always an icon and a word (section 4 rule 8). ANSWERED
// is the debris call's alone, with SSA owned (v1.3 R7, Ken's ruling on
// R6b's fresh eyes): burn fuel is free, but nothing is blocked, since HOLD
// can still lose the satellite.
// YOUR CALL is the debris call's without SSA (v1.5 R1): a hazard the
// player decides, so neither EXPOSED, which is an attack's word, nor
// "defend ›" (R6b's fresh eyes, item 11).
export type MoveStatus = 'exposed' | 'partial' | 'blocked' | 'answered' | 'call'
export const STATUS: Record<MoveStatus, { word: string; icon: Sprite; token: Token }> = {
  exposed: { word: 'EXPOSED', icon: ICON_WARN, token: 'hostile' },
  partial: { word: 'PARTLY BLOCKED', icon: ICON_HALF, token: 'warn' },
  blocked: { word: 'BLOCKED', icon: ICON_CHECK, token: 'go' },
  answered: { word: 'ANSWERED', icon: ICON_BURN, token: 'friendly' },
  call: { word: 'YOUR CALL', icon: ICON_CALL, token: 'warn' },
}

// The defense that answers the debris conjunction: not an attack, so it
// is never mitigated, but SSA makes the burn free (brief 6.6).
const SSA: CountermeasureId = 'ssaManeuver'

// How a move would land against these defenses: fully blocked, blunted,
// or at full strength. The chain exploit's extra severity counts while
// GNSS denial is live, as it does in the engine.
export function moveStatus(state: Pick<GameState, 'conditions' | 'scenario'>, ev: ThreatEvent, counters: readonly CountermeasureId[]): MoveStatus {
  if (ev.effect.special === 'debrisStrike') return counters.includes(SSA) ? 'answered' : 'call'
  const mitigation = mitigationOf(ev, counters)
  const effective = Math.max(0, ev.baseSeverity + chainBonusOf(ev, gnssDenied(state.conditions, state.scenario)) - mitigation)
  if (effective === 0) return 'blocked'
  return mitigation > 0 ? 'partial' : 'exposed'
}

// The flag over a move card: the one COLDVEIL plays (LIKELY TARGET), one
// of a tie the deck breaks (EITHER), or a fixed slot's (CONFIRMED).
export type MoveFlag = 'LIKELY TARGET' | 'EITHER' | 'CONFIRMED'

export interface MoveRead {
  ev: ThreatEvent
  status: MoveStatus
  flag: MoveFlag | null
}

export interface SlotView {
  fixed: boolean
  // Unnamed tonight: no intel brief, and not a fixed slot. The cards show
  // the vector and layer only.
  hidden: boolean
  moves: MoveRead[]
}

export function tonightSlots(state: GameState, actions: TurnActions): SlotView[] {
  const counters = countersAfter(state, actions)
  const named = briefActive(state, actions)
  return adversaryPicks(state, counters).map((read) => ({
    fixed: read.fixed,
    hidden: !read.fixed && !named,
    moves: read.candidates.map(({ id }) => {
      const ev = eventById(state.scenario, id)
      const flag: MoveFlag | null = read.fixed ? 'CONFIRMED' : read.least.includes(id) ? (read.least.length > 1 ? 'EITHER' : 'LIKELY TARGET') : null
      return { ev, status: moveStatus(state, ev, counters), flag }
    }),
  }))
}

// The defenses that answer a move, best first: the primary (the threat's
// first counter) takes the most off (brief 5.4, "a note says which blocks
// the most").
export function stoppedBy(ev: ThreatEvent): CountermeasureId[] {
  return ev.effect.special === 'debrisStrike' ? [SSA] : [...ev.counters]
}

// THE STOPS RULE (R6 question 2): a defense stops a move on its own only
// when its own points reach the move's strength (the primary takes
// PRIMARY_MITIGATION, each other SECONDARY_MITIGATION); otherwise it blunts
// it. The debris conjunction is never stopped: no attack, no mitigation,
// so its defense answers the call instead. Every "stops" on PROCURE, the
// hit card, the intel card, the Dossier, the debrief and FIRST ORDERS reads
// this, so the game says "stops" only where its own rule blocks.
export type StopVerb = 'stops' | 'blunts' | 'answers'
export function stopVerb(cm: CountermeasureId, ev: ThreatEvent): StopVerb {
  if (ev.effect.special === 'debrisStrike') return 'answers'
  const i = ev.counters.indexOf(cm)
  const points = i === 0 ? PRIMARY_MITIGATION : i > 0 ? SECONDARY_MITIGATION : 0
  return points >= ev.baseSeverity ? 'stops' : 'blunts'
}

// What the debris call's defense does, said where others say "stops".
export const STOPPED_BY = 'STOPPED BY'
export const ANSWERED_BY = 'ANSWERED BY'
export const BLUNTED_BY = 'BLUNTED BY'
export const SSA_ANSWER = 'exact odds, free burn'
export const ssaLine = () => `Makes the debris call: ${SSA_ANSWER}.`

// A move's defenses in the intel card's and the Dossier's words: the ones
// that block it alone under STOPPED BY, then "also blunts:" the rest; when
// none blocks it alone, BLUNTED BY, and whether together they block it.
export function stoppedByLine(ev: ThreatEvent, scenario: GameState['scenario']): { label: string; text: string } {
  const name = (id: CountermeasureId) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id
  if (ev.effect.special === 'debrisStrike') return { label: ANSWERED_BY, text: `${name(SSA)} (${SSA_ANSWER})` }
  const stops = ev.counters.filter((c) => stopVerb(c, ev) === 'stops').map(name)
  const blunts = ev.counters.filter((c) => stopVerb(c, ev) === 'blunts').map(name)
  if (stops.length) return { label: STOPPED_BY, text: `${stops.join('; ')}${blunts.length ? `; also blunts: ${blunts.join('; ')}` : ''}` }
  const together = mitigationOf(ev, ev.counters) >= ev.baseSeverity
  return { label: BLUNTED_BY, text: `${blunts.join('; ')}${together && blunts.length > 1 ? ' (together they block it)' : ''}` }
}

// PROCURE's note over the defenses a tapped move highlights.
export function matchNote(ev: ThreatEvent): string {
  const n = ev.counters.length
  if (ev.effect.special === 'debrisStrike') return ` is answered by the highlighted defense: ${SSA_ANSWER}.`
  const primaryStops = stopVerb(ev.counters[0], ev) === 'stops'
  if (n === 1) return primaryStops ? ' is stopped by the highlighted defense.' : ' is blunted by the highlighted defense; nothing blocks it alone.'
  if (primaryStops) return ' is answered by the highlighted defenses. The first listed blocks it alone; the others blunt it.'
  const together = mitigationOf(ev, ev.counters) >= ev.baseSeverity
  return ` is answered by the highlighted defenses. Each blunts it; ${together ? 'together they block it' : 'none blocks it alone'}.`
}

// A move's name without its gloss: "Uplink jamming" for "Uplink jamming
// (command link denial)".
export const shortName = (ev: Pick<ThreatEvent, 'name'>) => ev.name.split(' (')[0]

// The TONIGHT card's words.
export const WILL_HIT_LEAD = 'COLDVEIL WILL HIT '
export const willHitCount = (n: number) => `1 OF ${n}`
export const WILL_HIT = (n: number) => `${WILL_HIT_LEAD}${willHitCount(n)}`
// The adversary's rule as the engine plays it (R6 question 11): the move
// the defenses take the fewest points off, so a BLOCKED move can tie a
// PARTLY BLOCKED one when both take the same off.
export const TONIGHT_REASON = 'They go for the move your defenses take the fewest points off.'
// Said after the rule once tonight's new defense is ordered (v1.4 fresh
// eyes: an exposed move's "details ›" changed with nothing to say why).
// Not on turn 1, where FIRST ORDERS says the rule and ticks the order, and
// where the longer line would push the board past 375x667.
export const DEFENSE_IN = "This turn's new defense is ordered."
export const tonightReason = (turn: number, open: boolean) => (open || turn === 1 ? TONIGHT_REASON : `${TONIGHT_REASON} ${DEFENSE_IN}`)
export const TONIGHT_HIDDEN = 'The names are hidden. An intel brief reveals them.'
// EXPOSED says what an exposed move does if it is the one COLDVEIL takes,
// not that it will land (R6b fresh eyes: "will hit" beside both moves
// under COLDVEIL WILL HIT 1 OF 2).
export const KEY_EXPOSED = 'full strength'
export const KEY_BLOCKED = 'is safe'
export const KEY_LIKELY = 'their pick'
export const KEY_EITHER = 'a tie'
export const confirmedNote = (ev: ThreatEvent, status: MoveStatus) =>
  ev.effect.special !== 'debrisStrike' ? 'lands tonight' : status === 'answered' ? 'your call; burn fuel is free' : 'your call when it arrives'
export const INTEL_ROW = { none: 'Order an intel brief to name the moves.', ordered: 'Brief ordered. Names shown above.' } as const
export const UNIDENTIFIED = 'Unidentified'
// "defend ›" only while tonight can still take a new defense (v1.4: one a
// night); once it is ordered, a tap opens the same PROCURE, where the rest
// read 1 A TURN, so it says "details ›".
export const tapHint = (status: MoveStatus, open = true) =>
  status === 'blocked' || status === 'answered' || status === 'call' || !open ? 'details ›' : 'defend ›'
// A move's strength, shown on an attack only: the debris conjunction is a
// hazard nothing mitigates, so its tile shows none (v1.5 R1; R6b's fresh
// eyes, item 11).
export const showsStrength = (ev: ThreatEvent) => ev.effect.special !== 'debrisStrike'
export const REVEAL = 'reveal ›'
// A condition's turns left, one meaning everywhere (v1.3 R6, G-103; brief
// 6.5): the nights it will still press after the one being played. The
// engine counts it down at each turn close, so a board between turns reads
// it as stored, and a night in play (before its close) reads it as its
// close will leave it, so the night's chips and its END OF TURN agree.
export const turnsLeft = (c: Pick<ActiveCondition, 'remainingTurns'>, preClose: boolean) => (preClose ? Math.max(0, c.remainingTurns - 1) : c.remainingTurns)

// The board's cue when its moves run under the dock (R6 question 14).
export const MORE_BELOW = '▼ more below'

// FIRST ORDERS and SECOND ORDERS (brief 5.3 item 4).
export type OrderId = 'defense' | 'drone' | 'worst' | 'intel'

export interface OrderLine {
  id: OrderId
  text: string
  done: boolean
}

// Turn 1's three orders, each with whether it is done with tonight's
// orders queued.
export function firstOrders(state: GameState, actions: TurnActions): OrderLine[] {
  const { scenario } = state
  const counters = countersAfter(state, actions)
  const ids = (planFor(scenario, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [s.fixed] : (s.drawFrom ?? [])))
  // Done only when a move reads BLOCKED (R6 question 2): a defense that
  // only blunts it has not done what the line asks.
  const defended = ids.some((id) => moveStatus(state, eventById(scenario, id), counters) === 'blocked')
  const drone = actions.buyAssets.some((b) => b.kind === 'drone')
  const worst = worstCase(state, actions).value >= 0 && (drone || defended)
  const { coverageMin, credits } = scenario.slaBonus
  const lifts = coverage(state.assets) < coverageMin && coverage(state.assets) + COVERAGE_PER_KIND.drone >= coverageMin
  return [
    // The rule where turn 1 asks for the order (v1.4 fresh eyes).
    // v1.5 R1: and that COLDVEIL then takes the other door (R6b's fresh
    // eyes, item 2: the tick read as the turn held).
    { id: 'defense', text: `Tap a red move above to block it. ${NEW_DEFENSES_PER_NIGHT} new defense a turn, so they hit the other one.`, done: defended },
    {
      id: 'drone',
      text: `Order an ISR (surveillance) drone, ${scenario.prices.drone} CR. It arrives next turn${lifts ? `, and the coverage bonus pays +${credits} CR a turn` : ''}.`,
      done: drone,
    },
    // "Then": it ticks once an order is in and WORST CASE holds, so on an
    // empty first board it is unticked while the dock reads a sound WORST
    // CASE (R7 fresh eyes).
    { id: 'worst', text: 'Then keep WORST CASE at 0 or above.', done: worst },
  ]
}

export const ordersDone = (done: number, of: number) => `${done} OF ${of} DONE`
export const FIRST_ORDERS_SET = 'First orders set. EXECUTE to play out the night.'
// "What answers it", not "what stops it" (R6b fresh eyes): no one defense
// stops a strength 3 move, and the move's card says so.
export const SECOND_ORDER = 'New vector tonight. Tap a move to see what answers it. An EXPOSED move lands at full strength.'
// SECOND ORDERS while tonight's moves are hidden, and what a tap on a hidden
// move or "reveal ›" opens PROCURE at (R6 question 14: a player was told to
// tap a move and look for EXPOSED while every move was Unidentified).
export const hiddenOrder = (price: number) => `Order an intel brief (${price} CR) to name tonight's moves, then tap one to see what answers it.`


// THE HUD's words (brief 5.3 item 1).
// Under this margin above the win line the chip turns amber (brief 5.3).
export const CLOSE_MARGIN = 6

export const SCORE_LABEL = 'MISSION ASSURANCE SCORE'
export const BUDGET_LABEL = 'BUDGET'

// "17.4 ABOVE WIN LINE", "3.0 BELOW WIN LINE", and the tone it reads in.
export function marginChip(score: number, winAt: number): { text: string; tone: 'go' | 'warn' | 'hostile' } {
  const gap = Math.round((score - winAt) * 10) / 10
  if (gap < 0) return { text: `${Math.abs(gap).toFixed(1)} BELOW WIN LINE`, tone: 'hostile' }
  return { text: `${gap.toFixed(1)} ABOVE WIN LINE`, tone: gap < CLOSE_MARGIN ? 'warn' : 'go' }
}

export const streakChip = (streak: number) => `×${streak} STREAK`
export const winLineLabel = (winAt: number) => `${winAt} WIN LINE`

// A move's vector and layer, "RF → ORBIT".
export const vectorTo = (ev: ThreatEvent) => `${vectorLabels[ev.vector].toUpperCase()} → ${ev.layers.join(' · ')}`
export const strengthLine = (ev: ThreatEvent) => `STRENGTH ${'●'.repeat(ev.baseSeverity)}`

// The full brief's toggle (QC G-026: it says what a tap does either way).
export const FULL_BRIEF_OPEN = 'Expand full brief'
export const FULL_BRIEF_CLOSE = 'Hide full brief'
// The intel brief's row on TONIGHT opens PROCURE at the brief (v1.5 R2),
// where its lock is said before the order; once ordered it is a status.
export const briefButton = (price: number) => `BRIEF · ${price} CR ›`
// THE BRIEF'S LOCK (v1.5 R2, Ken's ruling of 24 October 2026; the engine's
// briefLocked): the brief names the moves the moment it is ordered, so the
// order stands for the turn.
export const BRIEF_RULE = "Names COLDVEIL's moves the moment you order it, and the defenses then say which moves they stop or blunt. Once named, the order is locked for this turn: no cancel, no refund."
export const BRIEF_LOCKED_LINE = "It has named tonight's moves, so it stays ordered: no cancel, no refund."
export const BRIEF_LOCKED = 'LOCKED'
export const briefLockedTag = (price: number) => `${price} CR · ${BRIEF_LOCKED}`

// The dock's words (brief 5.3 item 5).
export const REMAINING = 'REMAINING'
export const WORST_CASE = 'WORST CASE'

export const OVER_BUDGET = 'Over budget. Cancel an order in PROCURE.'
export const BELOW_ZERO = 'Below zero ends the operation.'
export const worstSum = (w: WorstCase) => `${w.remaining} remaining - ${w.repairs} repairs if hit - ${w.upkeep} defense upkeep`
export type { WorstCase }

// PROCURE (brief 5.4).
// What PROCURE offers in ASSETS (brief 5.4): the ISR drone, the smallsat
// and the ground station. The RPO sat stays on the starter manifest only.
// One new defense a turn (v1.4), as PROCURE says it: the rule before the
// turn's order, with its reason, and the reason the rest are not available
// once it is in. Numerals, by section 4 rule 6.
// The v1.4 fresh-eyes review: the reason read as a lead time ("a night to
// bring online"), the line read as covering the assets, and once the order
// was in nothing said why or how to change it. Its re-run: "fleet" named
// nothing on the sheet, whose section is ASSETS, and did not say why the
// team's limit spares them. v1.5 R1: the game counts in turns, one word
// everywhere (v1.4 finding 11), and the line names the defense ordered, so
// a sheet opened from another move says what to cancel.
const newDefense = (n: number) => `${n} new defense${n === 1 ? '' : 's'}`
// Its re-review: "arrive ready" read as instant beside "arrives in 1
// turn", and the last turn has no next one to be booked until.
export const defenseRule = (n: number) =>
  `${newDefense(n)} a turn: the integration team can bring only ${n} online. Assets skip integration, so the limit does not apply to them.`
export const defenseOrderIn = (name: string, last = false) =>
  last
    ? `${name} is the operation's last new defense. To swap, cancel it first.`
    : `${name} is this turn's new defense, and the integration team is booked until next turn. To swap, cancel it first.`
// What a defense reads where its price was, once the turn's defense is in
// (v1.4 finding 7: NOT TONIGHT read as "this move is not on tonight"): the
// rule, one label on every turn (the R1 re-review: NEXT TURN and 1 A TURN
// for the same state).
export const capLabel = (n: number) => `${n} A TURN`
// Beside the note on a move whose defenses wait for the turn's one (the R1
// re-review: "stopped by the highlighted defense" read as tonight).
export const NOT_THIS_TURN = 'Not this turn unless you swap.'
// The DEFENSES heading's note, beside the upkeep.
export const defensesPerTurn = (n: number) => `${n} a turn`
// PROCURE's planned line leads with the turn's one defense (v1.4 finding
// 3: "Ordered: 0 of 100 CR" read as a budget to fill).
export const defenseCount = (ordered: number, n: number) => `New defense this turn: ${ordered} of ${n}.`
// Under CONFIRM N ORDERS (v1.4 finding 6: CONFIRM read as locking them in).
export const confirmNote = (cost: number, briefLocked = false) =>
  briefLocked
    ? `${cost} CR committed. The intel brief stays ordered; tap any other order again to cancel it until you EXECUTE.`
    : `${cost} CR committed. Tap an order again to cancel it; nothing is final until you EXECUTE.`

export const PROCURE_KINDS: AssetKind[] = ['drone', 'sat', 'groundStation']
export const PROCURE_LABEL: Record<AssetKind, string> = { drone: 'ISR DRONE', sat: 'SMALLSAT', groundStation: 'GROUND STATION', rpoSat: 'RPO SAT' }

export const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`

// The IR retainer's line, read off the scenario (brief 5.4). Since v1.5 R1
// it names the three meters and the assets' own healing (R6b's fresh eyes,
// item 3: "points" read as score points, and "every recovery" as asset
// repair, which the retainer does not speed).
export const retainerLine = (state: Pick<GameState, 'scenario'>) =>
  `Link, data and sensor health recover ${state.scenario.recovery.withIrRetainer} a turn instead of ${state.scenario.recovery.base}; damaged assets heal ${ASSET_HEAL_PER_TURN} a turn with or without it. Stops no move, and counts as the turn's new defense.`
// A condition chip's turns left (brief 6.5), and on its last turn LAST
// rather than 0T (R6b's fresh eyes, item 4): the night it last presses, and
// the board before that night, where the stored 1 read "1T" on turn 6 of 6
// as if it ran past the end (the R1 re-review).
export const chipTurns = (stored: number, left: number) => (stored <= 1 ? 'LAST' : `${left}T`)

// The earned answer key as a line: what it stops alone, then what it
// blunts (the stops rule above), then how many it answers unmet.
export function stopsLine(cm: Countermeasure, state: GameState, named: ReadonlySet<string>, met: ReadonlySet<string>): string {
  if (cm.counters.length === 0) return retainerLine(state)
  if (cm.id === SSA) return ssaLine()
  const key = answerKey(cm, met, named)
  const vectors = vectorsOf(cm, state.scenario).map((v) => vectorLabels[v].toUpperCase())
  if (key.known.length === 0) return `Answers: ${key.unmet} threat${key.unmet === 1 ? '' : 's'} you have not met yet · vector ${vectors.join(', ')}`
  const said = (verb: StopVerb) =>
    key.known
      .filter((k) => stopVerb(cm.id, eventById(state.scenario, k.id)) === verb)
      .map((k) => `${shortName(eventById(state.scenario, k.id))}${k.tonight ? ' (tonight)' : ''}`)
  const parts = [['Stops', said('stops')], ['Blunts', said('blunts')]].filter(([, names]) => names.length).map(([verb, names]) => `${verb}: ${(names as string[]).join(', ')}`)
  return `${parts.join(' · ')}${key.unmet ? ` +${key.unmet} you have not met` : ''}`
}


// The line the TONIGHT card shows while GNSS denial arms the chain.
export const CHAIN_ARMED_LINE = `BLACKOUT CHAIN ARMED: ${SQUADRON} is on LiDAR alone.`
export const chainLine = () => `${CHAIN_ARMED_LINE} +${CHAIN_BONUS} strength on LiDAR.`

// After turn 6 the strip says the operation is over (QC G-067): a tile in
// transit says OVER where its ETA was, and a line under the strip says why.
export const OPERATION_OVER = 'OPERATION OVER'
export const NO_ARRIVAL = 'OVER'

// THE DEBRIS CALL (brief 5.5 item 5). The engine takes BURN or HOLD with
// the night's orders, so EXECUTE on a conjunction night resolves both,
// and the night plays the events up to the call from either: they are the
// same, since the call is the first thing the two resolutions do
// differently (tests/night-model.spec.ts holds it). This is where the
// call sits, or -1 when there is none to make: no conjunction tonight, or
// no satellite on its orbit.
export function callIndex(hold: Pick<GameState, 'history'>): number {
  const events = hold.history[hold.history.length - 1]?.events ?? []
  return events.findIndex((e) => e.debris !== undefined && e.debris.assetId !== undefined)
}

// THE DESKTOP BOARD (v1.5 R2, Ken's ruling of 24 October 2026: a
// full-width desktop layout in place of the centered phone column): at
// this size and up the board is three columns (src/index.css), the
// playfield, the phone's column and the side panel, where PROCURE stands
// open while the player decides. The stylesheet's query is the same.
export const WIDE_BOARD = '(min-width: 1100px) and (min-height: 600px)'
