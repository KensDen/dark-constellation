// EACH THREAT'S SOUND (v2.0 R1): a short motif of its own, played as its
// strike leaves COLDVEIL, so the ear learns the threat with the eye. Every
// motif is made of voices the audio engine already has (src/audio/voices.ts),
// in a rhythm that says what the threat does: a replay repeats itself, a
// time spoof ticks out of step, an implant has a heartbeat, phishing is a
// friendly chime that turns. New voices of their own are a later round's
// (they need the mix measured again, tests/mix-measurement.json).

import type { SoundCue } from '../../cues'

type Note = readonly [cue: SoundCue, atMs: number]

export const MOTIF: Record<string, readonly Note[]> = {
  'pnt-jamming': [['alarm-gnss', 0], ['alarm-gnss', 300]],
  'uplink-jamming': [['alarm-uplink', 0], ['alarm-uplink', 190], ['alarm-uplink', 380]],
  'gnss-spoofing': [['alarm-spoof', 0], ['tick-up', 330]],
  'time-spoof': [['tick-up', 0], ['tick-down', 130], ['tick-up', 330], ['tick-down', 400]],
  'lidar-dazzle': [['data-burst', 0], ['warn-low', 240]],
  'lidar-injection': [['soft-tick', 0], ['soft-tick', 110], ['soft-tick', 220], ['tick-up', 360]],
  'lidar-blinding': [['tick-down', 0], ['tick-down', 160], ['warn-low', 320]],
  'training-data-poisoning': [['soft-tick', 0], ['tick-down', 150], ['soft-tick', 300], ['tick-down', 450]],
  'supply-chain-implant': [['soft-tick', 0], ['soft-tick', 170], ['soft-tick', 640], ['soft-tick', 810]],
  'rogue-ground-station': [['data-burst', 0], ['denied-buzz', 280]],
  'telemetry-replay': [['data-burst', 0], ['data-burst', 290], ['data-burst', 580]],
  'downlink-eavesdropping': [['alarm-eavesdrop', 0]],
  'backhaul-exfil': [['alarm-exfil', 0], ['data-burst', 300]],
  'ground-ransomware': [['alarm-ransom', 0], ['denied-buzz', 340]],
  'ops-phishing': [['arrive-chime', 0], ['denied-buzz', 360]],
  'insider-exfil': [['buy-click', 0], ['alarm-exfil', 230]],
  'debris-conjunction': [['tick-up', 0], ['tick-up', 260], ['tick-up', 460], ['tick-up', 600]],
  'blackout-chain': [['blackout-chain', 0]],
}

// Plays a threat's motif; returns a cancel for a screen that leaves early.
export function playMotif(play: (cue: SoundCue) => void, eventId: string): () => void {
  const timers = (MOTIF[eventId] ?? []).map(([cue, at]) => window.setTimeout(() => play(cue), at))
  return () => timers.forEach((t) => window.clearTimeout(t))
}
