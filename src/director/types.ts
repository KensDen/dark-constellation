// Director beat vocabulary (game-feel Round 2). A beat is one thing the
// player sees happen during the adversary phase: a data-only description
// plus a Patch of state deltas. Beats are derived from the engine's log by
// the presentation adapter (beats.ts); the engine never produces them and
// never reads them. Everything here is serializable so a beat list can be
// replayed, tested in node, and later paired with visual and sound cues.

import type {
  ActiveCondition,
  Asset,
  ChainFlags,
  CountermeasureId,
  GameState,
  Layer,
  PendingAsset,
  PendingCounter,
} from '../engine/types'

export type MeterKey = 'linkAvailability' | 'dataIntegrity' | 'sensorIntegrity'
export const METER_KEYS: MeterKey[] = ['linkAvailability', 'dataIntegrity', 'sensorIntegrity']

// One kind per row of the brief's cue table that the engine log can
// express, plus the bookkeeping kinds the ledger needs. Every kind must
// resolve to a cue entry (tests/cues.spec.ts).
export type BeatKind =
  | 'turn-start'
  | 'deploy-arrived'
  | 'procurement'
  | 'surge-spent'
  | 'condition-pressure'
  | 'chain-armed'
  | 'quiet'
  | 'threat'
  | 'opportunity'
  | 'condition-applied'
  | 'condition-renewed'
  | 'end-of-turn-tick'
  | 'condition-cleared'
  | 'commendation'
  | 'settle'
  | 'outcome'

export const BEAT_KINDS: BeatKind[] = [
  'turn-start',
  'deploy-arrived',
  'procurement',
  'surge-spent',
  'condition-pressure',
  'chain-armed',
  'quiet',
  'threat',
  'opportunity',
  'condition-applied',
  'condition-renewed',
  'end-of-turn-tick',
  'condition-cleared',
  'commendation',
  'settle',
  'outcome',
]

// State deltas a beat applies to the presented state. Numeric meter,
// credit and token fields are signed deltas already clamped by the adapter
// (so the display can show the exact number that moved). Collection fields
// are add, remove, or absolute-set operations. The *Set fields exist only
// for the settle beat, which reconciles any residual against the engine's
// real after-state.
export interface Patch {
  meters?: Partial<Record<MeterKey, number>>
  credits?: number
  surgeTokens?: number
  intelBoostTurns?: number
  intelLevel?: GameState['intelLevel']
  irRetainer?: boolean
  assetsAdd?: Asset[]
  assetIntegrity?: Record<string, number>
  assetsSet?: Asset[]
  conditionsAdd?: ActiveCondition[]
  conditionsRemove?: string[]
  conditionsRemaining?: Record<string, number>
  conditionsSet?: ActiveCondition[]
  pipelineAdd?: PendingAsset[]
  pipelineRemove?: string[]
  pipelineEta?: Record<string, number>
  pipelineSet?: PendingAsset[]
  pendingCountersAdd?: PendingCounter[]
  pendingCountersRemove?: CountermeasureId[]
  pendingCountersEta?: Partial<Record<CountermeasureId, number>>
  pendingCountersSet?: PendingCounter[]
  countersAdd?: CountermeasureId[]
  countersSet?: CountermeasureId[]
  flags?: Partial<ChainFlags>
}

export interface BeatSeverity {
  base: number
  chain: number
  mitigation: number
  effective: number
}

export interface Beat {
  // Stable within a turn: `t<turn>-<index>-<kind>[-<subject>]`.
  id: string
  kind: BeatKind
  // Invisible beats apply their patch and are passed over without a dwell
  // (bookkeeping the engine does silently, such as the end-of-turn tick).
  visible: boolean
  title: string
  // Event id, countermeasure id, or the eventId behind a condition.
  subjectId?: string
  // Key into the cue registry: `beat:<kind>`, `event:<id>`,
  // `condition:<eventId>`, or `counter:<id>`.
  cueKey: string
  // Every framework reference the event carries, first one first.
  techniques?: { tag: string; url: string }[]
  layers?: Layer[]
  severity?: BeatSeverity
  // Prose from the engine log that belongs to this beat, verbatim.
  lines: string[]
  patch: Patch
  // Whether an outcome beat is a LOSS. Present only on the outcome kind.
  //
  // Finding 3.10, carried since Round 3. The view derived this by matching
  // the beat's title against 'MISSION FAILED', and the winning title is
  // 'MISSION ASSURED': both begin with the same word, so an edit to either
  // string silently inverts the treatment, and a loss renders friendly
  // with a victory fanfare. Round 5 is the round that gives the outcomes
  // their scenes, which is exactly the round that would touch those
  // strings. The treatment now rides what the beat IS rather than what it
  // says.
  lost?: boolean
}
