// Core engine and content types (spec Section 10, refined for R1, and for
// the v1.3 loop pass in Round 0). The engine is content-agnostic: it
// consumes whatever validated data the scenario carries. Content modules
// import these types, never the reverse.

// Difficulty (v1.3 brief 6.1): EASY scales damage and repair bills by
// 0.75; STANDARD is the tuned campaign and scales nothing. Expert went
// with the v1.2 economy: the v1.3 title offers EASY or STANDARD (brief
// 5.1), and the sweep gate tunes those two (brief 7).
export type Difficulty = 'easy' | 'standard'

export type Layer = 'ORBIT' | 'AIR' | 'GROUND'
// The three layers, as a value. Promoted out of ui/cues/Scene.tsx in Round
// 7b, where it was one component's private list: the quiet beat's title
// had hardcoded the denominator as a literal 3, which is a count in
// player-facing prose that nothing joins to the fleet it describes.
export const LAYERS = ['ORBIT', 'AIR', 'GROUND'] as const satisfies readonly Layer[]
// The join, made deliberate rather than incidental: a member added to the
// Layer union but missing from LAYERS fails to compile here, instead of
// being caught by luck through an unrelated Record<Layer, string> map.
type _EveryLayerListed = Exclude<Layer, (typeof LAYERS)[number]> extends never ? true : never
const _layersAreComplete: _EveryLayerListed = true
void _layersAreComplete
export type Vector = 'rf' | 'optical' | 'cyber' | 'supplyChain' | 'human' | 'environmental'
export type AssetKind = 'sat' | 'rpoSat' | 'drone' | 'groundStation'

export interface TechniqueRef {
  framework: 'SPARTA' | 'ATLAS' | 'ATTACK' | 'ATTACK_ICS' | 'NSA' | 'RESEARCH'
  id: string
  name: string
  url: string
  status: 'verified' | 'verify-at-build'
  citation?: string
}

// Learn-more cards (spec Sections 7 and 16): the educational payload per
// event. Sources carry the same explicit verification status as technique
// refs: verify-at-build until the URL and claim are confirmed against the
// live site, and the UI labels them accordingly.
export interface LearnMoreSource {
  title: string
  url: string
  type: 'paper' | 'report' | 'advisory'
  status: 'verified' | 'verify-at-build'
}

export interface LearnMoreCard {
  title: string
  body: string
  sources: LearnMoreSource[]
}

// The defenses (brief 6.7 and Appendix A). The intel investment left with
// the intel levels (D2 a); the intel brief is an order of its own, priced
// in the scenario.
export type CountermeasureId =
  | 'linkAuth'
  | 'antiJam'
  | 'pntAuth'
  | 'sensorFusion'
  | 'tierAAttestation'
  | 'mlPipelineIntegrity'
  | 'groundZeroTrust'
  | 'insiderProgram'
  | 'ssaManeuver'
  | 'encryptedBackhaul'
  | 'irRetainer'

// Mapping to the SPARTA countermeasure catalog (spec Section 8, R3).
// Tier is SPARTA's defense-in-depth tier for the countermeasure as
// published on sparta.aerospace.org, verified at build via the web.
export interface SpartaCmRef {
  id: string
  name: string
  url: string
  tier: string
}

export interface Countermeasure {
  id: CountermeasureId
  name: string
  cost: number
  counters: string[] // ThreatEvent ids; empty means posture-wide (the IR retainer)
  spartaCms: SpartaCmRef[]
  blurb: string
}

// What an event does when it lands. Meters name the mission assurance
// components the damage applies to; specials trigger engine mechanics.
// assetDamage false marks confidentiality-loss events (eavesdropping,
// exfiltration, replay, latent poisoning): they erode trust meters
// without physically degrading an asset.
//   - jamsGnss: the condition it leaves is GNSS denial, which arms the chain.
//   - chainExploit: strikes harder while GNSS denial is live (CHAIN_BONUS).
//   - debrisStrike: resolves as the player's BURN or HOLD call (brief 5.5
//     and 6.1), not as an attack.
export interface ThreatEffect {
  meters: ('linkAvailability' | 'dataIntegrity' | 'sensorIntegrity')[]
  special?: 'jamsGnss' | 'chainExploit' | 'debrisStrike'
  assetDamage?: boolean
  repairCostPerSeverity: number
}

// Positive effects carried by opportunity events (R3.25): direct credits,
// a free intel brief for the coming turns, or expediting one in-transit
// deploy.
export interface OpportunityBenefit {
  credits?: number
  briefTurns?: number
  expediteTurns?: number
}

// The condition a landed event leaves (brief 6.5): its chip name and how
// many turns it stays, fixed per event and shown to the player as turns
// left. v1.2 rolled a hidden span from a range; v1.3 shows the clock on
// purpose, so the player can plan around it.
export interface ThreatCondition {
  name: string
  turns: number
}

export interface ThreatEvent {
  id: string
  name: string
  // Threats are the default; opportunities are rare beneficial draws from
  // the same deck flow with relaxed sourcing requirements.
  kind?: 'threat' | 'opportunity'
  layers: Layer[]
  vector: Vector
  baseSeverity: 1 | 2 | 3
  // Primary first (brief 6.7): the first listed defense mitigates
  // PRIMARY_MITIGATION, each other one SECONDARY_MITIGATION.
  counters: CountermeasureId[]
  techniqueRefs: TechniqueRef[]
  chainsWith?: string[]
  effect: ThreatEffect
  condition?: ThreatCondition
  benefit?: OpportunityBenefit
  blurb: string // plain-English why-this-matters, one paragraph
  learnMoreCards: LearnMoreCard[]
}

// Campaign script: each turn draws fixed events, drawn slots, or both. A
// drawn slot is the reacting adversary's choice among its candidates
// (brief 6.3); a fixed slot is CONFIRMED.
export interface EventSlot {
  fixed?: string
  drawFrom?: string[]
}

export interface TurnPlan {
  turn: number
  // The watch officer's line for the turn (brief 6.2).
  intro: string
  slots: EventSlot[]
  // Rare beneficial draw, rolled after the threat slots resolve.
  opportunity?: { chance: number; drawFrom: string[] }
}

export interface Scenario {
  id: string
  name: string
  totalTurns: number
  startCredits: number
  incomePerTurn: number
  slaBonus: { coverageMin: number; credits: number }
  winThreshold: number
  collapseThreshold: number
  maiWeights: {
    coverage: number
    linkAvailability: number
    dataIntegrity: number
    sensorIntegrity: number
  }
  prices: {
    sat: number
    rpoSat: number
    drone: number
    groundStation: number
    intelBrief: number
  }
  // Paid at every turn close for each defense owned (brief 6.1, M10).
  upkeepPerDefense: number
  recovery: { base: number; withIrRetainer: number }
  starterAssets: { kind: AssetKind }[]
  campaign: TurnPlan[]
  briefIntro: string
  // Self-contained content: the engine reads events and countermeasures
  // only through the scenario, never from module-level imports.
  events: ThreatEvent[]
  countermeasures: Countermeasure[]
}

export interface Asset {
  id: string
  kind: AssetKind
  layer: Layer
  integrity: number // 0..100; destroyed below 1
}

// A landed event with a condition leaves it on its layers: per-turn
// pressure until it expires. remainingTurns is the clock the player sees
// (brief 6.5), counted down at every turn close.
export interface ActiveCondition {
  instanceId: string
  eventId: string
  name: string
  startedTurn: number
  remainingTurns: number
  baseSeverity: number
}

export interface PendingAsset {
  id: string
  kind: AssetKind
  etaTurns: number
}

// The debris call (brief 5.5 item 5 and 6.1).
export type DebrisChoice = 'burn' | 'hold'

// How an event went (brief 5.5): HELD when nothing got through, REDUCED
// when a defense took some of it, OPEN when nothing owned answered it.
export type EventOutcome = 'held' | 'reduced' | 'open'

export interface DebrisCall {
  choice: DebrisChoice
  // The satellite on the crossing orbit, when there was one.
  assetId?: string
  lost: boolean
  // Charged at once on a burn: 0 with the SSA subscription.
  fuel: number
  ssa: boolean
}

export interface ResolvedEvent {
  eventId: string
  name: string
  baseSeverity: number
  chainBonus: number
  mitigation: number
  effectiveSeverity: number
  repairCost: number
  notes: string[]
  firedTechniqueRefs: TechniqueRef[]
  // Threats and the debris call only; an opportunity has none.
  outcome?: EventOutcome
  // The mission assurance this event would have cost at full strength
  // minus what it did cost (brief 6.8), to one decimal.
  saved: number
  // The tile the event was aimed at, when a live asset sat on its layers:
  // the generic target, the satellite on the debris's crossing orbit. Set
  // whether or not the hit landed, so the strike can lock on and flash a
  // shield where a defense held (brief 5.5).
  targetAssetId?: string
  // The target's integrity either side of the hit, when the hit damaged it.
  integrityBefore?: number
  integrityAfter?: number
  // The condition this event left, when it landed with one.
  condition?: ThreatCondition
  debris?: DebrisCall
}

// What the player can now say (brief 6.9, WHAT YOU CAN NOW SAY): a defense
// that stopped, blunted or would have stopped a threat this game.
export type LearnedHow = 'held' | 'reduced' | 'missed'
export interface Learned {
  counter: CountermeasureId
  threat: string
  how: LearnedHow
}

// The END OF TURN card's ledger (brief 5.5 item 6), every line that made
// the budget, so the total is checkable.
export interface TurnLedger {
  // The budget the turn opened with.
  start: number
  // Spent on tonight's orders at EXECUTE.
  ordered: number
  // Burn fuel charged during the night.
  fuel: number
  // Credits an opportunity brought in during the night.
  windfall: number
  // "Left after tonight's orders": start - ordered - fuel + windfall.
  afterNight: number
  repairs: number
  // What each repair bill was for: the tile, or the event when it hit no tile.
  repaired: string[]
  upkeep: number
  defensesKept: number
  // Mission funding and the coverage bonus; both 0 on an insolvent close.
  funding: number
  coverageBonus: number
  // The coverage the bonus check read, after arrivals and with a satellite
  // that burned off station tonight left out.
  bonusCoverage: number
  arrivals: string[]
  recovery: number
  // The budget for the next turn.
  after: number
  insolvent: boolean
}

export interface TurnRecord {
  turn: number
  purchases: string[]
  // Whether the intel brief was active tonight, and the threats it named.
  briefed: boolean
  named: string[]
  events: ResolvedEvent[]
  // Names of the conditions that pressed this turn.
  conditionsActive: string[]
  ledger: TurnLedger
  creditsAfter: number
  meters: { linkAvailability: number; dataIntegrity: number; sensorIntegrity: number }
  coverage: number
  maiScore: number
  // The defense streak and points saved after the turn (brief 6.8).
  streak: number
  bestStreak: number
  saved: number
  notes: string[]
}

export interface GameState {
  scenario: Scenario
  difficulty: Difficulty
  seed: number
  turn: number // next turn to resolve, 1..totalTurns
  status: 'playing' | 'won' | 'lost'
  lossReason?: 'maiCollapse' | 'insolvency' | 'belowThreshold'
  credits: number
  assets: Asset[]
  // Owned defenses, the IR retainer among them.
  counters: CountermeasureId[]
  meters: { linkAvailability: number; dataIntegrity: number; sensorIntegrity: number }
  conditions: ActiveCondition[]
  pipeline: PendingAsset[]
  // The intel brief is free through this turn: turn 1 (D2 a), and the
  // turns an allied data share covers.
  briefFreeThrough: number
  // The defense streak, its best, and the points saved so far (brief 6.8).
  streak: number
  bestStreak: number
  saved: number
  // What the player can now say, this game (brief 6.9).
  learned: Learned[]
  history: TurnRecord[]
}

export interface AssetBuy {
  kind: AssetKind
}

export interface TurnActions {
  buyAssets: AssetBuy[]
  // Defenses, the IR retainer among them.
  buyCounters: CountermeasureId[]
  // Order the intel brief for tonight. Ignored on a turn it is free.
  intelBrief: boolean
  // The call on a conjunction night (brief 5.5 item 5). HOLD when absent,
  // which is what doing nothing is.
  debris?: DebrisChoice
}
