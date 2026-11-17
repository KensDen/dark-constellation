// THE SCOREBOARD (R4; split by mode in v1.3 Round 4, M38), from SYSTEM.
// Two halves: the Daily Op's official runs, newest first, one a date, from
// the daily ledger; and the best ten practice runs (PLAY), from the score
// sink. Every row shows its grade, read through src/engine/grade.ts, never
// stored (src/persistence/DailyLedger.ts says why).
//
// Reads through the ScoreSink and DailyLedger interfaces, so a remote
// leaderboard would drop in unchanged. Clearing empties the practice half
// only: the Daily Op's record is the streak, and is kept.

import { useMemo, useState } from 'react'
import { LocalDailyLedger, LocalScoreSink, type ScoreEntry } from '../persistence'
import { DIFFICULTIES } from '../engine/rules'
import { gradeFor, type Grade } from '../engine/grade'
import { DC_BTN } from './buttons'
import { dailyStreak } from './titleStatus'
import './rooms.css'

const sink = new LocalScoreSink()
const ledger = new LocalDailyLedger()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`
const fromKey = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)), 12)

// A stored entry could carry an unrecognized difficulty (hand-edited, or
// EXPERT from before v1.3 retired it). Fall back rather than dereference
// undefined.
const modeLabel = (d: unknown): string =>
  typeof d === 'string' && d in DIFFICULTIES ? DIFFICULTIES[d as keyof typeof DIFFICULTIES].label : 'STANDARD'

// An entry from before v1.3 R4 has no loss reason: a run that lasted every
// turn ended under the line (D), one that did not ended early (F).
const entryGrade = (e: ScoreEntry): Grade =>
  gradeFor({
    status: e.outcome,
    lossReason: e.lossReason ?? (e.turnsSurvived >= e.totalTurns ? 'belowThreshold' : 'insolvency'),
    finalMai: e.mai,
    bonus: e.bonus,
    // The bands are the difficulty's own (src/engine/grade.ts, v2.0 R3).
    difficulty: e.difficulty === 'easy' ? 'easy' : 'standard',
  })

// One layout for both halves, so their columns line up (fresh-eyes
// review): the run, its grade, how it ended, when, and the final score.
// The row, and the half that holds it, are the rooms' own (./rooms.css).
const ROW = 'rm-row'
const HALF = 'rm-card'
const HEAD = 'tt-label'
const RESULT = (won: boolean) => (won ? <b className="tt-go">HELD</b> : <b className="rm-bad">LOST</b>)

export default function Scoreboard({ onBack }: { onBack: () => void }) {
  const [nonce, setNonce] = useState(0)
  // Clearing asks first.
  const [confirmClear, setConfirmClear] = useState(false)
  const dailies = useMemo(() => ledger.all().slice(0, 10), [])
  const streak = useMemo(() => dailyStreak(new Date()), [])
  // Practice runs only. Before v1.3 R4 a Daily Op's finish was posted here
  // too; its official copy is in the ledger, recorded at the same moment.
  const practice = useMemo(() => {
    void nonce
    const daily = new Set(ledger.all().map(({ result }) => `${result.seed}@${result.recordedAt}`))
    return sink
      .top(10 + daily.size)
      .filter((e) => !daily.has(`${e.seed}@${e.recordedAt}`))
      .slice(0, 10)
  }, [nonce])

  return (
    <main data-scoreboard className="rm">
      <div className="rm-head">
        <button type="button" data-back onClick={onBack} className={DC_BTN}>
          BACK TO TITLE
        </button>
        <h1>SCOREBOARD</h1>
      </div>
      {/* The two halves are two cards of glass: one over the other on a
          phone, side by side on a desk (v2.0 R4). */}
      <div className="rm-body rm-pair">
        <p className="tt-note">Kept on this device only.</p>

        <section data-board="daily" aria-labelledby="daily-head" className={HALF}>
          <div className="tt-row">
            <h2 id="daily-head" className={`${HEAD} tt-sky`}>
              DAILY OP
            </h2>
            {streak > 0 && <p className={`${HEAD} ml-auto`}>STREAK {streak}</p>}
          </div>
          {dailies.length === 0 ? (
            <p className="tt-note">No Daily Op finished yet. Each day’s first finish is its official run.</p>
          ) : (
            <ol>
              {dailies.map(({ dateKey, result }) => {
                const grade = gradeFor({ status: result.outcome, lossReason: result.lossReason, finalMai: result.mai, bonus: result.bonus })
                return (
                  <li key={dateKey} data-daily-row={result.n} className={ROW}>
                    <span>#{result.n}</span>
                    <b data-grade>{grade}</b>
                    {RESULT(result.outcome === 'won')}
                    <span className="rm-meta">{dayOf(fromKey(dateKey))}</span>
                    <span>{result.mai.toFixed(1)}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section data-board="practice" aria-labelledby="practice-head" className={HALF}>
          <div className="tt-row">
            <h2 id="practice-head" className={`${HEAD} tt-sky`}>
              PRACTICE · TOP 10
            </h2>
          </div>
          {practice.length === 0 ? (
            <p className="tt-note">No practice run finished yet. PLAY records one when it ends.</p>
          ) : (
            <ol>
              {practice.map((e, i) => (
                <li key={`${e.recordedAt}-${i}`} data-practice-row={i + 1} className={ROW}>
                  <span className="tt-off">{i + 1}</span>
                  <b data-grade>{entryGrade(e)}</b>
                  {RESULT(e.outcome === 'won')}
                  <span className="rm-meta truncate">
                    {modeLabel(e.difficulty)} · {dayOf(new Date(e.recordedAt))}
                  </span>
                  <span>{e.mai.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="rm-meta">
          Grades read the final mission assurance score and the defense bonus. Practice runs rank wins first, then the score.
        </p>
        {/* Clearing is the one act here that cannot be undone: last, quiet,
            and asked about first (fresh-eyes review). */}
        {practice.length > 0 &&
          (confirmClear ? (
            <div role="group" aria-label="Clear the practice scores" data-confirm-clear className="tt-card tt-warn">
              <p>Clear {practice.length} practice {practice.length === 1 ? 'score' : 'scores'}? The Daily Op record stays.</p>
              <div className="tt-row">
                <button
                  type="button"
                  data-clear-practice
                  className={`${DC_BTN} tt-warn`}
                  onClick={() => {
                    sink.clear()
                    setConfirmClear(false)
                    setNonce((n) => n + 1)
                  }}
                >
                  CLEAR THEM
                </button>
                <button type="button" className={DC_BTN} onClick={() => setConfirmClear(false)}>
                  KEEP THEM
                </button>
              </div>
            </div>
          ) : (
            <button type="button" data-ask-clear className={`${DC_BTN} rm-bad rm-start`} onClick={() => setConfirmClear(true)}>
              CLEAR PRACTICE SCORES
            </button>
          ))}
      </div>
    </main>
  )
}
