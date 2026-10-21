// THE TITLE (v1.3 R1, brief 5.1): the front door that replaced the
// nine-entry menu (M1). Top bar with the difficulty chip and SYSTEM; the
// ripple band; DARK CONSTELLATION / OP FIRST LIGHT and the tagline; GOAL 1
// and GOAL 2; CONTINUE TURN n when a game is resumable; PLAY; DAILY OP #n;
// and the READ row (BRIEFING, DOSSIER, LIBRARY). Below it, the key art and
// the constellation frame the retired start screen used to carry (Ken,
// 21 October 2026: keep them on the title).
//
// The Field Manual, How to Play and the menu's function keys are gone:
// the briefing and FIRST ORDERS teach the rules (M5, M20).

import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import { dailyNumber, msUntilNextDaily } from '../engine/daily'
import { DIFFICULTIES } from '../engine/rules'
import type { Difficulty } from '../engine/types'
import { STALE_SAVE_MESSAGE } from '../persistence'
import type { SoundPrefs } from '../audio'
import SystemPanel from './SystemPanel'
import { DECK_LINE, SYSTEM_TITLE } from './systemControls'
import { TITLE_TAGLINE, dailyLineNow, dossierCount } from './titleStatus'
import { usePageVisible, useReducedMotion } from './cues/motion'
import PixelHash from './PixelHash'
import Wordmark from './Wordmark'
import heroUrl from './assets/hero.webp'
import heroPlaceholderUrl from './assets/hero-placeholder.webp'
import frameUrl from './assets/constellation-frame.svg'

// The 3D frame is decoration; a failed chunk falls back to the still
// reference frame rather than taking the title down.
const FrameStill = () => <img src={frameUrl} alt="" aria-hidden="true" className="h-64 w-64 opacity-90" />
const Constellation = lazy(() =>
  import('./Constellation').catch(() => ({ default: FrameStill as unknown as (typeof import('./Constellation'))['default'] })),
)

export interface TitleProps {
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  // The turn a resumable game is on, when there is one.
  resumeTurn: number | null
  onContinue: () => void
  onPlay: () => void
  onDaily: () => void
  onBriefing: () => void
  onDossier: () => void
  onLibrary: () => void
  // The autosave is from an earlier version (v1.3 brief 6.10).
  staleSave?: boolean
  soundPrefs: SoundPrefs
  onSoundPrefs: (next: (prev: SoundPrefs) => SoundPrefs) => void
  onExport?: () => void
  onImport: (code: string) => void
  onReplaySeed: (seed: number) => void
  onScoreboard: () => void
  onCredits: () => void
  notice?: string
}

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

const TILE = 'border-2 border-dc-line bg-dc-panel p-3 text-left shadow-hard'
const READ_BTN = 'border-2 border-dashed border-dc-line p-3 text-left min-h-11'

export default function Title(p: TitleProps) {
  const reduced = useReducedMotion()
  const [system, setSystem] = useState(false)
  // The Daily Op's number and line, read again at the next local midnight
  // so a title left open overnight offers the new day's run.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setTimeout(() => setNow(new Date()), msUntilNextDaily(now) + 50)
    return () => window.clearTimeout(id)
  }, [now])
  const n = dailyNumber(now)
  const goal = dossierCount()
  // DONE · grade · STREAK n once today's official run is in; the grade
  // arrives with its module (see ./titleStatus.ts).
  const [dailyText, setDailyText] = useState(() => dailyLineNow(now))
  useEffect(() => {
    let live = true
    setDailyText(dailyLineNow(now))
    import('./titleDaily')
      .then(({ dailyLine }) => {
        if (live) setDailyText(dailyLine(now))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [now])
  // A Daily Op starts at once, so with an operation in progress it asks
  // first: the new campaign takes the autosave.
  const [confirmDaily, setConfirmDaily] = useState(false)
  const daily = () => (p.resumeTurn !== null && !confirmDaily ? setConfirmDaily(true) : p.onDaily())

  return (
    <main data-title className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-4 px-4 pt-safe pb-10 text-dc-ink">
      <div className="flex items-center justify-between pt-3">
        <span data-difficulty-chip className="border border-dc-go px-2 py-1 font-mono text-[11px] tracking-widest text-dc-go">
          {DIFFICULTIES[p.difficulty].label.toUpperCase()}
        </span>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSystem(true)}
          className="min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink"
        >
          {SYSTEM_TITLE}
        </button>
      </div>

      <div className="h-28 overflow-hidden border-2 border-dc-line bg-dc-chrome">
        <Ripple />
      </div>

      <div>
        <h1 className="m-0">
          <Wordmark size="clamp(0.9rem, 5vw, 1.7rem)" />
        </h1>
        <p className="mt-3 font-mono text-xs tracking-widest text-dc-friendly">OP {DEFAULT_SCENARIO.name}</p>
        <p className="mt-2 text-sm text-dc-muted">{TITLE_TAGLINE}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={TILE} data-goal="1">
          <p className="font-mono text-[10px] tracking-widest text-dc-muted">GOAL 1</p>
          <p className="mt-1 text-sm font-bold">Hold the mission</p>
          <p className="mt-1 font-mono text-xs text-dc-go">Keep the score at {DEFAULT_SCENARIO.winThreshold}+</p>
        </div>
        <button type="button" className={TILE} data-goal="2" onClick={p.onDossier}>
          <span className="block font-mono text-[10px] tracking-widest text-dc-muted">GOAL 2</span>
          <span className="mt-1 block text-sm font-bold">Complete the dossier</span>
          <span className="mt-1 block font-mono text-xs text-dc-go">
            {goal.filed} / {goal.total} filed
          </span>
          <span className="mt-2 block h-1 w-full bg-dc-line" aria-hidden="true">
            <span className="block h-1 bg-dc-go" style={{ width: `${(goal.filed / Math.max(1, goal.total)) * 100}%` }} />
          </span>
        </button>
      </div>

      {p.staleSave && (
        <div role="status" data-stale-save className="border-2 border-dc-warn/50 bg-dc-panel p-3">
          <p className="font-mono text-sm text-dc-warn">{STALE_SAVE_MESSAGE}.</p>
          <button type="button" onClick={p.onPlay} className="mt-2 min-h-11 border-2 border-dc-go px-3 font-display text-[10px] text-dc-go">
            START A NEW OPERATION
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {p.resumeTurn !== null && (
          <button
            type="button"
            data-continue
            onClick={p.onContinue}
            className="min-h-12 border-2 border-dc-friendly bg-dc-friendly/10 font-display text-xs text-dc-friendly shadow-press"
          >
            CONTINUE TURN {p.resumeTurn}
          </button>
        )}
        <button
          type="button"
          data-play
          onClick={p.onPlay}
          className="min-h-14 border-2 border-dc-go bg-dc-go/10 font-display text-sm text-dc-go shadow-press active:translate-y-[3px] active:shadow-none"
        >
          PLAY
        </button>
        {n >= 1 && (
          <button
            type="button"
            data-daily
            onClick={daily}
            className="flex min-h-13 flex-col items-center justify-center gap-1 border-2 border-dc-friendly bg-dc-friendly/10 py-2 text-dc-friendly"
          >
            <span className="font-display text-xs">
              DAILY OP <PixelHash />
              {n}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-dc-muted">{dailyText}</span>
          </button>
        )}
        {confirmDaily && (
          <div role="group" aria-label="Replace the operation in progress" data-confirm-daily className="border-2 border-dc-warn/50 bg-dc-panel p-3">
            <p className="font-mono text-sm text-dc-warn">The Daily Op replaces the operation in progress.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={p.onDaily} className="min-h-11 border-2 border-dc-warn px-3 font-display text-[10px] text-dc-warn">
                START DAILY OP
              </button>
              <button type="button" onClick={() => setConfirmDaily(false)} className="min-h-11 border-2 border-dc-line px-3 font-display text-[10px] text-dc-ink">
                KEEP IT
              </button>
            </div>
          </div>
        )}
      </div>

      <section aria-label="Read" className="grid gap-2">
        <p className="font-mono text-[10px] tracking-widest text-dc-muted">READ</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-read="briefing" className={`${READ_BTN} col-span-2`} onClick={p.onBriefing}>
            <span className="block font-display text-[11px] text-dc-friendly">BRIEFING</span>
            <span className="mt-1 block text-xs text-dc-muted">Who you are, what you protect, who is coming.</span>
          </button>
          <button type="button" data-read="dossier" className={READ_BTN} onClick={p.onDossier}>
            <span className="block font-display text-[11px] text-dc-friendly">DOSSIER</span>
            <span className="mt-1 block text-xs text-dc-muted">COLDVEIL&apos;s moves and the techniques behind them.</span>
          </button>
          <button type="button" data-read="library" className={READ_BTN} onClick={p.onLibrary}>
            <span className="block font-display text-[11px] text-dc-friendly">LIBRARY</span>
            <span className="mt-1 block text-xs text-dc-muted">The public reading behind every threat.</span>
          </button>
        </div>
      </section>

      <section aria-label="Key art" className="mt-4 flex flex-col items-center gap-4">
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
      </section>

      {system && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-dc-ground/95" role="dialog" aria-modal="true" aria-label={SYSTEM_TITLE}>
          <div className="mx-auto max-w-[520px] border-x-2 border-dc-line bg-dc-panel">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-dc-line bg-dc-panel px-3 py-2 pt-safe">
              <h2 className="font-display text-[10px] text-dc-ink">{SYSTEM_TITLE}</h2>
              <button type="button" onClick={() => setSystem(false)} className="min-h-11 border-2 border-dc-line px-3 font-display text-[10px] text-dc-ink">
                DONE
              </button>
            </div>
            <SystemPanel
              difficulty={p.difficulty}
              onDifficulty={p.onDifficulty}
              restartsOperation={false}
              soundPrefs={p.soundPrefs}
              onSoundPrefs={p.onSoundPrefs}
              onExport={p.onExport}
              onImport={p.onImport}
              onReplaySeed={p.onReplaySeed}
              onScoreboard={p.onScoreboard}
              onCredits={p.onCredits}
              deckLine={DECK_LINE}
              notice={p.notice ?? ''}
            />
          </div>
        </div>
      )}
    </main>
  )
}
