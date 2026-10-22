// The night's card kit (v1.3 brief 5.5): the classes its cards share and
// the one hook they use to sound once. Status never looks like a control
// (section 4 rule 2): tags are tinted words and blocks are ruled at one
// edge; the buttons, which act, carry the border and the press shadow.

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SoundCue } from '../../cues'

export type Play = (cue: SoundCue) => void

export const PRIMARY =
  'dc-tile flex min-h-12 w-full items-center justify-center gap-2 border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground shadow-hard'
export const CHOICE = 'dc-tile flex w-full flex-col items-start gap-1 border-2 border-dc-line bg-dc-chrome p-2.5 text-left shadow-press'
export const LABEL = 'font-mono text-[10px] tracking-widest'

// A tag on a card: a tinted word, never a bordered one (rule 2).
export const TAG_TONE = {
  muted: 'bg-dc-line/40 text-dc-muted',
  friendly: 'bg-dc-friendly/15 text-dc-friendly',
  warn: 'bg-dc-warn/15 text-dc-warn',
  go: 'bg-dc-go/15 text-dc-go',
  hostile: 'bg-dc-hostile/15 text-dc-hostile',
} as const
// A block of outcome or status: ruled at its left edge in its tone.
export const BLOCK_TONE = {
  go: 'border-dc-go bg-dc-go/10',
  warn: 'border-dc-warn bg-dc-warn/10',
  hostile: 'border-dc-hostile bg-dc-hostile/10',
  friendly: 'border-dc-friendly bg-dc-friendly/10',
  muted: 'border-dc-line bg-dc-chrome',
} as const
export const HEAD_TONE = { go: 'text-dc-go', warn: 'text-dc-warn', hostile: 'text-dc-hostile', friendly: 'text-dc-friendly', muted: 'text-dc-muted' } as const

// A score as the HUD prints it: one decimal, always (v1.3 R5).
export const fmtScore = (n: number) => n.toFixed(1)

// Fires once for the card it is in: each card is keyed on its step.
export function useOnce(fire: () => void | (() => void)) {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    return fire() ?? undefined
    // Once per card: the card is keyed on its step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Whether a scrolling body runs on below what shows, and the player has
// not scrolled to its end: then its card says "more below" (fresh-eyes
// review, as the full brief's cue did for QC G-099).
export function useMore(body: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = body.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [body])
  return more
}
