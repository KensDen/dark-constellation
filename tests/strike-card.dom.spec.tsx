// @vitest-environment jsdom
//
// THE STRIKE'S CARD (v1.6 R1, Ken's ruling of 26 October 2026), and what
// v1.6 R2 added to it from R1's fresh eyes (F5): from 390 wide one line
// from the hit card's outcome block, and under the card the night so far,
// which move of tonight's this is and the moves before it, written as the
// desktop's night log writes them. The phone layout guard holds where it
// shows (scripts/phone-layout.mjs, GUARD v1.6 R2 (g)); this holds what it
// says, over every strike of three seeds' campaigns.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { tracesOf } from '../src/ui/board/strike'
import { StrikeCard } from '../src/ui/night/cards'
import { defensesFor, nightOf } from '../src/ui/night/nightModel'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
const tall = window.innerHeight
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: tall })
})

const WORD = { blocked: 'BLOCKED', partial: 'PARTIAL', hit: 'HIT', clear: 'CLEAR', lost: 'LOST' } as const

describe("the strike's card (v1.6 R1 and R2)", () => {
  it('adds one outcome line from 390 wide and lists the night so far under it, on every strike of three campaigns', () => {
    const seen = { held: 0, reduced: 0, open: 0, rows: 0, single: 0 }
    for (const seed of [2, 32, 7]) {
      let s: GameState = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (s.status === 'playing') {
        const before = s
        s = resolveTurn(s, WIN_SCRIPT[s.turn] ?? NO_OP, turnRng(s.seed, s.turn))
        const record = s.history.at(-1)!
        const night = nightOf(before, s)
        const all = tracesOf(record.turn, record.events, DEFAULT_SCENARIO)
        const signs = new Map([...callSigns(before), ...callSigns(s)])
        night.steps.forEach((step, i) => {
          if (step.kind !== 'threat') return
          const earlier = tracesOf(record.turn, record.events, DEFAULT_SCENARIO, i)
          act(() => root.render(<StrikeCard key={`${seed}-${record.turn}-${i}`} step={step} signs={signs} earlier={earlier} of={all.length} />))
          const at = `seed ${seed}, turn ${record.turn}, ${step.ev.eventId}`
          // The outcome line: what the player can now say on a block, what
          // would have finished a partial, what would have helped a hit;
          // shown from 390 wide only, so 375 keeps the card it had.
          const line = container.querySelector('[data-strike-outcome]')
          const { held, missing } = defensesFor(step.def, step.after.counters, DEFAULT_SCENARIO)
          const outcome = step.ev.outcome
          if (outcome === 'held' && held) {
            expect(line?.textContent, at).toMatch(/^You can now say it: /)
            expect(line!.textContent, at).toContain(held.name)
            seen.held += 1
          } else if (missing) {
            expect(line?.textContent, at).toMatch(outcome === 'reduced' ? /^Would have finished it: / : /^What would have helped: /)
            expect(line!.textContent, at).toContain(`${missing.name}, ${missing.cost} CR.`)
            seen[outcome === 'reduced' ? 'reduced' : 'open'] += 1
          }
          if (line) expect(line.className.split(' '), at).toEqual(expect.arrayContaining(['hidden', 'min-[390px]:block']))
          // The night so far: which move this is, and the ones before it
          // with their results as an icon and a word; none on a night of
          // one move, which has nothing so far to list (v1.6 R2's fresh
          // eyes, G9).
          const list = container.querySelector('[data-strike-log]')
          if (all.length === 1) {
            expect(list, at).toBeNull()
            seen.single += 1
            return
          }
          expect(list, at).not.toBeNull()
          if (!list) return
          expect(list.getAttribute('data-strike-log'), at).toBe('shown')
          expect(list.querySelector('p')!.textContent, at).toBe(`TONIGHT · MOVE ${earlier.length + 1} OF ${all.length}`)
          const rows = [...list.querySelectorAll('li[data-log]')]
          expect(rows.map((r) => r.getAttribute('data-log')), at).toEqual(earlier.map((t) => t.result))
          for (const [k, row] of rows.entries()) {
            expect(row.querySelector('svg[data-sprite^="log-"]'), `${at}: row ${k} has no icon`).not.toBeNull()
            expect(row.textContent, at).toContain(WORD[earlier[k].result])
          }
          seen.rows += rows.length
        })
      }
    }
    // Not vacuous: blocks, hits and earlier moves were all met.
    expect(seen.held, 'no block met').toBeGreaterThan(0)
    expect(seen.open, 'no undefended hit met').toBeGreaterThan(0)
    expect(seen.rows, 'no strike listed an earlier move').toBeGreaterThan(0)
    expect(seen.single, 'no night of one move').toBeGreaterThan(0)
  })

  it('steps the list aside when it would end off the screen, so the card never scrolls (375x667)', () => {
    // A night of more than one move, so the list is drawn.
    let s: GameState = newGame(DEFAULT_SCENARIO, 32, 'standard')
    let before = s
    do {
      before = s
      s = resolveTurn(s, WIN_SCRIPT[s.turn] ?? NO_OP, turnRng(s.seed, s.turn))
    } while (tracesOf(s.turn - 1, s.history.at(-1)!.events, DEFAULT_SCENARIO).length < 2)
    const record = s.history.at(-1)!
    const step = nightOf(before, s).steps.find((x) => x.kind === 'threat')!
    // jsdom lays nothing out, so every box ends at 0: a screen of 0 is one
    // the list cannot fit.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 0 })
    act(() => root.render(<StrikeCard step={step} signs={callSigns(s)} earlier={[]} of={tracesOf(record.turn, record.events, DEFAULT_SCENARIO).length} />))
    const list = container.querySelector('[data-strike-log]')!
    expect(list.getAttribute('data-strike-log')).toBe('no-room')
    expect(list.className).toContain('hidden')
  })
})
