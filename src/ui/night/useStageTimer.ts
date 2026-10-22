// The night's two clocks (v1.3 brief 5.5): only the 750ms overlay and the
// strike advance on their own. Each is a timer that stops while the tab is
// hidden and finishes the rest of its time when the player comes back
// (brief 8.3: paused while the tab is hidden), so a player who switches
// away mid-strike returns to the strike, not to a card they never saw
// arrive.

import { useEffect, useRef } from 'react'
import { usePageVisible } from '../cues/motion'

// Fires `fire` once, `ms` after `key` is first seen non-null, counting only
// time the page was visible. A new key starts a new clock.
export function useStageTimer(key: string | null, ms: number, fire: () => void): void {
  const visible = usePageVisible()
  const latest = useRef(fire)
  latest.current = fire
  const clock = useRef<{ key: string | null; left: number }>({ key: null, left: 0 })
  useEffect(() => {
    if (key === null) return
    if (clock.current.key !== key) clock.current = { key, left: ms }
    if (!visible) return
    const started = performance.now()
    const id = window.setTimeout(() => {
      clock.current.left = 0
      latest.current()
    }, clock.current.left)
    return () => {
      window.clearTimeout(id)
      clock.current.left = Math.max(0, clock.current.left - (performance.now() - started))
    }
  }, [key, ms, visible])
}
