// @vitest-environment jsdom
//
// GUARD R6 (a), the round's central guard (brief 8: "Round 6 loads its
// desktop layout only on wide screens"): the wide board's module is never
// fetched on a phone, and is fetched once the screen is wide. Its
// mutation is the render without the width gate, and the phone half then
// counts one load.
//
// In a file of its own with one test, because the count lives in the
// module registry: once any test has loaded the module, a later phone
// case could not see a load, whatever order the runner picks.

import { describe, expect, it, vi } from 'vitest'

const loads = vi.hoisted(() => ({ n: 0 }))
vi.mock('../src/ui/Constellation', () => ({ default: () => null }))
vi.mock('../src/ui/board/WideBoard', async (importOriginal) => {
  loads.n += 1
  return importOriginal()
})

import { container, executeNow, gameAt, installWideBoardHarness, playOut, render, setWide, settle, stage, step } from './wideHarness'

installWideBoardHarness()

describe('GUARD R6 (a): the wide board loads only on a wide screen', () => {
  it('never imports the module on a phone, through a night played out, and imports it once the screen is wide', async () => {
    render(gameAt(2))
    await settle()
    // A whole turn, the night and its END OF TURN, so no stage can fetch
    // it: the overlay and each strike on their clocks and every card
    // tapped through, then END OF TURN left on its timers for two minutes,
    // so a fetch armed on a delay anywhere in the night still fires before
    // the count is read.
    executeNow()
    await settle()
    expect(stage(), 'EXECUTE opened no night').toBe('moving')
    await playOut()
    step(120_000)
    await settle()
    expect(container.querySelector('button[data-begin]')?.textContent, 'the turn never played out').toBe('BEGIN TURN 3')
    expect(loads.n, 'the phone board fetched the wide module').toBe(0)
    expect(container.querySelector('[data-ops-log], [data-inspector]')).toBeNull()
    expect(container.querySelector('main[data-board]')!.hasAttribute('data-wide')).toBe(false)
    // The positive control: the same mount, the screen turned wide.
    setWide(true)
    await settle()
    expect(loads.n, 'the wide board never fetched its module').toBe(1)
    expect(container.querySelector('[data-ops-log]')).not.toBeNull()
    expect(container.querySelector('[data-inspector]')).not.toBeNull()
    expect(container.querySelector('main[data-board]')!.hasAttribute('data-wide')).toBe(true)
    // And back: a tablet turned to portrait gets the phone board.
    setWide(false)
    expect(container.querySelector('[data-ops-log], [data-inspector]')).toBeNull()
    expect(container.querySelector('main[data-board]')!.hasAttribute('data-wide')).toBe(false)
  })
})
