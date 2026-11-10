// THE NIGHT'S OTHER CARDS (v1.3 brief 5.5 items 4 to 6): the debris call
// and its result, an opportunity, and END OF TURN. A chunk of their own,
// which the night fetches as it opens, so each of the night's two chunks
// stays inside the deferred cap (brief 10); the per-event loop (the
// overlay, the strike, the hit card and the intel card) is in ./cards.

import { useEffect, useMemo, useRef } from 'react'
import type { GameState, TurnRecord } from '../../engine/types'
import { EVENT_CUES, MOMENT_CUES, outcomeSound } from '../../cues'
import { shortName, stopVerb } from '../board/boardModel'
import { ICON_DOWN, ICON_UP, tinted } from '../sprites/icons'
import { callSigns } from '../board/board'
import { LogRows } from '../board/LogRows'
import { tracesOf } from '../board/strike'
import PixelSprite from '../sprites/PixelSprite'
import { Card, DossierRow, Named, Officer, Onward, Signed, Tag, type StepCardProps } from './cards'
import { callTerms, damaged, ledgerRows, opportunityLines, scoreRows, type LedgerRow } from './closeModel'
import { BLOCK_TONE, CHOICE, HEAD_TONE, PRIMARY, fmtScore, useOnce, type Play } from './kit'
import * as copy from './nightCopy'
import { defensesFor, scoreDelta, type Night, type NightStep } from './nightModel'
import { maiScore } from '../../engine/scoring'
import { ASSET_HEAL_PER_TURN } from '../../engine/rules'

// THE DEBRIS CALL (brief 5.5 item 5): the odds, and two buttons that each
// say what they cost, in the odds line's own words.
export function DebrisCall({
  step,
  turn,
  filed,
  reduced,
  onCall,
}: {
  step: NightStep
  turn: number
  filed: boolean
  reduced: boolean
  onCall: (choice: 'burn' | 'hold') => void
}) {
  const t = callTerms(step.before, step.ev)
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  const officer = copy.officerFor(step, t.sat)
  return (
    <Card
      kind="call"
      label={copy.callHeader(turn)}
      head={copy.callHeader(turn)}
      right={<Tag tone="warn">{copy.DEBRIS_CHIP}</Tag>}
      reduced={reduced}
      foot={
        <>
          <p className="font-mono text-[11px] tracking-widest text-dc-ink">{copy.CHOOSE}</p>
          {/* Two buttons with their cost on the face, each saying what it
              risks in the odds line's own words. */}
          <button ref={ref} type="button" data-call="burn" onClick={() => onCall('burn')} className={`${CHOICE} border-dc-friendly! bg-dc-friendly/10!`}>
            <span className="font-display text-[13px] text-dc-friendly">{copy.burnFace(t.fuel)}</span>
            <span className="text-[13px] text-dc-ink/90">{copy.burnLine(t.ssa, t.chance, t.sat, t.bonus)}</span>
          </button>
          <button type="button" data-call="hold" onClick={() => onCall('hold')} className={`${CHOICE} border-dc-warn! bg-dc-warn/10!`}>
            <span className="font-display text-[13px] text-dc-warn">{copy.HOLD_FACE}</span>
            <span className="text-[13px] text-dc-ink/90">{copy.holdLine(t.ssa, t.chance, t.sat, t.review)}</span>
          </button>
        </>
      }
    >
      {/* The header's DEBRIS chip says what it is; the body keeps to what
          the call turns on, so it fits 375 (second fresh-eyes pass). */}
      <h3 className="text-lg font-bold leading-tight">{shortName(step.def)}</h3>
      {officer && <Officer line={officer.line} clock={officer.clock} />}
      <p data-odds-line className="bg-dc-chrome px-2.5 py-2 text-sm">
        {copy.oddsLine(t.ssa, t.chance).map((part, i) =>
          i === 1 ? (
            <b key={i} data-odds className="text-dc-warn">
              {part}
            </b>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
      {filed && <DossierRow def={step.def} scenario={step.before.scenario} />}
    </Card>
  )
}

// The call's result (brief 5.5 item 5: "Then the result card").
export function DebrisResult({ step, turn, signs, first, filed, reduced, play, onContinue }: StepCardProps) {
  const d = step.ev.debris!
  const sat = d.assetId ? signs.get(d.assetId) : undefined
  const scenario = step.after.scenario
  const ssa = scenario.countermeasures.find((c) => c.id === 'ssaManeuver')!
  const delta = scoreDelta(step)
  useOnce(() => play(d.lost ? EVENT_CUES[step.ev.eventId].sound : MOMENT_CUES['debris-result'].sound))
  return (
    <Card
      kind="debris"
      label={`${copy.conjunctionHeader(turn)}: ${copy.debrisChip(d.lost, d.choice)}`}
      head={copy.conjunctionHeader(turn)}
      right={<Tag tone={d.lost ? 'hostile' : 'go'}>{copy.debrisChip(d.lost, d.choice)}</Tag>}
      reduced={reduced}
      foot={<Onward first={first} filed={filed} reduced={reduced} onContinue={onContinue} />}
    >
      <div>
        <h3 className="text-lg font-bold leading-tight">{copy.debrisTitle(d.lost, d.choice)}</h3>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Tag tone="muted">{copy.attackTag(step.def.vector)}</Tag>
          <Tag tone="friendly">{step.def.layers[0]}</Tag>
          <Tag tone="muted">{copy.youChose(d.choice)}</Tag>
        </div>
      </div>
      <div data-outcome={d.lost ? 'open' : 'held'} className={`border-l-4 p-2.5 ${BLOCK_TONE[d.lost ? 'hostile' : 'go']}`}>
        <p className={`font-display text-[11px] ${HEAD_TONE[d.lost ? 'hostile' : 'go']}`}>{copy.debrisHead(d.lost, d.choice)}</p>
        <p className="mt-1 text-sm">
          <Signed text={copy.debrisText({ choice: d.choice, lost: d.lost, sat })} />
        </p>
        {!d.ssa && (
          <p className="mt-1.5 text-[13px] text-dc-ink/85">
            <Named parts={copy.debrisHelp(d.lost, ssa.name, ssa.cost)} />
          </p>
        )}
      </div>
      {/* The score's change, when there was one. */}
      {delta < 0 && (
        <p className="flex items-baseline gap-2.5 font-mono text-[11px] text-dc-muted">
          <b className="font-display text-[20px] text-dc-hostile">{delta.toFixed(1)}</b>
          Mission assurance {fmtScore(step.scoreBefore)} → {fmtScore(step.scoreAfter)}
        </p>
      )}
      {d.fuel > 0 && <p className="font-mono text-[11px] text-dc-ink/75">{copy.fuelNow(d.fuel)}</p>}
      {step.ev.repairCost > 0 && <p className="font-mono text-[11px] text-dc-ink/75">{copy.reviewQueued(step.ev.repairCost)}</p>}
      <DossierRow def={step.def} fresh={first} scenario={scenario} />
    </Card>
  )
}

// OPPORTUNITIES (brief 5.5 item 4): a green card with CONTINUE.
// The setup first, then what it did (fresh-eyes review: the result read
// before the setup).
export function OpportunityCard({ step, turn, signs, reduced, play, onContinue }: StepCardProps) {
  useOnce(() => play(MOMENT_CUES.opportunity.sound))
  return (
    <Card
      kind="opportunity"
      label={`${copy.opportunityHeader(turn)}: ${step.def.name}`}
      head={copy.opportunityHeader(turn)}
      reduced={reduced}
      foot={<Onward first={false} reduced={reduced} onContinue={onContinue} />}
    >
      <h3 className="text-lg font-bold leading-tight text-dc-go">{step.def.name}</h3>
      <p className="text-sm text-dc-ink/85">{step.def.blurb}</p>
      <div data-opportunity-effect className={`border-l-4 p-2.5 ${BLOCK_TONE.go}`}>
        {opportunityLines(step, signs).map((line, i) => (
          <p key={i} className="text-sm font-bold">
            <Signed text={line} />
          </p>
        ))}
      </div>
    </Card>
  )
}

// WHAT TO FIX (v1.7 R1): one line for END OF TURN, from the night's own
// record. The move that cost the most tonight, and the defense that
// answers it and is not owned yet; with every defense for it owned, that
// it wants an answer in the night; and on a night nothing got through,
// that.
function fixLine(record: TurnRecord, state: GameState): { parts: readonly string[]; tone: 'go' | 'warn' } {
  const landed = record.events.filter((e) => e.effectiveSeverity > 0 && !e.debris)
  const worst = landed.reduce<(typeof landed)[number] | null>((w, e) => (!w || e.scoreAfter - e.scoreBefore < w.scoreAfter - w.scoreBefore ? e : w), null)
  if (!worst) return { parts: [copy.NOTHING_THROUGH], tone: 'go' }
  const def = state.scenario.events.find((e) => e.id === worst.eventId)!
  const { missing } = defensesFor(def, state.counters, state.scenario)
  if (!missing) return { parts: [copy.fixRespond(shortName(def))], tone: 'warn' }
  return { parts: copy.fixDefense(missing.name, missing.cost, shortName(def), stopVerb(missing.id, def) === 'stops' ? 'stops' : 'blunts'), tone: 'warn' }
}

// END OF TURN n (brief 5.5 item 6; simplified in v1.7 R1, Ken's ruling of
// 9 November 2026): the score's change, the budget's change, and one line
// on what to fix. Every line that made the two (the conditions, the moves,
// the recovery; the orders, the responses, the repairs, the upkeep, the
// funding and the coverage bonus) is under DETAILS, with the night's rows
// and a line on what upkeep and the coverage bonus are. Then BEGIN TURN
// n+1 or DEBRIEF.
export function EndOfTurn({
  record,
  state,
  night,
  reduced,
  play,
  onNext,
}: {
  record: TurnRecord
  state: GameState
  // The night just played, for the score's change and its lines; null when
  // the card arrives from a reload with nothing to compare.
  night: Night | null
  reduced: boolean
  play: Play
  onNext: () => void
}) {
  const rows = ledgerRows(record, state)
  const score = record.maiScore
  const scoreFrom = night ? maiScore(night.before) : null
  const change = scoreFrom === null ? 0 : Math.round((score - scoreFrom) * 10) / 10
  const over = state.status !== 'playing'
  const ending = over ? copy.ENDING[state.status === 'won' ? 'won' : (state.lossReason ?? 'belowThreshold')] : null
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  useOnce(() => play(over ? outcomeSound(state.status === 'won') : MOMENT_CUES['end-of-turn'].sound))
  const scores = night ? scoreRows(night).filter((r) => r.key !== 'from' && r.key !== 'to') : []
  const from = night ? scoreRows(night).find((r) => r.key === 'from')!.value : null
  const total = rows.find((r) => r.key === 'total')!
  const budgetChange = total.value - record.ledger.start
  const bonus = rows.find((r) => r.key === 'bonus')
  const signs = useMemo(() => new Map([...(night ? callSigns(night.before) : []), ...callSigns(state)]), [night, state])
  const log = tracesOf(record.turn, record.events, state.scenario)
  const recovery = damaged(state) && !record.ledger.insolvent && state.scenario.recovery.withIrRetainer > state.scenario.recovery.base
  const ledgerValue = (row: LedgerRow) => (row.word ? row.word : row.key === 'left' ? `-${record.ledger.ordered}` : row.value > 0 ? `+${row.value}` : row.value < 0 ? `-${-row.value}` : '0')
  const tone = (n: number) => (n < 0 ? 'text-dc-hostile' : n > 0 ? 'text-dc-go' : 'text-dc-muted')
  const fix = fixLine(record, state)
  return (
    <Card
      kind="end"
      label={copy.endHeader(record.turn)}
      head={copy.endHeader(record.turn)}
      reduced={reduced}
      foot={
        <button ref={ref} type="button" data-begin onClick={onNext} className={PRIMARY}>
          {over ? copy.DEBRIEF : copy.beginTurn(record.turn + 1)}
        </button>
      }
    >
      {/* The last END OF TURN leads with how the operation ended, so the
          verdict is on screen at 375 (second fresh-eyes pass: a win read
          as a loss beside a falling score). */}
      {record.ledger.insolvent ? (
        <div data-ending="insolvency" className={`border-l-4 p-2.5 ${BLOCK_TONE.hostile}`}>
          <p className={`font-display text-[11px] ${HEAD_TONE.hostile}`}>{copy.INSOLVENT}</p>
          <p className="mt-1 text-sm">{copy.INSOLVENT_LINE}</p>
        </div>
      ) : (
        ending && (
          <div data-ending={state.status === 'won' ? 'won' : state.lossReason} className={`border-l-4 p-2.5 ${BLOCK_TONE[state.status === 'won' ? 'go' : 'hostile']}`}>
            <p className={`font-display text-[11px] ${HEAD_TONE[state.status === 'won' ? 'go' : 'hostile']}`}>{ending.head}</p>
            <p className="mt-1 text-sm">
              {ending.line(
                state.status === 'won'
                  ? state.scenario.totalTurns
                  : state.lossReason === 'maiCollapse'
                    ? state.scenario.collapseThreshold
                    : state.scenario.winThreshold,
              )}
            </p>
          </div>
        )
      )}
      <div className="grid grid-cols-2 gap-2">
        {/* The score's change. */}
        <section data-score-lines aria-label={copy.SCORE_LINES} className={`flex flex-col bg-dc-chrome px-2.5 py-2 ${reduced ? '' : 'dc-row-in'}`}>
          <p className="font-mono text-[10px] tracking-widest text-dc-muted">{copy.SCORE_PANEL}</p>
          {/* From a reload there is no night to measure, so the score. */}
          {from === null ? (
            <p className="mt-0.5 font-display text-[20px] leading-none text-dc-ink">{fmtScore(score)}</p>
          ) : (
            <p className={`mt-0.5 flex items-center gap-1 font-display text-[20px] leading-none ${tone(change)}`}>
              {Math.abs(change) > 0.05 && <PixelSprite sprite={tinted(change < 0 ? ICON_DOWN : ICON_UP, change < 0 ? 'hostile' : 'go')} scale={2} name={change < 0 ? 'score-down' : 'score-up'} />}
              {Math.abs(change) > 0.05 ? Math.abs(change).toFixed(1) : copy.NO_CHANGE}
            </p>
          )}
          <p data-end-score className={`mt-1 font-mono text-[11px] text-dc-muted ${from === null ? 'sr-only' : ''}`}>
            {from !== null && <span data-score-row="from">{fmtScore(from)} → </span>}
            <b className="font-normal text-dc-ink">{fmtScore(score)}</b>
          </p>
          {/* What made the change, when more than the moves did (v1.7 R1's
              fresh eyes: a -0.7 hit closed as 0.2 with nothing to say why). */}
          {scores.length > 1 && (
            <p data-score-parts className="mt-0.5 font-mono text-[10px] leading-snug text-dc-muted">
              {copy.scoreParts(scores)}
            </p>
          )}
        </section>
        {/* The budget's change. */}
        <section data-ledger aria-label={copy.BUDGET_LINES} style={reduced ? undefined : { animationDelay: '90ms' }} className={`flex flex-col bg-dc-chrome px-2.5 py-2 ${reduced ? '' : 'dc-row-in'}`}>
          <p className="font-mono text-[10px] tracking-widest text-dc-muted">{copy.budgetPanel(record.turn, over)}</p>
          <p className={`mt-0.5 flex items-center gap-1 font-display text-[20px] leading-none ${tone(budgetChange)}`}>
            {budgetChange !== 0 && <PixelSprite sprite={tinted(budgetChange < 0 ? ICON_DOWN : ICON_UP, budgetChange < 0 ? 'hostile' : 'go')} scale={2} name={budgetChange < 0 ? 'budget-down' : 'budget-up'} />}
            {budgetChange !== 0 ? Math.abs(budgetChange) : copy.NO_CHANGE}
            <span className="font-mono text-[11px]">CR</span>
          </p>
          <p data-ledger-row="total" data-value={total.value} className="mt-1 font-mono text-[11px] text-dc-muted">
            {record.ledger.start} → <b className={`font-normal ${total.value < 0 ? 'text-dc-hostile' : 'text-dc-ink'}`}>{total.value}</b> CR
          </p>
        </section>
      </div>
      {/* The one line on what to fix; none once the operation is over. */}
      {!over && (
        <p data-end-fix={fix.tone} className={`border-l-4 p-2.5 text-[13px] leading-snug ${BLOCK_TONE[fix.tone]}`}>
          {fix.tone === 'warn' && <span className={`mr-1.5 font-mono text-[10px] tracking-widest ${HEAD_TONE.warn}`}>{copy.FIX_LABEL}</span>}
          <Named parts={fix.parts} />
        </p>
      )}
      {/* Every line behind the two figures, on demand. */}
      <details data-end-details className="border-2 border-dc-line bg-dc-panel">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-2.5 font-mono text-[11px] tracking-widest text-dc-muted [&::-webkit-details-marker]:hidden">
          <span>{copy.DETAILS}</span>
          <PixelSprite sprite={tinted(ICON_DOWN, 'ink')} scale={1} name="end-details-open" className="dc-open-turn flex-none" />
        </summary>
        <div className="flex flex-col gap-2.5 border-t border-dc-line px-2.5 py-2">
          <div className="grid grid-cols-2 gap-x-4">
            <dl className="grid grid-cols-[1fr_auto] content-start gap-x-2 gap-y-0.5 font-mono text-[11px]">
              {scores.map((row) => (
                <div key={row.key} data-score-row={row.key} className="col-span-2 grid grid-cols-subgrid">
                  <dt className="min-w-0 text-dc-ink/85">{copy.SCORE_SHORT[row.key]}</dt>
                  <dd className={`text-right ${tone(row.value)}`}>{row.value > 0 ? `+${row.value.toFixed(1)}` : row.value.toFixed(1)}</dd>
                </div>
              ))}
            </dl>
            <dl className="grid grid-cols-[1fr_auto] content-start gap-x-2 gap-y-0.5 font-mono text-[11px]">
              {rows
                .filter((r) => r.key !== 'total')
                .map((row) => (
                  <div key={row.key} data-ledger-row={row.key} data-value={row.value} className="col-span-2 grid grid-cols-subgrid">
                    <dt className="min-w-0 text-dc-ink/85">{copy.LEDGER_SHORT[row.key]}</dt>
                    <dd className={`text-right ${row.word ? 'text-dc-muted' : row.key === 'left' ? tone(-record.ledger.ordered) : tone(row.value)}`}>{ledgerValue(row)}</dd>
                  </div>
                ))}
            </dl>
          </div>
          {/* What hit tonight, as the night's own rows. */}
          {log.length > 0 && (
            <div data-end-tonight>
              <p className="font-mono text-[10px] tracking-widest text-dc-muted">{copy.TONIGHT_ROWS}</p>
              <ol className="mt-1 flex flex-col gap-1">
                <LogRows scenario={state.scenario} log={log} signs={signs} size="text-[13px]" delta={false} />
              </ol>
            </div>
          )}
          {bonus?.word && bonus.detail && <p data-end-hint className="text-[12px] leading-snug text-dc-ink/80">{copy.bonusHint(bonus.detail)}</p>}
          <p data-end-notes className="text-[12px] leading-snug text-dc-muted">{copy.DETAIL_NOTES}</p>
          {recovery && (
            <p data-end-how className="text-[12px] leading-snug text-dc-muted">
              {(state.counters.includes('irRetainer') ? copy.recoveryFast : copy.recoverySlow)(ASSET_HEAL_PER_TURN, state.scenario.recovery.base, state.scenario.recovery.withIrRetainer)}
            </p>
          )}
        </div>
      </details>
    </Card>
  )
}
