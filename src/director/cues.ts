// Cue registry (game-feel brief v0.5 section 6, principle 7). Hand-keyed
// by the deck's event, condition and countermeasure ids plus the
// director's beat kinds. Round 2 shipped placeholders; Round 3 fills every
// visual slot, so the battery now fails on a placeholder visual as well as
// on a missing entry. Sound slots stay placeholder until Round 4.
//
// This map is deliberately written by hand rather than generated from the
// content data: generating it would make the coverage test vacuous. Adding
// an event to the deck must fail the battery until someone decides what
// that event looks and sounds like.

import type { BeatKind } from './types'

// The visual treatments the presentation layer implements. Each maps to a
// CSS class or a component behaviour; 'silent' is a real decision (the
// beat carries a patch but renders nothing), not an absence.
export type VisualCue =
  | 'placeholder'
  | 'silent'
  | 'transmission'
  | 'card-hostile'
  | 'card-friendly'
  | 'badge-attach'
  | 'badge-tick'
  | 'badge-clear'
  | 'meter-ease'
  | 'strobe'
  | 'blackout'
  | 'token-burn'
  | 'ribbon'
  | 'asset-light'
  | 'outcome-sweep'
  | 'tile-press'
  | 'shake-flash'

export type SoundCue = 'placeholder'

export interface Cue {
  label: string
  visual: VisualCue
  sound: SoundCue
}

const cue = (label: string, visual: VisualCue): Cue => ({ label, visual, sound: 'placeholder' })

// The CSS class each visual applies to the element that carries it. A
// treatment with no class of its own (it is expressed by a component's
// own structure) maps to the empty string.
export const VISUAL_CLASS: Record<VisualCue, string> = {
  placeholder: '',
  silent: '',
  transmission: 'dc-transmission-in',
  'card-hostile': 'dc-card-in',
  'card-friendly': 'dc-card-in',
  'badge-attach': 'dc-badge-attach',
  'badge-tick': 'dc-badge-tick',
  'badge-clear': 'dc-badge-clear',
  'meter-ease': '',
  strobe: 'dc-strobe',
  blackout: 'dc-blackout',
  'token-burn': 'dc-token-burn',
  ribbon: 'dc-ribbon-in',
  'asset-light': 'dc-asset-light',
  'outcome-sweep': 'dc-card-in',
  'tile-press': '',
  'shake-flash': 'dc-shake',
}

// How long each treatment runs, matching the stylesheet. The cue helper
// removes its class when the animation is over, so a value shorter than
// the animation would cut it off mid-frame and snap the element back.
// tests/cues.spec.ts reads these out of index.css, so the two cannot drift.
export const VISUAL_MS: Record<VisualCue, number> = {
  placeholder: 0,
  silent: 0,
  transmission: 320,
  'card-hostile': 260,
  'card-friendly': 260,
  'badge-attach': 420,
  'badge-tick': 700,
  'badge-clear': 520,
  'meter-ease': 0,
  strobe: 0,
  blackout: 900,
  'token-burn': 560,
  ribbon: 420,
  'asset-light': 900,
  'outcome-sweep': 260,
  'tile-press': 0,
  'shake-flash': 320,
}

// Treatments that are safe to run on a whole card. The badge and token
// families were authored for a small element and end hidden or dimmed
// (badge-clear finishes at opacity 0, token-burn at 0.25), so handing one
// to the card would fade the card itself out. Those play on a marker
// inside the card instead, and the card keeps its own entrance.
export const CARD_SAFE_VISUALS = new Set<VisualCue>([
  'transmission',
  'card-hostile',
  'card-friendly',
  'blackout',
  'ribbon',
  'outcome-sweep',
  'asset-light',
])

export const BEAT_CUES: Record<BeatKind, Cue> = {
  'turn-start': cue('Turn start: income and recovery', 'transmission'),
  'deploy-arrived': cue('Deployment arrives', 'asset-light'),
  procurement: cue('Procurement confirmed', 'silent'),
  'surge-spent': cue('Surge authority spent', 'token-burn'),
  'condition-pressure': cue('Condition persists', 'badge-tick'),
  'chain-armed': cue('BLACKOUT CHAIN armed', 'blackout'),
  quiet: cue('No adversary activity', 'transmission'),
  threat: cue('Adversary event', 'card-hostile'),
  opportunity: cue('Opportunity', 'card-friendly'),
  'condition-applied': cue('Condition applied', 'badge-attach'),
  'condition-renewed': cue('Condition renewed', 'badge-attach'),
  'end-of-turn-tick': cue('End of turn', 'silent'),
  'condition-cleared': cue('Condition cleared', 'badge-clear'),
  commendation: cue('Commendation earned', 'ribbon'),
  settle: cue('State reconciled', 'silent'),
  outcome: cue('Campaign outcome', 'outcome-sweep'),
}

// Threat and opportunity events, keyed by ThreatEvent.id.
export const EVENT_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('PNT jamming', 'card-hostile'),
  'uplink-jamming': cue('Uplink jamming', 'card-hostile'),
  'gnss-spoofing': cue('GNSS spoofing', 'card-hostile'),
  'time-spoof': cue('Time spoof', 'card-hostile'),
  'lidar-dazzle': cue('Docking LiDAR dazzle', 'card-hostile'),
  'lidar-injection': cue('LiDAR point-cloud injection', 'card-hostile'),
  'lidar-blinding': cue('LiDAR perception blinding', 'card-hostile'),
  'training-data-poisoning': cue('Training-data poisoning', 'card-hostile'),
  'supply-chain-implant': cue('Supply-chain firmware implant', 'card-hostile'),
  'rogue-ground-station': cue('Rogue ground station', 'card-hostile'),
  'telemetry-replay': cue('Telemetry replay', 'card-hostile'),
  'downlink-eavesdropping': cue('Downlink eavesdropping', 'card-hostile'),
  'backhaul-exfil': cue('Backhaul exfiltration', 'card-hostile'),
  'ground-ransomware': cue('Ground segment ransomware', 'card-hostile'),
  'ops-phishing': cue('Ops credential phishing', 'card-hostile'),
  'insider-exfil': cue('Insider exfiltration', 'card-hostile'),
  'debris-conjunction': cue('Debris conjunction', 'card-hostile'),
  // The signature move gets the screen, not just a card.
  'blackout-chain': cue('BLACKOUT CHAIN', 'blackout'),
  'appropriations-rider': cue('Appropriations rider', 'card-friendly'),
  'allied-ssa-datashare': cue('Allied SSA data share', 'card-friendly'),
  'rideshare-slot': cue('Rideshare slot', 'card-friendly'),
}

// Persistent conditions, keyed by the eventId of the event that spawns
// them (every event with a duration).
export const CONDITION_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('GNSS denial condition', 'badge-attach'),
  'uplink-jamming': cue('Uplink denial condition', 'badge-attach'),
  'gnss-spoofing': cue('Spoofed navigation condition', 'badge-attach'),
  'downlink-eavesdropping': cue('Eavesdropping condition', 'badge-attach'),
  'backhaul-exfil': cue('Exfiltration condition', 'badge-attach'),
  'ground-ransomware': cue('Ransomware condition', 'badge-attach'),
}

// Countermeasures, keyed by CountermeasureId. These fire when a retrofit
// completes and when the card is bought.
export const COUNTER_CUES: Record<string, Cue> = {
  linkAuth: cue('Link-layer auth', 'asset-light'),
  antiJam: cue('Anti-jam antennas', 'asset-light'),
  pntAuth: cue('PNT authentication', 'asset-light'),
  sensorFusion: cue('Sensor fusion', 'asset-light'),
  tierAAttestation: cue('Tier A attestation', 'asset-light'),
  mlPipelineIntegrity: cue('ML pipeline integrity', 'asset-light'),
  groundZeroTrust: cue('Ground zero trust', 'asset-light'),
  insiderProgram: cue('Insider program', 'asset-light'),
  ssaManeuver: cue('SSA maneuver budget', 'asset-light'),
  encryptedBackhaul: cue('Encrypted backhaul', 'asset-light'),
  intelInvestment: cue('Intel investment', 'asset-light'),
  irRetainer: cue('Incident response retainer', 'asset-light'),
}

// Every row of the brief's section 6 table, with the visual that now
// carries it and where it lives. The battery walks this so the round's
// closing condition ("every row of section 6 has its visual") is checked
// against the code rather than asserted in a report. Rounds 4 to 6 add the
// sound and haptic columns; Round 5 upgrades the four cinematic rows.
export interface Section6Row {
  beat: string
  visual: VisualCue
  where: string
  // True where Round 5 owns the full cinematic treatment and Round 3
  // ships the baseline visual.
  cinematicInRound5?: boolean
  // What the brief's row asks for that this round does not yet ship, so
  // the battery does not report an unfinished row as done.
  deferred?: string
}

export const SECTION_6_ROWS: Section6Row[] = [
  { beat: 'Turn start, intel incoming', visual: 'transmission', where: 'ui/cues/Teletype.tsx' },
  {
    beat: 'Buy fleet or countermeasure',
    visual: 'tile-press',
    // A fleet buy slides into the manifest; a countermeasure has no
    // manifest entry to slide into and carries its selected state on the
    // tile instead. Recorded so the row is not read as promising a
    // manifest entrance the countermeasure half never had.
    where: 'ui/Game.tsx procurement tiles (fleet buys slide into the manifest; countermeasure tiles hold their state in place)',
  },
  { beat: 'Cannot afford', visual: 'shake-flash', where: 'ui/Game.tsx procurement tiles' },
  { beat: 'EXECUTE TURN', visual: 'tile-press', where: 'ui/Game.tsx resolve control' },
  { beat: 'Adversary event lands', visual: 'card-hostile', where: 'director/DirectorView.tsx' },
  { beat: 'Condition applied', visual: 'badge-attach', where: 'ui/cues/ConditionBadge.tsx' },
  { beat: 'Condition persists into a new turn', visual: 'badge-tick', where: 'ui/cues/ConditionBadge.tsx' },
  { beat: 'Condition cleared', visual: 'badge-clear', where: 'ui/cues/ConditionBadge.tsx' },
  { beat: 'Meter delta', visual: 'meter-ease', where: 'ui/cues/Meter.tsx' },
  { beat: 'MAI crosses below the win line', visual: 'strobe', where: 'ui/cues/Meter.tsx' },
  { beat: 'BLACKOUT CHAIN fires', visual: 'blackout', where: 'director/DirectorView.tsx', cinematicInRound5: true },
  { beat: 'Surge token spent', visual: 'token-burn', where: 'director/DirectorView.tsx' },
  { beat: 'Commendation earned', visual: 'ribbon', where: 'director/DirectorView.tsx', cinematicInRound5: true },
  {
    beat: 'Deployment arrives',
    visual: 'asset-light',
    where: 'director/DirectorView.tsx',
    deferred:
      'lighting the matching satellite on the constellation frame, which needs the frame to be on screen during playback; it renders only on the start screen today',
  },
  { beat: 'Campaign won', visual: 'outcome-sweep', where: 'director/DirectorView.tsx', cinematicInRound5: true },
  { beat: 'Campaign lost', visual: 'outcome-sweep', where: 'director/DirectorView.tsx', cinematicInRound5: true },
]

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

// Beat kinds whose own treatment must win over the deck-keyed cue. The
// cue key names the subject (which condition, which event) so the label
// and the sound can be specific, but the visual belongs to what is
// happening: surge burns a token, a clear sweeps green, persistence
// ticks. Without this the deck cue's attach glow would play, which is
// both the wrong motion and the wrong colour for a friendly beat.
const KIND_OWNS_VISUAL = new Set<BeatKind>(['surge-spent', 'condition-cleared', 'condition-pressure'])

// The class a beat contributes, or '' when the treatment is structural
// rather than a one-shot animation.
export function visualClass(cueKey: string, kind?: BeatKind): string {
  const found = kind && KIND_OWNS_VISUAL.has(kind) ? BEAT_CUES[kind] : resolveCue(cueKey)
  return found ? VISUAL_CLASS[found.visual] : ''
}

// The visual a beat actually plays, for the battery to check against the
// section 6 table.
export function visualFor(cueKey: string, kind?: BeatKind): VisualCue | undefined {
  const found = kind && KIND_OWNS_VISUAL.has(kind) ? BEAT_CUES[kind] : resolveCue(cueKey)
  return found?.visual
}
