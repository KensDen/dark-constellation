// THE HUD (v1.3 brief 5.3 item 1). OP FIRST LIGHT, the turn and SYSTEM on
// one line; the MISSION ASSURANCE SCORE at display size with "/ 100", the
// margin to the win line (amber under 6 above it, red below it), the
// defense streak from 2 (on the label line since v1.6 R2), and the
// floating delta of a hit; the BUDGET in CR
// on the right; a bar with the win line marked and the scale
// "0 · ▲ 70 WIN LINE · 100". On a Daily Op the line carries DAILY OP #n
// (QC G-104). The four meters left the HUD with the v1.2 board: the score
// is the one number the player steers by (section 4 rule 9), and each
// meter's story is told by the move that hits it.
//
// Both numbers are Readouts, so the count and the ticks are the ones the
// board has had since v1.2. ONE NEUTRAL COLOUR (v1.6 R1, Ken's ruling of
// 26 October 2026): the score's digits stay ink in every state, motion on
// or off, and red or green shows only on the change beside them, the
// delta chip; the budget turns red only below zero. Until v1.6 the score
// went red on a hit, green on a block (and stayed so on the card with
// motion off), blue at END OF TURN, and the budget red on any repair bill.

import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { maiScore } from '../../engine/scoring'
import Readout from '../cues/Meter'
import { CUE_MS, useReducedMotion } from '../cues/motion'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CHECK, ICON_UP, tinted } from '../sprites/icons'
import { BUDGET_LABEL, SCORE_LABEL, marginChip, streakChip, winLineLabel } from './boardModel'

// The bar's fill says the margin: blue clear of the line, amber within
// CLOSE_MARGIN of it, red under it.
const BAR_TONE = { go: 'bg-dc-friendly', warn: 'bg-dc-warn', hostile: 'bg-dc-hostile' } as const

export interface BoardHudProps {
  shown: GameState
  displayTurn: number
  // The budget the HUD shows: the engine's balance.
  budget: { value: number; basis: string; chosen: boolean; chosenDelta: number }
  dailyNumber?: number
  onSystem: () => void
  systemOpen: boolean
  // A move that just landed: how far the score fell, or NO LOSS on a
  // block (delta 0). With motion off it stays while the move's card is up.
  drop?: { id: string; delta: number; label?: string } | null
  countMs?: number
  // END OF TURN is up and says the turn's change: no chip beside it (v1.6 R4).
  hush?: boolean
}

// The change no move explains (END OF TURN's recovery, a reload's close):
// the score's step to one decimal, shown beside it for the cue's length.
function useScoreChange(score: number, explained: boolean): { id: number; delta: number } | null {
  const prev = useRef(score)
  const [chip, setChip] = useState<{ id: number; delta: number } | null>(null)
  useEffect(() => {
    const delta = Math.round((score - prev.current) * 10) / 10
    prev.current = score
    if (delta === 0 || explained) return
    setChip((c) => ({ id: (c?.id ?? 0) + 1, delta }))
  }, [score, explained])
  useEffect(() => {
    if (!chip) return
    const id = window.setTimeout(() => setChip(null), CUE_MS)
    return () => window.clearTimeout(id)
  }, [chip])
  return chip
}

export default function BoardHud({ shown, displayTurn, budget, dailyNumber, onSystem, systemOpen, drop, countMs, hush = false }: BoardHudProps) {
  const scenario = shown.scenario
  const score = maiScore(shown)
  const winAt = scenario.winThreshold
  const margin = marginChip(score, winAt)
  const fill = Math.max(0, Math.min(100, score))
  const reduced = useReducedMotion()
  const change = useScoreChange(score, !!drop || hush)
  // The delta chip: the move's, or else the change no move explains.
  const chip = hush ? null : drop ? { key: drop.id, fall: drop.delta > 0, text: drop.delta > 0 ? `-${drop.delta.toFixed(1)}` : 'NO LOSS', label: drop.delta > 0 ? drop.label : undefined } : change ? { key: `change-${change.id}`, fall: change.delta < 0, text: `${change.delta > 0 ? '+' : ''}${change.delta.toFixed(1)}`, label: undefined } : null
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
      <p className="flex items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-dc-muted">
        <span>{SCORE_LABEL}</span>
        {/* The defense streak, on the label line beside the score's name
            (v1.6 R2's fresh eyes, G17: stacked under the margin line it
            made the HUD about 7px taller the moment it appeared, and the
            whole board moved down mid-strike). */}
        {shown.streak >= 2 && (
          <span data-streak className="inline-flex items-center gap-1 whitespace-nowrap tracking-wider text-dc-go">
            <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="status-blocked" />
            {streakChip(shown.streak)}
          </span>
        )}
        <span className="ml-auto">{BUDGET_LABEL}</span>
      </p>
      <div className="flex items-end justify-between gap-2 px-3">
        <div className="relative flex min-w-0 items-end gap-x-1.5">
          <span data-score className="contents">
            <Readout
              label={SCORE_LABEL}
              value={score}
              warnBelow={winAt}
              strobeOnWarn
              bare
              odometer
              toneless
              // One decimal always (v1.3 R5, R3's question 6), as every card,
              // the debrief and the share text print it.
              decimals={1}
              countMs={countMs}
              valueClassName="whitespace-nowrap font-display text-[22px] leading-none text-dc-ink"
            />
          </span>
          <span className="whitespace-nowrap pb-0.5 font-mono text-[11px] text-dc-muted">/ 100</span>
          <span className="relative flex min-w-0 flex-col pb-0.5 font-mono text-[10px] leading-tight">
            {/* The delta chip, beside the score, never over its digits
                (fresh-eyes review, v1.3 R3): a fall in red, to one decimal
                as the card says it, NO LOSS in green on a block, and any
                other change in its own colour. The one place the score's
                red and green show (v1.6 R1). It floats off with motion
                on, and stands still with motion off. The margin's words
                ("17.4 ABOVE WIN LINE") left in v1.6 R3 (Ken's playtest
                item 1): the bar under it says the same, its fill amber
                within 6 of the line and red under it. */}
            <span className="sr-only">{margin.text}</span>
            {chip && (
              <span
                key={chip.key}
                aria-hidden="true"
                data-mai-drop={chip.fall ? 'fall' : drop ? 'held' : 'rise'}
                className={`${reduced ? '' : 'dc-mai-float'} pointer-events-none whitespace-nowrap font-display text-sm leading-none ${chip.fall ? 'text-dc-hostile' : 'text-dc-go'}`}
              >
                {chip.text}
                {/* What caused a fall nothing struck: the live conditions,
                    by name (v1.3 R5, R3's question 8). */}
                {chip.label && <span data-drop-label className="ml-1 font-mono text-[10px] tracking-widest">{chip.label}</span>}
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
          toneless
          valueClassName={`whitespace-nowrap font-display text-sm leading-none ${budget.value < 0 ? 'text-dc-hostile' : 'text-dc-ink'}`}
        />
      </div>
      <div className="px-3 pb-1 pt-1">
        <div className="relative h-1.5 bg-dc-line" aria-hidden="true">
          <i
            data-margin={margin.tone}
            className={`absolute inset-y-0 left-0 ${BAR_TONE[margin.tone]}`}
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
