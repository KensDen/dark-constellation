// Teletype headline (brief v0.5 sections 4 and 5). The transmission bar
// slides in and the headline types out; a tap or the SKIP control reveals
// it whole. Reduced motion gets the finished line immediately, with no
// bar animation and no timer, which is also what happens when the tab is
// hidden or rAF is unavailable.

import { useEffect, useRef, useState } from 'react'
import { useCueClass, useReducedMotion } from './motion'

export const TELETYPE_MS_PER_CHAR = 22

export interface TeletypeProps {
  text: string
  // Changing this restarts the reveal; keep it stable within a turn.
  cueKey: string | number
  className?: string
}

export default function Teletype({ text, cueKey, className }: TeletypeProps) {
  const reduced = useReducedMotion()
  const [shownChars, setShownChars] = useState(reduced ? text.length : 0)
  const timerRef = useRef(0)

  useEffect(() => {
    if (reduced) {
      setShownChars(text.length)
      return
    }
    setShownChars(0)
    let i = 0
    const tick = () => {
      i += 1
      setShownChars(i)
      if (i < text.length) timerRef.current = window.setTimeout(tick, TELETYPE_MS_PER_CHAR)
    }
    timerRef.current = window.setTimeout(tick, TELETYPE_MS_PER_CHAR)
    return () => window.clearTimeout(timerRef.current)
  }, [text, cueKey, reduced])

  const done = shownChars >= text.length
  const reveal = () => {
    window.clearTimeout(timerRef.current)
    setShownChars(text.length)
  }

  return (
    <span className={className} onClick={done ? undefined : reveal}>
      {/* The full line is always in the accessibility tree; the partial
          render is decoration for sighted players mid-reveal. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shownChars)}
        {!done && <span className="text-phosphor">_</span>}
      </span>
    </span>
  )
}

// The INCOMING TRANSMISSION bar that carries the headline.
export function TransmissionBar({ cueKey, children }: { cueKey: string | number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const cue = useCueClass(cueKey, 'dc-transmission-in', reduced)
  return (
    <div className={`border-l-2 border-phosphor/60 pl-3 ${cue}`}>
      <p className="font-mono text-[11px] tracking-widest text-phosphor">&gt; INCOMING TRANSMISSION_</p>
      {children}
    </div>
  )
}
