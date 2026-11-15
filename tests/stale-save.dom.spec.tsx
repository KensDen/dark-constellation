// @vitest-environment jsdom
//
// AN OLD SAVE SAYS SO (v1.3 brief 6.10). A v1.2 autosave cannot resume under
// the six-turn rules. Until this fix the menu dropped it without a word: no
// RESUME, no message, which reads to a returning player as lost progress.
// Now the menu shows "This save is from an earlier version and cannot be
// resumed" with PLAY. The save under test is a real v1.2 autosave: written by
// the v1.2 code at 204d59b (its own LocalStorageStore.autosave, the WIN
// script played to turn 4, saved in the retired 'harden' phase), kept in
// tests/fixtures/v12-autosave.json.
//
// v2.0 R3: the pixel board is retired, so a pixel board save of any version
// is told the same (src/persistence/codec.ts), and a new or a resumed
// operation opens the 3D game. A test DOM has no WebGL, so what shows is
// the 3D game's own fallback (tests/game3d.dom.spec.tsx holds that).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The title's frame is three.js, which a test DOM cannot draw.
vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import { STALE_SAVE_MESSAGE, captureGame } from '../src/persistence'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const V12_AUTOSAVE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v12-autosave.json'), 'utf8')

let container: HTMLDivElement
let root: Root
let unlisten: () => void

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(String(k), String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  resetAudioEngineForTests()
  installFakeAudioContext()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  unlisten = installGestureUnlock()
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.unstubAllGlobals()
})

const loadPage = () =>
  act(() => {
    root.render(<App />)
  })
const notice = () => container.querySelector('[data-stale-save]')
const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const inGame = () => container.querySelector('[data-game3d]') !== null
// The 3D game is a lazy chunk: a few turns of the loop bring it in.
const settle = async () => {
  for (let i = 0; i < 300 && !inGame(); i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)))
}

describe('an autosave from an earlier version (v1.3 brief 6.10)', () => {
  it('is a real v1.2 save, which this version refuses', () => {
    const save = JSON.parse(V12_AUTOSAVE)
    expect(save.version).toBe(3)
    expect(save.phase).toBe('harden')
  })

  it('shows the earlier-version message on the title with a way to start a new operation, rather than dropping the save without a word', async () => {
    localStorage.setItem('dc-autosave', V12_AUTOSAVE)
    loadPage()
    expect(notice(), 'the old save disappeared without a message').not.toBeNull()
    expect(notice()!.textContent).toContain(STALE_SAVE_MESSAGE)
    expect(notice()!.getAttribute('role')).toBe('status')
    // It does not pretend the save can resume.
    expect(container.querySelector('[data-continue]'), 'an old save offered CONTINUE').toBeNull()
    expect(byText(/CONTINUE NIGHT/), 'an old save offered CONTINUE').toBeUndefined()
    // Its button starts a new operation, and says so (QC G-064: it read
    // PLAY, which did not say the old save would not come back).
    const start = [...notice()!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'START A NEW OPERATION')
    expect(start, 'the message offers no way to start a new operation').toBeDefined()
    act(() => {
      start!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    await settle()
    expect(inGame(), 'START A NEW OPERATION did not start one').toBe(true)
  })

  it('says the same of a pixel board save of the last version before the board was retired (v2.0 R3)', () => {
    // A version 8 save without the 3D game's mark was a pixel board game.
    const pixel = { ...captureGame(newGame(DEFAULT_SCENARIO, 7), 'procure', '2026-11-14T00:00:00.000Z'), version: 8 }
    localStorage.setItem('dc-autosave', JSON.stringify(pixel))
    loadPage()
    expect(notice(), 'a pixel board save disappeared without a message').not.toBeNull()
    expect(notice()!.textContent).toContain(STALE_SAVE_MESSAGE)
    expect(inGame(), 'a pixel board save resumed').toBe(false)
    expect(byText(/CONTINUE/), 'a pixel board save offered CONTINUE').toBeUndefined()
  })

  it('shows no message with no save, and none for a save this version can resume', async () => {
    loadPage()
    expect(notice(), 'a message with no save at all').toBeNull()
    expect(container.querySelector('[data-play]')).not.toBeNull()
    act(() => root.unmount())
    root = createRoot(container)
    // A current save boots straight back into its game, as before.
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(newGame(DEFAULT_SCENARIO, 7), 'procure', '2026-10-09T00:00:00.000Z')))
    loadPage()
    expect(notice(), 'a resumable save was called an earlier version').toBeNull()
    await settle()
    expect(inGame(), 'a resumable save did not resume into the game').toBe(true)
  })
})
