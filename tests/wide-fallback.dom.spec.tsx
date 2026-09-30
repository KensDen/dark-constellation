// @vitest-environment jsdom
//
// The wide board when its chunk cannot load (v1.2 R6), as after a redeploy
// under a stale index.html: the board must stay the phone board, whole.
// Its own file, because the failing mock has to be the only one the
// module registry sees.

import { describe, expect, it, vi } from 'vitest'

const tried = vi.hoisted(() => ({ n: 0 }))
vi.mock('../src/ui/Constellation', () => ({ default: () => null }))
vi.mock('../src/ui/board/WideBoard', () => {
  tried.n += 1
  throw new Error('chunk unavailable')
})

import { ACTIONS, fKeyOf } from '../src/ui/board/actions'
import { chips, click, container, gameAt, press, render, setWide, settle, sheetOpen, installWideBoardHarness } from './wideHarness'

installWideBoardHarness()

describe('the wide board degrades to the phone board when its chunk cannot load', () => {
  it('a tile still opens its intel card, the layout stays single, and the F keys stay the browser\'s', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    // The positive control: the board did ask for the chunk.
    expect(tried.n, 'the chunk was never asked for, so this proves nothing').toBeGreaterThanOrEqual(1)
    expect(container.querySelector('[data-inspector], [data-ops-log]')).toBeNull()
    expect(container.querySelector('main[data-board]')!.hasAttribute('data-wide')).toBe(false)
    // No chip promises a key that is not bound.
    for (const a of ACTIONS) expect(chips()).not.toContain(fKeyOf(a))
    expect(press(fKeyOf(ACTIONS[0])), 'an F key was taken with no wide board').toBe(false)
    // The digits need no chunk.
    expect(press(ACTIONS[0].hotkey)).toBe(true)
    expect(sheetOpen(ACTIONS[0].sheet!)).toBe(true)
    press('Escape')
    const tile = container.querySelector('button[data-asset-id]')!
    expect(tile.getAttribute('aria-haspopup')).toBe('dialog')
    click(tile)
    await settle()
    expect(container.querySelector('section[data-intel-card="tile"]')).not.toBeNull()
  })
})
