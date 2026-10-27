// THE DEBRIEF (v1.3 brief 5.6, Round 4), at the end of every run, Daily Op
// or practice. It replaced the v1.2 score screen and its threats-faced
// study guide, and arrives in a chunk of its own, which Game fetches as
// the last turn plays back. The save code stays in Game, outside this
// chunk, so a chunk that fails to load can never cost a player their code
// (the Round 6d defect).
//
// ONE SCREEN BEFORE ANY DETAIL (the designer call ratified 5 October): the
// eyebrow, the grade (MISSION HELD or LOST, why, the final score against
// the win line, the bonus a win is graded with, the difficulty and the
// time played), the six stats, and FILED THIS GAME.
//
// A WIN FEELS LIKE A WIN (v1.3 R5, Ken's first priority): a filled pixel
// shield carries the grade, MISSION HELD is stamped beside it, rays stand
// behind them, and a burst flies out, all scaled by the grade, so a C
// still reads as a win and an S feels earned. ONE SHAPE (v1.6 R1, Ken's
// ruling of 26 October 2026): a loss has the same hero in the same place,
// the shield cracked and the stamp, the rays and the grade in hostile red,
// with no burst; the same tiles in the same order; and its biggest drop
// (M14) under the hero, where until v1.6 it stood above a plain grade row.
// With motion off both read from their shape: the shield, the stamp and
// the rays are there, only nothing moves. Below the fold: WHAT YOU CAN NOW SAY, NEXT
// TIME, DECISIONS, the grade ladder and the turn strip (./DebriefMore.tsx,
// a chunk of its own since v1.6 R2), then SHARE, PLAY AGAIN,
// DOSSIER n / 18, BACK TO TITLE and the countdown to the next Daily Op.
// scripts/phone-layout.mjs holds the first screen to 375x667 unscrolled.
//
// Every number is the engine's, read through ./debriefModel.ts and
// src/engine/grade.ts. No quiz and no scoring of the player's reading
// (Ken's standing ruling): the debrief reports, it does not test.
//
// MOTION: after a short lead-in the grade lands with its sound (on a win,
// the stamp is pressed down, the shield pops up with the grade in it and
// the burst flies); then the six tiles rise in a step apart and count up
// together, each landing with a blip; then the filed cards step in, the
// Dossier's count ticks up and the strip fills. Each section below the
// fold rises in as it is scrolled to. Under reduced motion all of it is
// on screen at once, with no count, no drop, no fill and no blips; the
// grade still sounds once.

import { Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSound } from '../audio'
import { MOMENT_CUES, gradeSound } from '../cues'
import { dailyKey, dailyNumber, msUntilNextDaily } from '../engine/daily'
import { gradeFor } from '../engine/grade'
import { DIFFICULTIES } from '../engine/reducer'
import type { GameState } from '../engine/types'
import { LocalDailyLedger, dossier, readRun, runKey, type DailyOp, type DailyStanding } from '../persistence'
import { DC_BTN, DC_BTN_GO } from './buttons'
import { shareOrCopy, shareSupported, type ShareOutcome } from './clipboard'
import { hms, useNow } from './dailyClock'
import { useCountUp, useReducedMotion } from './cues/motion'
import {
  FILED_SHOWN,
  clock,
  debriefStats,
  filedThisGame,
  gradeBlock,
  lossLead,
  type DebriefStat,
} from './debriefModel'
import { DEBRIEF_MOTION } from './debriefMotion'
import { HOOK } from './night/nightCopy'
import { PRIMARY } from './night/kit'
import { shareText } from './reportCard'
import { ICON_SPARK, tinted } from './sprites/icons'
import { SHIELD_BROKEN, SHIELD_PLAIN } from './sprites/effects'
import PixelSprite from './sprites/PixelSprite'
import { dailyStreak, dossierCount } from './titleStatus'
import { shortName } from './board/boardModel'
import './debrief.css'

// THE LOWER SECTIONS (v1.6 R2): in a chunk of their own, fetched the
// moment this one is, so this chunk stays inside its 10,000-byte cap
// (brief 10; it stood at 9,831 after v1.6 R1). Rendered from the loaded
// module rather than through React.lazy, as the night's cards are
// (./night/Night.tsx): they are below the fold and arrive before a player
// scrolls to them, and should they never come the first screen and the
// way on stand without them.
let more: typeof import('./DebriefMore') | null = null
const lowerReady = import('./DebriefMore').then((m) => (more = m))
lowerReady.catch(() => undefined)

// The Dossier, opened over the debrief so BACK returns here: the game is
// over and its autosave gone, so a route away could not come back.
const DossierUnavailable = ({ onBack }: { onBack: () => void }) => (
  <button type="button" onClick={onBack} className={`${DC_BTN} m-4`}>
    BACK TO DEBRIEF
  </button>
)
const Dossier = lazy(() => import('./Dossier').catch(() => ({ default: DossierUnavailable })))

export interface DebriefProps {
  state: GameState
  // The Daily Op this campaign is, when it is one.
  daily?: DailyOp
  // How this device recorded the finish: official only when this finish
  // claimed its date here. Null for a campaign that arrived finished.
  standing: DailyStanding | null
  onPlayAgain: () => void
  onTitle?: () => void
}

const SHARE_NOTICE: Record<ShareOutcome, string> = {
  shared: 'Result shared.',
  cancelled: '',
  copied: 'Result copied. Paste it anywhere.',
  failed: 'Copy failed; try again.',
}

// What each winning grade says under its stamp, and how much it bursts.
// Its sparks round the shield are still shapes, there with motion off.
const TIER: Record<'S' | 'A' | 'B' | 'C', { line: string; burst: number; sparks: number }> = {
  S: { line: 'TOP GRADE', burst: 28, sparks: 4 },
  A: { line: 'STRONG HOLD', burst: 18, sparks: 2 },
  B: { line: 'SOLID HOLD', burst: 12, sparks: 1 },
  C: { line: 'HELD THE LINE', burst: 8, sparks: 0 },
}
// What each losing grade says under its stamp (v1.6 R1).
const LOSS_LINE: Record<'D' | 'F', string> = { D: 'FELL SHORT', F: 'ENDED EARLY' }
// How far the final score finished from the win line, as the HUD says it.
const marginLine = (final: number, needed: number) => (final >= needed ? `${(final - needed).toFixed(1)} ABOVE WIN LINE` : `${(needed - final).toFixed(1)} BELOW WIN LINE`)
// The stats the grid opens on, won or lost.
const STATS_FIRST = ['MOVES BLOCKED', 'BEST STREAK', 'POINTS SAVED']
// Where each spark sits round the shield, in the order they add.
// Inside the hero's frame and clear of the lines beside the shield.
const SPARK_AT = ['-right-1 -top-1', '-left-1 -top-1', '-left-1 bottom-4', '-right-1 bottom-4']
// The burst's pixels, in the board's tokens, round the shield.
const BURST_TONES = ['bg-dc-go', 'bg-dc-warn', 'bg-dc-friendly', 'bg-dc-ink']

const EYEBROW = 'font-mono text-[10px] tracking-widest text-dc-muted'
const HEAD = 'font-mono text-[11px] tracking-widest'

// Where the reveal is: 0 before anything, 1 once the grade has landed,
// 2 to n+1 while stat i-2 has started, n+2 at the end. Reduced motion, at
// any point, puts it at its end for good: turning it off again does not
// take back what is already on screen.
function useReveal(reduced: boolean, n: number, won: boolean, onLand: () => void, onGrade: () => void): number {
  const last = n + 2
  const [stage, setStage] = useState(() => (reduced ? last : 0))
  const done = useRef(reduced)
  useEffect(() => {
    if (reduced) {
      done.current = true
      setStage(last)
      return
    }
    if (done.current) return
    const M = DEBRIEF_MOTION
    const timers: number[] = []
    const at = (ms: number, fire: () => void) => timers.push(window.setTimeout(fire, ms))
    at(M.leadMs, () => {
      setStage((s) => Math.max(s, 1))
      onGrade()
    })
    const tiles = M.leadMs + (won ? M.heroMs : M.lossMs)
    for (let i = 0; i < n; i += 1) {
      const start = tiles + i * M.statStepMs
      at(start, () => setStage((s) => Math.max(s, i + 2)))
      at(start + M.countMs, onLand)
    }
    at(tiles + (n - 1) * M.statStepMs + M.countMs + M.beatMs, () => {
      done.current = true
      setStage(last)
    })
    return () => timers.forEach((id) => window.clearTimeout(id))
    // The callbacks keep their identity (useCallback below).
  }, [reduced, n, won, last, onLand, onGrade])
  return reduced ? last : stage
}

// THE WIN'S BURST: pixels from the shield's centre, out along even
// spokes, two rings on an S. Only with motion.
function Burst({ count }: { count: number }) {
  return (
    <span aria-hidden="true" data-burst={count}>
      {Array.from({ length: count }, (_, i) => {
        const ring = count > 20 && i % 2 === 1 ? 1.6 : 1
        const a = (i / count) * Math.PI * 2
        const r = (96 + (i % 3) * 18) * ring
        return (
          <i
            key={i}
            className={`dc-burst-px dc-burst-fly ${BURST_TONES[i % BURST_TONES.length]}`}
            // Flat, so the pixels fly out sideways and fade inside the
            // hero's height, never landing on the text below it.
            style={{ '--dx': `${Math.round(Math.cos(a) * r)}px`, '--dy': `${Math.round(Math.sin(a) * r * 0.4)}px`, animationDelay: `${i * DEBRIEF_MOTION.burstStepMs}ms` } as CSSProperties}
          />
        )
      })}
    </span>
  )
}

function Stat({ stat, index, active, reduced, moving }: { stat: DebriefStat; index: number; active: boolean; reduced: boolean; moving: boolean }) {
  const shown = useCountUp(active ? stat.value : 0, reduced, DEBRIEF_MOTION.countMs)
  return (
    <li
      data-stat={stat.label}
      data-stat-index={index}
      className={`flex min-w-0 flex-col gap-1 bg-dc-panel px-3 py-1.5 ${active ? (moving ? 'dc-stat-in' : '') : 'dc-score-wait'}`}
    >
      <span className="flex items-baseline gap-1 font-mono leading-none">
        <span data-stat-value className="text-lg tabular-nums text-dc-ink">
          {shown.toFixed(stat.decimals)}
        </span>
        {stat.unit && <span className="text-[11px] text-dc-muted">{stat.unit}</span>}
      </span>
      <span className="font-mono text-[10px] leading-tight text-dc-muted">{stat.label}</span>
    </li>
  )
}

// The final score against the win line, the bonus a win is graded with,
// the difficulty and the time played.
function FinalLines({ block, difficulty, played }: { block: ReturnType<typeof gradeBlock>; difficulty: string; played: string | null }) {
  return (
    <>
      Final mission assurance <b className="font-mono font-normal text-dc-ink">{block.final.toFixed(1)}</b>,{' '}
      <span className="whitespace-nowrap">needed {block.needed}</span>
      {block.bonus && (
        <>
          <br />+ defense bonus <span className="font-mono">{block.bonus.bonus.toFixed(1)}</span> →{' '}
          <span className="whitespace-nowrap">
            grade score <b className="font-mono font-normal text-dc-ink">{block.bonus.graded.toFixed(1)}</b>
          </span>
        </>
      )}
      <br />
      {difficulty}
      {played && ` · played in ${played}`}
    </>
  )
}

// A YYYYMMDD date key's day, at noon.
const runDay = (dateKey: string) => new Date(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8)), 12)

// A YYYYMMDD date key a day earlier.
function dayBefore(dateKey: string): string {
  const y = Number(dateKey.slice(0, 4))
  const m = Number(dateKey.slice(4, 6))
  const d = Number(dateKey.slice(6, 8))
  return dailyKey(new Date(y, m - 1, d - 1, 12))
}

export default function Debrief({ state, daily, standing, onPlayAgain, onTitle }: DebriefProps) {
  const reduced = useReducedMotion()
  const play = useSound()
  const now = useNow()
  const [shareNotice, setShareNotice] = useState('')
  // A share that went through reads in the go colour, a failed copy in
  // amber (R7 fresh eyes: "Result shared." read as a warning).
  const [shareFailed, setShareFailed] = useState(false)
  // Read once, as the debrief opens: the run's own record, and what it
  // filed (null when the run arrived as a code and its turn 1 is unknown).
  const [filed] = useState(() => {
    const run = readRun(runKey(state.seed, state.difficulty, daily?.dateKey))
    return { run, ids: filedThisGame(state, run ? new Set(run.before) : null, dossier()) }
  })
  // The Dossier over the debrief, and its count, read again as it closes.
  const [dossierOpen, setDossierOpen] = useState(false)
  const [count, setCount] = useState(dossierCount)
  const dossierButton = useRef<HTMLButtonElement | null>(null)
  const closeDossier = () => {
    setDossierOpen(false)
    setCount(dossierCount())
    window.setTimeout(() => dossierButton.current?.focus(), 0)
  }

  const block = gradeBlock(state)
  const lead = lossLead(state)
  // One order, won or lost (v1.6 R1): what held first, as a win has led
  // since a fresh-eyes review found HITS TAKEN first read like a loss.
  const stats = (() => {
    const all = debriefStats(state)
    return STATS_FIRST.map((label) => all.find((s) => s.label === label)!).concat(all.filter((s) => !STATS_FIRST.includes(s.label)))
  })()
  const official = !!daily && standing === 'official'
  const scenario = state.scenario

  const blip = useCallback(() => play(MOMENT_CUES['result-tiles'].sound), [play])
  const gradeLands = useCallback(() => play(gradeSound(block.won)), [play, block.won])
  const stage = useReveal(reduced, stats.length, block.won, blip, gradeLands)
  // Under reduced motion the grade is there from the start, and sounds once.
  const sounded = useRef(false)
  useEffect(() => {
    if (sounded.current || !reduced) return
    sounded.current = true
    gradeLands()
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const gradeStage = 1
  const restStage = stats.length + 2
  const moving = !reduced
  const tier = block.won ? TIER[block.grade as keyof typeof TIER] : null
  // The Dossier's count ticks up to where this game left it.
  const filedBase = Math.max(0, count.filed - (filed.ids?.length ?? 0))
  const shownFiledCount = useCountUp(stage >= restStage ? count.filed : filedBase, reduced, DEBRIEF_MOTION.countMs)
  // The lower sections' chunk, here at once if it came with this one.
  const [lower, setLower] = useState(() => more)
  useEffect(() => {
    if (!lower) lowerReady.then(setLower, () => undefined)
  }, [lower])

  // After midnight, a Daily Op finished late belongs to the day it started
  // on, and the next one is already open rather than counting down. Only
  // forward: a clock set back shows the countdown, never a number at or
  // below the run's own. A practice debrief says today's is open while
  // today's official run is not in (R6 question 14), rather than counting
  // down to tomorrow's past one the player has not played.
  const nowN = dailyNumber(now)
  const ledger = new LocalDailyLedger()
  const openNow = daily ? (nowN > daily.n ? nowN : null) : ledger.official(dailyKey(now)) ? null : nowN
  // The previous Daily Op's grade on a Daily Op's debrief (brief 6.10,
  // M32), by its number: "yesterday" is the run's day before, which after
  // midnight is not the clock's (R6 question 14).
  const yesterday = (() => {
    if (!daily) return null
    const r = ledger.official(dayBefore(daily.dateKey))
    return r ? gradeFor({ status: r.outcome, lossReason: r.lossReason, finalMai: r.mai, bonus: r.bonus }) : null
  })()

  // The Daily Op's number in its own colour, so a Daily's debrief says so
  // at a glance (fresh-eyes review).
  const mode = daily ? `DAILY OP #${daily.n}` : 'PRACTICE'
  const after = daily && !official ? ' · PRACTICE' : ''
  // The streak to the run's own date, so one finished after midnight keeps
  // its line (R6 question 14).
  const streak = daily && official ? dailyStreak(runDay(daily.dateKey)) : 0
  const difficulty = DIFFICULTIES[state.difficulty].label
  const share = async () => {
    const outcome = await shareOrCopy(shareText(state, daily ? { n: daily.n, official } : undefined))
    setShareNotice(SHARE_NOTICE[outcome])
    setShareFailed(outcome === 'failed')
  }
  const shownFiled = filed.ids?.slice(0, FILED_SHOWN) ?? []
  const moreFiled = (filed.ids?.length ?? 0) - shownFiled.length

  return (
    <>
      <section data-debrief aria-labelledby="debrief-head" className="flex flex-col gap-3 text-dc-ink" {...(dossierOpen ? { inert: true, 'aria-hidden': true } : {})}>
        {/* THE FIRST SCREEN. */}
        <div data-debrief-first className="flex flex-col gap-2.5">
          <p data-debrief-eyebrow className={EYEBROW}>
            DEBRIEF · OP {scenario.name} · <span className={daily ? 'text-dc-friendly' : ''}>{mode}</span>
            {after}
          </p>

          {/* ONE SHAPE, WON OR LOST (v1.6 R1, Ken's ruling of 26 October
              2026): the hero with the grade, the result and the final
              score, then why, then a loss's biggest drop, then the six
              tiles in one order. A win keeps its shield, stamp, rays and
              burst as decoration; a loss wears the same in hostile red,
              the shield cracked, and nothing flies. */}
          <div data-hero={block.won ? 'won' : 'lost'} data-tier={block.grade} className={`relative z-10 bg-dc-panel px-3 pb-2.5 pt-3 ${block.grade === 'S' ? 'border-2 border-dc-go' : ''}`}>
            {/* The rays are clipped to the hero; the burst is not, so it
                flies past the hero's edges (fresh-eyes review). */}
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
              <div className={`dc-rays absolute inset-0 ${block.won ? '' : 'dc-rays-lost'} ${stage < gradeStage ? 'dc-score-wait' : moving ? 'dc-rays-in' : ''}`} />
            </div>
            {moving && tier && stage >= gradeStage && <Burst count={tier.burst} />}
            <div className="relative flex items-center gap-4">
              <div data-shield className={`relative flex-none ${stage < gradeStage ? 'dc-score-wait' : moving ? 'dc-shield-pop' : ''}`}>
                <PixelSprite sprite={block.won ? SHIELD_PLAIN : SHIELD_BROKEN} scale={5} name={block.won ? 'win-shield' : 'loss-shield'} />
                {SPARK_AT.slice(0, tier?.sparks ?? 0).map((at) => (
                  <span key={at} data-spark aria-hidden="true" className={`absolute ${at}`}>
                    <PixelSprite sprite={tinted(ICON_SPARK, 'warn')} scale={2} name="win-spark" />
                  </span>
                ))}
                {/* The grade, the largest thing on the screen. */}
                <span data-grade className="absolute inset-x-0 top-[13px] text-center font-display text-[36px] leading-none text-dc-ground">
                  {block.grade}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="debrief-head"
                  data-mission
                  data-stamp
                  className={`mt-1 inline-block -rotate-6 border-[3px] bg-dc-ground/70 px-2 py-1 font-display text-[15px] leading-tight ${block.won ? 'border-dc-go text-dc-go' : 'border-dc-hostile text-dc-hostile'} ${block.grade === 'S' ? 'shadow-[0_0_0_3px_var(--dc-ground),0_0_0_5px_var(--dc-go)]' : ''} ${stage < gradeStage ? 'dc-score-wait' : moving ? 'dc-stamp-in' : ''}`}
                >
                  {block.head}
                </h2>
                {/* Clear of the stamp's tilt: the grade's word, the final
                    score, and how far it finished from the win line, as
                    the HUD says it (section 4 rule 9). */}
                <p data-tier-line className={`mt-3 font-mono text-[11px] tracking-widest ${block.won ? 'text-dc-go' : 'text-dc-hostile'} ${stage < gradeStage ? 'dc-score-wait' : ''}`}>
                  {tier ? tier.line : LOSS_LINE[block.grade as 'D' | 'F']}
                </p>
                <p data-margin className={`mt-1 whitespace-nowrap font-mono text-[11px] text-dc-ink ${stage < gradeStage ? 'dc-score-wait' : ''}`}>
                  FINAL <b className="font-normal">{block.final.toFixed(1)}</b> · {marginLine(block.final, block.needed)}
                </p>
              </div>
            </div>
            {/* Why, and the final lines, in the hero itself. */}
            <div data-hero-lines className={`relative mt-2.5 border-t border-dc-line/70 pt-2 ${stage < gradeStage ? 'dc-score-wait' : ''}`}>
              <p data-reason className="text-[13px] leading-snug">
                {block.reason}
              </p>
              <p data-final className="mt-0.5 text-[12px] leading-snug text-dc-muted">
                <FinalLines block={block} difficulty={difficulty} played={filed.run ? clock(filed.run.ms) : null} />
              </p>
            </div>
          </div>
          {/* A loss's biggest drop, under the hero (M14), its two numbers
              in one sentence. */}
          {lead && (
            <div data-loss-lead className="border-l-4 border-dc-hostile bg-dc-hostile/10 px-3 py-2">
              <p className={`${HEAD} text-dc-hostile`}>
                BIGGEST DROP · TURN {lead.turn}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug">{lead.line}</p>
            </div>
          )}

          <ul data-stats aria-label="This game" className="grid grid-cols-3 gap-1.5">
            {stats.map((s, i) => (
              <Stat key={s.label} stat={s} index={i} active={stage >= i + 2} reduced={reduced} moving={moving} />
            ))}
          </ul>

          <section data-filed-this-game aria-label="Filed this game" className="border-l-4 border-dc-go bg-dc-go/10 px-3 py-2">
            <p className={`flex items-center gap-1.5 ${HEAD} text-dc-go`}>
              <PixelSprite sprite={tinted(ICON_SPARK, 'go')} scale={1} name="filed-spark" />
              <span>
                FILED THIS GAME · DOSSIER <span data-dossier-total>{Math.round(shownFiledCount)} / {count.total}</span>
              </span>
            </p>
            {filed.ids && filed.ids.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1">
                {shownFiled.map((id, i) => {
                  const def = scenario.events.find((e) => e.id === id)
                  return (
                    <li
                      key={id}
                      data-filed-card={id}
                      className={`text-[13px] leading-snug ${stage < restStage ? 'dc-score-wait' : moving ? 'dc-filed-in' : ''}`}
                      style={stage >= restStage && moving ? { animationDelay: `${i * DEBRIEF_MOTION.rowStepMs}ms` } : undefined}
                    >
                      <b>{def ? shortName(def) : id}</b>
                      <span className="text-dc-muted">{'\u00a0· '}{HOOK[id] ?? ''}</span>
                    </li>
                  )
                })}
                {moreFiled > 0 && (
                  <li data-filed-more className={`text-[12px] text-dc-muted ${stage < restStage ? 'dc-score-wait' : ''}`}>
                    and {moreFiled} more, in the Dossier
                  </li>
                )}
              </ul>
            ) : (
              <p data-filed-none className="mt-1 text-[13px] text-dc-muted">
                {filed.ids ? 'No new cards this game.' : 'Cards filed on this device show in the Dossier.'}
              </p>
            )}
          </section>
        </div>

        {/* BELOW THE FOLD, from its own chunk (v1.6 R2): what the player
            can now say, NEXT TIME and the decisions, then the turn strip
            and the grade ladder. */}
        {lower && <lower.default state={state} block={block} anyBlocked={stats[0].value > 0} stage={stage} restStage={restStage} moving={moving} />}

        {/* SHARE and PLAY AGAIN, pinned under the thumb (section 4 rule
            4; fresh-eyes review: three screens of reading stood between a
            player and the way on). The bar rests here, in the brief's
            order, once the page is scrolled to it. */}
        {/* Held back until the grade lands, so the first thing to read is
            the result (second fresh-eyes pass). */}
        <div data-debrief-bar className={`sticky bottom-0 z-20 -mx-4 border-t-2 border-dc-line bg-dc-ground px-4 pb-safe pt-2 ${stage < gradeStage ? 'dc-score-wait pointer-events-none' : ''}`}>
          {/* A fade above the bar, so the line it covers sinks under it
              rather than reading as cut in half (second fresh-eyes pass). */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-7 h-6 bg-gradient-to-t from-dc-ground to-transparent" />
          <p role="status" data-share-notice data-failed={shareFailed || undefined} className={`font-mono text-[12px] empty:hidden ${shareFailed ? 'text-dc-warn' : 'text-dc-go'}`}>
            {shareNotice}
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-2 pb-2">
            <button type="button" data-share className={DC_BTN_GO} onClick={share}>
              {shareSupported() ? 'SHARE RESULT' : 'COPY RESULT'}
            </button>
            <button type="button" data-play-again className={PRIMARY} onClick={onPlayAgain}>
              PLAY AGAIN
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <button
              ref={dossierButton}
              type="button"
              data-open-dossier
              aria-haspopup="dialog"
              className={DC_BTN}
              onClick={() => setDossierOpen(true)}
            >
              DOSSIER {count.filed} / {count.total}
            </button>
            {onTitle && (
              <button type="button" data-title-screen className={DC_BTN} onClick={onTitle}>
                BACK TO TITLE
              </button>
            )}
          </div>
        </div>

        <div data-countdown-block className="flex flex-col gap-1 border-t-2 border-dc-line pt-2.5">
          {streak > 0 && (
            <p data-streak className={EYEBROW}>
              DAILY OP STREAK {streak}
            </p>
          )}
          {yesterday && (
            <p data-yesterday className={EYEBROW}>
              DAILY OP #{daily!.n - 1} · GRADE {yesterday}
            </p>
          )}
          <p data-countdown className="flex flex-wrap items-baseline gap-2">
            {openNow !== null ? (
              <span className="font-mono text-[12px] tracking-widest text-dc-go">DAILY OP #{openNow} IS OPEN NOW</span>
            ) : (
              <>
                <span className={EYEBROW}>NEXT DAILY OP IN</span>
                <span className="font-mono text-sm tabular-nums text-dc-ink">{hms(msUntilNextDaily(now))}</span>
              </>
            )}
          </p>
        </div>
      </section>

      {dossierOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-dc-ground" role="dialog" aria-modal="true" aria-label="COLDVEIL dossier" data-dossier-overlay>
          <Suspense fallback={<p className="p-4 font-mono text-xs text-dc-muted">Opening the Dossier.</p>}>
            <Dossier embedded backLabel="BACK TO DEBRIEF" onBack={closeDossier} />
          </Suspense>
        </div>
      )}
    </>
  )
}
