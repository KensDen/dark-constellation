// Cue registry (game-feel brief section 6, principle 7). Hand-keyed by the
// deck's event, condition and countermeasure ids plus the director's beat
// kinds. Round 2 ships placeholders only: every entry exists and resolves,
// and the battery fails if the deck grows a beat with no entry
// (tests/cues.spec.ts). Round 3 fills the visual slots, Round 4 the sound
// slots; a placeholder counts as coverage until then.
//
// This map is deliberately written by hand rather than generated from the
// content data: generating it would make the coverage test vacuous. Adding
// an event to the deck must fail the battery until someone decides what
// that event looks and sounds like.

import type { BeatKind } from './types'

export type VisualCue = 'placeholder'
export type SoundCue = 'placeholder'

export interface Cue {
  label: string
  visual: VisualCue
  sound: SoundCue
}

const placeholder = (label: string): Cue => ({ label, visual: 'placeholder', sound: 'placeholder' })

export const BEAT_CUES: Record<BeatKind, Cue> = {
  'turn-start': placeholder('Turn start: income and recovery'),
  'deploy-arrived': placeholder('Deployment arrives'),
  procurement: placeholder('Procurement confirmed'),
  'deploy-slipped': placeholder('Deployment slips'),
  'surge-spent': placeholder('Surge authority spent'),
  'condition-pressure': placeholder('Condition persists'),
  'chain-armed': placeholder('BLACKOUT CHAIN armed'),
  quiet: placeholder('No adversary activity'),
  threat: placeholder('Adversary event'),
  opportunity: placeholder('Opportunity'),
  'condition-applied': placeholder('Condition applied'),
  'condition-renewed': placeholder('Condition renewed'),
  'end-of-turn-tick': placeholder('End of turn'),
  'condition-cleared': placeholder('Condition cleared'),
  commendation: placeholder('Commendation earned'),
  settle: placeholder('State reconciled'),
  outcome: placeholder('Campaign outcome'),
}

// Threat and opportunity events, keyed by ThreatEvent.id.
export const EVENT_CUES: Record<string, Cue> = {
  'pnt-jamming': placeholder('PNT jamming'),
  'uplink-jamming': placeholder('Uplink jamming'),
  'gnss-spoofing': placeholder('GNSS spoofing'),
  'time-spoof': placeholder('Time spoof'),
  'lidar-dazzle': placeholder('Docking LiDAR dazzle'),
  'lidar-injection': placeholder('LiDAR point-cloud injection'),
  'lidar-blinding': placeholder('LiDAR perception blinding'),
  'training-data-poisoning': placeholder('Training-data poisoning'),
  'supply-chain-implant': placeholder('Supply-chain firmware implant'),
  'rogue-ground-station': placeholder('Rogue ground station'),
  'telemetry-replay': placeholder('Telemetry replay'),
  'downlink-eavesdropping': placeholder('Downlink eavesdropping'),
  'backhaul-exfil': placeholder('Backhaul exfiltration'),
  'ground-ransomware': placeholder('Ground segment ransomware'),
  'ops-phishing': placeholder('Ops credential phishing'),
  'insider-exfil': placeholder('Insider exfiltration'),
  'debris-conjunction': placeholder('Debris conjunction'),
  'blackout-chain': placeholder('BLACKOUT CHAIN'),
  'appropriations-rider': placeholder('Appropriations rider'),
  'allied-ssa-datashare': placeholder('Allied SSA data share'),
  'rideshare-slot': placeholder('Rideshare slot'),
}

// Persistent conditions, keyed by the eventId of the event that spawns
// them (every event with a duration).
export const CONDITION_CUES: Record<string, Cue> = {
  'pnt-jamming': placeholder('GNSS denial condition'),
  'uplink-jamming': placeholder('Uplink denial condition'),
  'gnss-spoofing': placeholder('Spoofed navigation condition'),
  'downlink-eavesdropping': placeholder('Eavesdropping condition'),
  'backhaul-exfil': placeholder('Exfiltration condition'),
  'ground-ransomware': placeholder('Ransomware condition'),
}

// Countermeasures, keyed by CountermeasureId.
export const COUNTER_CUES: Record<string, Cue> = {
  linkAuth: placeholder('Link-layer auth'),
  antiJam: placeholder('Anti-jam antennas'),
  pntAuth: placeholder('PNT authentication'),
  sensorFusion: placeholder('Sensor fusion'),
  tierAAttestation: placeholder('Tier A attestation'),
  mlPipelineIntegrity: placeholder('ML pipeline integrity'),
  groundZeroTrust: placeholder('Ground zero trust'),
  insiderProgram: placeholder('Insider program'),
  ssaManeuver: placeholder('SSA maneuver budget'),
  encryptedBackhaul: placeholder('Encrypted backhaul'),
  intelInvestment: placeholder('Intel investment'),
  irRetainer: placeholder('Incident response retainer'),
}

// Resolve a beat's cue key. Returns undefined for an unknown key, which the
// coverage test treats as a failure; the view falls back to the kind cue.
export function resolveCue(cueKey: string): Cue | undefined {
  const sep = cueKey.indexOf(':')
  if (sep < 0) return undefined
  const ns = cueKey.slice(0, sep)
  const id = cueKey.slice(sep + 1)
  if (ns === 'beat') return (BEAT_CUES as Record<string, Cue>)[id]
  if (ns === 'event') return EVENT_CUES[id]
  if (ns === 'condition') return CONDITION_CUES[id]
  if (ns === 'counter') return COUNTER_CUES[id]
  return undefined
}
