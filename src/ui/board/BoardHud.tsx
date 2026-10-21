// THE HUD (v1.3 brief 5.3 item 1). OP FIRST LIGHT, the turn and SYSTEM on
// one line; the MISSION ASSURANCE SCORE at display size with "/ 100", the
// margin to the win line (amber under 6 above it, red below it), the
// defense streak from 2, and the floating delta of a hit; the BUDGET in CR
// on the right; a bar with the win line marked and the scale
// "0 · ▲ 70 WIN LINE · 100". On a Daily Op the line carries DAILY OP #n
// (QC G-104). The four meters left the HUD with the v1.2 board: the score
// is the one number the player steers by (section 4 rule 9), and each
// meter's story is told by the move that hits it.
//
// Both numbers are Readouts, so the count, the tones and the ticks are the
// ones the board has had since v1.2.

import type { GameState } from '../../engine/types'
import { maiScore } from '../../engine/scoring'
import Readout from '../cues/Meter'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CHECK, ICON_UP, tinted } from '../sprites/icons'
import { BUDGET_LABEL, SCORE_LABEL, marginChip, streakChip, winLineLabel } from './boardModel'

const TONE_TEXT = { go: 'text-dc-go', warn: 'text-dc-warn', hostile: 'text-dc-hostile' } as const

export interface BoardHudProps {
  shown: GameState
  displayTurn: number
  // The budget the HUD shows: the engine's balance.
  budget: { value: number; basis: string; chosen: boolean; chosenDelta: number }
  dailyNumber?: number
  onSystem: () => void
  systemOpen: boolean
  // A hit that just landed: how far the score fell, floated off it.
  drop?: { id: string; delta: number } | null
  countMs?: number
}

export default function BoardHud({ shown, displayTurn, budget, dailyNumber, onSystem, systemOpen, drop, countMs }: BoardHudProps) {
  const scenario = shown.scenario
  const score = maiScore(shown)
  const winAt = scenario.winThreshold
  const margin = marginChip(score, winAt)
  const fill = Math.max(0, Math.min(100, score))
  return (
    <header data-hud className="relative flex-none border-b-2 border-dc-line bg-dc-chrome px-safe pt-safe">
      <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-0.5 font-mono text-[11px] tracking-widest text-dc-muted">
        <p className="min-w-0 truncate">
          {/* On a Daily Op the line leads with its number (QC G-104), in the
              place of the operation's name, so both fit at 375. */}
          {dailyNumber !== undefined ? (
            <span data-daily-tag className="text-dc-friendly">
              DAILY OP #{dailyNumber}
            </span>
          ) : (
            <span className="text-dc-ink">OP {scenario.name}</span>
          )}{' '}
          · TURN {displayTurn} OF {scenario.totalTurns}
        </p>
        {/* SYSTEM: a 44px target drawn as a small key, the hit area
            reaching into the line under it, which holds no control. */}
        <button
          type="button"
          aria-label="System"
          aria-expanded={systemOpen}
          onClick={onSystem}
          className={`relative -my-3 flex min-h-11 flex-none items-center px-1 font-display text-[10px] ${systemOpen ? 'text-dc-friendly' : 'text-dc-ink'}`}
        >
          <span className="border-2 border-dc-line bg-dc-panel px-2 py-1 uppercase">System</span>
        </button>
      </div>
      <p className="flex justify-between px-3 font-mono text-[10px] tracking-widest text-dc-muted">
        <span>{SCORE_LABEL}</span>
        <span>{BUDGET_LABEL}</span>
      </p>
      <div className="flex items-end justify-between gap-2 px-3">
        <div className="relative flex min-w-0 items-end gap-x-1.5">
          <Readout
            label={SCORE_LABEL}
            value={score}
            warnBelow={winAt}
            strobeOnWarn
            bare
            odometer
            countMs={countMs}
            valueClassName="whitespace-nowrap font-display text-[22px] leading-none"
          />
          <span className="whitespace-nowrap pb-0.5 font-mono text-[11px] text-dc-muted">/ 100</span>
          {drop && (
            <span key={drop.id} aria-hidden="true" data-mai-drop className="dc-mai-float pointer-events-none absolute left-24 top-2 font-display text-sm text-dc-hostile">
              -{drop.delta}
            </span>
          )}
          <span className="flex min-w-0 flex-col pb-0.5 font-mono text-[10px] leading-tight">
            <span data-margin={margin.tone} className={`whitespace-nowrap ${TONE_TEXT[margin.tone]}`}>
              {margin.text}
            </span>
            {shown.streak >= 2 && (
              <span data-streak className="inline-flex items-center gap-1 whitespace-nowrap text-dc-go">
                <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="status-blocked" />
                {streakChip(shown.streak)}
              </span>
            )}
          </span>
        </div>
        <Readout
          label={BUDGET_LABEL}
          value={budget.value}
          basis={budget.basis}
          chosen={budget.chosen}
          chosenDelta={budget.chosenDelta}
          suffix=" CR"
          bare
          valueClassName="whitespace-nowrap font-display text-sm leading-none"
        />
      </div>
      <div className="px-3 pb-1 pt-1">
        <div className="relative h-1.5 bg-dc-line" aria-hidden="true">
          <i className={`absolute inset-y-0 left-0 ${score < winAt ? 'bg-dc-hostile' : 'bg-dc-friendly'}`} style={{ width: `${fill}%` }} />
          <b className="absolute -inset-y-0.5 w-0.5 bg-dc-go" style={{ left: `${winAt}%` }} />
        </div>
        <p data-scale className="relative mt-0.5 h-3 font-mono text-[10px] leading-none text-dc-muted">
          <span className="absolute left-0">0</span>
          <span className="absolute inline-flex -translate-x-1/2 items-center gap-1 text-dc-go" style={{ left: `${winAt}%` }}>
            <PixelSprite sprite={tinted(ICON_UP, 'go')} scale={1} name="win-marker" />
            {winLineLabel(winAt)}
          </span>
          <span className="absolute right-0">100</span>
        </p>
      </div>
    </header>
  )
}
