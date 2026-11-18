// THE TITLE (v1.3 R1, brief 5.1): the front door that replaced the
// nine-entry menu (M1). The hero, with DARK CONSTELLATION / OP FIRST LIGHT
// and the tagline over it; GOAL 1 and GOAL 2; CONTINUE NIGHT n when a game
// is resumable; PLAY; DAILY OP #n, which after today's official run reads
// DONE, the grade and the streak, and counts down to the next (v1.3 R4,
// M32); the READ row (BRIEFING, DOSSIER, LIBRARY); and SYSTEM as the
// menu's last row.
//
// IN THE 3D GAME'S LOOK since v2.0 R3 (Ken's ruling of 15 November 2026:
// the title in 3D; a playtester: "the pixel title and the glossy game do
// not match"). The hero is the game's own world, live (./TitleWorld), and
// the menu is the game's glass: soft panels, round corners, the system
// face, PLAY as the game's primary button. Its styles are a short block of
// rules in src/index.css, not utility strings here: the title is in the
// first download, and a rule said once is smaller than a class list said
// on every element. The wordmark keeps the brand face; nothing else on
// the title does. The pixel key art and the wireframe ring are gone.
//
// On the desktop the hero spans the screen and takes what the menu leaves
// of the window, and the menu stands in three columns under it.
//
// No top bar since v1.3 R3 (Ken's R2 notes, 22 October 2026): the
// difficulty chip left it in R2, and SYSTEM moved to the foot of the menu,
// like Settings in a game menu, so the hero starts at the top.
//
// The Field Manual, How to Play and the menu's function keys are gone:
// the briefing teaches the rules (M5, M20).

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import { dailyNumber, msUntilNextDaily } from '../engine/daily'
import { DIFFICULTIES } from '../engine/rules'
import type { Difficulty } from '../engine/types'
import { STALE_SAVE_MESSAGE } from '../persistence'
import type { SoundPrefs } from '../audio'
import SystemPanel from './SystemPanel'
import { DECK_LINE, SYSTEM_TITLE } from './systemControls'
import { MOVED_TO_STANDARD, movedToStandard, toldMovedToStandard } from './session'
import { DAILY_OPEN_LINE, TITLE_TAGLINE, dailyLineNow, dossierCount, goalOne } from './titleStatus'
import Countdown from './Countdown'
import Wordmark from './Wordmark'

// The hero's world loads after the title as its own chunk, and three.js
// with it (v1.3 R1 fixes: the title's decoration left the first download,
// which sat 26 bytes under its ceiling). The hero's box is the title's
// own, so the words are there before the world lands and nothing moves
// when it does. A chunk that fails to load leaves the hero's still
// gradient, never a broken title.
const TitleWorld = lazy(() => import('./TitleWorld').catch(() => ({ default: () => null })))

export interface TitleProps {
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  // The night a resumable game is on, when there is one.
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

export default function Title(p: TitleProps) {
  const [system, setSystem] = useState(false)
  // PLAY's move to STANDARD on a first win, said once (v1.5 R1).
  const [moved] = useState(() => movedToStandard())
  useEffect(() => {
    if (moved) toldMovedToStandard()
  }, [moved])
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
  // DONE · grade · DAY STREAK n once today's official run is in; the grade
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
  // PLAY asks first too (v2.0 R5): with an operation in progress it began
  // a new one at a tap and the night in progress was gone (the R4 phone
  // review). CONTINUE stands over it, so a second tap is the answer.
  const [confirmPlay, setConfirmPlay] = useState(false)
  const play = () => (p.resumeTurn !== null && !confirmPlay ? setConfirmPlay(true) : p.onPlay())

  return (
    <main data-title>
      {/* The first screen: the hero, then the menu. On the desktop it is
          the window's height, and the hero takes what the menu leaves
          (Claude's site review, 29 October). */}
      <div data-title-screen>
        <header data-key-art>
          {/* Covered by SYSTEM, the world has no one to draw for. */}
          <Suspense fallback={null}>
            <TitleWorld paused={system} />
          </Suspense>
          <div className="tt-words">
            <h1>
              <Wordmark size="var(--wordmark)" />
            </h1>
            <p className="tt-op">OP {DEFAULT_SCENARIO.name}</p>
            {/* One line on a phone (Ken, 21 October): the size follows the
                width, and the effect above fits it to the font, never under
                10px. */}
            <p ref={tagline} data-tagline>
              {TITLE_TAGLINE}
            </p>
          </div>
        </header>

        {/* The menu: one column on a phone, three on the desktop: the
            goals, the ways to play, and READ with SYSTEM. */}
        <div data-title-menu>
          <div className="tt-col">
            <div className="tt-goals">
              <div className="tt-card" data-goal="1">
                <p className="tt-label">GOAL 1</p>
                <p className="tt-name">Hold the mission</p>
                {/* The score at the end of the last night is what counts
                    (v1.5 R1; R6b's fresh eyes, item 9: "keep" read as every
                    turn). The 3D game counts nights. */}
                <p className="tt-go">
                  Finish night {DEFAULT_SCENARIO.totalTurns} at{' '}
                  {DEFAULT_SCENARIO.winThreshold}+
                </p>
                {/* Whether it is done yet, as GOAL 2 shows its count (v1.3
                    R5): a mark and a word, never colour alone (rule 8). */}
                <p data-goal-status className={held?.held ? 'tt-go' : undefined}>
                  {held?.held && (
                    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                      <path d="M2 6.5 4.8 9.2 10 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {held ? `${held.held ? 'HELD' : 'NOT YET'} · BEST ${held.best.toFixed(1)}` : 'NOT YET'}
                </p>
              </div>
              <button type="button" className="tt-card" data-goal="2" onClick={p.onDossier}>
                <span className="tt-label">GOAL 2</span>
                <span className="tt-name">Complete the&nbsp;Dossier</span>
                <span className="tt-go">
                  {goal.filed} / {goal.total} filed
                </span>
                <span className="tt-bar" aria-hidden="true">
                  <span style={{ width: `${(goal.filed / Math.max(1, goal.total)) * 100}%` }} />
                </span>
              </button>
            </div>

            {p.staleSave && (
              <div role="status" data-stale-save className="tt-card tt-warn">
                <p>{STALE_SAVE_MESSAGE}.</p>
                {/* Why, and what is not lost (v2.0 R4): the only save this
                    version refuses is a game begun on the pixel board. */}
                <p className="tt-note">It was begun on the pixel board, which the 3D game has replaced. Your scores and your Dossier are kept.</p>
                <button type="button" onClick={p.onPlay} className="tt-btn">
                  START A NEW OPERATION
                </button>
              </div>
            )}
          </div>

          <div data-title-play className="tt-col">
            {p.resumeTurn !== null && (
              <button type="button" data-continue onClick={p.onContinue} className="tt-btn tt-sky">
                CONTINUE NIGHT {p.resumeTurn}
              </button>
            )}
            {/* The game's primary button, as PLAY AGAIN is on its debrief:
                the main way on looks the same wherever it is, and it is the
                largest thing on the desktop's menu (v1.5 R2's review). */}
            <button type="button" data-play onClick={play}>
              <span>PLAY</span>
              {/* The mode PLAY will start (Ken's R1 phone pass, item 12): the
                  difficulty is changed in SYSTEM only. */}
              <span data-play-mode className="tt-label">
                {DIFFICULTIES[p.difficulty].label.toUpperCase()}
              </span>
            </button>
            {confirmPlay && p.resumeTurn !== null && (
              <div role="group" aria-label="Replace the operation in progress" data-confirm-play className="tt-card tt-warn">
                <p>A new operation replaces the one in progress, on night {p.resumeTurn}.</p>
                <div className="tt-row">
                  <button type="button" onClick={p.onPlay} className="tt-btn tt-warn">
                    START NEW
                  </button>
                  <button type="button" onClick={() => setConfirmPlay(false)} className="tt-btn">
                    KEEP IT
                  </button>
                </div>
              </div>
            )}
            {moved && (
              <p data-moved-to-standard className="tt-go">
                {MOVED_TO_STANDARD}
              </p>
            )}
            {n >= 1 && (
              <button type="button" data-daily onClick={daily} className="tt-btn tt-sky">
                <span>DAILY OP #{n}</span>
                <span data-daily-line className="tt-label">
                  {dailyText}
                </span>
                {/* Once today's official run is in, the button replays it as
                    practice, and says so (section 4 rule 3). */}
                {dailyText !== DAILY_OPEN_LINE && <span className="tt-label tt-sky">REPLAY AS PRACTICE</span>}
              </button>
            )}
            {/* The countdown once today's official run is in (brief 5.1), as
                status under the button rather than inside it (rule 2). */}
            {n >= 1 && dailyText !== DAILY_OPEN_LINE && (
              <p data-daily-countdown className="tt-label">
                NEXT DAILY OP IN <Countdown className="tt-clock" />
              </p>
            )}
            {confirmDaily && (
              <div role="group" aria-label="Replace the operation in progress" data-confirm-daily className="tt-card tt-warn">
                <p>The Daily Op replaces the operation in progress.</p>
                <div className="tt-row">
                  <button type="button" onClick={p.onDaily} className="tt-btn tt-warn">
                    START DAILY OP
                  </button>
                  <button type="button" onClick={() => setConfirmDaily(false)} className="tt-btn">
                    KEEP IT
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="tt-col">
            <section aria-label="Read" className="tt-read">
              <p className="tt-label">READ</p>
              <button type="button" data-read="briefing" className="tt-card" onClick={p.onBriefing}>
                <span className="tt-sky">BRIEFING</span>
                <span>Who you are, what you protect, who is coming.</span>
              </button>
              <button type="button" data-read="dossier" className="tt-card" onClick={p.onDossier}>
                <span className="tt-sky">DOSSIER</span>
                <span>COLDVEIL’s moves and the techniques behind them.</span>
              </button>
              <button type="button" data-read="library" className="tt-card" onClick={p.onLibrary}>
                <span className="tt-sky">LIBRARY</span>
                <span>The public reading behind every threat.</span>
              </button>
            </section>

            {/* SYSTEM, the menu's last row (Ken's R2 notes): difficulty, sound and
                motion, the save code, Replay a seed, the scoreboard, credits. */}
            <button type="button" data-title-system aria-haspopup="dialog" onClick={() => setSystem(true)} className="tt-btn">
              {SYSTEM_TITLE}
            </button>
          </div>
        </div>
      </div>

      {system && (
        // Opaque and full height (Ken, 21 October): nothing of the title
        // shows through below a short panel.
        <div className="tt-system" role="dialog" aria-modal="true" aria-label={SYSTEM_TITLE}>
          <div>
            <div className="tt-bar-top">
              <h2 className="tt-label">{SYSTEM_TITLE}</h2>
              <button type="button" onClick={() => setSystem(false)} className="tt-btn">
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
