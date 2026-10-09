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

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const onStartScreen = () => [...container.querySelectorAll('legend')].some((l) => l.textContent === 'Difficulty')

describe('an autosave from an earlier version (v1.3 brief 6.10)', () => {
  it('is a real v1.2 save, which this version refuses', () => {
    const save = JSON.parse(V12_AUTOSAVE)
    expect(save.version).toBe(3)
    expect(save.phase).toBe('harden')
  })

  it('shows the earlier-version message with PLAY on the menu, rather than dropping the save without a word', () => {
    localStorage.setItem('dc-autosave', V12_AUTOSAVE)
    loadPage()
    expect(notice(), 'the old save disappeared without a message').not.toBeNull()
    expect(notice()!.textContent).toContain(STALE_SAVE_MESSAGE)
    expect(notice()!.getAttribute('role')).toBe('status')
    // It does not pretend the save can resume.
    expect(byText(/RESUME OPERATION/), 'an old save offered RESUME').toBeUndefined()
    // PLAY starts a new operation.
    const play = [...notice()!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'PLAY')
    expect(play, 'the message offers no PLAY').toBeDefined()
    act(() => {
      play!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    expect(onStartScreen(), 'PLAY did not open a new operation').toBe(true)
  })

  it('shows no message with no save, and none for a save this version can resume', () => {
    loadPage()
    expect(notice(), 'a message with no save at all').toBeNull()
    expect(byText(/NEW OPERATION/)).toBeDefined()
    act(() => root.unmount())
    root = createRoot(container)
    // A current save boots straight back into its game, as before.
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(newGame(DEFAULT_SCENARIO, 7), 'procure', '2026-10-09T00:00:00.000Z')))
    loadPage()
    expect(notice(), 'a resumable save was called an earlier version').toBeNull()
    expect(container.querySelector('[aria-label^="Credits"]'), 'a resumable save did not resume onto the board').not.toBeNull()
  })
})
