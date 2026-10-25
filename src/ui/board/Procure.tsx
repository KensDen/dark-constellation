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
//
// One new defense a turn (v1.4): a line pinned under the header says the
// rule and its reason before the turn's defense is ordered, and once it is,
// which one it is, why the others are not available and how to swap; each
// of them reads the rule, 1 A TURN, where its price was, so it never reads
// as unaffordable.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NEW_DEFENSES_PER_NIGHT, briefActive, briefFree, candidatesTonight, defenseOpen, newDefenses } from '../../engine/rules'
import { COVERAGE_PER_KIND, assetPrice } from '../../engine/scoring'
import { DEPLOY_TURNS } from '../../engine/rules'
import type { AssetKind, CountermeasureId, GameState, ThreatEvent, TurnActions } from '../../engine/types'
import { knownThreats } from '../../persistence'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CROSS, ICON_LOCK, tinted } from '../sprites/icons'
import { KIND_LAYER } from './board'
import { BRIEF_LOCKED_LINE, BRIEF_RULE, MORE_BELOW, NOT_THIS_TURN, PROCURE_KINDS, briefLockedTag, PROCURE_LABEL, capLabel, confirmNote, defenseCount, defenseOrderIn, defenseRule, defensesPerTurn, hiddenOrder, matchNote, shortName, stopsLine, turns } from './boardModel'

export interface ProcureProps {
  state: GameState
  actions: TurnActions
  // The move the sheet was opened from, or the asset an order pointed at.
  focus: { move: ThreatEvent } | { kind: AssetKind } | { intel: true } | null
  onToggleAsset: (kind: AssetKind) => void
  onToggleCounter: (id: CountermeasureId) => void
  // Orders the brief, which names the moves and locks (v1.5 R2).
  onOrderBrief: () => void
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

export default function Procure({ state, actions, focus, onToggleAsset, onToggleCounter, onOrderBrief, onClose, remaining, cost, orders }: ProcureProps) {
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
  // The cue while the list runs on under the footer (v1.5 R2's review: on
  // the desktop's side panel a card was cut at the foot with no sign of
  // more), checked on scroll and after every render.
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  })
  const afford = (price: number) => remaining - price >= 0
  // Tonight's room for a new defense, and whether any is left to order.
  const open = defenseOpen(state, actions)
  const left = scenario.countermeasures.some((cm) => !state.counters.includes(cm.id))
  // The defense ordered this turn, which the line names once it is in.
  const tonights = scenario.countermeasures.find((cm) => newDefenses(state, actions).includes(cm.id))
  return (
    <section role="dialog" aria-label="PROCURE" data-sheet="procure" className="dc-sheet-in absolute inset-x-0 bottom-0 z-30 flex max-h-[85%] flex-col border-t-2 border-dc-line bg-dc-panel px-safe text-dc-ink">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-dc-line px-3 py-1">
        <h2 className="font-mono text-xs tracking-widest">
          PROCURE · <b className={remaining < 0 ? 'text-dc-hostile' : 'text-dc-go'}>{remaining}</b> CR LEFT
        </h2>
        <button type="button" data-sheet-close aria-label="Close PROCURE" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center">
          <PixelSprite sprite={tinted(ICON_CROSS, 'ink')} scale={2} name="close" />
        </button>
      </div>
      {left && (
        <p id="procure-defense-rule" data-defense-rule={open ? 'open' : 'in'} className={`flex-none border-b border-dc-line px-3 py-1.5 text-xs ${open ? 'text-dc-go' : 'text-dc-ink'}`}>
          {open ? defenseRule(NEW_DEFENSES_PER_NIGHT) : defenseOrderIn(tonights?.name ?? '', state.turn >= scenario.totalTurns)}
        </p>
      )}
      {/* What the sheet was opened for stays above the list, which opens
          scrolled to the highlighted item (R6b fresh eyes: the note had
          scrolled off with the top of the list). */}
      {/* Opened at the brief, the note goes once it is ordered: its row says
          LOCKED (v1.5 R2's re-review: the sheet was crowded at 375). */}
      {focus && ('move' in focus || ('intel' in focus && !actions.intelBrief)) && (
        <p data-match-note className="flex-none border-b border-dc-line px-3 py-1.5 text-xs text-dc-ink">
          {'move' in focus ? (
            <>
              <b>{shortName(focus.move)}</b>
              {matchNote(focus.move)}
              {/* Its defenses wait for the turn's one: said, so the note
                  does not promise tonight (the R1 re-review). */}
              {!open && !focus.move.counters.some((id) => newDefenses(state, actions).includes(id) || state.counters.includes(id)) && ` ${NOT_THIS_TURN}`}
            </>
          ) : (
            hiddenOrder(scenario.prices.intelBrief)
          )}
        </p>
      )}
      <div ref={body} data-procure-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {!(focus && ('move' in focus || 'intel' in focus)) && (
          <p className="mt-2 text-xs text-dc-muted">Tap to add an order; tap again to cancel. Orders take effect when you EXECUTE.</p>
        )}
        <p data-planned className="mt-1 font-mono text-[10px] text-dc-muted">
          {left && <>{defenseCount(newDefenses(state, actions).length, NEW_DEFENSES_PER_NIGHT)} </>}
          Ordered: {cost} of {state.credits} CR. Funding arrives at the turn close, after repairs.
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
          <span>
            {defensesPerTurn(NEW_DEFENSES_PER_NIGHT)} · {upkeep} CR a turn to keep
          </span>
        </p>
        <ul className="mt-2 grid gap-2" data-procure-defenses>
          {scenario.countermeasures.map((cm) => {
            const owned = state.counters.includes(cm.id)
            const ordered = actions.buyCounters.includes(cm.id)
            const match = !!stops && stops.has(cm.id)
            // Not tonight: another new defense is already ordered.
            const capped = !owned && !ordered && !open
            const off = owned || capped || (!ordered && !afford(cm.cost))
            return (
              <li key={cm.id}>
                <button
                  type="button"
                  data-procure-defense={cm.id}
                  data-match={match || undefined}
                  data-capped={capped || undefined}
                  aria-pressed={owned || ordered}
                  aria-describedby={capped ? 'procure-defense-rule' : undefined}
                  disabled={off}
                  onClick={() => onToggleCounter(cm.id)}
                  className={`${ITEM} ${ordered ? 'border-dc-go bg-dc-go/10' : match ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${!owned && off ? 'opacity-50' : ''}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{cm.name}</span>
                    {owned ? (
                      <span className="whitespace-nowrap font-mono text-[11px] tracking-wider text-dc-go">OWNED · {upkeep} CR a turn</span>
                    ) : capped ? (
                      <span className="flex flex-none flex-col items-end gap-0.5">
                        <span className="whitespace-nowrap font-mono text-[11px] tracking-wider text-dc-muted">{capLabel(NEW_DEFENSES_PER_NIGHT)}</span>
                        <span className="whitespace-nowrap font-mono text-[10px] text-dc-muted">{cm.cost} CR</span>
                      </span>
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
          ) : actions.intelBrief ? (
            // Ordered, it has named the moves, and the order is locked for
            // the turn (v1.5 R2, the engine's briefLocked): a status with
            // its icon, not a control.
            <div data-procure-intel data-locked className="border border-dc-go bg-dc-go/10 p-2">
              <span className="flex w-full items-start justify-between gap-2">
                <span className="text-sm font-semibold">Intel brief</span>
                <span className="flex flex-none items-center gap-1 whitespace-nowrap font-mono text-[11px] tracking-wider text-dc-go">
                  <PixelSprite sprite={tinted(ICON_LOCK, 'go')} scale={1} name="procure-brief-lock" />
                  {briefLockedTag(scenario.prices.intelBrief)}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-dc-muted">{BRIEF_LOCKED_LINE}</span>
            </div>
          ) : (
            <button
              type="button"
              data-procure-intel
              data-match={(focus && 'intel' in focus) || undefined}
              aria-pressed={false}
              disabled={!afford(scenario.prices.intelBrief)}
              onClick={onOrderBrief}
              className={`${ITEM} ${focus && 'intel' in focus ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'}`}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="text-sm font-semibold">Intel brief</span>
                <Price ordered={false} price={scenario.prices.intelBrief} />
              </span>
              <span data-brief-rule className="text-xs text-dc-muted">{BRIEF_RULE}</span>
            </button>
          )}
        </div>
      </div>
      {more && (
        <p data-scroll-cue aria-hidden="true" className="pointer-events-none relative z-10 -mt-7 flex-none bg-linear-to-t from-dc-panel from-40% to-transparent pt-3 text-center font-mono text-[10px] text-dc-muted">
          {MORE_BELOW}
        </p>
      )}
      <div className="flex-none border-t border-dc-line px-3 pt-2 pb-2">
        {orders > 0 ? (
          <>
            <button type="button" data-confirm onClick={onClose} className="dc-tile flex min-h-12 w-full items-center justify-center border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground shadow-hard">
              CONFIRM {orders} ORDER{orders === 1 ? '' : 'S'}
            </button>
            <p className="mt-1 text-center font-mono text-[10px] text-dc-muted">{confirmNote(cost, actions.intelBrief && !briefFree(state))}</p>
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

