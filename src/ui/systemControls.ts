// The SYSTEM sheet's controls as data (v1.3 R1, brief 5.8), apart from
// the component that renders them (./SystemPanel.tsx).

import { ADVERSARY } from '../config'
import { ADVISORY_COUNT, COUNTERMEASURE_COUNT, DEFAULT_SCENARIO, FRAMEWORK_TECHNIQUE_COUNT, OPPORTUNITY_EVENT_COUNT, SOURCE_COUNT, THREAT_EVENT_COUNT } from '../content'
import { HARDEN, NEW_DEFENSES_PER_NIGHT, SCANS_PER_NIGHT } from '../engine/rules'

// The two audio toggles (Round 4d), one word each, ON or OFF beside them
// since the v1.3 R1 fixes.
export const SOUND_TOGGLE_LABELS = { effects: 'Sound', music: 'Music' } as const

export const SYSTEM_TITLE = 'SYSTEM'

// One word, like the two sound toggles beside it.
export const MOTION_TOGGLE_LABEL = 'Motion'

export interface SystemControl {
  id: 'howto' | 'difficulty' | 'sound' | 'music' | 'motion' | 'export' | 'import' | 'replay' | 'scoreboard' | 'credits' | 'title'
  // The accessible name the control carries, as the tests find it.
  name: string
}

// Eleven controls since v1.6 R3 (HOW TO PLAY). The two sound toggles are
// one component, SoundToggles, which renders both names.
export const SYSTEM_CONTROLS: readonly SystemControl[] = [
  { id: 'howto', name: 'How to play' },
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

// HOW TO PLAY (v1.6 R3, Ken's playtest item 6; the 3D game's since v2.0
// R3), which SYSTEM opens on the title. Every number is the scenario's or
// the engine's.
export function howToLines(scenario = DEFAULT_SCENARIO): string[] {
  const { totalTurns, winThreshold, collapseThreshold, upkeepPerDefense, answers } = scenario
  return [
    `Finish night ${totalTurns} with the mission assurance score at ${winThreshold} or higher. You start above the win line, and ${ADVERSARY} spends ${totalTurns} nights eroding it.`,
    `Before each night, ${ADVERSARY}’s possible moves stand over the fleet as signatures. Scan ${SCANS_PER_NIGHT} of them, or name one on sight, to see what it is and what answers it. ${ADVERSARY} plays the move your defenses take the fewest points off.`,
    `Place ${NEW_DEFENSES_PER_NIGHT} new defense a night. It covers the whole fleet against its moves, and a strike on the asset it sits on lands ${HARDEN} point weaker. Each defense takes ${upkeepPerDefense} CR a night to keep, and new assets take nights to arrive.`,
    `In the night, a move that would land stops for your answer: block it, halve it, or ride it out. You have ${answers} answers for the whole operation. Some nights your own policy engine stops one of your assets: read the checks, then override the block or let it stand.`,
    `Some attacks become conditions that press every night until they lift. A score under ${collapseThreshold} or a budget under 0 ends the operation.`,
  ]
}
