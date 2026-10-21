// PROCURE (v1.3 brief 5.4): one sheet with ASSETS, DEFENSES and INTEL,
// replacing the v1.2 two-step sheet. Header PROCURE · n CR LEFT · ✕. Tap a
// line to order it ("+ ADD · n CR"), tap again to cancel ("n CR ·
// ORDERED"); the sheet is never remounted by a tap, so its scroll stays
// where it was. Pinned footer: CONFIRM N ORDERS with what is committed, or
// BACK TO BOARD with nothing queued.
//
// A defense says what it stops by the earned answer key (ruling R1): a
// threat by name once it has been met on this device or named by tonight's
// intel brief, and otherwise only counted. Opened from a move, the sheet
// scrolls to the defenses and highlights the ones that stop it. One price
// format, "10 CR", with "+2 CR a turn" beside each defense (QC G-101), and
// the planned spend in words (QC G-102).

import { useEffect, useRef } from 'react'
import { briefActive, briefFree, candidatesTonight } from '../../engine/rules'
import { COVERAGE_PER_KIND, assetPrice } from '../../engine/scoring'
import { DEPLOY_TURNS } from '../../engine/rules'
import type { AssetKind, CountermeasureId, GameState, ThreatEvent, TurnActions } from '../../engine/types'
import { knownThreats } from '../../persistence'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CROSS, tinted } from '../sprites/icons'
import { KIND_LAYER } from './board'
import { PROCURE_KINDS, PROCURE_LABEL, shortName, stopsLine, turns } from './boardModel'

export interface ProcureProps {
  state: GameState
  actions: TurnActions
  // The move the sheet was opened from, or the asset an order pointed at.
  focus: { move: ThreatEvent } | { kind: AssetKind } | null
  onToggleAsset: (kind: AssetKind) => void
  onToggleCounter: (id: CountermeasureId) => void
  onToggleBrief: () => void
  onClose: () => void
  remaining: number
  cost: number
  orders: number
}

const ITEM = 'dc-tile flex w-full flex-col gap-1 border p-2 text-left disabled:cursor-not-allowed'
const SECTION = 'mt-3 flex items-baseline justify-between border-b border-dc-line pb-1 font-mono text-[10px] tracking-widest text-dc-muted'

function Price({ ordered, price, extra }: { ordered: boolean; price: number; extra?: string }) {
  return (
    <span className="flex flex-none flex-col items-end gap-0.5">
      <span className={`whitespace-nowrap font-mono text-[11px] tracking-wider ${ordered ? 'text-dc-go' : 'text-dc-friendly'}`}>{ordered ? `${price} CR · ORDERED` : `+ ADD · ${price} CR`}</span>
      {extra && <span className="whitespace-nowrap font-mono text-[10px] text-dc-muted">{extra}</span>}
    </span>
  )
}

export default function Procure({ state, actions, focus, onToggleAsset, onToggleCounter, onToggleBrief, onClose, remaining, cost, orders }: ProcureProps) {
  const { scenario } = state
  const named = new Set(briefActive(state, actions) ? candidatesTonight(state) : [])
  const met = knownThreats()
  const upkeep = scenario.upkeepPerDefense
  const stops = focus && 'move' in focus ? new Set(focus.move.counters) : null
  const body = useRef<HTMLDivElement | null>(null)
  // Opened from a move or an order: bring what it pointed at into view.
  useEffect(() => {
    const target = body.current?.querySelector<HTMLElement>('[data-match]')
    target?.scrollIntoView?.({ block: 'center' })
    // Only on opening: a tap inside the sheet must not move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const afford = (price: number) => remaining - price >= 0
  return (
    <section role="dialog" aria-label="PROCURE" data-sheet="procure" className="dc-sheet-in absolute inset-x-0 bottom-0 z-30 flex max-h-[85%] flex-col border-t-2 border-dc-line bg-dc-panel px-safe text-dc-ink">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-dc-line px-3 py-1">
        <h2 className="font-mono text-xs tracking-widest">
          PROCURE · <b className={remaining < 0 ? 'text-dc-hostile' : 'text-dc-go'}>{remaining}</b> CR LEFT
        </h2>
        <button type="button" aria-label="Close PROCURE" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center">
          <PixelSprite sprite={tinted(ICON_CROSS, 'ink')} scale={2} name="close" />
        </button>
      </div>
      <div ref={body} data-procure-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {focus && 'move' in focus ? (
          <p data-match-note className="mt-2 text-xs text-dc-ink">
            <b>{shortName(focus.move)}</b> is stopped by the highlighted defense{focus.move.counters.length > 1 ? 's' : ''}.
            {focus.move.counters.length > 1 ? ' The first listed blocks the most.' : ''}
          </p>
        ) : (
          <p className="mt-2 text-xs text-dc-muted">Tap to add an order; tap again to cancel. Orders take effect when you EXECUTE.</p>
        )}
        <p data-planned className="mt-1 font-mono text-[10px] text-dc-muted">
          Planned spend: {cost} of {state.credits} CR. Funding arrives at the turn close, after repairs.
        </p>

        <p className={SECTION}>
          <span>ASSETS</span>
          <span>one-time</span>
        </p>
        <ul className="mt-2 grid gap-2">
          {PROCURE_KINDS.map((kind) => {
            const price = assetPrice(scenario, kind)
            const ordered = actions.buyAssets.some((b) => b.kind === kind)
            const late = state.turn + DEPLOY_TURNS[kind] > scenario.totalTurns
            const match = !!focus && 'kind' in focus && focus.kind === kind
            const off = !ordered && (late || !afford(price))
            return (
              <li key={kind}>
                <button
                  type="button"
                  data-procure-kind={kind}
                  data-match={match || undefined}
                  aria-pressed={ordered}
                  disabled={off}
                  onClick={() => onToggleAsset(kind)}
                  className={`${ITEM} ${ordered ? 'border-dc-go bg-dc-go/10' : match ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${off ? 'opacity-50' : ''}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{PROCURE_LABEL[kind]}</span>
                    <Price ordered={ordered} price={price} />
                  </span>
                  <span className="text-xs text-dc-muted">
                    {late
                      ? `Arrives after the last turn: ${turns(DEPLOY_TURNS[kind])} to deploy.`
                      : `${KIND_LAYER[kind]} · arrives in ${turns(DEPLOY_TURNS[kind])} · +${COVERAGE_PER_KIND[kind]} coverage`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <p className={SECTION}>
          <span>DEFENSES</span>
          <span>{upkeep} CR a turn to keep</span>
        </p>
        <ul className="mt-2 grid gap-2" data-procure-defenses>
          {scenario.countermeasures.map((cm) => {
            const owned = state.counters.includes(cm.id)
            const ordered = actions.buyCounters.includes(cm.id)
            const match = !!stops && stops.has(cm.id)
            const off = owned || (!ordered && !afford(cm.cost))
            return (
              <li key={cm.id}>
                <button
                  type="button"
                  data-procure-defense={cm.id}
                  data-match={match || undefined}
                  aria-pressed={owned || ordered}
                  disabled={off}
                  onClick={() => onToggleCounter(cm.id)}
                  className={`${ITEM} ${ordered ? 'border-dc-go bg-dc-go/10' : match ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${!owned && off ? 'opacity-50' : ''}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{cm.name}</span>
                    {owned ? (
                      <span className="whitespace-nowrap font-mono text-[11px] tracking-wider text-dc-go">OWNED · {upkeep} CR a turn</span>
                    ) : (
                      <Price ordered={ordered} price={cm.cost} extra={`+${upkeep} CR a turn`} />
                    )}
                  </span>
                  <span data-stops className="text-xs text-dc-ink">
                    {stopsLine(cm, state, named, met)}
                  </span>
                  <span className="text-xs text-dc-muted">{cm.blurb}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <p className={SECTION}>
          <span>INTEL</span>
          <span>this turn only</span>
        </p>
        <div className="mt-2">
          {briefFree(state) ? (
            <p data-procure-intel className="border border-dc-line bg-dc-chrome p-2 text-xs text-dc-muted">
              <span className="text-sm font-semibold text-dc-ink">Intel brief</span> · FREE TONIGHT. COLDVEIL&apos;s moves are named on the TONIGHT card.
            </p>
          ) : (
            <button
              type="button"
              data-procure-intel
              aria-pressed={actions.intelBrief}
              disabled={!actions.intelBrief && !afford(scenario.prices.intelBrief)}
              onClick={onToggleBrief}
              className={`${ITEM} ${actions.intelBrief ? 'border-dc-go bg-dc-go/10' : 'border-dc-line bg-dc-chrome'}`}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="text-sm font-semibold">Intel brief</span>
                <Price ordered={actions.intelBrief} price={scenario.prices.intelBrief} />
              </span>
              <span className="text-xs text-dc-muted">Names COLDVEIL&apos;s moves tonight. The defenses then say which move they stop.</span>
            </button>
          )}
        </div>
      </div>
      <div className="flex-none border-t border-dc-line px-3 pt-2 pb-2">
        {orders > 0 ? (
          <>
            <button type="button" data-confirm onClick={onClose} className="dc-tile flex min-h-12 w-full items-center justify-center border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground shadow-hard">
              CONFIRM {orders} ORDER{orders === 1 ? '' : 'S'}
            </button>
            <p className="mt-1 text-center font-mono text-[10px] text-dc-muted">{cost} CR committed. You can change orders until you EXECUTE.</p>
          </>
        ) : (
          <button type="button" data-confirm onClick={onClose} className="dc-tile flex min-h-12 w-full items-center justify-center border-2 border-dc-line bg-dc-panel font-display text-xs text-dc-ink shadow-press">
            BACK TO BOARD
          </button>
        )}
      </div>
    </section>
  )
}

