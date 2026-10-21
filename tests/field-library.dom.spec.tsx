// @vitest-environment jsdom
//
// The Field Library on screen (v1.2 R5b, brief 4.8 and 7.3): the screen
// itself, the menu's INTEL ARCHIVE, the event cards' "learn more", and the
// met events that FILED stamps read.
//
// GUARD R5b (b): an entry paired with an event the player has met shows
// FILED, and one that is not does not.
// GUARD R5b (c): every library link opens in a new tab with noopener and
// noreferrer.
// GUARD R5b (d): the total in the counter equals the number of entries in
// the data.
//
// Doubles, as game.dom.spec.tsx names them: the three.js frame is stubbed,
// storage is an in-memory map, and the clock is vitest's fake one.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import Game from '../src/ui/Game'
import FieldLibrary from '../src/ui/FieldLibrary'
import { DEFAULT_SCENARIO } from '../src/content'
import { SHELVES_AS_DRAFTED } from '../src/content/fieldLibraryData'
import { briefFree, resolveTurn, newGame } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { captureGame, encodeSaveCode } from '../src/persistence'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'
import { briefCopy } from '../src/ui/brief'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let mounts = 0

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
      expect(links.length, 'no links, so this asserts nothing').toBe(titles().length)
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

describe('the READ row on the title (v1.3 R1, brief 5.1)', () => {
  // The menu's INTEL ARCHIVE and its function keys left with the menu (M1).
  // The title's READ row opens the two reading screens; until R4 rebuilds
  // them, LIBRARY opens the Field Library and DOSSIER the Glossary, which
  // lists every COLDVEIL move and its technique.
  function loadPage() {
    mounts += 1
    act(() => {
      root.render(<App key={`a${mounts}`} />)
    })
  }
  const readButton = (which: string) => container.querySelector(`[data-read="${which}"]`) as HTMLButtonElement | null

  it('opens the Field Library from LIBRARY and the Glossary from DOSSIER, and comes back to the title', async () => {
    loadPage()
    for (const [which, heading] of [
      ['library', 'FIELD LIBRARY'],
      ['dossier', 'GLOSSARY'],
    ] as const) {
      expect(readButton(which), `the title has no ${which.toUpperCase()}`).not.toBeNull()
      click(readButton(which)!)
      await settle()
      expect(container.querySelector('h1')?.textContent?.trim(), `${which.toUpperCase()} did not open ${heading}`).toBe(heading)
      click(byText(/^back to title$/i)!)
      expect(container.querySelector('[data-title]'), 'not back on the title').not.toBeNull()
    }
  })

  it('offers CONTINUE TURN n above PLAY when a game is resumable, and none without one', () => {
    loadPage()
    expect(container.querySelector('[data-continue]'), 'CONTINUE with nothing to continue').toBeNull()
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(newGame(DEFAULT_SCENARIO, 1, 'standard'), 'brief', '2026-09-29T00:00:00Z')))
    loadPage()
    // A resumable save lands straight on the board; SYSTEM goes back.
    click(container.querySelector('button[aria-label="System"]')!)
    click(byText(/^Back to title$/)!)
    click(byText(/^LEAVE$/)!)
    const cont = container.querySelector('[data-continue]')
    expect(cont, 'no CONTINUE for the game in progress').not.toBeNull()
    expect(cont!.textContent?.trim()).toBe('CONTINUE TURN 1')
    const order = [...container.querySelectorAll('[data-continue], [data-play]')].map((b) => (b.hasAttribute('data-play') ? 'PLAY' : 'CONTINUE'))
    expect(order, 'CONTINUE is not above PLAY').toEqual(['CONTINUE', 'PLAY'])
  })
})

describe("the event cards' learn more", () => {
  function gameAt(turn: number, seed = 20260712, script = WIN_SCRIPT): GameState {
    let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
    while (state.status === 'playing' && state.turn < turn) state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    return state
  }
  // A night on which the intel brief is free and names a fixed move, so
  // the TONIGHT card's full brief carries the lead's technique tag and its card the lead's
  // REAL WORLD line: since v1.3 Round 0 the brief is on or off, free on
  // turn 1 (which has no fixed slot) and on the turns an allied data share
  // covers, and the empty cart these tests commit orders nothing. Found in
  // v1.3 play by search over seeds of the given line.
  function briefedWithLead(script = WIN_SCRIPT): GameState {
    for (const seed of [20260712, 11, 41, 104, ...Array.from({ length: 100 }, (_, i) => i + 1)]) {
      for (let turn = 2; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
        const state = gameAt(turn, seed, script)
        if (state.status === 'playing' && state.turn === turn && briefFree(state) && briefCopy(state).tag) return state
      }
    }
    throw new Error('no turn of any line searched carries a technique tag')
  }
  function render(state: GameState) {
    mounts += 1
    act(() => {
      root.render(<Game key={`g${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
    })
  }
  // EXECUTE is a plain button since v1.3 Round 0 (the hold went with the
  // dwell), and a synthetic Enter does not click a button in jsdom, so the
  // tests click it.
  const execute = () => {
    const button = container.querySelector('nav[aria-label="Actions"] button[data-execute]')
    expect(button, 'EXECUTE is not on screen').not.toBeNull()
    click(button!)
  }
  const beatShown = () => container.textContent!.match(/beat (\d+) of \d+/)?.[1]
  // Every beat waits for a tap since v1.3 Round 0, so nothing but the
  // player moves a playback on: Next, the card, or Space or Enter with
  // nothing focused, which is the one a dialog over the board must keep
  // from reaching the turn behind it.
  const nextBeat = () => click(byText(/^Next$/)!)
  const space = () =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
  const metNow = () => JSON.parse(localStorage.getItem('dc-met') ?? '[]') as string[]
  const escape = () =>
    act(() => {
      ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
  // What the empty cart's turn from `state` draws, from the engine.
  const drawnFrom = (state: GameState) => resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)).history.at(-1)!.events
  // Playback, tapped through, until a threat's card carries its link.
  function untilLearnMore(): HTMLButtonElement {
    for (let i = 0; i < 60 && byText(/^Skip/); i += 1) {
      const link = container.querySelector<HTMLButtonElement>('button[data-learn-more]')
      if (link) return link
      nextBeat()
    }
    throw new Error('no threat card reached the screen')
  }
  // The entries a threat's filtered view may show: those naming it, and
  // SPARTA's when the threat carries a SPARTA technique.
  const allowedFor = (id: string) => {
    const sparta = DEFAULT_SCENARIO.events.find((e) => e.id === id)!.techniqueRefs.some((r) => r.framework === 'SPARTA')
    return [...naming(id), ...(sparta ? [SPARTA] : [])]
  }

  it('records every event a turn resolved here draws, held ones and opportunities too, and nothing a load brings in', () => {
    const state = gameAt(3)
    const drawn = drawnFrom(state)
    // The fixture turn draws more than one event, and one that did not
    // land, so "every event" is tested against one a landed-only record
    // would miss.
    expect(drawn.length).toBeGreaterThan(1)
    expect(drawn.some((e) => e.effectiveSeverity === 0), 'every event landed, so held ones are untested').toBe(true)
    expect(state.history.flatMap((r) => r.events).length, 'the loaded campaign has no history, so a load could record nothing').toBeGreaterThan(0)
    render(state)
    expect(metNow(), 'loading a campaign recorded its history as met').toEqual([])
    execute()
    expect(metNow().sort()).toEqual([...new Set(drawn.map((e) => e.eventId))].sort())
  })

  it('counts a campaign loaded from a pasted code, which is learning, not a score', () => {
    const state = gameAt(4)
    // Pasted through SYSTEM, where the box lives since v1.3 R1.
    render(gameAt(1))
    click(container.querySelector('button[aria-label="System"]')!)
    const box = container.querySelector('[data-sheet="system"] textarea[aria-label="save code"]') as HTMLTextAreaElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(box, encodeSaveCode(captureGame(state, 'brief', '2026-09-29T00:00:00Z', { dateKey: '20260929', n: 3 })))
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(byText(/^load save code$/i)!)
    expect(metNow()).toEqual([])
    execute()
    expect(metNow().length, 'a pasted practice run met nothing').toBeGreaterThan(0)
  })

  it('opens the library over the board at that threat, holds the playback, and lets it go on after Escape', async () => {
    render(gameAt(4))
    execute()
    const link = untilLearnMore()
    const id = link.getAttribute('data-learn-more')!
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat').toBe('threat')
    expect(link.getAttribute('aria-haspopup')).toBe('dialog')
    link.focus()
    click(link)
    await settle()
    const overlay = container.querySelector('[data-library-overlay]')!
    expect(overlay, 'learn more opened nothing').not.toBeNull()
    expect(overlay.querySelector('[data-library-filter]')!.getAttribute('data-library-filter')).toBe(id)
    expect(titles().sort()).toEqual(allowedFor(id).sort())
    expect(container.querySelector('main[data-board]')!.hasAttribute('inert'), 'the board behind is not inert').toBe(true)
    expect(document.querySelectorAll('main').length, 'a second main').toBe(1)
    expect(document.querySelectorAll('h1').length, 'a second h1').toBeLessThanOrEqual(1)
    // Held: the beat on screen stays while the library is open, and a
    // Space meant for the library does not step it.
    const held = beatShown()
    expect(held, 'no beat on screen, so holding it proves nothing').toBeDefined()
    space()
    expect(beatShown(), 'playback ran on behind the library').toBe(held)
    escape()
    expect(container.querySelector('[data-library-overlay]'), 'Escape did not close the library').toBeNull()
    expect(byText(/^Skip/), 'Escape on the library skipped the playback').toBeDefined()
    expect(document.activeElement?.getAttribute('data-learn-more'), 'focus did not come back to the link').toBe(id)
    // Let go: once the library is closed, the same Space steps the turn.
    space()
    expect(beatShown() !== held || !byText(/^Skip/), 'playback stayed held after the library closed').toBe(true)
  })

  it('returns focus to a tapped link, which a phone never focused', async () => {
    render(gameAt(4))
    execute()
    const link = untilLearnMore()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    expect(document.activeElement).toBe(document.body)
    click(link)
    await settle()
    escape()
    expect(document.activeElement, 'focus fell to the page').toBe(link)
  })

  it('from the intel card, closes the card, opens the library, and returns focus to what opened the card', async () => {
    // Under the intel brief COLDVEIL's card names the lead threat with its
    // REAL WORLD line. Its button is in the TONIGHT card's full brief since
    // v1.3 R2, a chunk of its own.
    render(briefedWithLead())
    click(container.querySelector('button[data-full-brief]')!)
    await settle()
    const banner = container.querySelector<HTMLButtonElement>('button[aria-label="Threat intel"]')!
    expect(banner, 'the full brief has no intel button').not.toBeNull()
    banner.focus()
    click(banner)
    await settle()
    const link = container.querySelector<HTMLButtonElement>('section[data-intel-card] button[data-learn-more]')
    expect(link, 'the intel card has no learn more').not.toBeNull()
    click(link!)
    await settle()
    expect(container.querySelector('section[data-intel-card]'), 'the intel card stayed open under the library').toBeNull()
    expect(container.querySelector('[data-library-overlay]')).not.toBeNull()
    escape()
    expect(container.querySelector('[data-library-overlay]')).toBeNull()
    expect(document.activeElement, 'focus did not come back to what opened the card').toBe(banner)
  })

  it('holds the playback under the intel card too', async () => {
    render(gameAt(4))
    execute()
    const held = beatShown()
    expect(held).toBeDefined()
    // A tile's card: COLDVEIL's is off the board with the TONIGHT card
    // while a night plays (v1.3 R2).
    click(container.querySelector('button[data-asset-id]')!)
    await settle()
    expect(container.querySelector('section[data-intel-card]'), 'the intel card did not open').not.toBeNull()
    space()
    expect(beatShown(), 'playback ran on behind the intel card').toBe(held)
    // The positive control: with the card closed, the same Space steps it.
    escape()
    expect(container.querySelector('section[data-intel-card]')).toBeNull()
    space()
    expect(beatShown() !== held || !byText(/^Skip/), 'a Space with no card open did not step the playback').toBe(true)
  })

  it('carries the link on the aftermath card, the only event card a skipped playback leaves', () => {
    // INSTANT left with the speeds in v1.3 Round 0; a player who skips the
    // playback lands on the aftermath, as INSTANT did, and reads the turn
    // there.
    const state = gameAt(4)
    expect(drawnFrom(state).some((e) => (DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind ?? 'threat') === 'threat')).toBe(true)
    render(state)
    execute()
    click(byText(/^Skip/)!)
    const aftermath = container.querySelector('section[aria-label^="Aftermath"]')
    expect(aftermath, 'no aftermath card').not.toBeNull()
    expect(aftermath!.querySelector('button[data-learn-more]'), 'the aftermath card has no learn more').not.toBeNull()
    // The ledger's own REAL WORLD lines keep theirs too, now that the list
    // above the ledger (critique row M7) carries one per threat as well.
    expect(aftermath!.querySelector('details [data-real-world] + button[data-learn-more]'), 'the ledger lost its learn more').not.toBeNull()
  })

  it('shows no link on an opportunity, which has no entries', () => {
    // The fixture turn draws an opportunity, and its card is seen. The
    // six-turn campaign of v1.3 Round 0 rolls one at 0.2 on turns 2 to 5,
    // and seed 20260712 draws none, so the prepared line on seed 5, whose
    // turn 3 draws the appropriations rider, is the fixture.
    const state = gameAt(3, 5)
    const opportunities = drawnFrom(state).filter((e) => DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind === 'opportunity')
    expect(opportunities.length, 'the turn draws no opportunity, so this asserts nothing').toBeGreaterThan(0)
    const names = opportunities.map((e) => DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)!.name)
    const ids = new Set(opportunities.map((e) => e.eventId))
    render(state)
    execute()
    // Every beat of the turn, tapped through, and the aftermath it ends on.
    let seen = false
    for (let i = 0; i < 60; i += 1) {
      if (names.some((n) => container.textContent!.includes(n))) seen = true
      for (const b of container.querySelectorAll('button[data-learn-more]')) expect(ids.has(b.getAttribute('data-learn-more')!), 'an opportunity card links to the library').toBe(false)
      if (!byText(/^Skip/)) break
      nextBeat()
    }
    expect(byText(/^Skip/), 'the playback never finished').toBeUndefined()
    expect(seen, 'no opportunity card was ever on screen').toBe(true)
  })
})
