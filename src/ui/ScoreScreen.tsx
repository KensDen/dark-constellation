// THE SCORE SCREEN (v1.2 R5, brief 7.2), at the end of every run, Daily
// Op or free play. It replaces the v1.1 report and arrives in a chunk of
// its own, which Game loads when the campaign ends. The save code and the
// ways out stay in Game, outside this chunk, so a chunk that fails to
// load can never cost a player their code (the Round 6d defect).
//
// Everything counted here is read from src/engine/grade.ts: the grade,
// the hits, the strip. Nothing is restated.
//
// MOTION: after a short lead-in the three stats count up one at a time,
// each landing with a blip; then the grade drops in and bounces once;
// then the strip fills left to right. Under reduced motion all of it is
// on screen at once, with no count, no drop, no fill and no blips: the
// blips mark a number landing, and nothing lands.

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useSound } from '../audio'
import { dailyNumber, msUntilNextDaily } from '../engine/daily'
import { TURN_STRIP, gradeOf, hitsTaken, turnStrip, type Grade, type StripColour } from '../engine/grade'
import { DIFFICULTIES } from '../engine/reducer'
import type { GameState } from '../engine/types'
import type { DailyOp, DailyStanding } from '../persistence'
import { DC_BTN, DC_BTN_GO } from './buttons'
import { shareOrCopy, shareSupported, type ShareOutcome } from './clipboard'
import { useCountUp, useReducedMotion } from './cues/motion'
import PixelHash from './PixelHash'
import { shareText } from './reportCard'
import { SCORE_MOTION } from './scoreMotion'
import defeatSphereUrl from './assets/defeat-sphere.webp'
import winSphereUrl from './assets/win-sphere.webp'
import './scoreScreen.css'

// The debrief (brief 4.8), a chunk of its own again, loaded when opened. A
// failed fetch says so in place and leaves the rest of the screen alone.
const DebriefUnavailable = () => <p className="mt-2 font-mono text-xs text-dc-warn">The debrief could not load.</p>
const Debrief = lazy(() => import('./Debrief').catch(() => ({ default: DebriefUnavailable })))

export interface ScoreScreenProps {
  state: GameState
  // The Daily Op this campaign is, when it is one.
  daily?: DailyOp
  // How this device recorded the finish: official only when this finish
  // claimed its date here. Null for a campaign that arrived finished.
  standing: DailyStanding | null
}

const GRADE_TONE: Record<Grade, string> = {
  S: 'text-dc-go',
  A: 'text-dc-go',
  B: 'text-dc-friendly',
  C: 'text-dc-friendly',
  D: 'text-dc-warn',
  F: 'text-dc-hostile',
}

const STRIP_WORD: Record<StripColour, string> = {
  green: 'MAI held',
  amber: 'MAI slipped',
  magenta: 'hit hard',
}

const SHARE_NOTICE: Record<ShareOutcome, string> = {
  shared: 'Result shared.',
  cancelled: '',
  copied: 'Result summary copied.',
  failed: 'Copy failed; try again.',
}

const LABEL = 'font-display text-[9px] leading-none text-dc-muted'

// Where the reveal is: -1 before anything, 0 to stats-1 while that stat
// counts, then the grade, then the strip, which is the last stage. A stat
// lands at the end of its count, and its blip with it. Reduced motion, at
// any point, puts the reveal at its end for good: turning it off again
// does not take back what is already on screen.
// `onLand` must keep its identity across renders: the counts and the
// countdown re-render constantly, and a new callback would restart the
// stage's timers every time.
function useReveal(reduced: boolean, stats: number, onLand: () => void): number {
  const last = stats + 1
  const [stage, setStage] = useState(() => (reduced ? last : -1))
  useEffect(() => {
    if (reduced) {
      if (stage < last) setStage(last)
      return
    }
    if (stage >= last) return
    const ms = stage < 0 ? SCORE_MOTION.leadMs : stage < stats ? SCORE_MOTION.statMs : SCORE_MOTION.gradeMs
    const timers = [window.setTimeout(() => setStage(stage + 1), ms)]
    if (stage >= 0 && stage < stats) timers.push(window.setTimeout(onLand, SCORE_MOTION.countMs))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [stage, reduced, stats, last, onLand])
  return reduced ? last : stage
}

// The wall clock, once a second, for the countdown.
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':')
}

function Stat({ label, value, decimals, tone, active, reduced }: {
  label: string
  value: number
  decimals: number
  tone: string
  active: boolean
  reduced: boolean
}) {
  const shown = useCountUp(active ? value : 0, reduced, SCORE_MOTION.countMs)
  return (
    <div data-stat={label} className="flex items-baseline justify-between gap-2 border-b-2 border-dc-line py-1.5 last:border-b-0">
      <span className={LABEL}>{label}</span>
      <span data-stat-value className={`font-display text-sm ${tone}`}>
        {shown.toFixed(decimals)}
      </span>
    </div>
  )
}

export default function ScoreScreen({ state, daily, standing }: ScoreScreenProps) {
  const reduced = useReducedMotion()
  const play = useSound()
  const now = useNow()
  const [debriefOpen, setDebriefOpen] = useState(false)
  // What the share control last did, said beside it rather than under the
  // save code, where a phone would have it below the fold.
  const [shareNotice, setShareNotice] = useState('')
  const scenario = state.scenario
  const won = state.status === 'won'
  const last = state.history[state.history.length - 1]
  const grade = gradeOf(state)
  const strip = turnStrip(state)
  const official = !!daily && standing === 'official'
  const stats = [
    { label: 'FINAL MAI', value: last?.maiScore ?? 0, decimals: 1, tone: 'text-dc-go' },
    { label: 'HITS TAKEN', value: hitsTaken(state), decimals: 0, tone: 'text-dc-hostile' },
    { label: 'CREDITS LEFT', value: last?.creditsAfter ?? state.credits, decimals: 0, tone: 'text-dc-warn' },
  ]
  const blip = useCallback(() => play('tick-up'), [play])
  const stage = useReveal(reduced, stats.length, blip)
  const gradeStage = stats.length
  const stripStage = stats.length + 1
  const moving = !reduced

  // After midnight, a Daily Op finished late belongs to the day it started
  // on, and the next one is already open rather than counting down. Only
  // forward: a clock set back shows the countdown, never a number at or
  // below the run's own.
  const nowN = dailyNumber(now)
  const openNow = daily && nowN > daily.n ? nowN : null

  const share = async () => {
    const outcome = await shareOrCopy(shareText(state, daily ? { n: daily.n, official } : undefined))
    setShareNotice(SHARE_NOTICE[outcome])
  }

  return (
    <>
      {/* Outcome backdrop: dimmed and duotoned toward the state colour,
          magenta on a loss and blue on a win, lazy-loaded. Only the one
          that applies is ever requested. */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
        <img
          src={won ? winSphereUrl : defeatSphereUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover opacity-60"
          style={{
            filter: won
              ? 'grayscale(1) brightness(0.55) sepia(1) hue-rotate(175deg) saturate(4)'
              : 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(270deg) saturate(4)',
          }}
        />
        <div className="absolute inset-0 bg-base/60" />
      </div>

      <section aria-labelledby="score-title" data-score-screen className="relative z-10 mt-4">
        <p data-run-mode className="flex flex-wrap items-center gap-2 font-mono text-xs text-dc-muted">
          {daily ? (
            <>
              <span className="border-2 border-dc-go px-1.5 py-1 font-display text-[10px] leading-none text-dc-go">
                DAILY OP <PixelHash />
                {daily.n}
              </span>
              <span
                data-standing
                className={`border-2 px-1.5 py-1 font-display text-[10px] leading-none ${official ? 'border-dc-go bg-dc-go text-dc-ground' : 'border-dc-warn text-dc-warn'}`}
              >
                {official ? 'OFFICIAL' : 'PRACTICE'}
              </span>
            </>
          ) : (
            <span>
              FREE PLAY · {DIFFICULTIES[state.difficulty].label} · SEED {state.seed}
            </span>
          )}
        </p>
        <h2
          id="score-title"
          className={`mt-3 font-display text-xl sm:text-2xl tracking-widest ${won ? 'text-hero-blue' : 'text-hero-magenta'}`}
        >
          {won ? 'MISSION ASSURED' : 'MISSION FAILED'}
        </h2>
        <p className="mt-2 text-dc-ink">
          {won
            ? `The architecture held through turn ${scenario.totalTurns}.`
            : state.lossReason === 'insolvency'
              ? 'Budget insolvency. The program ran out of credits before it ran out of threats.'
              : state.lossReason === 'maiCollapse'
                ? 'Mission Assurance Index collapse. The architecture came apart under the campaign.'
                : `End of campaign below the win threshold of ${scenario.winThreshold}.`}
        </p>

        <div className="mt-4 flex gap-3 border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
          <div data-grade-block className="flex w-24 flex-none flex-col items-center justify-center border-2 border-dc-line bg-dc-ground py-2">
            <span className={LABEL}>GRADE</span>
            <span
              data-grade
              className={`dc-grade-letter mt-2 font-display ${GRADE_TONE[grade]} ${stage < gradeStage ? 'dc-score-wait' : moving ? 'dc-grade-drop' : ''}`}
            >
              {grade}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            {stats.map((s, i) => (
              <Stat key={s.label} {...s} active={stage >= i} reduced={reduced} />
            ))}
          </div>
        </div>

        <div className="mt-4 border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
          <p className={LABEL}>TURN BY TURN</p>
          <ol
            data-strip
            aria-label="Turn by turn"
            className="dc-strip mt-2"
            style={{ gridTemplateColumns: `repeat(${scenario.totalTurns}, minmax(0, 1fr))` }}
          >
            {strip.map((colour, i) => (
              <li
                key={i}
                data-strip-cell={colour}
                aria-label={`Turn ${i + 1}: ${STRIP_WORD[colour]}`}
                className={`dc-strip-cell dc-strip-${colour} ${stage < stripStage ? 'dc-score-wait' : moving ? 'dc-strip-fill' : ''}`}
                style={stage >= stripStage && moving ? { animationDelay: `${i * SCORE_MOTION.stripStepMs}ms` } : undefined}
              />
            ))}
          </ol>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-dc-muted">
            <span>
              <span className="dc-strip-key dc-strip-green" /> MAI held
            </span>
            <span>
              <span className="dc-strip-key dc-strip-amber" /> fell under {TURN_STRIP.magentaDrop}
            </span>
            <span>
              <span className="dc-strip-key dc-strip-magenta" /> fell {TURN_STRIP.magentaDrop} or more, or lost an asset
            </span>
          </p>
        </div>

        <p data-countdown className="mt-4 flex flex-wrap items-baseline gap-2">
          {openNow !== null ? (
            <span className="font-display text-[10px] text-dc-go">
              DAILY OP <PixelHash />
              {openNow} IS OPEN NOW
            </span>
          ) : (
            <>
              <span className={LABEL}>NEXT DAILY OP IN</span>
              <span className="font-display text-sm text-dc-ink">{hms(msUntilNextDaily(now))}</span>
            </>
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={DC_BTN_GO} onClick={share}>
            {shareSupported() ? 'SHARE RESULT' : 'COPY RESULT'}
          </button>
          <button
            type="button"
            className={DC_BTN}
            aria-expanded={debriefOpen}
            aria-controls="debrief"
            onClick={() => setDebriefOpen((open) => !open)}
          >
            DEBRIEF
          </button>
        </div>
        <p role="status" data-share-notice className="mt-2 min-h-6 font-mono text-sm text-alert-amber">
          {shareNotice}
        </p>
        {debriefOpen && (
          <div id="debrief" className="mt-3">
            <Suspense fallback={<p className="font-mono text-xs text-dc-muted">&gt; LOADING DEBRIEF_</p>}>
              <Debrief state={state} />
            </Suspense>
          </div>
        )}
      </section>
    </>
  )
}
