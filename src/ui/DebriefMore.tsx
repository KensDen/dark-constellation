// THE DEBRIEF'S LOWER SECTIONS (v1.3 brief 5.6), below its first screen:
// WHAT YOU CAN NOW SAY, NEXT TIME and DECISIONS, then the grade ladder and
// the turn strip. In a chunk of their own since v1.6 R2, which ./Debrief
// fetches the moment it loads, so the debrief's own chunk stays inside its
// 10,000-byte cap (brief 10; it stood at 9,831 after v1.6 R1). Moved whole:
// the words, the order and the motion are the debrief's, unchanged.
//
// Two groups, so the desktop's two columns each flow from the top (R1's
// fresh eyes, F18: a won debrief left a band of about 100px between FILED
// THIS GAME and TURN BY TURN, where a loss's BIGGEST DROP would be). On a
// phone the groups step aside (display: contents) and the sections run in
// the order they always have.

import { Fragment, useEffect, useState } from 'react'
import { turnStrip, type Grade, type StripColour } from '../engine/grade'
import type { GameState, LearnedHow } from '../engine/types'
import { canSay, decisions, gradeBlock, ladder, missedLead, nextTime, toNextGrade } from './debriefModel'
import { DEBRIEF_MOTION } from './debriefMotion'
import { ICON_CHECK, ICON_CROSS, ICON_HALF, tinted } from './sprites/icons'
import PixelSprite from './sprites/PixelSprite'

const GRADE_TONE: Record<Grade, string> = {
  S: 'text-dc-go',
  A: 'text-dc-go',
  B: 'text-dc-go',
  C: 'text-dc-go',
  D: 'text-dc-hostile',
  F: 'text-dc-hostile',
}

// The turn strip's legend (QC G-062), and each square's own words.
const STRIP_WORD: Record<StripColour, string> = {
  green: 'score held or rose',
  amber: 'dropped less than 3',
  magenta: 'dropped 3 or more, or lost an asset',
}

// NEXT TIME's turn with room for it (v1.4). "a night with no new defense"
// read as a night none was allowed (v1.4 fresh eyes); in turns since v1.5
// R1, the game's one unit; "when", not "a turn you ordered no defense",
// since v1.6 R2 (its fresh eyes, G21).
const NO_NEW_DEFENSE = 'when you ordered no defense'
// NEXT TIME when no one defense ordered earlier ends the game higher (v1.5
// R1): the move COLDVEIL took instead cost as much.
const NO_BETTER = 'No one defense ordered earlier ends this game higher: COLDVEIL takes whatever move you leave open.'

// Names in bold, joined "A, B and C".
function Names({ list }: { list: string[] }) {
  return (
    <>
      {list.map((t, i) => (
        <span key={t}>
          {i > 0 && (i === list.length - 1 ? ' and ' : ', ')}
          <b>{t}</b>
        </span>
      ))}
    </>
  )
}

// What a saying is, as an icon and a word (section 4 rule 8).
const SAY_ICON: Record<LearnedHow, { icon: typeof ICON_CHECK; tone: 'go' | 'warn' | 'hostile' }> = {
  held: { icon: ICON_CHECK, tone: 'go' },
  reduced: { icon: ICON_HALF, tone: 'warn' },
  missed: { icon: ICON_CROSS, tone: 'hostile' },
}

const HEAD = 'font-mono text-[11px] tracking-widest'
const PANEL = 'bg-dc-panel px-3 py-2.5'

// A section below the fold rises in the first time it is scrolled to, with
// motion; without it, or without an observer, it is simply there.
function useRiseIn(moving: boolean): [(el: HTMLElement | null) => void, string] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(!moving)
  useEffect(() => {
    if (seen || !el) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [el, seen])
  return [setEl, seen ? (moving ? 'dc-section-in' : '') : 'dc-score-wait']
}

type DebriefTab = 'say' | 'decisions' | 'grades'
const tabLabel = (word: string, n: number) => (n > 0 ? `${word} ${n}` : word)

export interface DebriefMoreProps {
  state: GameState
  block: ReturnType<typeof gradeBlock>
  // Whether any move was blocked, for NEXT TIME's last line.
  anyBlocked: boolean
  // The debrief's reveal, which the turn strip fills with.
  stage: number
  restStage: number
  moving: boolean
}

export default function DebriefMore({ state, block, anyBlocked, stage, restStage, moving }: DebriefMoreProps) {
  const scenario = state.scenario
  const strip = turnStrip(state)
  const sayings = canSay(state)
  const next = nextTime(state)
  const turns = decisions(state)
  const rungs = ladder(state)
  const [canSayRef, canSayIn] = useRiseIn(moving)
  const [nextRef, nextIn] = useRiseIn(moving)
  const [decisionsRef, decisionsIn] = useRiseIn(moving)
  const [ladderRef, ladderIn] = useRiseIn(moving)
  const [turnsRef, turnsIn] = useRiseIn(moving)
  const [tab, setTab] = useState<DebriefTab | null>(null)
  // THE END SCREEN'S LOWER HALF (v1.6 R4, Ken's ruling of 27 October 2026:
  // long lists behind taps). NEXT TIME, the one lesson, and the turn strip
  // stand open; what the player can now say, the decisions and the grade
  // ladder are three tabs, one open at a time, none at first.
  const tabs: { id: DebriefTab; label: string }[] = [
    { id: 'say', label: tabLabel('YOU CAN SAY', sayings.length) },
    { id: 'decisions', label: tabLabel('DECISIONS', turns.length) },
    { id: 'grades', label: 'GRADES' },
  ]
  return (
    <>
      <div data-debrief-col="right" className="contents">
          <section ref={nextRef} data-next-time aria-labelledby="next-time-head" className={`border-l-4 border-dc-warn bg-dc-warn/10 px-3 py-2.5 ${nextIn}`}>
            <h3 id="next-time-head" className={`${HEAD} text-dc-warn`}>
              NEXT TIME
            </h3>
            {/* A run that went insolvent learns the budget first (the R1
                re-review: its tip was a defense, never why it ended). */}
            {state.lossReason === 'insolvency' ? (
              <p className="mt-1 text-[13px] leading-snug">
                {`Keep WORST CASE at 0 or above. Orders, upkeep and repairs took the budget below zero on turn ${state.history.length}.`}
              </p>
            ) : next?.kind === 'earlier' ? (
              <p className="mt-1 text-[13px] leading-snug">
                {/* An order of purchases, one new defense a turn (v1.4), and
                    since v1.5 R1 the same game played again with that one
                    change, so the line says what it does, redirects and all
                    (R6b's fresh eyes, item 2). */}
                {next.procured !== null ? (
                  <>
                    You ordered <b>{next.defense}</b> on turn {next.procured}. Order it on turn {next.orderOn}
                  </>
                ) : (
                  <>
                    Order <b>{next.defense}</b> ({next.price} CR) on turn {next.orderOn}
                  </>
                )}
                {next.ahead === null ? (
                  `, ${NO_NEW_DEFENSE}`
                ) : next.aheadTo !== null ? (
                  <>
                    {' '}
                    and move <b>{next.ahead}</b> to turn {next.aheadTo}
                  </>
                ) : (
                  <>
                    {' '}
                    in place of <b>{next.ahead}</b>
                  </>
                )}
                . Played again with every other order the same, this game ends at <b>{next.final.toFixed(1)}</b>, not {next.was.toFixed(1)}
                {/* Whether it wins, said (the R1 re-review: 54.6 against 48.7
                    read as a fix while still a loss). */}
                {next.won ? (state.status !== 'won' ? ', and is won' : '') : `, still under the win line of ${state.scenario.winThreshold}`}.
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-snug">
                {next?.kind === 'none' ? NO_BETTER : anyBlocked ? 'Every move that got through met a defense you already had.' : 'Nothing got through.'}
              </p>
            )}
          </section>

          <nav data-debrief-tabs aria-label="More from this game" className="grid grid-cols-3 gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                data-debrief-tab={t.id}
                aria-expanded={tab === t.id}
                onClick={() => setTab((o) => (o === t.id ? null : t.id))}
                className={`dc-tile min-h-11 border-2 px-1 font-mono text-[10px] tracking-wider shadow-press active:shadow-none ${tab === t.id ? 'border-dc-friendly bg-dc-friendly/15 text-dc-ink' : 'border-dc-line bg-dc-panel text-dc-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'say' && (
          <section ref={canSayRef} data-can-say aria-labelledby="can-say-head" className={`${PANEL} ${canSayIn}`}>
            <h3 id="can-say-head" className={`${HEAD} text-dc-muted`}>
              WHAT YOU CAN NOW SAY
            </h3>
            {sayings.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {sayings.map((s, n) => (
                  <Fragment key={`${s.defense}-${s.verb}`}>
                    {/* Above the first defense not owned, what the list is
                        (v1.4's fresh eyes, finding 13). */}
                    {s.how === 'missed' && sayings[n - 1]?.how !== 'missed' && (
                      <li data-saying-lead className="px-2 pt-1 text-[12px] leading-snug text-dc-muted">
                        {missedLead(state)}
                      </li>
                    )}
                    <li data-saying={s.how} className="flex items-start gap-2 bg-dc-chrome px-2 py-1.5 text-[13px] leading-snug">
                      <PixelSprite sprite={tinted(SAY_ICON[s.how].icon, SAY_ICON[s.how].tone)} scale={1} className="mt-1 flex-none" name={`say-${s.how}`} />
                      <span>
                        <b>{s.defense}</b> <span className={s.how === 'missed' ? 'text-dc-hostile' : ''}>{s.verb}</span> <Names list={s.threats} />
                        {s.more?.map((m) => (
                          <span key={m.verb}>
                            {' '}
                            and <span className="text-dc-hostile">{m.verb}</span> <Names list={m.threats} />
                          </span>
                        ))}
                        {s.orderedOn !== undefined && <span className="text-dc-muted"> (ordered on turn {s.orderedOn}, too late)</span>}
                      </span>
                    </li>
                  </Fragment>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[13px] text-dc-muted">Nothing landed and nothing was tested.</p>
            )}
          </section>
          )}
          {tab === 'decisions' && (
          <section ref={decisionsRef} data-decisions aria-labelledby="decisions-head" className={`${PANEL} ${decisionsIn}`}>
            <h3 id="decisions-head" className={`${HEAD} text-dc-muted`}>
              DECISIONS
            </h3>
            <ol className="mt-1.5 flex flex-col">
              {turns.map((d) => (
                <li key={d.turn} data-decision={d.turn} className="grid grid-cols-[2rem_1fr_auto] gap-2 border-t border-dc-line/60 py-1.5 text-[13px] leading-snug first:border-t-0">
                  <b className="font-mono font-normal text-dc-ink">T{d.turn}</b>
                  <span className="flex flex-col">
                    {d.orders.length ? d.orders.map((o, i) => <span key={i}>{o}</span>) : <span className="text-dc-muted">nothing ordered</span>}
                    {d.call && <span className="text-dc-muted">debris call: {d.call}</span>}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-dc-muted">{d.spent > 0 ? `${d.spent} CR` : ''}</span>
                </li>
              ))}
            </ol>
          </section>
          )}
          {tab === 'grades' && (
          <section ref={ladderRef} data-ladder aria-labelledby="ladder-head" className={`${PANEL} ${ladderIn}`}>
            <h3 id="ladder-head" className={`${HEAD} text-dc-muted`}>
              GRADE LADDER
            </h3>
            <p className="mt-1 text-[12px] text-dc-muted">Grade score: the final mission assurance score plus the defense bonus.</p>
            <ol className="mt-1.5 flex flex-col">
              {rungs.map((r) => {
                const mine = r.grade === block.grade
                return (
                  <Fragment key={r.grade}>
                    {/* The win line between C and D (Ken, 22 October: question
                        7 of the R5 report): every grade above it is a win. */}
                    {r.grade === 'D' && (
                      <li data-win-line aria-hidden="true" className="my-1 flex items-center gap-2 font-mono text-[10px] tracking-widest text-dc-go">
                        <span className="flex-1 border-t border-dashed border-dc-go/70" />
                        WIN LINE {scenario.winThreshold}
                        <span className="flex-1 border-t border-dashed border-dc-go/70" />
                      </li>
                    )}
                    <li
                      data-rung={r.grade}
                      {...(mine ? { 'data-mine': true } : {})}
                      className={`flex items-center gap-3 border-l-4 px-2 py-1 ${mine ? (block.won ? 'border-dc-go bg-dc-go/10' : 'border-dc-hostile bg-dc-hostile/10') : 'border-transparent'}`}
                    >
                      <span className={`w-5 font-display text-xs ${mine ? GRADE_TONE[r.grade] : 'text-dc-muted'}`}>{r.grade}</span>
                      <span className={`flex-1 text-[12px] ${mine ? 'text-dc-ink' : 'text-dc-muted'}`}>{r.takes}</span>
                      {mine && <span className={`font-mono text-[10px] tracking-widest ${block.won ? 'text-dc-go' : 'text-dc-hostile'}`}>YOUR GRADE</span>}
                    </li>
                  </Fragment>
                )
              })}
            </ol>
            <p data-to-next className="mt-1.5 text-[13px]">
              {toNextGrade(state)}
            </p>
          </section>
          )}
      </div>
      <div data-debrief-col="left" className="contents">
          <section ref={turnsRef} data-turns aria-labelledby="turns-head" className={`${PANEL} ${turnsIn}`}>
            <h3 id="turns-head" className={`${HEAD} text-dc-muted`}>
              TURN BY TURN
            </h3>
            <ol
              data-turn-strip
              aria-label="Turn by turn"
              className="dc-strip mt-2 max-w-60"
              style={{ gridTemplateColumns: `repeat(${scenario.totalTurns}, minmax(0, 1fr))` }}
            >
              {strip.map((colour, i) => (
                <li
                  key={i}
                  data-strip-cell={colour}
                  aria-label={`Turn ${i + 1}: ${STRIP_WORD[colour]}`}
                  className={`dc-strip-cell dc-strip-${colour} ${stage < restStage ? 'dc-score-wait' : moving ? 'dc-strip-fill' : ''}`}
                  style={stage >= restStage && moving ? { animationDelay: `${i * DEBRIEF_MOTION.stripStepMs}ms` } : undefined}
                />
              ))}
            </ol>
            <ol aria-hidden="true" className="mt-1 grid max-w-60 gap-1 font-mono text-[10px] text-dc-muted" style={{ gridTemplateColumns: `repeat(${scenario.totalTurns}, minmax(0, 1fr))` }}>
              {strip.map((_, i) => (
                <li key={i} className="text-center">
                  T{i + 1}
                </li>
              ))}
            </ol>
            <p data-strip-legend className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-dc-muted">
              {(['green', 'amber', 'magenta'] as const).map((c) => (
                <span key={c}>
                  <span className={`dc-strip-key dc-strip-${c}`} />
                  {STRIP_WORD[c]}
                </span>
              ))}
            </p>
          </section>
      </div>
    </>
  )
}
