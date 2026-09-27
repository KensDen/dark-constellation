// The SYSTEM sheet (v1.2 R1b): the controls that are not a decision about
// the turn, behind the gear on the HUD, so the board ends at the action
// bar. Save, Export code, Back to menu, the two audio toggles and the
// playback speed, driven by the one list below, which the board suite
// pins by count and by name so a control cannot drop out of the sheet
// unnoticed. Every control keeps the name it had on the old save row.
//
// Muting stays available whatever the campaign's status, on the same
// principle as before: an accessibility path that disappears at the
// loudest moment is not one. Saving belongs to a campaign in progress.

import { SpeedSelect, type Speed } from '../../director'
import { SOUND_TOGGLE_LABELS } from '../brief'
import SoundToggles from '../cues/SoundToggles'
import type { SoundPrefs } from '../../audio'
import Sheet, { SHEET_BUTTON } from './Sheet'

export const SYSTEM_TITLE = 'SYSTEM'

export interface SystemControl {
  id: 'save' | 'export' | 'menu' | 'sound' | 'music' | 'playback'
  // The accessible name the control carries, as the tests find it.
  name: string
}

// Six controls. The two toggles are one component, SoundToggles, which
// renders both names; it mounts at the first of the pair and the second
// entry stands for the name it also carries.
export const SYSTEM_CONTROLS: readonly SystemControl[] = [
  { id: 'save', name: 'Save' },
  { id: 'export', name: 'Export code' },
  { id: 'menu', name: 'Back to menu' },
  { id: 'sound', name: SOUND_TOGGLE_LABELS.effects },
  { id: 'music', name: SOUND_TOGGLE_LABELS.music },
  { id: 'playback', name: 'Playback:' },
]

export interface SystemSheetProps {
  playing: boolean
  onSave: () => void
  onExport: () => void
  onExit?: () => void
  soundPrefs: SoundPrefs
  onSoundPrefs: (next: (prev: SoundPrefs) => SoundPrefs) => void
  speed: Speed
  onSpeed: (speed: Speed) => void
  notice: string
  onClose: () => void
}

export default function SystemSheet({ playing, onSave, onExport, onExit, soundPrefs, onSoundPrefs, speed, onSpeed, notice, onClose }: SystemSheetProps) {
  // The three plain buttons, by id: their handler, and whether they apply.
  const buttons: Partial<Record<SystemControl['id'], (() => void) | undefined>> = {
    save: playing ? onSave : undefined,
    export: playing ? onExport : undefined,
    menu: onExit,
  }
  const render = (control: SystemControl) => {
    if (control.id === 'sound') return <SoundToggles prefs={soundPrefs} onChange={onSoundPrefs} />
    if (control.id === 'music') return null
    if (control.id === 'playback') return <SpeedSelect speed={speed} onChange={onSpeed} label={control.name} />
    const onClick = buttons[control.id]
    return onClick ? (
      <button type="button" className={SHEET_BUTTON} onClick={onClick}>
        {control.name}
      </button>
    ) : null
  }
  return (
    <Sheet id="system" title={SYSTEM_TITLE} onClose={onClose}>
      <ul className="flex flex-wrap items-center gap-2">
        {SYSTEM_CONTROLS.map((control) => {
          const node = render(control)
          return node ? (
            <li key={control.id} data-system-control={control.id}>
              {node}
            </li>
          ) : null
        })}
      </ul>
      {playing && <p className="mt-3 font-mono text-[10px] text-dc-muted">Autosaved each turn.</p>}
      {notice && <p className="mt-2 font-mono text-xs text-alert-amber">{notice}</p>}
    </Sheet>
  )
}
