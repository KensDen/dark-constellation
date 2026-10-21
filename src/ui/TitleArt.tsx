// The title's decoration (v1.3 R1, brief 5.1), split from the title so it
// loads as its own chunk after the first paint (v1.3 R1 fixes): the ripple
// band, and the key art with the constellation frame under the READ row
// (Ken, 21 October 2026: keep them on the title). Nothing here is
// interactive or read; the title is whole without it.

import { Suspense, lazy, useEffect, useRef } from 'react'
import { usePageVisible, useReducedMotion } from './cues/motion'
import heroUrl from './assets/hero.webp'
import heroPlaceholderUrl from './assets/hero-placeholder.webp'
import frameUrl from './assets/constellation-frame.svg'

// The 3D frame is decoration; a failed chunk falls back to the still
// reference frame rather than taking the title down.
const FrameStill = () => <img src={frameUrl} alt="" aria-hidden="true" className="h-64 w-64 opacity-90" />
const Constellation = lazy(() =>
  import('./Constellation').catch(() => ({ default: FrameStill as unknown as (typeof import('./Constellation'))['default'] })),
)

// THE RIPPLE (brief 5.1, 8.3): a dot field whose size and brightness
// ripple over time, on one canvas at about 30 frames a second. One still
// frame under reduced motion, and paused while the tab is hidden.
function Ripple() {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = cv.getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) return
    const c = ctx
    const friendly = getComputedStyle(document.documentElement).getPropertyValue('--dc-friendly').trim() || '#5AA9FF'
    const n = Number.parseInt(friendly.slice(1), 16)
    const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const paint = (t: number) => {
      const w = cv.clientWidth || 300
      const h = cv.clientHeight || 120
      if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr)
      if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr)
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, w, h)
      for (let y = 5; y < h; y += 10) {
        for (let x = 5; x < w; x += 10) {
          let k = 0.5 + 0.5 * Math.sin(x * 0.035 + t * 0.9) * Math.cos(y * 0.07 - t * 0.6 + Math.sin(x * 0.01 + t * 0.3))
          k = k * k * k
          c.fillStyle = `rgba(${rgb},${(0.08 + 0.55 * k).toFixed(3)})`
          const r = 0.5 + 1.8 * k
          c.fillRect(Math.round(x - r), Math.round(y - r), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2)))
        }
      }
    }
    if (reduced || !visible) {
      paint(2)
      return
    }
    const t0 = performance.now()
    let last = 0
    let raf = 0
    const loop = (now: number) => {
      if (now - last >= 33) {
        paint((now - t0) / 1000)
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduced, visible])
  return <canvas ref={ref} aria-hidden="true" data-ripple className="block h-full w-full" />
}

function KeyArt() {
  const reduced = useReducedMotion()
  return (
    <div className="flex flex-col items-center gap-4">
        <div
          className="w-full border-2 border-dc-line"
          style={{ backgroundImage: `url(${heroPlaceholderUrl})`, backgroundSize: 'cover', aspectRatio: '1 / 1' }}
        >
          <img
            src={heroUrl}
            width={1200}
            height={1200}
            alt="Split-sphere key art: a dark sphere broken by a diagonal breach line, blue energy on one flank, magenta on the other, debris spraying from both"
            className="block h-auto w-full"
            decoding="async"
            loading="lazy"
          />
        </div>
        {reduced ? (
          <FrameStill />
        ) : (
          <Suspense fallback={<FrameStill />}>
            <Constellation size={256} />
          </Suspense>
        )}
    </div>
  )
}

export default function TitleArt({ part }: { part: 'ripple' | 'art' }) {
  return part === 'ripple' ? <Ripple /> : <KeyArt />
}
