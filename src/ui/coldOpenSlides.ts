// The cold open as data (v1.2 R4, brief 6): four slides, each a scene
// and the watch officer's line. IntroSequence renders this list and
// derives everything countable from it (the counter, the last slide's
// BEGIN, the music's build), so a fifth slide is one more entry here and
// nothing else (principle 17).
//
// Every line is built from the config constants, as the one-slide intro
// built them, so a rename stays a one-constant change.

import { ADVERSARY, CONSTELLATION, PLAYER_ORG, SQUADRON } from '../config'
import { DEFAULT_SCENARIO } from '../content'

// Which picture a slide shows. ColdOpenScene draws each one.
export type SceneName = 'orbit' | 'disaster' | 'coldveil' | 'watch'

export interface Slide {
  scene: SceneName
  lines: readonly string[]
}

// PLAYER_ORG is written for the middle of a sentence ("the Directorate"),
// and the first line opens with it.
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const SLIDES: readonly Slide[] = [
  {
    scene: 'orbit',
    lines: [sentence(`${PLAYER_ORG} is standing up ${CONSTELLATION} and the ${SQUADRON} squadron for a disaster-response tasking.`)],
  },
  {
    scene: 'disaster',
    lines: [`The ${SQUADRON} squadron flies the disaster zone. Everything it sees comes home through ${CONSTELLATION}.`],
  },
  {
    scene: 'coldveil',
    lines: [`A threat group called ${ADVERSARY} has taken an interest.`],
  },
  {
    scene: 'watch',
    lines: ['You are the mission assurance architect. The constellation goes dark if you let it.'],
  },
]

// The chrome around the slides.
export const OPS_LABEL = `${PLAYER_ORG.replace(/^the /i, '').toUpperCase()} OPS`
export const OP_LABEL = `OP ${DEFAULT_SCENARIO.name}`
// No name, as decided (brief 6).
export const SPEAKER = 'WATCH OFFICER'

// About forty characters a second (brief 6).
export const CHARS_PER_SECOND = 40
export const MS_PER_CHAR = 1000 / CHARS_PER_SECOND

// The soft key click sounds on every third character typed, not every
// one: the click is the existing soft tick, which rings for 120ms, and
// forty of those a second overlap into a buzz rather than a keyboard.
export const CLICK_EVERY = 3

// How long a pixel dissolve takes, out or in; under reduced motion, how
// long the crossfade takes instead.
export const DISSOLVE_MS = 420
export const CROSSFADE_MS = 300
