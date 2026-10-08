// PROCURE (brief 4.4; one sheet since v1.3 Round 0, brief 5.4 and 10).
// HARDEN and INTEL were their own sheets until v1.3 Round 0 merged them in
// here, and the Tier A / Tier B step went with D2 (a), so the sheet holds
// three sections on its first step: ASSETS, DEFENSES and INTEL. An asset
// opens a confirm step that carries its price; a defense or the intel
// order is a checkbox on the first step. The rules are the existing
// procure logic in Game.tsx, which owns the cart, the affordability gate
// and the cues; this sheet only asks the questions. Round 2 rebuilds it to
// brief 5.4.
//
// A defense is shown by its vector icons and its blurb. The IR retainer is
// offered with the defenses (critique row M8); it answers no threat, so
// its tile says what it does to recovery instead, and it rides the turn's
// buyIrRetainer flag rather than the countermeasure list.

import type { ReactNode } from 'react'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT, assetPrice } from '../../engine/scoring'
import { DEPLOY_ETA } from '../../engine/reducer'
import type { AssetKind, CountermeasureId, GameState, Scenario } from '../../engine/types'
import { vectorIcons } from '../cues/icons'
import { kindLabels, vectorLabels } from '../labels'
import { hardenOffers, retainerLine, vectorsOf } from './board'
import Sheet, { SHEET_BUTTON } from './Sheet'

export const PROCURE_STEPS = 2
export const PROCURE_KINDS: AssetKind[] = ['sat', 'rpoSat', 'drone', 'groundStation']
// Every asset is bought at the one price there is since D2 (a) retired the
// tiers; the engine still reads a tier on the order until Round 0's engine
// step removes the field, and this is the one it is sent.
export const ORDER_TIER = 'B' as const

// Plain-language effect of each kind, shown at the point of purchase so
// the reason for every buy is legible. Developer parentheticals about
// what a build does not yet do are not player copy (brief 4.4).
//
// In three parts since v1.2 R3: what the kind adds, how long it takes to
// arrive, and what it does. The sheet says all three; a deployed tile's
// intel card says the first and the last (assetRole), since the arrival
// is behind it. The same words either way.
const COVERAGE: Record<AssetKind, string> = {
  sat: `+${COVERAGE_PER_SAT} coverage`,
  rpoSat: `+${COVERAGE_PER_SAT} coverage`,
  drone: `+${COVERAGE_PER_DRONE} coverage`,
  groundStation: 'no coverage',
}
const ARRIVAL: Record<AssetKind, string> = {
  sat: `${DEPLOY_ETA.sat.min} to ${DEPLOY_ETA.sat.max} turns to orbit`,
  rpoSat: `${DEPLOY_ETA.rpoSat.min} to ${DEPLOY_ETA.rpoSat.max} turns to orbit`,
  drone: 'deploys next turn',
  groundStation: `${DEPLOY_ETA.groundStation.min} to ${DEPLOY_ETA.groundStation.max} turns to stand up`,
}
const ROLE: Partial<Record<AssetKind, string>> = {
  rpoSat: 'hosts the docking LiDAR',
  drone: 'flies the LiDAR mapping sorties',
  groundStation: 'ground ops capacity',
}
const withRole = (kind: AssetKind, head: string) => (ROLE[kind] ? `${head}; ${ROLE[kind]}` : head)
export const assetEffects = Object.fromEntries(
  PROCURE_KINDS.map((kind) => [kind, withRole(kind, `${COVERAGE[kind]}, ${ARRIVAL[kind]}`)]),
) as Record<AssetKind, string>
export const assetRole = (kind: AssetKind) => withRole(kind, COVERAGE[kind])

export interface ProcurePick {
  kind?: AssetKind
}

export interface ProcureSheetProps {
  scenario: Scenario
  state: GameState
  step: number
  pick: ProcurePick
  onKind: (kind: AssetKind) => void
  onBuy: () => void
  onBack: () => void
  onClose: () => void
  // The refused control's class, from Game.tsx's cue state.
  buyClass: string
  spendLine: ReactNode
  // The defenses queued this turn, the retainer included.
  queuedCounters: CountermeasureId[]
  onToggleCounter: (id: CountermeasureId) => void
  // Class for a refused tile, keyed by countermeasure id.
  deniedClassFor: (id: CountermeasureId) => string
  intelChecked: boolean
  onIntel: (checked: boolean) => void
  intelClass: string
}

const SECTION = 'mt-3 flex items-baseline justify-between border-b border-dc-line pb-1 font-display text-[10px] text-dc-muted'

export default function ProcureSheet({
  scenario,
  state,
  step,
  pick,
  onKind,
  onBuy,
  onBack,
  onClose,
  buyClass,
  spendLine,
  queuedCounters,
  onToggleCounter,
  deniedClassFor,
  intelChecked,
  onIntel,
  intelClass,
}: ProcureSheetProps) {
  const kind = pick.kind
  const maxed = state.intelLevel === 3
  return (
    <Sheet id="procure" title="PROCURE" step={step} steps={PROCURE_STEPS} onClose={onClose} onBack={step > 1 ? onBack : undefined}>
      {spendLine}
      {step === 1 && (
        <>
          <p className={SECTION}>
            <span>ASSETS</span>
            <span className="font-mono">one-time</span>
          </p>
          <ul className="mt-2 grid gap-2">
            {PROCURE_KINDS.map((k) => (
              <li key={k}>
                <button type="button" data-procure-kind={k} className={`${SHEET_BUTTON} w-full flex flex-col items-start text-left py-2`} onClick={() => onKind(k)}>
                  <span>
                    {kindLabels[k]}
                    <span className="ml-2 font-mono text-[10px] text-dc-warn">{assetPrice(scenario, k, ORDER_TIER)} CR</span>
                  </span>
                  <span className="mt-1 font-sans text-xs normal-case text-dc-muted">{assetEffects[k]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={SECTION}>
            <span>DEFENSES</span>
          </p>
          <ul className="mt-1" data-procure-defenses>
            {hardenOffers(scenario).map((cm) => {
              const active = state.counters.includes(cm.id)
              const queued = queuedCounters.includes(cm.id)
              return (
                <li key={cm.id} className={`dc-tile mt-2 border-2 border-transparent p-1.5 ${deniedClassFor(cm.id)} ${queued ? 'border-dc-friendly/60 bg-dc-friendly/10' : ''}`}>
                  <label className="flex items-start gap-2 min-h-11">
                    <input type="checkbox" className="mt-1" checked={active || queued} disabled={active} onChange={() => onToggleCounter(cm.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm">
                        {cm.name} <span className="font-mono text-dc-warn">({cm.cost})</span>
                        {active && <span className="ml-1 font-mono text-[10px] text-dc-friendly">[ACTIVE]</span>}
                      </span>
                      <span className="mt-1 flex items-center gap-1">
                        {vectorsOf(cm, scenario).map((v) => (
                          <img key={v} src={vectorIcons[v]} alt={vectorLabels[v]} className="h-4 w-4" />
                        ))}
                      </span>
                      <span className="mt-1 block text-xs text-dc-muted">{cm.id === 'irRetainer' ? retainerLine(scenario) : cm.blurb}</span>
                      {cm.spartaCms.length > 0 && (
                        <span className="mt-1 block font-mono text-[10px] text-dc-muted">
                          SPARTA:{' '}
                          {cm.spartaCms.map((ref, j) => (
                            <span key={ref.id}>
                              {j > 0 ? '; ' : ''}
                              <a className="underline" href={ref.url} target="_blank" rel="noreferrer">
                                {ref.id} {ref.name}
                              </a>{' '}
                              ({ref.tier})
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className={SECTION}>
            <span>INTEL</span>
          </p>
          <p className={`mt-2 dc-tile p-1.5 border-2 ${intelClass}`} data-procure-intel>
            <label className="flex items-start gap-2 min-h-11 text-sm">
              <input type="checkbox" className="mt-1" checked={intelChecked} disabled={maxed} onChange={(e) => onIntel(e.target.checked)} />
              <span>
                Raise intel to level {Math.min(3, state.intelLevel + 1)} ({state.intelLevel === 3 ? 'maxed' : scenario.prices.intelLevels[state.intelLevel]}) for a sharper
                forecast of the coming turn
              </span>
            </label>
          </p>
        </>
      )}
      {step === 2 && kind && (
        <div className="mt-2">
          <div className="border-2 border-dc-line bg-dc-ground p-2">
            <p className="font-display uppercase text-[10px] text-dc-friendly">{kindLabels[kind]}</p>
            <p className="mt-1 text-xs text-dc-muted">{assetEffects[kind]}</p>
          </div>
          <button type="button" data-procure-buy className={`${buyClass} mt-3 w-full min-h-12`} onClick={onBuy}>
            ORDER · {assetPrice(scenario, kind, ORDER_TIER)} CR
          </button>
        </div>
      )}
    </Sheet>
  )
}
