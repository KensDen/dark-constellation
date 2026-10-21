// The SYSTEM sheet on the board (v1.2 R1b; rebuilt in v1.3 R1, brief 5.8):
// the controls that are not a decision about the turn, behind the gear on
// the HUD, so the board ends at the action bar. The same controls open
// from the title's SYSTEM; ../SystemPanel.tsx renders them from the one
// list below, which the suites pin by count and by name so a control
// cannot drop out unnoticed.
//
// v1.3 R1 changes the list (brief 5.8, M21): Save left with the named
// slots (a game is the autosave plus one code), Back to menu became Back
// to title with the menu's retirement (M1), and difficulty, motion, Load a
// save code, Replay a seed, the scoreboard and credits arrived from the
// retired menu and start screen.
//
// Muting stays available whatever the campaign's status: an accessibility
// path that disappears at the loudest moment is not one.

import SystemPanel, { type SystemPanelProps } from '../SystemPanel'
import { SYSTEM_TITLE } from '../systemControls'
import Sheet from './Sheet'

export { MOTION_TOGGLE_LABEL, SYSTEM_CONTROLS, SYSTEM_TITLE, type SystemControl } from '../systemControls'

export interface SystemSheetProps extends SystemPanelProps {
  playing: boolean
  onClose: () => void
}

export default function SystemSheet({ playing, onClose, ...panel }: SystemSheetProps) {
  return (
    <Sheet id="system" title={SYSTEM_TITLE} onClose={onClose}>
      <SystemPanel {...panel} onExport={playing ? panel.onExport : undefined} confirmLeave={playing} />
      {playing && <p className="px-3 pb-3 font-mono text-[10px] text-dc-muted">Autosaved each turn.</p>}
    </Sheet>
  )
}
