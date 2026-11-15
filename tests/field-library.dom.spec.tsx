// @vitest-environment jsdom
//
// The Field Library on screen (v1.2 R5b, brief 4.8 and 7.3): the screen
// itself, the title's READ row, and the met events that FILED stamps read.
//
// GUARD R5b (b): an entry paired with an event the player has met shows
// FILED, and one that is not does not.
// GUARD R5b (c): every library link opens in a new tab with noopener and
// noreferrer.
// GUARD R5b (d): the total in the counter equals the number of entries in
// the data.
//
// v2.0 R3: the game is the 3D game, whose world a test DOM cannot draw
// (no WebGL), so the events a night meets are recorded here the one way
// the 3D game closes a night without its world: a night left in the middle
// is closed when the page loads again (src/ui/three/Game3D.tsx, on the
// mark src/ui/three/store3d.ts keeps). LEARN MORE from the 3D Dossier is
// held in tests/reading-rooms.dom.spec.tsx; the pixel board's own LEARN
// MORE links (a result's Dossier row, the intel card) are retired with it.
//
// Doubles: the three.js frame is stubbed, storage is an in-memory map, and
// the clock is vitest's fake one.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import FieldLibrary from '../src/ui/FieldLibrary'
import { DEFAULT_SCENARIO } from '../src/content'
import { SHELVES_AS_DRAFTED } from '../src/content/fieldLibraryData'
import { resolveTurn, newGame } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { LocalStorageStore, captureGame, encodeSaveCode, runKey } from '../src/persistence'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { NO_INPUTS, NO_ORDERS } from '../src/ui/three/gameModel'
import * as c3 from '../src/ui/three/copy3d'
import { markNight } from '../src/ui/three/store3d'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { prepared } from './policies'
import { NO_OP } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let mounts = 0

// The game's chunk, loaded once, so React.lazy resolves on a microtask
// under the fake clock.
beforeAll(async () => {
  await import('../src/ui/three/Game3D')
  await import('../src/ui/three/rooms3d')
})

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
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ENTRIES = SHELVES_AS_DRAFTED.flatMap((s) => s.entries)
const byTitle = (title: string) => container.querySelector(`[data-library-entry="${CSS.escape(title)}"]`)
const titles = () => [...container.querySelectorAll('[data-library-entry]')].map((e) => e.getAttribute('data-library-entry'))
const filedTitles = () => [...container.querySelectorAll('[data-library-entry]')].filter((e) => e.querySelector('[data-filed]')).map((e) => e.getAttribute('data-library-entry'))
const counter = () => container.querySelector('[data-filed-counter]')?.textContent ?? ''
const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
function showLibrary(focus?: string) {
  mounts += 1
  act(() => {
    root.render(<FieldLibrary key={`l${mounts}`} onBack={() => {}} focus={focus} />)
  })
}
const met = (...ids: string[]) => localStorage.setItem('dc-met', JSON.stringify(ids))
// The entries that name an event, read from the data rather than the screen.
const naming = (id: string) => ENTRIES.filter((e) => e.pairs.some((p) => p.kind === 'event' && p.event === id)).map((e) => e.title)
const SPARTA = ENTRIES.find((e) => e.pairs.some((p) => p.kind === 'sparta'))!.title
const GENERAL = ENTRIES.filter((e) => e.pairs.some((p) => p.kind === 'general')).map((e) => e.title)

describe('the library screen', () => {
  it('GUARD R5b (d): counts every entry in the data, and as many FILED as it stamps', () => {
    met('lidar-dazzle', 'insider-exfil')
    showLibrary()
    expect(titles().length, 'the screen shows a different list from the data').toBe(ENTRIES.length)
    const [, n, total] = counter().match(/^FILED (\d+) \/ (\d+)$/) ?? []
    expect(Number(total), 'the counter total is not the number of entries in the data').toBe(ENTRIES.length)
    expect(Number(n), 'the counter disagrees with the stamps on screen').toBe(filedTitles().length)
    expect(Number(n), 'nothing is filed, so the join proves nothing').toBeGreaterThan(0)
  })

  it('GUARD R5b (b): stamps an entry paired with a met event, and not one that is not', () => {
    // lidar-dazzle is met; debris-conjunction is not. Each has an entry
    // that names it and no other event.
    met('lidar-dazzle')
    showLibrary()
    const dazzle = naming('lidar-dazzle')
    const debris = naming('debris-conjunction')
    expect(dazzle.length).toBeGreaterThan(0)
    expect(debris.length).toBeGreaterThan(0)
    for (const t of dazzle) expect(byTitle(t)!.querySelector('[data-filed]'), `${t} is not filed`).not.toBeNull()
    for (const t of debris) expect(byTitle(t)!.querySelector('[data-filed]'), `${t} is filed with nothing met`).toBeNull()
    // lidar-dazzle carries a SPARTA technique, so the framework entry,
    // which pairs by derivation, is filed too.
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === 'lidar-dazzle')!.techniqueRefs.some((r) => r.framework === 'SPARTA')).toBe(true)
    expect(filedTitles()).toContain(SPARTA)
    // ops-phishing carries only ATT&CK: meeting it files its own entries
    // and not the SPARTA framework's.
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === 'ops-phishing')!.techniqueRefs.some((r) => r.framework === 'SPARTA')).toBe(false)
    met('ops-phishing')
    showLibrary()
    expect(filedTitles().sort()).toEqual(naming('ops-phishing').sort())
    met('lidar-dazzle')
    showLibrary()
    // An unstamped entry reads the same as a stamped one: its link, its
    // why line and its check are all there.
    const locked = byTitle(debris[0])!
    const entry = ENTRIES.find((e) => e.title === debris[0])!
    expect(locked.querySelector('a')!.getAttribute('href')).toBe(entry.url)
    expect(locked.textContent).toContain(entry.why)
    expect(locked.textContent).toContain('Checked 26 Sep 2026')
  })

  it('files the GENERAL entries once a campaign has finished here, and not before', () => {
    showLibrary()
    expect(GENERAL.length).toBeGreaterThan(0)
    expect(filedTitles().filter((t) => GENERAL.includes(t!)), 'a GENERAL entry is filed with no campaign finished').toEqual([])
    localStorage.setItem('dc-scores', JSON.stringify([{ outcome: 'lost', mai: 60, seed: 1, turnsSurvived: 12, totalTurns: 12, scenarioId: 'first-light', recordedAt: '2026-09-29T00:00:00Z' }]))
    showLibrary()
    expect(filedTitles().filter((t) => GENERAL.includes(t!)).sort()).toEqual([...GENERAL].sort())
    // A recorded Daily Op is a finished campaign too, with the scoreboard cleared.
    localStorage.removeItem('dc-scores')
    localStorage.setItem('dc-daily', JSON.stringify({ '20260927': { n: 1, seed: 1, outcome: 'lost', mai: 60, turns: 12, recordedAt: '2026-09-27T00:00:00Z' } }))
    showLibrary()
    expect(filedTitles().filter((t) => GENERAL.includes(t!)).sort()).toEqual([...GENERAL].sort())
  })

  it('GUARD R5b (c): opens every link in a new tab with noopener and noreferrer, filtered or not', () => {
    for (const focus of [undefined, 'downlink-eavesdropping']) {
      showLibrary(focus)
      const links = [...container.querySelectorAll('[data-field-library] a')]
      // Every entry's link, and, opened at a threat, its technique's (R6
      // question 14).
      expect(links.length, 'no links, so this asserts nothing').toBe(titles().length + (focus ? 1 : 0))
      if (focus) expect(container.querySelector('[data-library-technique]'), 'LEARN MORE does not link the technique').not.toBeNull()
      for (const a of links) {
        expect(a.getAttribute('target'), a.getAttribute('href')!).toBe('_blank')
        const rel = (a.getAttribute('rel') ?? '').split(/\s+/)
        expect(rel, a.getAttribute('href')!).toContain('noopener')
        expect(rel, a.getAttribute('href')!).toContain('noreferrer')
        expect(a.textContent, 'no external-link marker').toContain('↗')
        expect(a.textContent, 'the new tab is not said to assistive tech').toContain('(opens in a new tab)')
      }
    }
  })

  it('shows each entry\'s source and year, its checked date, and its link note', () => {
    showLibrary()
    for (const e of ENTRIES) {
      const el = byTitle(e.title)!
      expect(el.textContent, e.title).toContain(e.year ? `${e.source}, ${e.year} · ${e.type}` : `${e.source} · ${e.type}`)
      if (e.urlNote) expect(el.textContent).toContain(e.urlNote)
    }
    const wired = ENTRIES.find((e) => e.checked === '2026-09-27')!
    expect(byTitle(wired.title)!.textContent).toContain('Checked 27 Sep 2026')
  })

  it('opens at one threat\'s entries, with its layer note, and shows every shelf again on request', () => {
    showLibrary('supply-chain-implant')
    const expected = [...naming('supply-chain-implant'), SPARTA]
    expect(titles().sort()).toEqual(expected.sort())
    expect(container.querySelector('[data-library-filter]')!.textContent).toContain(DEFAULT_SCENARIO.events.find((e) => e.id === 'supply-chain-implant')!.name)
    const air = ENTRIES.find((e) => e.pairs.some((p) => p.kind === 'event' && p.note === 'AIR'))!
    expect(byTitle(air.title)!.textContent).toContain('(AIR)')
    click(byText(/^SHOW ALL SHELVES$/)!)
    expect(titles().length).toBe(ENTRIES.length)
    expect(document.activeElement?.textContent?.trim(), 'focus fell to the page when the filter went').toBe('FIELD LIBRARY')
    // Unfiltered, the layer note is not shown: it belongs to one threat.
    expect(byTitle(air.title)!.textContent).not.toContain('(AIR)')
    // A threat without a SPARTA technique gets only the entries that name it.
    showLibrary('ops-phishing')
    expect(titles().sort()).toEqual(naming('ops-phishing').sort())
  })
})

// A fresh App each call, as a page load is.
function loadPage() {
  mounts += 1
  act(() => {
    root.render(<App key={`a${mounts}`} />)
  })
}
// The 3D game, which here is its fallback: the world cannot start.
const inGame = () => container.querySelector('[data-game3d]') !== null
const settleGame = async () => {
  for (let i = 0; i < 20 && !inGame(); i += 1) await settle()
}

describe('the READ row on the title (v1.3 R1, brief 5.1)', () => {
  // The menu's INTEL ARCHIVE and its function keys left with the menu (M1).
  // The title's READ row opens the reading screens.
  const readButton = (which: string) => container.querySelector(`[data-read="${which}"]`) as HTMLButtonElement | null

  it('opens LIBRARY from LIBRARY and the COLDVEIL Dossier from DOSSIER, and comes back to the title', async () => {
    // v1.3 R4 (brief 5.1 and 5.7): DOSSIER opens the Dossier, not the
    // Glossary, which is LIBRARY's second tab now. Since v2.0 R1 the
    // Dossier is the 3D game's room, under its own heading.
    loadPage()
    for (const [which, heading, at] of [
      ['library', 'LIBRARY', 'h1'],
      ['dossier', 'COLDVEIL DOSSIER', '[data-t3-room="dossier"] h2'],
    ] as const) {
      expect(readButton(which), `the title has no ${which.toUpperCase()}`).not.toBeNull()
      click(readButton(which)!)
      for (let i = 0; i < 40 && !(container.querySelector(at) && !container.querySelector('[data-title]')); i += 1) await settle()
      expect(container.querySelector(at)?.textContent?.trim(), `${which.toUpperCase()} did not open ${heading}`).toBe(heading)
      click(byText(/^back to title$/i)!)
      expect(container.querySelector('[data-title]'), 'not back on the title').not.toBeNull()
    }
    expect(c3.DOSSIER_HEAD).toBe('COLDVEIL DOSSIER')
  })

  it('offers CONTINUE NIGHT n above PLAY when a game is resumable, and none without one', async () => {
    loadPage()
    expect(container.querySelector('[data-continue]'), 'CONTINUE with nothing to continue').toBeNull()
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(newGame(DEFAULT_SCENARIO, 1, 'standard'), 'brief', '2026-09-29T00:00:00Z')))
    loadPage()
    // A resumable save lands straight in the game; its way out goes back.
    await settleGame()
    expect(inGame(), 'a resumable save did not resume').toBe(true)
    click([...container.querySelectorAll('[data-game3d] button')].find((b) => (b.textContent ?? '').trim() === c3.TITLE)!)
    const cont = container.querySelector('[data-continue]')
    expect(cont, 'no CONTINUE for the game in progress').not.toBeNull()
    expect(cont!.textContent?.trim()).toBe('CONTINUE NIGHT 1')
    const order = [...container.querySelectorAll('[data-continue], [data-play]')].map((b) => (b.hasAttribute('data-play') ? 'PLAY' : 'CONTINUE'))
    expect(order, 'CONTINUE is not above PLAY').toEqual(['CONTINUE', 'PLAY'])
  })
})

describe('the events a night meets (v1.2 R5b)', () => {
  const store = new LocalStorageStore()
  const metNow = () => JSON.parse(localStorage.getItem('dc-met') ?? '[]') as string[]
  // What a night with no orders draws from `state`, from the engine.
  const drawnFrom = (state: GameState) => resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)).history.at(-1)!.events
  // The prepared line (tests/policies.ts) played to the given night.
  function gameAt(turn: number, seed: number): GameState {
    let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
    while (state.status === 'playing' && state.turn < turn) state = resolveTurn(state, prepared(state), turnRng(state.seed, state.turn))
    return state
  }
  // A night that draws more than one event, one of them a move a defense
  // owned stops outright, so "every event" is tested against one a
  // landed-only record would miss. Found by search, so the fixture holds
  // whatever the numbers are.
  function nightWithABlock(): GameState {
    const isMove = (id: string) => (DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat'
    for (let seed = 1; seed <= 200; seed += 1) {
      for (let turn = 2; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
        const state = gameAt(turn, seed)
        if (state.status !== 'playing' || state.turn !== turn) break
        const drawn = drawnFrom(state)
        if (drawn.length > 1 && drawn.some((e) => isMove(e.eventId) && !e.debris && e.effectiveSeverity === 0)) return state
      }
    }
    throw new Error('no night of the prepared line draws a blocked move among others')
  }
  // The night of the operation in progress, closed the way a reload closes
  // one left in the middle: marked as begun with no orders and no answers,
  // then the page loaded again.
  async function closeNight() {
    const op = store.loadAutosave()!
    markNight({ run: runKey(op.state.seed, op.state.difficulty, op.daily?.dateKey), turn: op.state.turn, orders: NO_ORDERS, inputs: NO_INPUTS })
    loadPage()
    await settleGame()
    expect(inGame(), 'the reload did not resume the operation').toBe(true)
    const next = store.loadAutosave()
    expect(next === null || next.state.turn === op.state.turn + 1, 'the reload did not close the night').toBe(true)
  }

  it('records every event a night played here draws, blocked ones too, and nothing a load brings in', async () => {
    const state = nightWithABlock()
    const drawn = drawnFrom(state)
    expect(drawn.length).toBeGreaterThan(1)
    expect(drawn.some((e) => e.effectiveSeverity === 0), 'every event landed, so blocked ones are untested').toBe(true)
    expect(state.history.flatMap((r) => r.events).length, 'the loaded campaign has no history, so a load could record nothing').toBeGreaterThan(0)
    store.autosave(state, 'brief')
    loadPage()
    await settleGame()
    expect(inGame()).toBe(true)
    expect(metNow(), 'loading a campaign recorded its history as met').toEqual([])
    await closeNight()
    expect(metNow().sort()).toEqual([...new Set(drawn.map((e) => e.eventId))].sort())
  })

  it('counts a campaign loaded from a pasted code, which is learning, not a score', async () => {
    const state = nightWithABlock()
    // Pasted through the title's SYSTEM, where the box lives since v1.3 R1.
    loadPage()
    click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
    const box = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(box, encodeSaveCode(captureGame(state, 'brief', '2026-09-29T00:00:00Z', { dateKey: '20260929', n: 3 })))
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(byText(/^load save code$/i)!)
    await settleGame()
    expect(inGame(), 'the code did not load').toBe(true)
    expect(metNow()).toEqual([])
    await closeNight()
    expect(metNow().length, 'a pasted practice run met nothing').toBeGreaterThan(0)
    expect(metNow().sort()).toEqual([...new Set(drawnFrom(state).map((e) => e.eventId))].sort())
  })

  it('has no entry for an opportunity, so no opportunity leads to the library', () => {
    const opportunities = DEFAULT_SCENARIO.events.filter((e) => e.kind === 'opportunity')
    expect(opportunities.length, 'the deck has no opportunity, so this asserts nothing').toBeGreaterThan(0)
    for (const o of opportunities) expect(naming(o.id), `${o.id} has library entries`).toEqual([])
    // The control: a threat does.
    expect(naming('lidar-dazzle').length).toBeGreaterThan(0)
  })
})
