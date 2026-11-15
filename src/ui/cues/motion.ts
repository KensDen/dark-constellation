// Motion primitives for the cue vocabulary (Round 3). Two things live
// here: a live reduced-motion subscription and the count-up hook the
// game's score and budget share. The one-shot cue class helper the pixel
// board's tiles used left with the board in v2.0 R3.
//
// Reduced motion is a first-class path, not a fallback (brief principle
// 3), so it is read from a live media-query subscription rather than
// sampled once at module load: a player who turns it on mid-session gets
// the quiet treatment on the next render, with no reload.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { countUpMode, onVisibilityChange, pageVisible } from './visibility'

const QUERY = '(prefers-reduced-motion: reduce)'
function matchesNow(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

// THE MOTION SETTING (v1.3 R1, brief 5.8): SYSTEM's motion toggle turns
// motion off whatever the system preference says. Off is stored; on means
// "follow the system", so a player who never touches it gets exactly what
// the media query gives. The root carries data-motion="reduce" while it is
// off, which src/index.css reads to stop every CSS animation and
// transition, and every hook below reads the same flag.
export const MOTION_PREF_KEY = 'dc-motion'

function readMotionOff(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MOTION_PREF_KEY) === 'off'
  } catch {
    return false
  }
}

let motionOff = readMotionOff()
const motionListeners = new Set<() => void>()

function applyMotionRoot() {
  if (typeof document === 'undefined') return
  if (motionOff) document.documentElement.dataset.motion = 'reduce'
  else delete document.documentElement.dataset.motion
}
applyMotionRoot()

export const motionSettingOff = (): boolean => motionOff

export function setMotionSettingOff(off: boolean): void {
  motionOff = off
  try {
    if (off) localStorage.setItem(MOTION_PREF_KEY, 'off')
    else localStorage.removeItem(MOTION_PREF_KEY)
  } catch {
    // The setting still holds for this session.
  }
  applyMotionRoot()
  motionListeners.forEach((fn) => fn())
}

// For tests: read the stored setting again, as a fresh page load would.
export function reloadMotionSetting(): void {
  motionOff = readMotionOff()
  applyMotionRoot()
  motionListeners.forEach((fn) => fn())
}

const subscribeMotion = (fn: () => void) => {
  motionListeners.add(fn)
  return () => {
    motionListeners.delete(fn)
  }
}

export const useMotionSettingOff = (): boolean => useSyncExternalStore(subscribeMotion, motionSettingOff, motionSettingOff)

export const prefersReducedMotionNow = (): boolean => motionOff || matchesNow(QUERY)

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => matchesNow(query))
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    let mq: MediaQueryList
    try {
      mq = window.matchMedia(query)
    } catch {
      return
    }
    const onChange = () => setOn(mq.matches)
    onChange()
    // Safari below 14 only has the deprecated listener API.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [query])
  return on
}

export const useReducedMotion = (): boolean => {
  const system = useMediaQuery(QUERY)
  const off = useMotionSettingOff()
  return system || off
}

// Ease a displayed number toward a target. Returns the value to render.
// Under reduced motion, or when the animation cannot run (no rAF), the
// target is adopted immediately, so the number on screen is always the
// real one within a frame or two.
export const COUNT_MS = 420

// Live, because a page can be hidden and shown mid-count and the policy
// has to apply to the count in flight, not only to the one that starts
// after the player comes back.
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(pageVisible)
  useEffect(() => {
    setVisible(pageVisible())
    return onVisibilityChange(setVisible)
  }, [])
  return visible
}

export function useCountUp(target: number, reduced: boolean, durationMs = COUNT_MS): number {
  const visible = usePageVisible()
  const [shown, setShown] = useState(target)
  // The value actually on screen, so an interrupted count resumes from
  // where it stopped rather than from the last completed target.
  const shownRef = useRef(target)
  const frameRef = useRef(0)

  useEffect(() => {
    const from = shownRef.current
    if (from === target) return
    // Hidden means the number is shown, not animated (the policy in
    // ./visibility.ts). An animation nobody can see is not an animation,
    // and a hidden page stops delivering frames anyway: this is what the
    // safety timeout below was doing by accident, now said out loud.
    if (countUpMode(visible, reduced) === 'snap' || typeof requestAnimationFrame !== 'function') {
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
  }, [target, reduced, durationMs, visible])

  return shown
}

