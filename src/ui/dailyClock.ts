// The clock the countdown to the next Daily Op reads (v1.3 R4): the wall
// clock once a second, and a span as hh:mm:ss. Shared by the title's
// countdown (./Countdown.tsx) and the debrief's.

import { useEffect, useState } from 'react'

export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':')
}

// The wall clock, once a second.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
