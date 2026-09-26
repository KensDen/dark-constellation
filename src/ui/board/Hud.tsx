// The pinned HUD (v1.2 R1, brief 4.1): the operation and the turn, MAI as
// one big display-type number with the win line beside it, credits to the
// right, a segmented MAI bar under them, and the four meters MAI is built
// from. The meters stay on the first screen because the reading budget
// (src/ui/brief.ts firstInputCopy) counts them there; a HUD that dropped
// them would be lighter on screen and heavier than its own mirror says.
//
// Every number is a Readout, so the count-up, the tones, the strobe under
// the win line and the tick sounds are the ones the play screen has had
// since Round 3; only the layout is new.

import { DIFFICULTIES } from '../../engine/reducer'
import type { GameState } from '../../engine/types'
import { METER_CAP, coverage, maiScore } from '../../engine/scoring'
import { hudLabels, hudStatusLine } from '../brief'
import Readout from '../cues/Meter'

export const MAI_SEGMENTS = 14

// The segmented bar (brief 4.1): fourteen segments, the win line marked.
// Decoration beside the Readout that already carries the number.
function MaiBar({ value, winAt }: { value: number; winAt: number }) {
  const lit = Math.round((Math.max(0, Math.min(METER_CAP, value)) / METER_CAP) * MAI_SEGMENTS)
  const winSegment = Math.ceil((winAt / METER_CAP) * MAI_SEGMENTS)
  const below = value < winAt
  return (
    <div className="mt-1 flex gap-0.5" aria-hidden="true">
      {Array.from({ length: MAI_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 ${i < lit ? (below ? 'bg-dc-warn' : 'bg-dc-go') : 'bg-dc-line'} ${
            i === winSegment - 1 ? 'border-r-2 border-dc-ink' : ''
          }`}
        />
      ))}
    </div>
  )
}

export interface HudProps {
  shown: GameState
  displayTurn: number
  credits: { value: number; basis: string; chosen: boolean; chosenDelta: number }
}

export default function Hud({ shown, displayTurn, credits }: HudProps) {
  const hud = hudLabels(shown)
  const scenario = shown.scenario
  return (
    <header className="flex-none bg-dc-chrome border-b-2 border-dc-line pt-safe px-safe">
      <div className="px-2 pt-2 flex items-baseline justify-between gap-2 whitespace-nowrap">
        <h1 className="font-display text-[10px] text-dc-go leading-none">OP {scenario.name}</h1>
        <p className="font-mono text-[10px] uppercase text-dc-muted leading-none">
          {hudStatusLine(shown, DIFFICULTIES[shown.difficulty].label, displayTurn)}
        </p>
      </div>
      <div className="px-2 mt-1 flex items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <Readout
            label={hud.mai}
            value={maiScore(shown)}
            warnBelow={scenario.winThreshold}
            strobeOnWarn
            stacked
            valueClassName="font-display text-2xl leading-none"
          />
          <span className="font-mono text-[10px] uppercase text-dc-muted pb-0.5">/ {scenario.winThreshold} to win</span>
        </div>
        <div className="flex items-end gap-1.5">
          {/* The coin sprite lands with R2; a warn-coloured square stands
              in for it, like every other sprite this round. */}
          <span aria-hidden="true" className="mb-1 inline-block h-3 w-3 bg-dc-warn" />
          <Readout
            label={hud.credits}
            value={credits.value}
            basis={credits.basis}
            chosen={credits.chosen}
            chosenDelta={credits.chosenDelta}
            suffix=" CR"
            stacked
            valueClassName="text-base leading-none"
          />
        </div>
      </div>
      <div className="px-2">
        <MaiBar value={maiScore(shown)} winAt={scenario.winThreshold} />
      </div>
      <div className="px-2 pb-2 mt-1 grid grid-cols-4 gap-x-2">
        <Readout label={hud.coverage} value={coverage(shown.assets)} max={METER_CAP} stacked valueClassName="text-xs leading-none" />
        <Readout label={hud.link} value={shown.meters.linkAvailability} max={METER_CAP} stacked valueClassName="text-xs leading-none" />
        <Readout label={hud.data} value={shown.meters.dataIntegrity} max={METER_CAP} stacked valueClassName="text-xs leading-none" />
        <Readout label={hud.sensor} value={shown.meters.sensorIntegrity} max={METER_CAP} stacked valueClassName="text-xs leading-none" />
      </div>
    </header>
  )
}
