// THE DEBRIEF (v1.2 R5, brief 4.8): the threats this campaign actually
// met, each with its technique IDs and its sources, as a study guide
// built from the player's own run. Loaded when the score screen's DEBRIEF
// is opened, in a chunk of its own. Built from content only, through
// threatsFaced: no new text about any threat.

import type { GameState } from '../engine/types'
import { techniqueLabel } from './labels'
import { threatsFaced } from './threatsFaced'

const LABEL = 'mt-2 font-display text-[9px] leading-none text-dc-muted'

export default function Debrief({ state }: { state: GameState }) {
  const faced = threatsFaced(state)
  return (
    <section aria-labelledby="debrief-title" data-debrief className="border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
      <h3 id="debrief-title" className="font-display text-[10px] leading-none text-dc-go">
        DEBRIEF
      </h3>
      <p className="mt-2 text-sm text-dc-ink">
        {faced.length === 0
          ? 'No threat reached this campaign.'
          : `The ${faced.length} threat${faced.length === 1 ? '' : 's'} you faced, with the techniques and sources behind each.`}
      </p>
      <ol className="mt-1">
        {faced.map(({ def, encounters, sources }) => (
          <li key={def.id} data-debrief-threat={def.id} className="mt-3 border-t-2 border-dc-line pt-2">
            <h4 className="font-mono text-sm font-bold text-dc-ink">{def.name}</h4>
            <p data-debrief-turns className="mt-1 font-mono text-[10px] text-dc-muted">
              {encounters.map((e, i) => (
                <span key={i} className={e.landed ? 'text-dc-hostile' : 'text-dc-friendly'}>
                  {i > 0 && <span className="text-dc-muted"> · </span>}T{e.turn} {e.landed ? 'hit' : 'held'}
                </span>
              ))}
            </p>
            <p className={LABEL}>TECHNIQUE</p>
            <ul className="mt-1 font-mono text-xs">
              {def.techniqueRefs.map((ref) => (
                <li key={techniqueLabel(ref)} data-debrief-technique>
                  <a className="underline" href={ref.url} target="_blank" rel="noopener noreferrer">
                    {techniqueLabel(ref)}
                  </a>{' '}
                  <span className="text-dc-muted">{ref.name}</span>
                </li>
              ))}
            </ul>
            {sources.length > 0 && (
              <>
                <p className={LABEL}>SOURCES</p>
                <ul className="mt-1 text-xs">
                  {sources.map((src) => (
                    <li key={src.url} data-debrief-source className="mt-0.5">
                      <a className="underline" href={src.url} target="_blank" rel="noopener noreferrer">
                        {src.title}
                      </a>{' '}
                      <span className="font-mono text-dc-muted">[{src.type}]</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
