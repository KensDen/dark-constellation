// @vitest-environment jsdom
//
// GUARD R6 (c), the other half (principle 17, both directions): the F keys
// are read from the action array's numbers, not spelled beside it. With
// the numbers rotated by one, every F key names a different action than in
// the shipped array (a reversal would leave the middle one where it was),
// so a key map written as F1 is PROCURE, F2 is HARDEN and so on passes
// tests/wide-board.dom.spec.tsx and fails here. Its own file,
// because the renumbered array has to be the only one Game ever imports.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))
vi.mock('../src/ui/board/actions', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/ui/board/actions')>()
  const n = m.ACTIONS.length
  return { ...m, ACTIONS: m.ACTIONS.map((a) => ({ ...a, number: (a.number % n) + 1 })) }
})

import { ACTIONS, fKeyOf } from '../src/ui/board/actions'
import { bar, gameAt, hold, installWideBoardHarness, press, render, setWide, settle, sheetOpen } from './wideHarness'

installWideBoardHarness()

describe("GUARD R6 (c), the other half: the keys follow the array's numbers", () => {
  it('each renumbered action opens on its own F key, and its chip says so', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    expect(ACTIONS.every((a, i) => a.number !== i + 1), 'an action kept its shipped number').toBe(true)
    // Each chip on its own action's slot.
    const slots = [...bar().querySelectorAll('[data-action]')]
    expect(slots.length).toBe(ACTIONS.length)
    for (const slot of slots) {
      const a = ACTIONS.find((x) => x.id === slot.getAttribute('data-action'))!
      expect(slot.querySelector('[data-step]')!.textContent, a.id).toBe(fKeyOf(a))
    }
    for (const a of ACTIONS) {
      expect(press(fKeyOf(a)), fKeyOf(a)).toBe(true)
      if (!a.sheet) {
        expect(document.activeElement, `${fKeyOf(a)} did not focus the hold`).toBe(hold())
        continue
      }
      expect(sheetOpen(a.sheet), `${fKeyOf(a)} did not open ${a.sheet}`).toBe(true)
      press(fKeyOf(a))
    }
  })
})
