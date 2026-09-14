// Motion primitives for the cue vocabulary (Round 3). Three things live
// here: a live reduced-motion subscription, the count-up hook the meters
// and the credit ticker share, and the one-shot cue class helper.
//
// Reduced motion is a first-class path, not a fallback (brief principle
// 3), so it is read from a live media-query subscription rather than
// sampled once at module load: a player who turns it on mid-session gets
// the quiet treatment on the next render, with no reload.

import { useEffect, useRef, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotionNow(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia(QUERY).matches
  } catch {
    return false
  }
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotionNow)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    let mq: MediaQueryList
    try {
      mq = window.matchMedia(QUERY)
    } catch {
      return
    }
    const onChange = () => setReduced(mq.matches)
    onChange()
    // Safari below 14 only has the deprecated listener API.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])
  return reduced
}

// Ease a displayed number toward a target. Returns the value to render.
// Under reduced motion, or when the animation cannot run (no rAF), the
// target is adopted immediately, so the number on screen is always the
// real one within a frame or two.
export const COUNT_MS = 420

export function useCountUp(target: number, reduced: boolean, durationMs = COUNT_MS): number {
  const [shown, setShown] = useState(target)
  // The value actually on screen, so an interrupted count resumes from
  // where it stopped rather than from the last completed target.
  const shownRef = useRef(target)
  const frameRef = useRef(0)

  useEffect(() => {
    const from = shownRef.current
    if (from === target) return
    if (reduced || typeof requestAnimationFrame !== 'function') {
      shownRef.current = target
      setShown(target)
      return
    }
    let start = 0
    let done = false
    const settle = () => {
      done = true
      shownRef.current = target
      setShown(target)
    }
    const step = (now: number) => {
      if (done) return
      if (!start) start = now
      const t = Math.min(1, (now - start) / durationMs)
      // Ease out cubic: fast first, settles onto the number.
      const eased = 1 - Math.pow(1 - t, 3)
      if (t < 1) {
        const value = from + (target - from) * eased
        shownRef.current = value
        setShown(value)
        frameRef.current = requestAnimationFrame(step)
      } else {
        settle()
      }
    }
    frameRef.current = requestAnimationFrame(step)
    // Animation frames are throttled to a standstill in a hidden tab, so
    // a timer guarantees the readout lands on the real number even when
    // no frame ever runs. A meter showing a stale value would be worse
    // than one that does not animate.
    const safety = window.setTimeout(settle, durationMs + 250)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(safety)
    }
  }, [target, reduced, durationMs])

  return shown
}

// A one-shot CSS animation that ends. The class is applied when `key`
// changes and removed again once the animation has had its time, so a cue
// reads as a flash rather than a permanent colour. A repeat trigger drops
// the class for a frame first, which is what lets the browser restart the
// same animation on the same element.
//
// A duration of zero or less holds the class until `key` changes instead.
// That is what a treatment whose keyframes end dimmed or hidden needs: it
// is meant to finish in its end state, and removing the class would snap
// the element back to full strength.
//
// Timers rather than animation frames throughout: frames are throttled in
// a hidden tab, and a cue that never applied at all would be worse than
// one that starts a beat late.
export const CUE_MS = 620
const RESTART_GAP_MS = 20

export function useCueClass(
  key: string | number | null,
  className: string,
  reduced: boolean,
  durationMs = CUE_MS,
): string {
  const [applied, setApplied] = useState('')
  const appliedRef = useRef('')
  // Written in an effect, never during render, so a render whose commit is
  // discarded cannot leave the ref out of step with the DOM.
  useEffect(() => {
    appliedRef.current = applied
  })

  useEffect(() => {
    if (reduced || key === null || !className) {
      setApplied('')
      return
    }
    let restart = 0
    let clear = 0
    const start = () => {
      setApplied(className)
      if (durationMs > 0) clear = window.setTimeout(() => setApplied(''), durationMs)
    }
    if (appliedRef.current === className) {
      // Already running: drop the class long enough for the browser to
      // notice it is gone, then put it back so the animation replays.
      setApplied('')
      restart = window.setTimeout(start, RESTART_GAP_MS)
    } else {
      start()
    }
    return () => {
      window.clearTimeout(restart)
      window.clearTimeout(clear)
    }
  }, [key, className, reduced, durationMs])

  return applied
}
