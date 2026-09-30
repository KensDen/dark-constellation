// The wide board's own columns (v1.2 R6, brief 4.6): the ops log under the
// threat banner and the inspector on the right. A module of its own,
// fetched only on a screen 1024 wide and up, with its stylesheet. The
// board itself is the same tree at every width; wide.css regrids it.
//
// Both parts read `shown`, the board the player sees, so during playback
// the log holds back the turn still playing out and the inspector reads
// the integrity the tile shows, not the engine's end state. A condition's
// age counts from the engine's turn, as the chips do, and SURGE reads the
// engine's tokens.

import { useLayoutEffect, useRef } from 'react'
import type { AssetKind, GameState } from '../../engine/types'
import { kindLabels } from '../labels'
import { SHEET_BUTTON } from './Sheet'
import { surgePickDisabled } from './board'
import './wide.css'
import { INSPECTOR_HEADING, INSPECT_PROMPT, NOTHING, OPS_LOG_HEADING, inspectTile, opsLogLine, opsLogRows } from './wide'

export type WideBoardProps =
  | { part: 'log'; shown: GameState }
  | {
      part: 'inspector'
      shown: GameState
      turn: number
      assetId: string | null
      // Whether the actions are live: only while the turn is decided.
      live: boolean
      tokens: number
      queuedSurge?: string
      onProcure: (kind: AssetKind) => void
      onSurge: (instanceId: string) => void
      onIntel: (assetId: string) => void
      onReady: (ready: boolean) => void
    }

const BUTTON = `${SHEET_BUTTON} w-full mt-1.5`

function OpsLog({ shown }: { shown: GameState }) {
  const rows = opsLogRows(shown)
  return (
    <aside data-ops-log aria-label={OPS_LOG_HEADING}>
      <h2>{OPS_LOG_HEADING}</h2>
      {rows.length === 0 ? (
        <p>{NOTHING}</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.turn} data-ops-row={r.turn}>
              <p data-ops-line>{opsLogLine(r)}</p>
              <p>{r.verdict}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

function Inspector(p: Extract<WideBoardProps, { part: 'inspector' }>) {
  const { onReady } = p
  const selected = useRef(p.assetId)
  selected.current = p.assetId
  // Ready before paint, so the columns, the tile routing, the F keys and
  // their chips all arrive in one frame, and only once this module (and
  // with it the stylesheet Vite loads ahead of it) is in. Unready on the
  // way out, when the screen narrows past the breakpoint; and if focus was
  // in here then, it goes to the tile this was showing, which stays.
  useLayoutEffect(() => {
    onReady(true)
    return () => {
      if (document.getElementById('dc-inspector')?.contains(document.activeElement)) {
        document.querySelector<HTMLElement>(`button[data-asset-id="${selected.current}"]`)?.focus()
      }
      onReady(false)
    }
  }, [onReady])
  const t = inspectTile(p.shown, p.turn, p.assetId)
  return (
    <aside id="dc-inspector" data-inspector aria-label={INSPECTOR_HEADING}>
      <h2>{INSPECTOR_HEADING}</h2>
      {/* What a selection put here, said once to a screen reader, since
          the tile that was pressed is in another column. */}
      <p className="sr-only" aria-live="polite">
        {t?.title ?? ''}
      </p>
      {!t ? (
        <p>{INSPECT_PROMPT}</p>
      ) : (
        <>
          <p data-inspector-title>{t.title}</p>
          <p data-inspector-integrity>INTEGRITY {t.integrity}</p>
          <p data-inspector-layer>CONDITIONS ON {t.layer}</p>
          {t.conditions.length === 0 ? (
            <p>{NOTHING}</p>
          ) : (
            <ul>
              {t.conditions.map((c) => {
                // Already queued this turn: it says so, and opens the
                // sheet where UNDO is.
                const queued = c.instanceId === p.queuedSurge
                return (
                  <li key={c.instanceId} data-inspector-condition={c.eventId}>
                    <p>
                      {c.name} T+{c.age}
                      {c.left !== undefined ? ` ~${c.left} left` : ''}
                    </p>
                    <button
                      type="button"
                      data-inspector-surge={c.instanceId}
                      aria-label={`SURGE ${c.name}${queued ? ', queued' : ''}`}
                      className={BUTTON}
                      disabled={!p.live || surgePickDisabled(p.tokens, c.instanceId, p.queuedSurge)}
                      onClick={() => p.onSurge(c.instanceId)}
                    >
                      {queued ? 'SURGE QUEUED' : 'SURGE'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <button
            type="button"
            data-inspector-procure
            aria-label={`PROCURE ${kindLabels[t.kind]}`}
            className={BUTTON}
            disabled={!p.live}
            onClick={() => p.onProcure(t.kind)}
          >
            PROCURE
          </button>
          <button type="button" data-inspector-intel aria-haspopup="dialog" className={BUTTON} onClick={() => p.onIntel(t.assetId)}>
            INTEL CARD
          </button>
        </>
      )}
    </aside>
  )
}

export default function WideBoard(props: WideBoardProps) {
  return props.part === 'log' ? <OpsLog shown={props.shown} /> : <Inspector {...props} />
}
