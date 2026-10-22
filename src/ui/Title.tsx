// THE TITLE (v1.3 R1, brief 5.1): the front door that replaced the
// nine-entry menu (M1). The ripple band; DARK CONSTELLATION / OP FIRST
// LIGHT and the tagline; GOAL 1 and GOAL 2; CONTINUE TURN n when a game is
// resumable; PLAY; DAILY OP #n, which after today's official run reads
// DONE, the grade and the streak, and counts down to the next (v1.3 R4,
// M32); the READ row (BRIEFING, DOSSIER, LIBRARY);
// and SYSTEM as the menu's last row. Below it, the key art and the
// constellation frame the retired start screen used to carry (Ken, 21
// October 2026: keep them on the title).
//
// No top bar since v1.3 R3 (Ken's R2 notes, 22 October 2026): the
// difficulty chip left it in R2, and SYSTEM moved to the foot of the menu,
// like Settings in a game menu, so the ripple band starts at the top. The
// board keeps its own SYSTEM button in the HUD.
//
// The Field Manual, How to Play and the menu's function keys are gone:
// the briefing and FIRST ORDERS teach the rules (M5, M20).

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import { dailyNumber, msUntilNextDaily } from '../engine/daily'
import { DIFFICULTIES } from '../engine/rules'
import type { Difficulty } from '../engine/types'
import { STALE_SAVE_MESSAGE } from '../persistence'
import type { SoundPrefs } from '../audio'
import SystemPanel from './SystemPanel'
import { DECK_LINE, SYSTEM_TITLE } from './systemControls'
import { DAILY_OPEN_LINE, TITLE_TAGLINE, dailyLineNow, dossierCount, goalOne } from './titleStatus'
import PixelSprite from './sprites/PixelSprite'
import { ICON_CHECK, tinted } from './sprites/icons'
import Countdown from './Countdown'
import PixelHash from './PixelHash'
import Wordmark from './Wordmark'

// The title's decoration, the ripple band and the key art with the frame,
// loads after the title as its own chunk (v1.3 R1 fixes: INITIAL sat 26
// bytes under its 155,000 ceiling, and a CI runner's gzip counted 65 more).
// Each fallback is an empty box of the same size, so nothing moves when it
// lands.
const TitleArt = lazy(() => import('./TitleArt'))

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

const TILE = 'flex flex-col justify-start border-2 border-dc-line bg-dc-panel p-3 text-left shadow-hard'
const READ_BTN = 'flex min-h-11 flex-col justify-start border-2 border-dashed border-dc-line p-3 text-left'

export default function Title(p: TitleProps) {
  const [system, setSystem] = useState(false)
  // The tagline on one line whatever the font (Ken, 21 October). Its size
  // follows the width, and the width a line takes follows the font: SF on
  // an iPhone, Roboto on Android, DejaVu on a CI runner. So once laid out
  // it steps down half a pixel at a time until it fits, never under 10px.
  const tagline = useRef<HTMLParagraphElement | null>(null)
  useLayoutEffect(() => {
    const el = tagline.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      for (let px = parseFloat(getComputedStyle(el).fontSize); el.scrollWidth > el.clientWidth && px > 10; ) el.style.fontSize = `${(px = Math.max(10, px - 0.5))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  // The Daily Op's number and line, read again at the next local midnight
  // so a title left open overnight offers the new day's run.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setTimeout(() => setNow(new Date()), msUntilNextDaily(now) + 50)
    return () => window.clearTimeout(id)
  }, [now])
  const n = dailyNumber(now)
  const goal = dossierCount()
  const held = goalOne()
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
      <div className="mt-3 h-28 overflow-hidden border-2 border-dc-line bg-dc-chrome">
        <Suspense fallback={null}>
          <TitleArt part="ripple" />
        </Suspense>
      </div>

      <div>
        <h1 className="m-0">
          <Wordmark size="clamp(0.9rem, 5vw, 1.7rem)" />
        </h1>
        <p className="mt-3 font-mono text-xs tracking-widest text-dc-friendly">OP {DEFAULT_SCENARIO.name}</p>
        {/* One line on a phone (Ken, 21 October): the size follows the
            width, and the effect above fits it to the font, never under
            10px. */}
        <p ref={tagline} data-tagline className="mt-2 whitespace-nowrap text-[clamp(10px,3.2vw,14px)] text-dc-muted">
          {TITLE_TAGLINE}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={TILE} data-goal="1">
          <p className="font-mono text-[10px] tracking-widest text-dc-muted">GOAL 1</p>
          <p className="mt-1 text-sm font-bold">Hold the mission</p>
          <p className="mt-1 font-mono text-xs text-dc-go">Keep the score at{'\u00a0'}{DEFAULT_SCENARIO.winThreshold}+</p>
          {/* Whether it is done yet, as GOAL 2 shows its count (v1.3 R5):
              an icon and a word, never colour alone (rule 8). */}
          <p data-goal-status className="mt-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider">
            {held?.held && <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="goal-held" />}
            <span className={held?.held ? 'text-dc-go' : 'text-dc-muted'}>
              {held ? `${held.held ? 'HELD' : 'NOT YET'} · BEST ${held.best.toFixed(1)}` : 'NOT YET'}
            </span>
          </p>
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
          className="flex min-h-14 flex-col items-center justify-center gap-1 border-2 border-dc-go bg-dc-go py-2 text-dc-ground shadow-press active:translate-y-[3px] active:shadow-none"
        >
          {/* Filled, as PLAY AGAIN is on the debrief (v1.3 R5): the main
              way on looks the same wherever it is. */}
          <span className="font-display text-sm">PLAY</span>
          {/* The mode PLAY will start (Ken's R1 phone pass, item 12): the
              difficulty is changed in SYSTEM only. */}
          <span data-play-mode className="font-mono text-[10px] tracking-wider text-dc-ground/75">
            {DIFFICULTIES[p.difficulty].label.toUpperCase()}
          </span>
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
            <span data-daily-line className="font-mono text-[10px] tracking-wider text-dc-muted">
              {dailyText}
            </span>
            {/* Once today's official run is in, the button replays it as
                practice, and says so (section 4 rule 3). */}
            {dailyText !== DAILY_OPEN_LINE && <span className="font-mono text-[10px] tracking-wider text-dc-friendly">replay as practice ›</span>}
          </button>
        )}
        {/* The countdown once today's official run is in (brief 5.1), as
            status under the button rather than inside it (rule 2). */}
        {n >= 1 && dailyText !== DAILY_OPEN_LINE && (
          <p data-daily-countdown className="-mt-1 text-center font-mono text-[10px] tracking-wider text-dc-muted">
            NEXT DAILY OP IN <Countdown className="tabular-nums text-dc-ink" />
          </p>
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

      {/* SYSTEM, the menu's last row (Ken's R2 notes): difficulty, sound and
          motion, the save code, Replay a seed, the scoreboard, credits. */}
      <button
        type="button"
        data-title-system
        aria-haspopup="dialog"
        onClick={() => setSystem(true)}
        className="min-h-12 border-2 border-dc-line bg-dc-panel font-display text-xs text-dc-ink shadow-press active:translate-y-[3px] active:shadow-none"
      >
        {SYSTEM_TITLE}
      </button>

      <section aria-label="Key art" className="mt-4">
        <Suspense fallback={<div className="w-full border-2 border-dc-line" style={{ aspectRatio: '1 / 1' }} />}>
          <TitleArt part="art" />
        </Suspense>
      </section>

      {system && (
        // Opaque and full height (Ken, 21 October): nothing of the title
        // shows through below a short panel.
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-dc-ground" role="dialog" aria-modal="true" aria-label={SYSTEM_TITLE}>
          <div className="mx-auto min-h-full max-w-[520px] border-x-2 border-dc-line bg-dc-panel pb-safe">
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
