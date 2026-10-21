// The SYSTEM sheet's controls as data (v1.3 R1, brief 5.8), apart from
// the components that render them (./SystemPanel.tsx, ./board/SystemSheet.tsx)
// so neither imports the other.

import { COUNTERMEASURE_COUNT, OPPORTUNITY_EVENT_COUNT, SOURCE_COUNT, TECHNIQUE_REF_COUNT, THREAT_EVENT_COUNT } from '../content'
import { SOUND_TOGGLE_LABELS } from './brief'

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
export const DECK_LINE = `The deck: ${THREAT_EVENT_COUNT} threats, ${OPPORTUNITY_EVENT_COUNT} opportunities, ${COUNTERMEASURE_COUNT} countermeasures, ${TECHNIQUE_REF_COUNT} techniques, ${SOURCE_COUNT} cited sources.`
