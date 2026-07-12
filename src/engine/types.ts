// Core engine and content types (spec Section 10, refined for R1).
// The engine is content-agnostic: it consumes whatever validated data the
// scenario carries. Content modules import these types, never the reverse.

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

export type CountermeasureId =
  | 'linkAuth'
  | 'antiJam'
  | 'sensorFusion'
  | 'tierAAttestation'
  | 'groundZeroTrust'
  | 'ssaManeuver'
  | 'intelInvestment'
  | 'irRetainer'

export interface Countermeasure {
  id: CountermeasureId
  name: string
  cost: number
  counters: string[] // ThreatEvent ids; empty means posture-wide (intel, IR)
  blurb: string
}

// What an event does when it lands. Meters name the MAI components the
// damage applies to; specials trigger engine mechanics.
export interface ThreatEffect {
  meters: ('linkAvailability' | 'dataIntegrity' | 'sensorIntegrity')[]
  special?: 'jamsGnss' | 'chainExploit' | 'implantTierB' | 'debrisStrike'
  repairCostPerSeverity: number
}

export interface ThreatEvent {
  id: string
  name: string
  layers: Layer[]
  vector: Vector
  baseSeverity: 1 | 2 | 3
  counters: CountermeasureId[]
  techniqueRefs: TechniqueRef[]
  chainsWith?: string[]
  effect: ThreatEffect
  blurb: string // plain-English why-this-matters, one paragraph
}

// Campaign script: each turn draws fixed events, random events, or both.
export interface EventSlot {
  fixed?: string
  drawFrom?: string[]
}

export interface TurnPlan {
  turn: number
  slots: EventSlot[]
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
  gnssJammedTurns: number // remaining turns of GNSS denial
  lidarFallback: boolean // drones navigating on LiDAR odometry
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
  notes: string[]
}

export interface GameState {
  scenario: Scenario
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
}
