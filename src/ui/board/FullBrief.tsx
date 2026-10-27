// THE FULL BRIEF (QC G-026, G-099), behind the TONIGHT card's toggle: the
// turn-1 job framing, the brief's named lines and the posture, the way to
// COLDVEIL's intel card and the technique's Glossary entry. Its own chunk
// since v1.3 R2, with ../brief.ts, which only it and the intel card read:
// the board fetches it as soon as it mounts, so the first tap finds it.
//
// It scrolls in its own area capped at a share of the viewport, so on a
// short phone it ends above the dock (QC Q29, G-097), and a cue says so
// while there is more below (G-099).

import { useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { JOB_FRAMING_HEADING, briefCopy } from '../brief'
import ScrollCue from './ScrollCue'

export interface FullBriefProps {
  state: GameState
  named: boolean
  onIntel: () => void
  onTag: (tag: string) => void
}

export default function FullBrief({ state, named, onIntel, onTag }: FullBriefProps) {
  const copy = briefCopy(state, named)
  const scroller = useRef<HTMLDivElement | null>(null)
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2)
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [])
  return (
    <div className="relative">
      <div ref={scroller} data-brief-scroll className="max-h-[30dvh] overflow-y-auto overscroll-contain pr-1">
        {copy.framing.length > 0 && (
          <div className="mt-1">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-dc-go">{JOB_FRAMING_HEADING}</p>
            {copy.framing.map((line, i) => (
              <p key={i} className="mt-1 text-sm">
                {line}
              </p>
            ))}
          </div>
        )}
        <ul className="ml-5 mt-2 list-disc font-mono text-xs">
          {copy.full.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <button type="button" aria-label="COLDVEIL intel" aria-haspopup="dialog" onClick={onIntel} className="min-h-11 font-mono text-[10px] tracking-wider text-dc-hostile">
          COLDVEIL <span className="text-dc-friendly">intel ›</span>
        </button>
        {copy.tag && (
          <p className="mt-1 font-mono text-xs text-dc-muted">
            Technique:{' '}
            <button type="button" className="min-h-6 text-dc-ink underline" data-technique-tag={copy.tag} onClick={() => onTag(copy.tag!)}>
              {copy.tag}
            </button>
          </p>
        )}
      </div>
      {more && (
        <ScrollCue data-scroll-cue className="absolute inset-x-0 bottom-0" />
      )}
    </div>
  )
}
