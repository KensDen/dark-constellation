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
  drop?: { id: string; delta: number; label?: string } | null
  // A block's card under reduced motion (no strike, so no float).
  held?: boolean
  countMs?: number
}

export default function BoardHud({ shown, displayTurn, budget, dailyNumber, onSystem, systemOpen, drop, held: heldCard, countMs }: BoardHudProps) {
  const scenario = shown.scenario
  const score = maiScore(shown)
  const winAt = scenario.winThreshold
  const margin = marginChip(score, winAt)
  const fill = Math.max(0, Math.min(100, score))
  // A block lands: the score and its bar go green while NO LOSS floats
  // (v1.3 R7, R5's question 6: "nothing in the game state reacts"). The
  // colour is meaning, so with motion off, where no strike floats, it
  // shows while the block's card is up; only the glow moves.
  const held = (!!drop && drop.delta <= 0) || !!heldCard
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
          {/* A wrapper, not a key: remounting the readout would restart its count. */}
          <span data-score-held={held || undefined} className={`contents ${held ? 'dc-score-held' : ''}`}>
          <Readout
            label={SCORE_LABEL}
            value={score}
            warnBelow={winAt}
            strobeOnWarn
            bare
            odometer
            // One decimal always (v1.3 R5, R3's question 6), as every card,
            // the debrief and the share text print it.
            decimals={1}
            countMs={countMs}
            valueClassName="whitespace-nowrap font-display text-[22px] leading-none"
          />
          </span>
          <span className="whitespace-nowrap pb-0.5 font-mono text-[11px] text-dc-muted">/ 100</span>
          <span className="relative flex min-w-0 flex-col pb-0.5 font-mono text-[10px] leading-tight">
            {/* The strike's float takes the margin line's place while it
                shows, never over the score's digits or layered on the line
                (fresh-eyes review, v1.3 R3): the fall in red, to one
                decimal as the card says it, or NO LOSS in green on a block. */}
            {drop ? (
              <span
                key={drop.id}
                aria-hidden="true"
                data-mai-drop={drop.delta > 0 ? 'fall' : 'held'}
                className={`dc-mai-float pointer-events-none whitespace-nowrap font-display text-sm leading-none ${drop.delta > 0 ? 'text-dc-hostile' : 'text-dc-go'}`}
              >
                {drop.delta > 0 ? `-${drop.delta.toFixed(1)}` : 'NO LOSS'}
                {/* What caused a fall nothing struck: the live conditions,
                    by name (v1.3 R5, R3's question 8). */}
                {drop.delta > 0 && drop.label && <span data-drop-label className="ml-1 font-mono text-[10px] tracking-widest">{drop.label}</span>}
              </span>
            ) : (
              <span data-margin={margin.tone} className={`whitespace-nowrap ${TONE_TEXT[margin.tone]}`}>
                {margin.text}
              </span>
            )}
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
          <i
            data-bar-held={held || undefined}
            className={`absolute inset-y-0 left-0 ${held ? 'dc-score-held bg-dc-go' : score < winAt ? 'bg-dc-hostile' : 'bg-dc-friendly'}`}
            style={{ width: `${fill}%` }}
          />
          <b className="absolute -inset-y-0.5 w-0.5 bg-dc-go" style={{ left: `${winAt}%` }} />
        </div>
        <p data-scale className="relative mt-0.5 h-3 font-mono text-[10px] leading-none text-dc-muted">
          <span className="absolute left-0">0</span>
          {/* The arrow on the win line's tick, the label running on to its
              right (fresh-eyes review: centring the whole label put the
              arrow 37px left of the tick). */}
          <span className="absolute inline-flex -translate-x-[4px] items-center gap-1 text-dc-go" style={{ left: `${winAt}%` }}>
            <PixelSprite sprite={tinted(ICON_UP, 'go')} scale={1} name="win-marker" />
            {winLineLabel(winAt)}
          </span>
          <span className="absolute right-0">100</span>
        </p>
      </div>
    </header>
  )
}
