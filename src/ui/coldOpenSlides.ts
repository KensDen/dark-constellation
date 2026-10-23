// The briefing as data (v1.2 R4 as the cold open; rebuilt in v1.3 R1,
// brief 5.2): four beats, each an animated pixel scene, its two corner
// captions and the watch officer's line, verbatim from the brief's
// Appendix B. IntroSequence renders this list and derives everything
// countable from it (the progress bar, the last beat's button, the
// music's build), so a fifth beat is one more entry here and nothing else
// (principle 17).

// Which picture a beat shows. ./briefingScenes.ts draws each one.
export type SceneName = 'orbit' | 'disaster' | 'coldveil' | 'watch'

export interface Beat {
  scene: SceneName
  // The watch officer's clock for the line.
  time: string
  // Top left and top right of the picture.
  caption: readonly [string, string]
  // The right caption reads hostile.
  hostile?: boolean
  text: string
}

export const BEATS: readonly Beat[] = [
  {
    scene: 'orbit',
    time: '21:00Z',
    caption: ['ORBIT · STORMGLASS-9', '3 BIRDS UP'],
    text: 'STORMGLASS-9 will be nine smallsats. Tonight two are up, with one inspection bird. Under it, the KESTREL squadron flies flood relief over three counties. Every frame they shoot comes home through us.',
  },
  {
    scene: 'disaster',
    time: '21:04Z',
    caption: ['AIR · KESTREL SQUADRON', 'FLOOD ZONE'],
    text: 'The county EOC is routing convoys on our imagery and sending rescue crews off our maps. If the constellation goes dark, they fly blind. People are waiting on what we deliver tonight.',
  },
  {
    scene: 'coldveil',
    time: '21:09Z',
    caption: ['GROUND · GS-1', '⚠ UNKNOWN ACTOR'],
    hostile: true,
    text: 'A threat group called COLDVEIL has taken an interest. They do not hit you where you are strong. They probe where you are thin, and they learn.',
  },
  {
    scene: 'watch',
    time: '21:12Z',
    caption: ['OPS FLOOR', 'ON WATCH'],
    text: 'You are the mission assurance architect. Six turns. Two jobs: keep mission assurance at 70 or above, and build the dossier on COLDVEIL. Every move they make teaches you how they work. Your first intel brief is already on your desk.',
  },
]

// No name, as decided (brief 6).
export const SPEAKER = 'WATCH OFFICER'

// Forty characters a second, as shipped (brief 5.2).
export const CHARS_PER_SECOND = 40
export const MS_PER_CHAR = 1000 / CHARS_PER_SECOND

// The soft key click sounds on every third character typed, not every
// one: the click is the existing soft tick, which rings for 120ms, and
// forty of those a second overlap into a buzz rather than a keyboard.
export const CLICK_EVERY = 3

// The pixel dissolve each scene enters with, in seconds (brief 5.2).
export const DISSOLVE_S = 0.42
