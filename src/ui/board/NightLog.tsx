// THE NIGHT'S LOG (v1.5 R2's review: on the desktop board the night left
// the side panel empty, and the board jumped wider as it went). While the
// night plays, the side panel keeps its place and lists tonight's moves as
// they land: each move, its target, what it came to as an icon and a word,
// and the score's change. The playfield beside it keeps every one where it
// landed. Desktop only: Game renders it from WIDE_BOARD up.
//
// Since v1.6 R2 (R1's fresh eyes, F6) a move's row is written as its
// strike lands, not when its card comes up: while it locks on the row reads
// ◎ INCOMING, in the muted ink, and the moment it lands it reads
// HIT, PARTIAL or BLOCKED with its target and the score's change, as the
// banner beside it does. The phone's strike card lists the night so far
// with the same rows (LogRows, src/ui/night/cards.tsx).

import type { Scenario } from '../../engine/types'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_AIM, tinted } from '../sprites/icons'
import { shortName } from './boardModel'
import { LogRows } from './LogRows'
import type { Trace } from './strike'

export interface NightLogProps {
  turn: number
  scenario: Scenario
  log: readonly Trace[]
  // The move on its way, while its strike locks on; once it lands it is
  // a row of the log.
  moving?: string | null
  signs: ReadonlyMap<string, string>
}

export default function NightLog({ turn, scenario, log, moving, signs }: NightLogProps) {
  const name = (id: string) => {
    const def = scenario.events.find((e) => e.id === id)
    return def ? shortName(def) : id
  }
  return (
    <section aria-label={`Tonight, turn ${turn}`} data-sheet="log" className="flex flex-col overflow-y-auto bg-dc-panel text-dc-ink">
      <h2 className="flex-none border-b border-dc-line px-3 py-2.5 font-mono text-xs tracking-widest">TONIGHT · TURN {turn}</h2>
      <ol className="flex flex-col gap-1.5 px-3 py-3">
        <LogRows scenario={scenario} log={log} signs={signs} />
        {moving && (
          <li data-log="moving" className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-dc-muted">
            <PixelSprite sprite={tinted(ICON_AIM, 'muted')} scale={1} name="log-incoming" />
            INCOMING · <span className="font-sans text-sm text-dc-ink">{name(moving)}</span>
          </li>
        )}
      </ol>
      <p className="px-3 pb-3 text-xs text-dc-muted">Each move stays on the board, where it landed.</p>
    </section>
  )
}
