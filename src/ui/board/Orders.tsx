// FIRST ORDERS and SECOND ORDERS (v1.3 brief 5.3 item 4), which replace
// the R2b walkthrough on the objective line. Turn 1 has three orders whose
// circles tick themselves as the player does them; when all three are done
// the card folds to "First orders set. EXECUTE to play out the night."
// Turn 2 has one. Tapping an order acts, as in the prototype: the defense
// order brings the move cards into view and flashes them, the drone order
// opens PROCURE at the drone, and the WORST CASE order pulses the dock.
//
// Every number is the scenario's or the engine's: the drone's price, the
// coverage it adds and whether that crosses the coverage bonus's line.

import type { GameState, TurnActions } from '../../engine/types'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CHECK, tinted } from '../sprites/icons'
import { FIRST_ORDERS_SET, SECOND_ORDER, firstOrders, hiddenOrder, ordersDone, tonightSlots, type OrderId, type OrderLine } from './boardModel'

export type { OrderId }

function Order({ line, onOrder }: { line: OrderLine; onOrder: (id: OrderId) => void }) {
  return (
    <button type="button" data-order={line.id} data-done={line.done || undefined} onClick={() => onOrder(line.id)} className="flex min-h-11 w-full items-center gap-2 text-left">
      <span aria-hidden="true" className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${line.done ? 'border-dc-go bg-dc-go' : 'border-dc-muted'}`}>
        {line.done && <PixelSprite sprite={tinted(ICON_CHECK, 'ground')} scale={1} name="order-done" />}
      </span>
      <span className={`min-w-0 flex-1 text-xs leading-snug ${line.done ? 'text-dc-muted line-through' : 'text-dc-ink'}`}>{line.text}</span>
      <span aria-hidden="true" className="flex-none font-mono text-xs text-dc-friendly">
        ›
      </span>
    </button>
  )
}

export interface OrdersProps {
  state: GameState
  actions: TurnActions
  onOrder: (id: OrderId) => void
}

export default function Orders({ state, actions, onOrder }: OrdersProps) {
  if (state.turn === 1) {
    const lines = firstOrders(state, actions)
    const done = lines.filter((l) => l.done).length
    if (done === lines.length)
      return (
        <section aria-label="First orders" data-orders="set" className="flex flex-none items-center gap-2 border border-dc-go/60 bg-dc-panel px-3 py-2">
          <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="orders-set" />
          <p className="text-xs text-dc-ink">{FIRST_ORDERS_SET}</p>
        </section>
      )
    return (
      <section aria-label="First orders" data-orders="first" className="flex-none border border-dc-go/60 bg-dc-panel px-3 pt-1">
        <p className="flex justify-between font-mono text-[10px] tracking-widest">
          <span className="text-dc-go">FIRST ORDERS</span>
          <span className="text-dc-muted">{ordersDone(done, lines.length)}</span>
        </p>
        {lines.map((line) => (
          <Order key={line.id} line={line} onOrder={onOrder} />
        ))}
      </section>
    )
  }
  if (state.turn === 2)
    return (
      <section aria-label="Second orders" data-orders="second" className="flex-none border border-dc-go/60 bg-dc-panel px-3 pt-1">
        <p className="font-mono text-[10px] tracking-widest text-dc-go">SECOND ORDERS</p>
        {tonightSlots(state, actions).some((s) => s.hidden) ? (
          <Order line={{ id: 'intel', text: hiddenOrder(state.scenario.prices.intelBrief), done: false }} onOrder={onOrder} />
        ) : (
          <Order line={{ id: 'defense', text: SECOND_ORDER, done: false }} onOrder={onOrder} />
        )}
      </section>
    )
  return null
}
