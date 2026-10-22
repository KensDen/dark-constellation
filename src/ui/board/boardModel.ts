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
import { CHAIN_BONUS, briefActive, chainBonusOf, countersAfter, eventById, gnssDenied, mitigationOf, planFor } from '../../engine/rules'
import { answerKey } from '../../engine/learning'
import type { AssetKind, Countermeasure, CountermeasureId, GameState, ThreatEvent, TurnActions } from '../../engine/types'
import type { WorstCase } from '../../engine/worstCase'
import { vectorsOf } from './board'
import { ICON_CHECK, ICON_HALF, ICON_WARN } from '../sprites/icons'
import type { Sprite, Token } from '../sprites/sprite'
import { vectorLabels } from '../labels'
import { SQUADRON } from '../../config'

// A move's status, always an icon and a word (section 4 rule 8).
export type MoveStatus = 'exposed' | 'partial' | 'blocked'
export const STATUS: Record<MoveStatus, { word: string; icon: Sprite; token: Token }> = {
  exposed: { word: 'EXPOSED', icon: ICON_WARN, token: 'hostile' },
  partial: { word: 'PARTLY BLOCKED', icon: ICON_HALF, token: 'warn' },
  blocked: { word: 'BLOCKED', icon: ICON_CHECK, token: 'go' },
}

// The defense that answers the debris conjunction: not an attack, so it
// is never mitigated, but SSA makes the burn free (brief 6.6).
const SSA: CountermeasureId = 'ssaManeuver'

// How a move would land against these defenses: fully blocked, blunted,
// or at full strength. The chain exploit's extra severity counts while
// GNSS denial is live, as it does in the engine.
export function moveStatus(state: Pick<GameState, 'conditions' | 'scenario'>, ev: ThreatEvent, counters: readonly CountermeasureId[]): MoveStatus {
  if (ev.effect.special === 'debrisStrike') return counters.includes(SSA) ? 'blocked' : 'exposed'
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

// The defenses that stop a move, best first: the primary (the threat's
// first counter) blocks the most (brief 5.4, "a note says which blocks the
// most").
export function stoppedBy(ev: ThreatEvent): CountermeasureId[] {
  return ev.effect.special === 'debrisStrike' ? [SSA] : [...ev.counters]
}

// A move's name without its gloss: "Uplink jamming" for "Uplink jamming
// (command link denial)".
export const shortName = (ev: Pick<ThreatEvent, 'name'>) => ev.name.split(' (')[0]

// The TONIGHT card's words.
export const WILL_HIT_LEAD = 'COLDVEIL WILL HIT '
export const willHitCount = (n: number) => `1 OF ${n}`
export const WILL_HIT = (n: number) => `${WILL_HIT_LEAD}${willHitCount(n)}`
export const TONIGHT_REASON = "They go for the one you've covered least."
export const TONIGHT_HIDDEN = 'The names are hidden. An intel brief reveals them.'
export const KEY_EXPOSED = 'will hit'
export const KEY_BLOCKED = 'is safe'
export const confirmedNote = (ev: ThreatEvent) => (ev.effect.special === 'debrisStrike' ? 'your call when it arrives' : 'lands tonight')
export const INTEL_ROW = { none: 'Order an intel brief to name the moves.', ordered: 'Brief ordered. Names shown above.' } as const
export const UNIDENTIFIED = 'Unidentified'
export const tapHint = (status: MoveStatus) => (status === 'blocked' ? 'details ›' : 'defend ›')
export const REVEAL = 'reveal ›'

// FIRST ORDERS and SECOND ORDERS (brief 5.3 item 4).
export type OrderId = 'defense' | 'drone' | 'worst'

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
  const defended = ids.some((id) => mitigationOf(eventById(scenario, id), counters) > 0)
  const drone = actions.buyAssets.some((b) => b.kind === 'drone')
  const worst = worstCase(state, actions).value >= 0 && (drone || defended)
  const { coverageMin, credits } = scenario.slaBonus
  const lifts = coverage(state.assets) < coverageMin && coverage(state.assets) + COVERAGE_PER_KIND.drone >= coverageMin
  return [
    { id: 'defense', text: 'Tap a red move above and order a defense that blocks it.', done: defended },
    {
      id: 'drone',
      text: `Order an ISR drone, ${scenario.prices.drone} CR. It arrives tomorrow${lifts ? `, and the coverage bonus pays +${credits} CR a turn` : ''}.`,
      done: drone,
    },
    { id: 'worst', text: 'Keep WORST CASE at 0 or above.', done: worst },
  ]
}

export const ordersDone = (done: number, of: number) => `${done} OF ${of} DONE`
export const FIRST_ORDERS_SET = 'First orders set. EXECUTE to play out the night.'
export const SECOND_ORDER = 'New vector tonight. Tap a move to see what stops it. Moves marked EXPOSED will hit at full strength.'


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
export const briefButton = (price: number, ordered: boolean) => (ordered ? `ORDERED · ${price} CR` : `BRIEF · ${price} CR`)

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
export const PROCURE_KINDS: AssetKind[] = ['drone', 'sat', 'groundStation']
export const PROCURE_LABEL: Record<AssetKind, string> = { drone: 'ISR DRONE', sat: 'SMALLSAT', groundStation: 'GROUND STATION', rpoSat: 'RPO SAT' }

export const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`

// The IR retainer's line, read off the scenario (brief 5.4).
export const retainerLine = (state: Pick<GameState, 'scenario'>) =>
  `Recovers ${state.scenario.recovery.withIrRetainer} points a turn on every meter instead of ${state.scenario.recovery.base}. Does not stop anything; shortens everything.`

// The earned answer key as a line.
export function stopsLine(cm: Countermeasure, state: GameState, named: ReadonlySet<string>, met: ReadonlySet<string>): string {
  if (cm.counters.length === 0) return retainerLine(state)
  const key = answerKey(cm, met, named)
  const vectors = vectorsOf(cm, state.scenario).map((v) => vectorLabels[v].toUpperCase())
  if (key.known.length === 0) return `Stops: ${key.unmet} threat${key.unmet === 1 ? '' : 's'} you have not met yet · vector ${vectors.join(', ')}`
  const names = key.known.map((k) => `${shortName(eventById(state.scenario, k.id))}${k.tonight ? ' (tonight)' : ''}`)
  return `Stops: ${names.join(', ')}${key.unmet ? ` +${key.unmet} you have not met` : ''}`
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
