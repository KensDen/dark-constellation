// THE NIGHT'S OTHER CARDS (v1.3 brief 5.5 items 4 to 6): the debris call
// and its result, an opportunity, and END OF TURN. A chunk of their own,
// which the night fetches as it opens, so each of the night's two chunks
// stays inside the deferred cap (brief 10); the per-event loop (the
// overlay, the strike, the hit card and the intel card) is in ./cards.

import { useEffect, useRef } from 'react'
import type { GameState, TurnRecord } from '../../engine/types'
import { EVENT_CUES, MOMENT_CUES, outcomeSound } from '../../cues'
import { shortName } from '../board/boardModel'
import { ICON_DOWN, ICON_UP, tinted } from '../sprites/icons'
import PixelSprite from '../sprites/PixelSprite'
import { Card, DossierRow, Named, Officer, Onward, Signed, Tag, type StepCardProps } from './cards'
import { callTerms, damaged, ledgerRows, opportunityLines, scoreRows } from './closeModel'
import { BLOCK_TONE, CHOICE, HEAD_TONE, PRIMARY, fmtScore, useOnce, type Play } from './kit'
import * as copy from './nightCopy'
import { scoreDelta, type Night, type NightStep } from './nightModel'
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
      {filed && <DossierRow def={step.def} />}
    </Card>
  )
}

// The call's result (brief 5.5 item 5: "Then the result card").
export function DebrisResult({ step, turn, signs, first, reduced, play, onContinue }: StepCardProps) {
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
      foot={<Onward first={first} reduced={reduced} onContinue={onContinue} />}
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
      {!first && <DossierRow def={step.def} />}
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

// END OF TURN n (brief 5.5 item 6): every line that made the budget, the
// score with its change, and BEGIN TURN n+1 or DEBRIEF.
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
  const shown = (row: (typeof rows)[number]) =>
    row.word ?? (row.key === 'left' || row.key === 'total' ? String(row.value) : row.value > 0 ? `+${row.value}` : row.value < 0 ? `-${-row.value}` : '0')
  return (
    <Card
      kind="end"
      label={copy.endHeader(record.turn)}
      head={copy.endHeader(record.turn)}
      right={
        <span data-end-score className="flex items-center gap-1 whitespace-nowrap">
          {copy.SCORE_WORD} <b className="text-dc-ink">{fmtScore(score)}</b>
          {Math.abs(change) > 0.05 && (
            <span className={`flex items-center gap-0.5 ${change < 0 ? 'text-dc-hostile' : 'text-dc-go'}`}>
              <PixelSprite sprite={tinted(change < 0 ? ICON_DOWN : ICON_UP, change < 0 ? 'hostile' : 'go')} scale={1} name={change < 0 ? 'score-down' : 'score-up'} />
              {Math.abs(change).toFixed(1)}
            </span>
          )}
        </span>
      }
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
      <p className="font-mono text-[10px] tracking-widest text-dc-muted">{copy.BUDGET_LINES}</p>
      <div data-ledger className="flex flex-col font-mono text-[13px]">
        {rows.map((row, i) => (
          <div
            key={row.key}
            data-ledger-row={row.key}
            data-value={row.value}
            style={reduced ? undefined : { animationDelay: `${i * 90}ms` }}
            className={`dc-ledger-row flex items-baseline justify-between gap-3 py-1 ${reduced ? '' : 'dc-row-in'} ${row.key === 'total' ? 'font-bold' : ''}`}
          >
            <span className="min-w-0">
              {row.label}
              {row.detail && <span className="text-dc-muted"> ({row.detail})</span>}
            </span>
            <b
              className={`flex-none ${
                row.key === 'total'
                  ? row.value < 0
                    ? 'text-dc-hostile'
                    : 'text-dc-ink'
                  : row.word || row.value === 0
                    ? 'text-dc-muted'
                    : row.value < 0
                      ? 'text-dc-hostile'
                      : row.key === 'left'
                        ? 'text-dc-ink'
                        : 'text-dc-go'
              }`}
            >
              {shown(row)}
            </b>
          </div>
        ))}
      </div>
      {/* The score's own lines, so its change is checkable too (fresh-eyes
          review: it fell during the overlay and rose by the close with
          nothing on screen saying why). A night played here only. The
          end of turn's own row went in v1.6 R3's sweep: the header says the
          score it lands on, and the third time ran the card under its foot
          at 375x667. */}
      {night && (
        <div data-score-lines className="flex flex-col font-mono text-[12px]">
          <p className="font-mono text-[10px] tracking-widest text-dc-muted">{copy.SCORE_LINES}</p>
          {scoreRows(night).filter((row) => row.key !== 'to').map((row) => (
            <div key={row.key} data-score-row={row.key} className="dc-ledger-row flex items-baseline justify-between gap-3 py-0.5">
              <span className="min-w-0">
                {row.label}
                {row.note && <span className={row.key === 'moves' ? 'text-dc-go' : 'text-dc-muted'}> ({row.note})</span>}
              </span>
              <b className={`flex-none ${row.key === 'from' || row.key === 'to' ? 'text-dc-ink' : row.value < 0 ? 'text-dc-hostile' : row.value > 0 ? 'text-dc-go' : 'text-dc-muted'}`}>
                {row.key === 'from' || row.key === 'to' ? fmtScore(row.value) : row.value > 0 ? `+${row.value.toFixed(1)}` : row.value.toFixed(1)}
              </b>
            </div>
          ))}
        </div>
      )}
      {damaged(state) && !record.ledger.insolvent && state.scenario.recovery.withIrRetainer > state.scenario.recovery.base && (
        <p className="text-[13px] text-dc-ink/80">
          {(state.counters.includes('irRetainer') ? copy.recoveryFast : copy.recoverySlow)(
            ASSET_HEAL_PER_TURN,
            state.scenario.recovery.base,
            state.scenario.recovery.withIrRetainer,
          )}
        </p>
      )}
    </Card>
  )
}

