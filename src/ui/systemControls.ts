// The SYSTEM sheet's controls as data (v1.3 R1, brief 5.8), apart from
// the components that render them (./SystemPanel.tsx, ./board/SystemSheet.tsx)
// so neither imports the other.

import { ADVISORY_COUNT, COUNTERMEASURE_COUNT, FRAMEWORK_TECHNIQUE_COUNT, OPPORTUNITY_EVENT_COUNT, SOURCE_COUNT, THREAT_EVENT_COUNT } from '../content'

// The two audio toggles (Round 4d), one word each, ON or OFF beside them
// since the v1.3 R1 fixes.
export const SOUND_TOGGLE_LABELS = { effects: 'Sound', music: 'Music' } as const

export const SYSTEM_TITLE = 'SYSTEM'

// One word, like the two sound toggles beside it.
export const MOTION_TOGGLE_LABEL = 'Motion'

export interface SystemControl {
  id: 'difficulty' | 'sound' | 'music' | 'motion' | 'export' | 'import' | 'replay' | 'scoreboard' | 'credits' | 'title'
  // The accessible name the control carries, as the tests find it.
  name: string
}

// Ten controls. The two sound toggles are one component, SoundToggles,
// which renders both names.
export const SYSTEM_CONTROLS: readonly SystemControl[] = [
  { id: 'difficulty', name: 'Difficulty' },
  { id: 'sound', name: SOUND_TOGGLE_LABELS.effects },
  { id: 'music', name: SOUND_TOGGLE_LABELS.music },
  { id: 'motion', name: MOTION_TOGGLE_LABEL },
  { id: 'export', name: 'Copy save code' },
  { id: 'import', name: 'Load save code' },
  { id: 'replay', name: 'Replay a seed' },
  { id: 'scoreboard', name: 'Scoreboard' },
  { id: 'credits', name: 'Credits and license' },
  { id: 'title', name: 'Back to title' },
]

// What the deck holds, in one line (QC gauntlet G-065), where the retired
// start screen's "Content loaded from data" footer used to say it. No
// developer words (brief section 4 rule 10), so not "in this build".
// The techniques counted apart from the NSA advisory since v1.5 R1, as the
// README counts them.
export const DECK_LINE = `The deck: ${THREAT_EVENT_COUNT} threats, ${OPPORTUNITY_EVENT_COUNT} opportunities, ${COUNTERMEASURE_COUNT} countermeasures, ${FRAMEWORK_TECHNIQUE_COUNT} framework techniques, ${ADVISORY_COUNT} NSA ${ADVISORY_COUNT === 1 ? 'advisory' : 'advisories'}, ${SOURCE_COUNT} cited sources.`
