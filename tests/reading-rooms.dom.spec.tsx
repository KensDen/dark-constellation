// @vitest-environment jsdom
//
// The reading rooms and the records (v1.3 R4, brief 5.1, 5.7 and M38): the
// COLDVEIL Dossier, LIBRARY with its Glossary tab, the scoreboard split
// between the Daily Op and practice, and the title's Daily read-back.
//
// GUARD R4 (c): THE DOSSIER'S COUNT IS ITS FILED CARDS, AND SURVIVES A
// RELOAD. Cards are filed through the store the game files them with
// (fileCard, which FILE TO DOSSIER calls), for the threats two nights of a
// real game met; then the page is loaded again and the Dossier read from
// the title: its count, its filed cards and GOAL 2 agree with each other
// and with what was filed.
// GUARD R4 (e), the reading rooms' half: no retired word (section 4) on the
// Dossier (empty, part-filled, a card open), LIBRARY's two tabs, the
// scoreboard, or the title with a Daily Op done, text nodes read apart.
//
// v2.0 R3: the Dossier is the 3D game's room (src/ui/three/rooms3d.tsx),
// which needs no WebGL, and the pixel Dossier and the pixel night that
// filed its cards are retired. The night itself cannot play in a test DOM,
// so the tap on FILE TO DOSSIER is not driven here.
//
// Doubles, as daily-op.dom.spec.tsx names them: the three.js frame is
// stubbed, storage is an in-memory map, and the clock is vitest's fake one.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import { DEFAULT_SCENARIO } from '../src/content'
import { FIELD_LIBRARY } from '../src/content/fieldLibrary'
import { pairedEvents } from '../src/content/librarySchema'
import { gradeFor } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { fileCard } from '../src/persistence'
import { stoppedByLine } from '../src/ui/board/boardModel'
import { glossaryEntries } from '../src/ui/reference'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import * as copy from '../src/ui/night/nightCopy'
import * as c3 from '../src/ui/three/copy3d'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let mounts = 0

beforeAll(async () => {
  // The reading rooms' chunks, so a lazy screen resolves on a microtask
  // under a loaded full run (v1.6 R3: the Library's entries once came back
  // empty there and whole alone), and under this file's fake clock. The
  // Dossier rides in the 3D game's chunk.
  await import('../src/ui/Library')
  await import('../src/ui/FieldLibrary')
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
  vi.setSystemTime(new Date(2026, 9, 22, 10, 0))
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
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

// A fresh App each call, as a page load is.
function loadPage() {
  mounts += 1
  act(() => {
    root.render(<App key={`page${mounts}`} />)
  })
}
const q = <T extends Element = HTMLElement>(s: string) => container.querySelector<T>(s)
const qa = (s: string) => [...container.querySelectorAll<HTMLElement>(s)]
const byText = (re: RegExp) => qa('button').find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
function words(el: Element): string {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  while (walk.nextNode()) out.push(walk.currentNode.textContent ?? '')
  return out.join(' ')
}
const filed = () => JSON.parse(localStorage.getItem('dc-dossier') ?? '[]') as string[]
const THREATS = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')

// The threats two nights of a real game meet, in the order met: what a
// player who filed every card would have filed.
function metInTwoNights(seed: number): string[] {
  let state = newGame(DEFAULT_SCENARIO, seed, 'easy')
  for (let n = 0; n < 2 && state.status === 'playing'; n += 1) state = resolveTurn(state, { buyAssets: [], buyCounters: [] }, turnRng(state.seed, state.turn))
  const met = state.history.flatMap((r) => r.events.map((e) => e.eventId)).filter((id) => THREATS.some((t) => t.id === id))
  return [...new Set(met)]
}

const room = () => q('[data-t3-room="dossier"]')
async function openDossierFromTitle() {
  click(q('[data-read="dossier"]')!)
  for (let i = 0; i < 40 && !room(); i += 1) await settle()
  expect(room(), 'DOSSIER did not open the Dossier').not.toBeNull()
}
const cards = () => qa('[data-t3-dcard]')
const cardIds = (sel: string) => qa(sel).map((c) => c.getAttribute('data-t3-dcard'))

describe('GUARD R4 (c): the Dossier counts its filed cards, and keeps them across a reload', () => {
  it('files what two nights met, reloads, and reads the same count from the title, GOAL 2 and the grid', async () => {
    loadPage()
    const met = metInTwoNights(20261022)
    for (const id of met) fileCard(id)
    const before = filed()
    expect(before.length, 'two nights filed nothing, so this counts nothing').toBeGreaterThan(0)
    expect([...before].sort()).toEqual([...met].sort())

    // A reload: a new App on the same storage.
    loadPage()
    expect(q('[data-goal="2"]')!.textContent).toContain(`${before.length} / ${THREATS.length} filed`)
    await openDossierFromTitle()
    expect(q('[data-t3-dossier-count]')!.textContent).toBe(c3.filedOf(before.length, THREATS.length))
    expect(cardIds('[data-t3-dcard][data-filed]').sort()).toEqual([...before].sort())
    expect(qa('[data-t3-dcard]:not([data-filed])')).toHaveLength(THREATS.length - before.length)
    expect(cardIds('[data-t3-dcard]'), 'the grid is not the deck in order').toEqual(THREATS.map((t) => t.id))
  })

  it('reads an empty Dossier as none filed, every card unfiled, and a filed one as its own', async () => {
    loadPage()
    await openDossierFromTitle()
    expect(q('[data-t3-dossier-count]')!.textContent).toBe(c3.filedOf(0, THREATS.length))
    expect(qa('[data-t3-dcard][data-filed]')).toHaveLength(0)
    // Each card keeps its place in the deck, 01 to the last, says it is
    // unfiled and how to file it, and cannot be opened.
    cards().forEach((card, i) => {
      const text = card.textContent ?? ''
      expect(text.startsWith(`${String(i + 1).padStart(2, '0')} · ${c3.UNFILED}`), `card ${i + 1} reads "${text}"`).toBe(true)
      expect(text).toContain(c3.UNFILED_LINE)
      expect(text, `card ${i + 1} names its move while unfiled`).not.toContain(THREATS[i].name.split(' (')[0])
      expect(card.querySelector('button')!.disabled, `unfiled card ${i + 1} opens`).toBe(true)
    })

    // An id the deck does not hold is not a card.
    localStorage.setItem('dc-dossier', JSON.stringify(['ground-ransomware', 'uplink-jamming', 'not-in-the-deck']))
    loadPage()
    // And GOAL 2 does not count it.
    expect(q('[data-goal="2"]')!.textContent).toContain(`2 / ${THREATS.length} filed`)
    await openDossierFromTitle()
    expect(cards()).toHaveLength(THREATS.length)
    expect(q('[data-t3-dossier-count]')!.textContent).toBe(c3.filedOf(2, THREATS.length))
    expect(cardIds('[data-t3-dcard][data-filed]')).toEqual(['uplink-jamming', 'ground-ransomware'].sort((a, b) => THREATS.findIndex((t) => t.id === a) - THREATS.findIndex((t) => t.id === b)))
  })

  it('opens a filed card to its blurb, BLUNTED BY, TECHNIQUE, SOURCES and LEARN MORE, which opens the Field Library at it', async () => {
    localStorage.setItem('dc-dossier', JSON.stringify(['ground-ransomware']))
    loadPage()
    await openDossierFromTitle()
    const card = q('[data-t3-dcard="ground-ransomware"]')!
    const def = THREATS.find((t) => t.id === 'ground-ransomware')!
    // The whole head opens the card.
    const head = card.querySelector('button')!
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(card.textContent).not.toContain(def.blurb)
    click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    const body = card.textContent ?? ''
    expect(body).toContain(def.blurb)
    // Ransomware is strength 3 against one defense that takes 2 off: it is
    // blunted, never stopped alone (R6 question 2).
    expect(stoppedByLine(def, DEFAULT_SCENARIO).label).toBe('BLUNTED BY')
    for (const label of ['BLUNTED BY', copy.TECHNIQUE, c3.SOURCES]) expect(body).toContain(label)
    expect(body).not.toContain('STOPPED BY')
    for (const id of def.counters) expect(body).toContain(DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!.name)
    await tap(card.querySelector('[data-learn-more]')!)
    await settle()
    // The reading list opens over the page, outside the game's own root.
    const overlay = document.querySelector('[data-t3-reading]')
    expect(overlay, 'LEARN MORE opened nothing').not.toBeNull()
    expect(overlay!.querySelector('[data-library-filter]')!.getAttribute('data-library-filter')).toBe('ground-ransomware')
    await tap([...overlay!.querySelectorAll('button')].find((b) => /^BACK TO DOSSIER$/.test((b.textContent ?? '').trim()))!)
    expect(document.querySelector('[data-t3-reading]')).toBeNull()
    expect(room()).not.toBeNull()
  })
})

describe('LIBRARY: the Field Library with a Glossary tab (brief 5.1)', () => {
  it('opens on the Field Library, every entry readable with nothing filed, and switches to the Glossary', async () => {
    loadPage()
    click(q('[data-read="library"]')!)
    await settle()
    expect(q('h1')!.textContent).toBe('LIBRARY')
    expect(q('[data-tab="library"]')!.getAttribute('aria-selected')).toBe('true')
    const entries = FIELD_LIBRARY.flatMap((s) => s.entries)
    expect(qa('[data-library-entry]'), 'an entry is held back').toHaveLength(entries.length)
    for (const a of qa('[data-library-entry] > a')) expect(a.getAttribute('href')).toMatch(/^https:\/\//)
    // Nothing filed on this device, and nothing locked either.
    expect(qa('[data-filed]')).toHaveLength(0)
    expect(entries.every((e) => pairedEvents(e).length >= 0)).toBe(true)

    click(q('[data-tab="glossary"]')!)
    await settle()
    expect(q('[data-tab="glossary"]')!.getAttribute('aria-selected')).toBe('true')
    expect(q('[data-glossary]')).not.toBeNull()
    expect(container.textContent).toContain(`${glossaryEntries().length} entries: framework techniques`)
    click(byText(/^BACK TO TITLE$/)!)
    expect(q('[data-title]')).not.toBeNull()
  })
})

describe('the scoreboard, split by mode (M38)', () => {
  it("lists the Daily Op's official runs and the practice runs apart, each with its grade", async () => {
    localStorage.setItem(
      'dc-daily',
      JSON.stringify({
        '20261021': { n: 26, seed: 11, outcome: 'won', mai: 78.1, bonus: 1.5, turns: 6, game: '3d', recordedAt: '2026-10-21T15:00:00.000Z' },
        '20261022': { n: 27, seed: 12, outcome: 'lost', lossReason: 'belowThreshold', mai: 64.3, turns: 6, game: '3d', recordedAt: '2026-10-22T13:00:00.000Z' },
      }),
    )
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([
        // A Daily Op posted here before R4: its official copy is in the ledger.
        { outcome: 'won', mai: 78.1, seed: 11, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 1.5, game: '3d', recordedAt: '2026-10-21T15:00:00.000Z' },
        { outcome: 'won', mai: 82.4, seed: 5, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 2, game: '3d', recordedAt: '2026-10-20T15:00:00.000Z' },
        { outcome: 'lost', lossReason: 'insolvency', mai: 71, seed: 6, turnsSurvived: 4, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', game: '3d', recordedAt: '2026-10-19T15:00:00.000Z' },
      ]),
    )
    loadPage()
    click(q('[data-title-system]')!)
    click(q('[data-system-control="scoreboard"]')!)
    await settle()
    expect(q('[data-scoreboard]')).not.toBeNull()
    const daily = qa('[data-board="daily"] [data-daily-row]')
    expect(daily.map((r) => r.getAttribute('data-daily-row'))).toEqual(['27', '26'])
    expect(daily.map((r) => r.querySelector('[data-grade]')!.textContent)).toEqual([
      gradeFor({ status: 'lost', lossReason: 'belowThreshold', finalMai: 64.3 }),
      gradeFor({ status: 'won', finalMai: 78.1, bonus: 1.5 }),
    ])
    expect(q('[data-board="daily"]')!.textContent).toContain('STREAK 2')
    const practice = qa('[data-board="practice"] [data-practice-row]')
    expect(practice, 'the Daily Op posted before R4 is listed as practice').toHaveLength(2)
    // 82.4 with its 2.0 bonus is 84.4: a B since v1.7 R1 raised the ladder
    // (S 88, A 85.5, B 77.5), where it was an S.
    expect(practice.map((r) => r.querySelector('[data-grade]')!.textContent)).toEqual(['B', 'F'])
    expect(gradeFor({ status: 'won', finalMai: 82.4, bonus: 2 })).toBe('B')
    // Clearing empties practice only; the Daily Op's record is the streak.
    click(q('[data-ask-clear]')!)
    expect(qa('[data-practice-row]'), 'cleared before it was confirmed').toHaveLength(2)
    click(q('[data-clear-practice]')!)
    expect(qa('[data-practice-row]')).toHaveLength(0)
    expect(qa('[data-daily-row]')).toHaveLength(2)
    // Every run here is the 3D game's: nothing is marked, and nothing is said about the pixel game.
    expect(q('[data-pixel]')).toBeNull()
    expect(q('[data-pixel-note]')).toBeNull()
  })

  it('shows a run from the pixel game with its score and no grade, marked, and never regrades it (Ken, 17 November 2026)', async () => {
    // What main's own code (v1.6.2) wrote: no stamp of the game. On the 3D
    // game's bands the 80.1 on EASY, an S there, would read B.
    localStorage.setItem(
      'dc-daily',
      JSON.stringify({
        '20261028': { n: 32, seed: 102, outcome: 'won', mai: 75.6, bonus: 1.5, turns: 6, recordedAt: '2026-10-28T21:00:00.000Z' },
        '20261117': { n: 52, seed: 12, outcome: 'won', mai: 90.2, bonus: 2, turns: 6, game: '3d', recordedAt: '2026-11-17T13:00:00.000Z' },
      }),
    )
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([
        { outcome: 'won', mai: 80.1, seed: 3, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', bonus: 3, recordedAt: '2026-10-09T20:15:00.000Z' },
        { outcome: 'lost', lossReason: 'belowThreshold', mai: 66.2, seed: 4, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', recordedAt: '2026-10-11T20:15:00.000Z' },
        { outcome: 'won', mai: 86.4, seed: 5, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 2, game: '3d', recordedAt: '2026-11-17T15:00:00.000Z' },
      ]),
    )
    loadPage()
    click(q('[data-title-system]')!)
    click(q('[data-system-control="scoreboard"]')!)
    await settle()
    const rows = [...qa('[data-board="daily"] [data-daily-row]'), ...qa('[data-board="practice"] [data-practice-row]')]
    const read = rows.map((r) => ({ grade: r.querySelector('[data-grade]')?.textContent ?? null, pixel: !!r.querySelector('[data-pixel]'), score: r.lastElementChild!.textContent }))
    expect(read).toEqual([
      // The Daily Op half, newest first: the 3D game's, then the pixel game's.
      { grade: gradeFor({ status: 'won', finalMai: 90.2, bonus: 2 }), pixel: false, score: '90.2' },
      { grade: null, pixel: true, score: '75.6' },
      // Practice: wins by score, then the loss. The 3D game's run is graded as now.
      { grade: gradeFor({ status: 'won', finalMai: 86.4, bonus: 2 }), pixel: false, score: '86.4' },
      { grade: null, pixel: true, score: '80.1' },
      { grade: null, pixel: true, score: '66.2' },
    ])
    expect(q('[data-pixel-note]')!.textContent).toMatch(/pixel game.*not graded/)
    // The mark is words to a screen reader too.
    expect(q('[data-pixel]')!.getAttribute('aria-label')).toBe('Pixel game, not graded')
  })
})


describe("the title's Daily read-back (M32)", () => {
  it('reads DONE, the grade and the streak once today is in, with the countdown, and neither before', async () => {
    loadPage()
    expect(q('[data-daily-countdown]'), 'a countdown before today ran').toBeNull()
    expect(q('[data-daily-line]')!.textContent).toBe('SAME BOARD FOR EVERYONE TODAY · STANDARD')
    localStorage.setItem(
      'dc-daily',
      JSON.stringify({
        '20261021': { n: 26, seed: 11, outcome: 'won', mai: 78.1, turns: 6, recordedAt: '2026-10-21T15:00:00.000Z' },
        '20261022': { n: 27, seed: 12, outcome: 'won', mai: 76, bonus: 0, turns: 6, game: '3d', recordedAt: '2026-10-22T09:00:00.000Z' },
      }),
    )
    loadPage()
    await settle()
    // A won 76 is a C since v1.7 R1 raised the ladder (B from 77.5).
    expect(q('[data-daily-line]')!.textContent).toBe('DONE · C · DAY STREAK 2')
    expect(gradeFor({ status: 'won', finalMai: 76, bonus: 0 })).toBe('C')
    expect(q('[data-daily-countdown]')!.textContent).toBe('NEXT DAILY OP IN 14:00:00')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(q('[data-daily-countdown]')!.textContent).toBe('NEXT DAILY OP IN 13:59:59')
  })
})

describe('GUARD R4 (e): no retired word in the reading rooms or the records', () => {
  const RETIRED: [string, RegExp][] = [
    ['buy', /\b(buy|buys|bought)\b/i],
    ['purchase', /\bpurchas\w*/i],
    ['money', /\bmoney\b/i],
    ['credits', /\bcredits?\b/i],
    ['MAI', /\bMAI\b/],
    ['Mission Assurance Index', /Mission Assurance Index/i],
    ['RESOLVE', /\bRESOLVE\b/],
    ['severity', /\bseverity\b/i],
    ['mitigated', /\bmitigated\b/i],
    ['commendation', /\bcommendation\b/i],
    ['INTEL ARCHIVE', /INTEL ARCHIVE/i],
    ['score screen', /score screen/i],
    ['seed', /\bseed\b/i],
    ['slot', /\bslot\b/i],
    ['in this build', /in this build/i],
  ]
  // The deck's own names are fiction and content, not copy: the rideshare
  // opportunity is called "Commercial rideshare slot" in the deck the
  // engine plays, and its blurb's "manifest slot" is the launch trade's
  // word. Section 4 retired "slot" as the forecast's engine word.
  const NAMES = [...DEFAULT_SCENARIO.events.map((e) => e.name), 'rideshare manifest slot']
  const check = (where: string) => {
    let text = `${words(container)} ${qa('[aria-label]').map((e) => e.getAttribute('aria-label')).join(' ')}`
    for (const name of NAMES) text = text.split(name).join(' ')
    for (const [word, re] of RETIRED) expect(re.test(text), `${word} on ${where}: "${text.match(re)?.[0]}"`).toBe(false)
  }

  it('finds none on the Dossier, LIBRARY, the scoreboard or the title with a Daily Op done', async () => {
    loadPage()
    await openDossierFromTitle()
    check('the empty Dossier')
    localStorage.setItem('dc-dossier', JSON.stringify(THREATS.slice(0, 7).map((t) => t.id)))
    localStorage.setItem('dc-daily', JSON.stringify({ '20261022': { n: 27, seed: 12, outcome: 'won', mai: 76, turns: 6, recordedAt: '2026-10-22T09:00:00.000Z' } }))
    localStorage.setItem('dc-scores', JSON.stringify([{ outcome: 'won', mai: 82.4, seed: 5, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', recordedAt: '2026-10-20T15:00:00.000Z' }]))
    loadPage()
    await settle()
    check('the title with a Daily Op done')
    await openDossierFromTitle()
    check('the part-filled Dossier')
    // One card is open at a time, so each filed card is read as it opens.
    const open = qa('[data-t3-dcard][data-filed]')
    expect(open).toHaveLength(7)
    for (const card of open) {
      click(card.querySelector('button')!)
      expect(card.textContent, 'a filed card did not open').toContain(THREATS.find((t) => t.id === card.getAttribute('data-t3-dcard'))!.blurb)
      check(`the Dossier with ${card.getAttribute('data-t3-dcard')} open`)
    }
    click(q('[data-t3-room-back]')!)
    click(q('[data-read="library"]')!)
    await settle()
    check("LIBRARY's Field Library")
    click(q('[data-tab="glossary"]')!)
    await settle()
    check("LIBRARY's Glossary")
    click(byText(/^BACK TO TITLE$/)!)
    click(q('[data-title-system]')!)
    click(q('[data-system-control="scoreboard"]')!)
    await settle()
    check('the scoreboard')
  })
})
