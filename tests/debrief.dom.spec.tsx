// @vitest-environment jsdom
//
// THE DEBRIEF'S SHARE (v1.2 R5, brief 7.2): the native share sheet where
// there is one, the clipboard where there is none or the sheet fails, and
// neither when the player closes the sheet (src/ui/clipboard.ts,
// shareOrCopy, which the 3D game's debrief calls with the share text).
//
// Until v2.0 R3 this suite mounted the pixel debrief (src/ui/Debrief.tsx)
// and held its whole screen: the grade and tiles, FILED THIS GAME, NEXT
// TIME's words, the reveal and its stylesheet, the countdown and the ways
// on. That screen is retired with the pixel board. The numbers it showed
// are held to the engine by tests/debrief.spec.ts and the share text by
// tests/share-text.spec.ts; the 3D game's debrief needs its world, which a
// test DOM cannot draw. What is left here is the one thing under that
// screen's SHARE button that still ships and no other suite holds.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { copyToClipboard, shareOrCopy, shareSupported } from '../src/ui/clipboard'
import { shareText } from '../src/ui/reportCard'
import { NO_OP } from './scripts'

// A finished campaign from the engine, for a real share text.
function finished(seed: number): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
  return state
}
const failing = (name: string) => async () => {
  throw Object.assign(new Error(name), { name })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the ways on: SHARE', () => {
  it('opens the native share sheet with the share text where there is one', async () => {
    const shared: unknown[] = []
    let copied = ''
    vi.stubGlobal('navigator', { share: async (data: unknown) => void shared.push(data), clipboard: { writeText: async (t: string) => void (copied = t) } })
    const text = shareText(finished(7), { n: 1, official: true })
    expect(shareSupported()).toBe(true)
    expect(await shareOrCopy(text)).toBe('shared')
    expect(shared).toEqual([{ text }])
    expect(copied, 'a shared result was copied as well').toBe('')
  })

  it('falls back to the clipboard where there is no sheet, or the sheet fails, but not when the player closes it', async () => {
    const text = shareText(finished(7))
    expect(text.split('\n'), 'free play shares four lines').toHaveLength(4)
    let copied = ''
    vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (copied = t) } })
    expect(shareSupported(), 'a navigator with no share is said to have a sheet').toBe(false)
    expect(await shareOrCopy(text)).toBe('copied')
    expect(copied).toBe(text)

    copied = ''
    vi.stubGlobal('navigator', { share: failing('NotAllowedError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    expect(await shareOrCopy(text)).toBe('copied')
    expect(copied, 'a failed sheet did not fall back to the clipboard').toBe(text)

    copied = ''
    vi.stubGlobal('navigator', { share: failing('AbortError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    expect(await shareOrCopy(text)).toBe('cancelled')
    expect(copied, 'closing the sheet copied anyway').toBe('')

    // A copy that fails says so, the one outcome that is a warning.
    vi.stubGlobal('navigator', { clipboard: { writeText: failing('NotAllowedError') } })
    expect(await shareOrCopy(text)).toBe('failed')
    expect(await copyToClipboard(text)).toBe(false)
  })

  it('is callable, not merely present: a share that is not a function is no sheet', async () => {
    let copied = ''
    vi.stubGlobal('navigator', { share: true, clipboard: { writeText: async (t: string) => void (copied = t) } })
    expect(shareSupported()).toBe(false)
    expect(await shareOrCopy('x')).toBe('copied')
    expect(copied).toBe('x')
  })
})
