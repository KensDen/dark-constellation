// PROCURE (brief 4.4): kind, then tier, then confirm, in three steps. The
// confirm button carries the price. The rules are the existing procure
// logic in Game.tsx, which owns the cart, the affordability gate and the
// cues; this sheet only asks the three questions.

import type { ReactNode } from 'react'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT, assetPrice } from '../../engine/scoring'
import { DEPLOY_ETA } from '../../engine/reducer'
import type { AssetKind, Scenario, TrustTier } from '../../engine/types'
import { kindLabels } from '../labels'
import Sheet, { SHEET_BUTTON, SHEET_PRIMARY } from './Sheet'

export const PROCURE_STEPS = 3
export const PROCURE_KINDS: AssetKind[] = ['sat', 'rpoSat', 'drone', 'groundStation']

// Plain-language effect of each kind, shown at the point of purchase so
// the reason for every buy is legible. Developer parentheticals about
// what a build does not yet do are not player copy (brief 4.4).
export const assetEffects: Record<AssetKind, string> = {
  sat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.sat.min} to ${DEPLOY_ETA.sat.max} turns to orbit`,
  rpoSat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.rpoSat.min} to ${DEPLOY_ETA.rpoSat.max} turns to orbit; hosts the docking LiDAR`,
  drone: `+${COVERAGE_PER_DRONE} coverage, deploys next turn; flies the LiDAR mapping sorties`,
  groundStation: `no coverage, ${DEPLOY_ETA.groundStation.min} to ${DEPLOY_ETA.groundStation.max} turns to stand up; ground ops capacity`,
}

export function tiersFor(kind: AssetKind): TrustTier[] {
  return kind === 'groundStation' ? ['B'] : ['B', 'A']
}

export interface ProcurePick {
  kind?: AssetKind
  tier?: TrustTier
}

export interface ProcureSheetProps {
  scenario: Scenario
  step: number
  pick: ProcurePick
  onKind: (kind: AssetKind) => void
  onTier: (tier: TrustTier) => void
  onBuy: () => void
  onBack: () => void
  onClose: () => void
  // The refused control's class, from Game.tsx's cue state.
  buyClass: string
  spendLine: ReactNode
}

export default function ProcureSheet({ scenario, step, pick, onKind, onTier, onBuy, onBack, onClose, buyClass, spendLine }: ProcureSheetProps) {
  const kind = pick.kind
  const tier = pick.tier
  return (
    <Sheet id="procure" title="PROCURE" step={step} steps={PROCURE_STEPS} onClose={onClose} onBack={step > 1 ? onBack : undefined}>
      {spendLine}
      {step === 1 && (
        <ul className="mt-2 grid gap-2">
          {PROCURE_KINDS.map((k) => (
            <li key={k}>
              <button type="button" data-procure-kind={k} className={`${SHEET_BUTTON} w-full flex flex-col items-start text-left py-2`} onClick={() => onKind(k)}>
                <span>
                  {kindLabels[k]}
                  <span className="ml-2 font-mono text-[10px] text-dc-warn">from {assetPrice(scenario, k, 'B')} CR</span>
                </span>
                <span className="mt-1 font-sans text-xs normal-case text-dc-muted">{assetEffects[k]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {step === 2 && kind && (
        <div className="mt-2">
          <p className="font-display uppercase text-[10px] text-dc-ink">{kindLabels[kind]}</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {tiersFor(kind).map((t) => (
              <li key={t}>
                <button type="button" data-procure-tier={t} className={`${SHEET_BUTTON} w-full py-2`} onClick={() => onTier(t)}>
                  Tier {t}
                  <span className="ml-2 font-mono text-[10px] text-dc-warn">{assetPrice(scenario, kind, t)} CR</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-dc-muted">
            Tier B sensor packages are cheap with a hidden supply-chain risk: only Tier B hardware can host the firmware
            implant. Tier A packages cost more on sats and drones, are immune to the implant, and an all Tier A drone
            fleet breaks the BLACKOUT CHAIN. Ground stations carry no sensor package.
          </p>
        </div>
      )}
      {step === 3 && kind && tier && (
        <div className="mt-2">
          <div className="border-2 border-dc-line bg-dc-ground p-2">
            <p className="font-display uppercase text-[10px] text-dc-friendly">
              {kindLabels[kind]} · Tier {tier}
            </p>
            <p className="mt-1 text-xs text-dc-muted">{assetEffects[kind]}</p>
          </div>
          <button type="button" data-procure-buy className={`${buyClass} mt-3 w-full min-h-12`} onClick={onBuy}>
            BUY · {assetPrice(scenario, kind, tier)} CR
          </button>
        </div>
      )}
    </Sheet>
  )
}

export { SHEET_PRIMARY }
