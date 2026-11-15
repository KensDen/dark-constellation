// EACH THREAT'S SOUND: a voice of its own, played as its strike leaves
// COLDVEIL, so the ear learns the threat with the eye.
//
// In v2.0 R1 this was a motif: a rhythm of voices borrowed from other cues
// (alarm blips, ticks, the buy click), timed here. Since v2.0 R3 (Ken's
// ruling of 15 November 2026: voices for the threats) each threat has one
// synthesized voice that says what it does: a replay repeats itself, a
// time spoof ticks out of step, an implant has a heartbeat, phishing is a
// friendly chime that turns. The voices are in src/audio/voices.ts, which
// threat has which is in the registry (THREAT_VOICES, src/cues.ts), and
// their levels are measured in the mix (tests/mix-measurement.json).
//
// Nothing here is the only way a strike is told: the banner names the
// threat and shows its signature, and a line says it to a screen reader
// (Game3D.tsx, cards3d.tsx), so the game plays the same with sound off.

import { THREAT_VOICES, type SoundCue } from '../../cues'

// Plays a threat's voice, and returns a cancel as the motif did, because
// the game calls one whenever a stage of the night ends. There is nothing
// left for it to stop: a motif was notes on timers, and the cancel kept
// the later ones from starting, but a voice is handed to the audio engine
// whole and at once, and ends by itself inside its declared length
// (SOUND_MS), as every other cue the game plays does. It does not cut a
// voice in flight on purpose: the game calls it at the end of every stage,
// and with Reduce Motion on a stage can end before BLACKOUT CHAIN's static
// has sounded.
export function playMotif(play: (cue: SoundCue) => void, eventId: string): () => void {
  const voice = THREAT_VOICES[eventId]
  if (voice) play(voice)
  return () => {}
}
