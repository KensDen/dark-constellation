// FIRST ORDERS and SECOND ORDERS (v1.3 brief 5.3 item 4), which replace
// the R2b walkthrough on the objective line.
//
// ONE COACH LINE (v1.6 R3, Ken's playtest item 1): turn 1's three orders
// stood as a checklist of three long lines under TONIGHT. Now the coach
// shows the current step alone, its place in the three as pips, and the
// whole line acts, as each order did: the defense step brings the move
// cards into view and flashes them, the drone step opens PROCURE at the
// drone, and the WORST CASE step pulses the dock. Its first step carries
// the job (item 6: YOUR JOB left the full brief for the turn-1 coach and
// SYSTEM's how-to). When all three are done it folds to "First orders set.
// EXECUTE to play out the night." Turn 2 has one step.
//
// Every number is the scenario's or the engine's: the drone's price, the
// coverage it adds and whether that crosses the coverage bonus's line.

import type { GameState, TurnActions } from '../../engine/types'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_CHECK, tinted } from '../sprites/icons'
import { FIRST_ORDERS_SET, SECOND_ORDER, firstOrders, hiddenOrder, ordersDone, tonightSlots, type OrderId, type OrderLine } from './boardModel'

export type { OrderId }

function Coach({ head, line, step, of, onOrder }: { head: string; line: OrderLine; step: number; of: number; onOrder: (id: OrderId) => void }) {
  return (
    <button
      type="button"
      data-orders={head === 'FIRST ORDERS' ? 'first' : 'second'}
      data-order={line.id}
      aria-label={`${head}, ${ordersDone(step - 1, of)}: ${line.text}`}
      onClick={() => onOrder(line.id)}
      className="dc-tile flex w-full flex-none flex-col gap-0.5 border-2 border-dc-go/60 bg-dc-panel px-3 py-1.5 text-left shadow-press active:shadow-none"
    >
      <span className="flex items-center justify-between font-mono text-[10px] tracking-widest">
        <span className="text-dc-go">{head}</span>
        {of > 1 && (
          <span aria-hidden="true" data-pips className="flex gap-1">
            {Array.from({ length: of }, (_, k) => (
              <i key={k} className={`block h-1.5 w-3 ${k < step - 1 ? 'bg-dc-go' : k === step - 1 ? 'bg-dc-ink' : 'bg-dc-line'}`} />
            ))}
          </span>
        )}
      </span>
      <span className="text-xs leading-snug text-dc-ink">{line.text}</span>
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
    const next = lines.findIndex((l) => !l.done)
    if (next < 0)
      return (
        <section aria-label="First orders" data-orders="set" className="flex flex-none items-center gap-2 border border-dc-go/60 bg-dc-panel px-3 py-2">
          <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="orders-set" />
          <p className="text-xs text-dc-ink">{FIRST_ORDERS_SET}</p>
        </section>
      )
    return <Coach head="FIRST ORDERS" line={lines[next]} step={lines.filter((l) => l.done).length + 1} of={lines.length} onOrder={onOrder} />
  }
  if (state.turn === 2) {
    const line: OrderLine = tonightSlots(state, actions).some((s) => s.hidden)
      ? { id: 'intel', text: hiddenOrder(state.scenario.prices.intelBrief), done: false }
      : { id: 'defense', text: SECOND_ORDER, done: false }
    return <Coach head="SECOND ORDERS" line={line} step={1} of={1} onOrder={onOrder} />
  }
  return null
}
