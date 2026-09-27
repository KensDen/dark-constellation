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
import { hudLabels, hudStatusParts } from '../brief'
import Readout from '../cues/Meter'
import { COIN, EYE } from '../sprites/icons'
import PixelSprite from '../sprites/PixelSprite'

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
  // The gear (v1.2 R1b): opens the SYSTEM sheet.
  onSystem: () => void
  systemOpen: boolean
  // A hit that just landed (v1.2 R3): how far MAI fell, floated off the
  // number in magenta, and how long the count runs at this speed.
  drop?: { id: string; delta: number } | null
  countMs?: number
}

export default function Hud({ shown, displayTurn, credits, onSystem, systemOpen, drop, countMs }: HudProps) {
  const hud = hudLabels(shown)
  const scenario = shown.scenario
  const [turn, intel, difficulty] = hudStatusParts(shown, DIFFICULTIES[shown.difficulty].label, displayTurn)
  return (
    <header className="relative flex-none bg-dc-chrome border-b-2 border-dc-line pt-safe px-safe">
      <div className="px-2 pt-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
        <div className="min-w-0">
          <h1 className="font-display text-[10px] text-dc-go leading-none">OP {scenario.name}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase text-dc-muted leading-none">
            {/* The eye carries no text, so the line reads exactly as
                hudStatusLine prints it. */}
            {turn} | <PixelSprite sprite={EYE} scale={1} name="eye" className="mr-1 inline-block align-[-1px]" />
            {intel} | {difficulty}
          </p>
        </div>
        {/* The gear, top right (brief R1b). The sr-only word is what the
            chrome mirror counts; the aria-label is the name. */}
        <button
          type="button"
          aria-label="System"
          aria-expanded={systemOpen}
          onClick={onSystem}
          className={`dc-tile flex-none flex items-center justify-center min-h-11 min-w-11 border-2 border-dc-line bg-dc-panel text-dc-ink shadow-press active:shadow-none ${
            systemOpen ? 'border-dc-friendly text-dc-friendly' : ''
          }`}
        >
          <span aria-hidden="true" className="font-sans text-lg leading-none">
            &#9881;
          </span>
          <span className="sr-only">System</span>
        </button>
      </div>
      <div className="px-2 mt-0.5 flex items-end justify-between gap-3">
        <div className="relative flex items-end gap-2">
          <Readout
            label={hud.mai}
            value={maiScore(shown)}
            warnBelow={scenario.winThreshold}
            strobeOnWarn
            stacked
            odometer
            countMs={countMs}
            valueClassName="font-display text-2xl leading-none"
          />
          {drop && (
            <span
              key={drop.id}
              aria-hidden="true"
              data-mai-drop
              className="dc-mai-float pointer-events-none absolute left-24 top-2 font-display text-sm text-dc-hostile"
            >
              -{drop.delta}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase text-dc-muted pb-0.5">/ {scenario.winThreshold} to win</span>
        </div>
        <div className="flex items-end gap-1.5">
          <PixelSprite sprite={COIN} name="coin" className="mb-0.5 flex-none" />
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
