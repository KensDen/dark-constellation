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
  })

// One layout for both halves, so their columns line up (fresh-eyes
// review): the run, its grade, how it ended, when, and the final score.
const ROW = 'grid grid-cols-[2.75rem_1.25rem_2.5rem_1fr_2.75rem] items-baseline gap-2 bg-dc-panel px-3 py-2 font-mono text-[12px]'
const HEAD = 'font-mono text-[11px] tracking-widest'
const RESULT = (won: boolean) => (won ? <span className="text-dc-go">HELD</span> : <span className="text-dc-hostile">LOST</span>)

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
    <main data-scoreboard className="mx-auto w-full max-w-[520px] pb-10 text-dc-ink">
      <div className="sticky top-0 z-10 border-b-2 border-dc-line bg-dc-panel px-4 pt-safe">
        <div className="flex items-center justify-between gap-2 py-2">
          <button type="button" data-back onClick={onBack} className={DC_BTN}>
            BACK TO TITLE
          </button>
          <h1 className="font-display text-[13px] text-dc-ink">SCOREBOARD</h1>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-4">
        <p className="text-[13px] text-dc-muted">Kept on this device only.</p>

        <section data-board="daily" aria-labelledby="daily-head">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="daily-head" className={`${HEAD} text-dc-friendly`}>
              DAILY OP
            </h2>
            {streak > 0 && <p className={`${HEAD} text-dc-muted`}>STREAK {streak}</p>}
          </div>
          {dailies.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-dc-muted">No Daily Op finished yet. Each day&apos;s first finish is its official run.</p>
          ) : (
            <ol className="mt-1.5 flex flex-col gap-1">
              {dailies.map(({ dateKey, result }) => {
                const grade = gradeFor({ status: result.outcome, lossReason: result.lossReason, finalMai: result.mai, bonus: result.bonus })
                return (
                  <li key={dateKey} data-daily-row={result.n} className={ROW}>
                    <span className="text-dc-ink">#{result.n}</span>
                    <b data-grade className="font-display text-[12px]">
                      {grade}
                    </b>
                    {RESULT(result.outcome === 'won')}
                    <span className="text-dc-muted">{dayOf(fromKey(dateKey))}</span>
                    <span className="text-right tabular-nums">{result.mai.toFixed(1)}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section data-board="practice" aria-labelledby="practice-head">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="practice-head" className={`${HEAD} text-dc-friendly`}>
              PRACTICE · TOP 10
            </h2>
          </div>
          {practice.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-dc-muted">No practice run finished yet. PLAY records one when it ends.</p>
          ) : (
            <ol className="mt-1.5 flex flex-col gap-1">
              {practice.map((e, i) => (
                <li key={`${e.recordedAt}-${i}`} data-practice-row={i + 1} className={ROW}>
                  <span className="text-dc-muted">{i + 1}</span>
                  <b data-grade className="font-display text-[12px]">
                    {entryGrade(e)}
                  </b>
                  {RESULT(e.outcome === 'won')}
                  <span className="min-w-0 truncate text-dc-muted">
                    {modeLabel(e.difficulty)} · {dayOf(new Date(e.recordedAt))}
                  </span>
                  <span className="text-right tabular-nums">{e.mai.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="text-[12px] leading-relaxed text-dc-muted">
          Grades read the final mission assurance score and the defense bonus. Practice runs rank wins first, then the score.
        </p>
        {/* Clearing is the one act here that cannot be undone: last, quiet,
            and asked about first (fresh-eyes review). */}
        {practice.length > 0 &&
          (confirmClear ? (
            <div role="group" aria-label="Clear the practice scores" data-confirm-clear className="border-l-4 border-dc-warn bg-dc-warn/10 px-3 py-2">
              <p className="text-[13px]">Clear {practice.length} practice {practice.length === 1 ? 'score' : 'scores'}? The Daily Op record stays.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-clear-practice
                  className="min-h-11 border-2 border-dc-warn px-3 font-display text-[10px] text-dc-warn"
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
            <button type="button" data-ask-clear className={`${DC_BTN} self-start border-dc-hostile/60! text-dc-hostile!`} onClick={() => setConfirmClear(true)}>
              CLEAR PRACTICE SCORES
            </button>
          ))}
      </div>
    </main>
  )
}
