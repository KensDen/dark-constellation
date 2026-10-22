// The night's dot fields (v1.3 brief 8.3: "canvas where it is a field"):
// the red band that sweeps down COLDVEIL IS MOVING, and the slow crawl
// over a new intel card's header, as the prototype draws them (runDots).
// One still frame under reduced motion, and no frames at all while the tab
// is hidden; the sweep is the length of the overlay it runs on.

import { useEffect, useRef } from 'react'
import { usePageVisible, useReducedMotion } from '../cues/motion'

export interface DotFieldProps {
  // A CSS token name for the dots' colour, read off the root.
  token: 'hostile' | 'friendly' | 'warn' | 'go'
  mode: 'sweep' | 'noise'
  gap?: number
  // A sweep's length; a noise field runs until it unmounts.
  ms?: number
}

export default function DotField({ token, mode, gap = 9, ms = 0 }: DotFieldProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  // Where the field is in its time, kept across a hidden tab.
  const elapsed = useRef(0)
  useEffect(() => {
    const cv = ref.current
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = cv?.getContext('2d') ?? null
    } catch {
      ctx = null
    }
    if (!cv || !ctx) return
    const c = ctx
    const hex = getComputedStyle(document.documentElement).getPropertyValue(`--dc-${token}`).trim() || '#FF5A4F'
    const n = Number.parseInt(hex.slice(1), 16)
    const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const paint = (t: number) => {
      const w = cv.clientWidth || 320
      const h = cv.clientHeight || 120
      if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr)
      if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr)
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, w, h)
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          let k: number
          if (mode === 'sweep') {
            const band = (t / ((ms || 750) / 1000)) * 1.3 - 0.15
            k = Math.max(0, 1 - Math.abs(y / h - band) * 5) * (0.6 + 0.4 * Math.sin(x * 0.05 + t * 9))
          } else {
            k = 0.5 + 0.5 * Math.sin(x * 0.13 + t * 2.6 + Math.sin(y * 0.21 + t * 1.7) * 2.2) * Math.cos(y * 0.09 - t * 1.9)
            k = k * k
          }
          c.fillStyle = `rgba(${rgb},${(0.18 + 0.7 * k).toFixed(3)})`
          const r = 0.35 + 1.5 * k
          c.fillRect(Math.round(x - r), Math.round(y - r), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2)))
        }
      }
    }
    if (reduced || !visible) {
      paint(mode === 'sweep' ? 0.4 : 2)
      return
    }
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      elapsed.current += (now - last) / 1000
      last = now
      paint(elapsed.current)
      if (!ms || elapsed.current * 1000 < ms) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [token, mode, gap, ms, reduced, visible])
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
}
