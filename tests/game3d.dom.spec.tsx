// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:3000/"}
// THE WAY INTO THE GAME (v2.0 R1; the only game since v2.0 R3). The
// title's PLAY, CONTINUE and DAILY OP open the 3D game, in a chunk of its
// own, and its rooms (the Dossier among them) in a chunk beside it. A test
// DOM has no WebGL, so what shows here is the game's own fallback, which
// is itself held: a device that cannot start the world is told so and
// shown the way back, never a blank page, and never a link to a pixel
// board that is no longer on this branch.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import { LocalStorageStore } from '../src/persistence'
import { resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

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

const mount = async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<App />))
}
const unmount = async () => {
  await act(async () => root.unmount())
  container.remove()
}
// The 3D game is a lazy chunk, and its rooms another: a few turns of the
// loop bring each in.
const settle = async (selector = '[data-game3d]') => {
  for (let i = 0; i < 300 && !container.querySelector(selector); i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)))
}
const click = async (el: Element | null | undefined) => {
  expect(el, 'nothing to click').toBeTruthy()
  await act(async () => (el as HTMLElement).click())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  resetAudioEngineForTests()
  installFakeAudioContext()
})

afterEach(async () => {
  await unmount()
  removeFakeAudioContext()
  vi.unstubAllGlobals()
})

describe('the title opens the 3D game (v2.0 R1)', () => {
  it('PLAY goes to the 3D game, and a device without WebGL is told so and shown the way back, with no link to a pixel board', async () => {
    await mount()
    expect(location.search, 'this suite must run at the plain address').toBe('')
    expect(container.querySelector('[data-try3d]'), 'the experiment has left the title').toBeNull()
    await click(container.querySelector('[data-play]'))
    await settle()
    const game = container.querySelector('[data-game3d]')
    expect(game, 'PLAY did not open the 3D game').toBeTruthy()
    expect(game!.textContent).toContain('could not start the 3D view')
    // The pixel board is retired on this branch: nothing points at it.
    expect(container.querySelector('a[href*="classic"]'), 'a link to a pixel mode that no longer exists').toBeNull()
    expect(container.innerHTML).not.toMatch(/view=classic|pixel board/i)
    // And back to the title.
    await click([...game!.querySelectorAll('button')].find((b) => /TITLE/.test(b.textContent ?? '')))
    expect(container.querySelector('[data-play]')).toBeTruthy()
  })

  it('a game in progress resumes in the 3D game', async () => {
    new LocalStorageStore().autosave(newGame(DEFAULT_SCENARIO, 42, 'easy'), 'brief')
    await mount()
    await settle()
    expect(container.querySelector('[data-game3d]'), 'the autosave did not resume in the 3D game').toBeTruthy()
  })

  it('the title’s DOSSIER opens the 3D Dossier: every threat’s card, unfiled ones by their signature alone', async () => {
    await mount()
    await click(container.querySelector('[data-read="dossier"]'))
    await settle('[data-t3-room="dossier"]')
    const room = container.querySelector('[data-t3-room="dossier"]')
    expect(room, 'DOSSIER did not open the 3D Dossier').toBeTruthy()
    const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
    expect(room!.querySelectorAll('[data-t3-dcard]').length).toBe(threats.length)
    expect(room!.querySelector('[data-t3-dossier-count]')!.textContent).toContain(`0 of ${threats.length}`)
    expect(room!.querySelectorAll('[data-t3-dcard] svg.t3g').length, 'a card has no signature').toBe(threats.length)
    // No name leaks from an unfiled card.
    for (const ev of threats) expect(room!.textContent, `${ev.id} is named while unfiled`).not.toContain(ev.name.split(' (')[0])
    await click(room!.querySelector('[data-t3-room-back]'))
    expect(container.querySelector('[data-play]')).toBeTruthy()
  })
})
