// THE FULL BRIEF (QC G-026), a sheet since v1.6 R3 (Ken's playtest item
// 6): it opens from its icon on TONIGHT's header, like PROCURE, with DONE
// to close it, and nothing in it scrolls inside the board. Until R3 it
// unfolded inside the TONIGHT card behind "Expand full brief", scrolled in
// its own area under the page's, and the move cards' status row drew over
// its first bullet. It keeps only what the board does not show (brief.ts,
// fullBriefCopy): the coverage against the bonus's line and, once the
// moves are named, each one's technique, a tap to its Glossary entry. Its
// own chunk with ../brief.ts, fetched as the TONIGHT card mounts.

import type { GameState } from '../../engine/types'
import { fullBriefCopy } from '../brief'

export interface FullBriefProps {
  state: GameState
  named: boolean
  onTag: (tag: string) => void
}

// The sheet's own frame (./Sheet, with DONE) is Game's, which wraps this
// body: imported here too, the bundler split it out of the entry into a
// chunk of its own (v1.6 R3, +300 bytes on INITIAL). A technique's tag is
// drawn as SHEET_BUTTON draws a control, for the same reason.
const TAG_BUTTON = 'dc-tile flex-none border-2 border-dc-line bg-dc-panel px-3 min-h-11 font-mono text-[10px] tracking-wider text-dc-ink shadow-press active:shadow-none'

const LABEL = 'font-mono text-[10px] tracking-widest text-dc-muted'

export default function FullBrief({ state, named, onTag }: FullBriefProps) {
  const copy = fullBriefCopy(state, named)
  return (
    <div data-brief className="flex flex-col gap-3 text-sm">
      <section>
        <p className={LABEL}>YOUR FLEET</p>
        <p data-brief-coverage className="mt-1">
          {copy.coverage}
        </p>
      </section>
      <section>
        <p className={LABEL}>TONIGHT&apos;S TECHNIQUES</p>
        {copy.dark ? (
          <p className="mt-1 text-dc-muted">{copy.dark}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1.5">
            {copy.moves.map((m) => (
              <li key={m.id} data-brief-move={m.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">{m.name}</span>
                {m.tag && (
                  <button type="button" data-technique-tag={m.tag} onClick={() => onTag(m.tag!)} className={TAG_BUTTON}>
                    {m.tag}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
