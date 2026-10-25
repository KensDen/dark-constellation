// @vitest-environment jsdom
//
// THE DESKTOP NIGHT'S LOG (v1.5 R2, from its fresh-eyes review: the side
// panel emptied and the board jumped wider as the night began). Game shows
// it from WIDE_BOARD up, which the test DOM is not, so it is rendered here
// on its own: each of tonight's moves with its target, its result as an
// icon and a word (section 4 rule 8), and the score's change.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { callSigns } from '../src/ui/board/board'
import NightLog from '../src/ui/board/NightLog'
import { tracesOf } from '../src/ui/board/strike'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("the desktop night's log (v1.5 R2)", () => {
  it('lists each move with its target, an icon and a word for its result, and the score change', () => {
    let s = newGame(DEFAULT_SCENARIO, 2, 'standard')
    const seen = new Set<string>()
    while (s.status === 'playing') {
      s = resolveTurn(s, WIN_SCRIPT[s.turn] ?? NO_OP, turnRng(s.seed, s.turn))
      const rec = s.history.at(-1)!
      const log = tracesOf(rec.turn, rec.events, DEFAULT_SCENARIO)
      act(() => root.render(<NightLog turn={rec.turn} scenario={DEFAULT_SCENARIO} log={log} moving={null} signs={callSigns(s)} />))
      const rows = [...container.querySelectorAll('li[data-log]')]
      expect(rows.map((r) => r.getAttribute('data-log'))).toEqual(log.map((t) => t.result))
      for (const [i, row] of rows.entries()) {
        const t = log[i]
        seen.add(t.result)
        // An icon and a word, never colour alone.
        expect(row.querySelector('svg[data-sprite^="log-"]'), `${t.eventId}: no icon`).not.toBeNull()
        expect(row.textContent).toContain({ blocked: 'BLOCKED', partial: 'PARTIAL', hit: 'HIT', clear: 'CLEAR', lost: 'LOST' }[t.result])
        expect(row.textContent).toContain(t.delta < 0 ? t.delta.toFixed(1) : 'NO LOSS')
        if (t.assetId) expect(row.textContent).toContain(callSigns(s).get(t.assetId)!)
      }
      expect(container.querySelector('h2')!.textContent).toBe(`TONIGHT · TURN ${rec.turn}`)
    }
    expect(seen.size, 'the game met too few kinds of result to test').toBeGreaterThanOrEqual(2)
    // The move on its way, while it strikes.
    act(() => root.render(<NightLog turn={6} scenario={DEFAULT_SCENARIO} log={[]} moving="blackout-chain" signs={new Map()} />))
    expect(container.querySelector('li[data-log="moving"]')!.textContent).toBe('COLDVEIL MOVES · BLACKOUT CHAIN')
  })
})
