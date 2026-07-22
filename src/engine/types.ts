// Core engine and content types (spec Section 10, refined for R1).
// The engine is content-agnostic: it consumes whatever validated data the
// scenario carries. Content modules import these types, never the reverse.

// Difficulty (R5): documented multipliers on condition pressure and the
// economy. Standard is exactly 1 on every axis, so a Standard campaign is
// behavior-identical to the pre-R5 tuning.
export type Difficulty = 'easy' | 'standard' | 'expert'

export type Layer = 'ORBIT' | 'AIR' | 'GROUND'
export type TrustTier = 'A' | 'B'
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
  | 'intelInvestment'
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
  counters: string[] // ThreatEvent ids; empty means posture-wide (intel, IR)
  spartaCms: SpartaCmRef[]
  blurb: string
}

// What an event does when it lands. Meters name the MAI components the
// damage applies to; specials trigger engine mechanics. assetDamage false
// marks confidentiality-loss events (eavesdropping, exfiltration, replay,
// latent poisoning): they erode trust meters without physically degrading
// an asset.
export interface ThreatEffect {
  meters: ('linkAvailability' | 'dataIntegrity' | 'sensorIntegrity')[]
  special?: 'jamsGnss' | 'chainExploit' | 'implantTierB' | 'debrisStrike'
  assetDamage?: boolean
  repairCostPerSeverity: number
}

// Positive effects carried by opportunity events (R3.25): direct credits,
// a temporary intel-fidelity boost, or expediting one in-transit deploy.
export interface OpportunityBenefit {
  credits?: number
  intelBoostTurns?: number
  expediteTurns?: number
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
  counters: CountermeasureId[]
  techniqueRefs: TechniqueRef[]
  chainsWith?: string[]
  effect: ThreatEffect
  // Events with a duration become active conditions on landing: per-turn
  // pressure for a span rolled from seeded RNG inside this range, hidden
  // from the player.
  duration?: { min: number; max: number }
  benefit?: OpportunityBenefit
  blurb: string // plain-English why-this-matters, one paragraph
  learnMoreCards: LearnMoreCard[]
}

// Campaign script: each turn draws fixed events, random events, or both.
export interface EventSlot {
  fixed?: string
  drawFrom?: string[]
}

export interface TurnPlan {
  turn: number
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
    tierAUpcharge: { sat: number; drone: number }
    intelLevels: [number, number, number]
  }
  recovery: { base: number; withIrRetainer: number }
  starterAssets: { kind: AssetKind; tier: TrustTier }[]
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
  tier: TrustTier
  integrity: number // 0..100; destroyed below 1
}

export interface ChainFlags {
  lidarFallback: boolean // drones navigating on LiDAR odometry while a jam condition lives
}

// A landed event with a duration becomes an active condition: per-turn
// pressure until it expires. remainingTurns is rolled hidden; the UI shows
// elapsed time, and only high intel estimates what is left.
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
  tier: TrustTier
  etaTurns: number
}

export interface PendingCounter {
  id: CountermeasureId
  etaTurns: number
}

export interface IntelForecast {
  turn: number
  lines: string[]
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
}

export interface TurnRecord {
  turn: number
  creditsAfter: number
  purchases: string[]
  events: ResolvedEvent[]
  meters: { linkAvailability: number; dataIntegrity: number; sensorIntegrity: number }
  coverage: number
  maiScore: number
  flags: ChainFlags
  // Names of conditions that applied pressure this turn, commendations
  // earned, and the surge authority balance after the turn.
  conditionsActive: string[]
  commendations: string[]
  surgeTokensAfter: number
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
  intelLevel: 0 | 1 | 2 | 3
  irRetainer: boolean
  assets: Asset[]
  counters: CountermeasureId[]
  meters: { linkAvailability: number; dataIntegrity: number; sensorIntegrity: number }
  flags: ChainFlags
  conditions: ActiveCondition[]
  pipeline: PendingAsset[]
  pendingCounters: PendingCounter[]
  surgeTokens: number
  intelBoostTurns: number
  forecast: IntelForecast
  history: TurnRecord[]
}

export interface AssetBuy {
  kind: AssetKind
  tier: TrustTier
}

export interface TurnActions {
  buyAssets: AssetBuy[]
  buyCounters: CountermeasureId[]
  buyIntelLevel: boolean
  buyIrRetainer: boolean
  // Spend one surge authority token to clear the named active condition
  // (by instanceId) before this turn's pressure applies.
  spendSurgeOn?: string
}
