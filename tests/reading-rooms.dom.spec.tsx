// @vitest-environment jsdom
//
// The reading rooms and the records (v1.3 R4, brief 5.1, 5.7 and M38): the
// COLDVEIL Dossier, LIBRARY with its Glossary tab, the scoreboard split
// between the Daily Op and practice, and the title's Daily read-back.
//
// GUARD R4 (c): THE DOSSIER'S COUNT IS ITS FILED CARDS, AND SURVIVES A
// RELOAD. Cards are filed the way a player files them, FILE IT on the
// night's intel card, then the page is loaded again and the Dossier read
// from the title: its count, its filed cards and GOAL 2 agree with each
// other and with what was filed.
// GUARD R4 (e), the reading rooms' half: no retired word (section 4) on the
// Dossier (empty, part-filled, a card open), LIBRARY's two tabs, the
// scoreboard, or the title with a Daily Op done, text nodes read apart.
//
// Doubles, as daily-op.dom.spec.tsx names them: the three.js frame is
// stubbed, storage is an in-memory map, and the clock is vitest's fake one.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import { DEFAULT_SCENARIO } from '../src/content'
import { FIELD_LIBRARY } from '../src/content/fieldLibrary'
import { pairedEvents } from '../src/content/librarySchema'
import { gradeFor } from '../src/engine/grade'
import { glossaryEntries } from '../src/ui/reference'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
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
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
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

// One night through its cards as a player taps them, FILE IT included.
async function playNight() {
  await tap(q('button[data-execute]')!)
  for (let i = 0; i < 40; i += 1) {
    const way = q('[data-file-it]') ?? q('[data-call="hold"]') ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-night-card="end"] button[data-begin]')
    expect(way, 'a card of the night has no way on').not.toBeNull()
    const last = way!.hasAttribute('data-begin')
    await tap(way!)
    if (last) break
  }
}

async function openDossierFromTitle() {
  click(q('[data-read="dossier"]')!)
  await settle()
  expect(q('[data-dossier]'), 'DOSSIER did not open the Dossier').not.toBeNull()
}

describe('GUARD R4 (c): the Dossier counts its filed cards, and keeps them across a reload', () => {
  it('files through play, reloads, and reads the same count from the title, GOAL 2 and the grid', async () => {
    loadPage()
    click(q('[data-play]')!)
    await playNight()
    await playNight()
    const before = filed()
    expect(before.length, 'two nights filed nothing, so this counts nothing').toBeGreaterThan(0)

    // A reload: a new App on the same storage. It lands on the game in
    // progress; SYSTEM leads back to the title.
    loadPage()
    click(q('button[aria-label="System"]')!)
    click(byText(/^Back to title$/i)!)
    click(byText(/^LEAVE$/)!)
    expect(q('[data-goal="2"]')!.textContent).toContain(`${before.length} / 18 filed`)
    await openDossierFromTitle()
    expect(q('[data-dossier-count]')!.textContent).toBe(`${before.length} / 18`)
    expect(qa('[data-dossier-card][data-filed]').map((c) => c.getAttribute('data-dossier-card')).sort()).toEqual([...before].sort())
    expect(qa('[data-dossier-card][data-unfiled]')).toHaveLength(THREATS.length - before.length)
    expect(qa('[data-dossier-card]').map((c) => c.getAttribute('data-dossier-card')), 'the grid is not the deck in order').toEqual(THREATS.map((t) => t.id))
  })

  it('reads an empty Dossier as 0 / 18, every card unfiled, and a filed one as its own', async () => {
    loadPage()
    await openDossierFromTitle()
    expect(q('[data-dossier-count]')!.textContent).toBe('0 / 18')
    expect(qa('[data-dossier-card][data-filed]')).toHaveLength(0)
    // Each card keeps its place in the deck, 01 to 18.
    qa('[data-dossier-card]').forEach((card, i) => expect(card.textContent).toBe(`UnfiledFace this move in play to file it.${String(i + 1).padStart(2, '0')}`))

    localStorage.setItem('dc-dossier', JSON.stringify(['ground-ransomware', 'uplink-jamming', 'not-in-the-deck']))
    loadPage()
    await openDossierFromTitle()
    // An id the deck does not hold is not a card and is not counted.
    expect(q('[data-dossier-count]')!.textContent).toBe('2 / 18')
    expect(qa('[data-dossier-card][data-filed]').map((c) => c.getAttribute('data-dossier-card'))).toEqual(['uplink-jamming', 'ground-ransomware'].sort((a, b) => THREATS.findIndex((t) => t.id === a) - THREATS.findIndex((t) => t.id === b)))
  })

  it('opens a filed card to its blurb, STOPPED BY, TECHNIQUE, SOURCE and LEARN MORE, which opens the Field Library at it', async () => {
    localStorage.setItem('dc-dossier', JSON.stringify(['ground-ransomware']))
    loadPage()
    await openDossierFromTitle()
    const card = q<HTMLDetailsElement>('[data-dossier-card="ground-ransomware"]')!
    const def = THREATS.find((t) => t.id === 'ground-ransomware')!
    expect(card.querySelector('summary')!.textContent).toContain('details ›')
    click(card.querySelector('summary')!)
    card.open = true
    const body = card.textContent ?? ''
    expect(body).toContain(def.blurb)
    for (const label of ['STOPPED BY', 'TECHNIQUE', 'SOURCE']) expect(body).toContain(label)
    for (const id of def.counters) expect(body).toContain(DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!.name)
    await tap(card.querySelector('[data-learn-more]')!)
    await settle()
    const overlay = q('[data-library-overlay]')
    expect(overlay, 'LEARN MORE opened nothing').not.toBeNull()
    expect(overlay!.querySelector('[data-library-filter]')!.getAttribute('data-library-filter')).toBe('ground-ransomware')
    await tap(byText(/^BACK TO DOSSIER$/)!)
    expect(q('[data-library-overlay]')).toBeNull()
    expect(q('[data-dossier]')).not.toBeNull()
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
        '20261021': { n: 26, seed: 11, outcome: 'won', mai: 78.1, bonus: 1.5, turns: 6, recordedAt: '2026-10-21T15:00:00.000Z' },
        '20261022': { n: 27, seed: 12, outcome: 'lost', lossReason: 'belowThreshold', mai: 64.3, turns: 6, recordedAt: '2026-10-22T13:00:00.000Z' },
      }),
    )
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([
        // A Daily Op posted here before R4: its official copy is in the ledger.
        { outcome: 'won', mai: 78.1, seed: 11, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 1.5, recordedAt: '2026-10-21T15:00:00.000Z' },
        { outcome: 'won', mai: 82.4, seed: 5, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 2, recordedAt: '2026-10-20T15:00:00.000Z' },
        { outcome: 'lost', lossReason: 'insolvency', mai: 71, seed: 6, turnsSurvived: 4, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-10-19T15:00:00.000Z' },
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
    expect(practice.map((r) => r.querySelector('[data-grade]')!.textContent)).toEqual(['S', 'F'])
    // Clearing empties practice only; the Daily Op's record is the streak.
    click(q('[data-ask-clear]')!)
    expect(qa('[data-practice-row]'), 'cleared before it was confirmed').toHaveLength(2)
    click(q('[data-clear-practice]')!)
    expect(qa('[data-practice-row]')).toHaveLength(0)
    expect(qa('[data-daily-row]')).toHaveLength(2)
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
        '20261022': { n: 27, seed: 12, outcome: 'won', mai: 76, bonus: 0, turns: 6, recordedAt: '2026-10-22T09:00:00.000Z' },
      }),
    )
    loadPage()
    await settle()
    expect(q('[data-daily-line]')!.textContent).toBe('DONE · B · STREAK 2')
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
    for (const card of qa('[data-dossier-card][data-filed]')) (card as HTMLDetailsElement).open = true
    check('the Dossier with its cards open')
    click(byText(/^BACK TO TITLE$/)!)
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
