// @vitest-environment jsdom
//
// The score screen (v1.2 R5, brief 7.2), rendered on its own with real
// finished campaigns from the engine. The numbers it shows are read from
// src/engine/grade.ts, whose own suite holds them to the engine; this
// holds the screen to those numbers, and holds its motion to the brief:
// the stats count up one at a time with a blip, the grade drops in and
// bounces once, the strip fills left to right, and reduced motion shows
// everything at once.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ScoreScreen from '../src/ui/ScoreScreen'
import { SCORE_MOTION } from '../src/ui/scoreMotion'
import { shareText } from '../src/ui/reportCard'
import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, hitsTaken, turnStrip } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import type { DailyOp, DailyStanding } from '../src/persistence'
import { techniqueLabel } from '../src/ui/labels'
import { getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const STYLESHEET = readFileSync(join(SRC, 'ui', 'scoreScreen.css'), 'utf8')

let container: HTMLDivElement
let root: Root
let unlisten: () => void

// A preference that can change mid-session: every query the page opens
// reads the current value, and a change tells their listeners, as a
// browser does when the setting is flipped.
let reducedNow = false
let motionListeners: (() => void)[] = []
function setReducedMotion(reduced: boolean) {
  reducedNow = reduced
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return reducedNow && query.includes('reduce')
    },
    media: query,
    addEventListener: (_: string, l: () => void) => void motionListeners.push(l),
    removeEventListener: (_: string, l: () => void) => void (motionListeners = motionListeners.filter((x) => x !== l)),
    addListener: () => {},
    removeListener: () => {},
  }))
}
function flipReducedMotion(reduced: boolean) {
  reducedNow = reduced
  act(() => {
    for (const l of [...motionListeners]) l()
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 27, 16, 0, 0))
  setReducedMotion(false)
  resetAudioEngineForTests()
  installFakeAudioContext()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  unlisten = installGestureUnlock()
  motionListeners = []
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function play(seed: number, script: Record<number, TurnActions>): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}
// A won campaign and a lost one, both with hits and a mixed strip.
const WON = () => play(20260712, WIN_SCRIPT)
const LOST = () => play(20260712, LOSS_SCRIPT)
const TODAY: DailyOp = { dateKey: '20260927', n: 1 }

function show(state: GameState, daily?: DailyOp, standing: DailyStanding | null = null) {
  act(() => {
    root.render(<ScoreScreen state={state} daily={daily} standing={standing} />)
  })
}
const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
const statValues = () => [...container.querySelectorAll('[data-stat-value]')].map((el) => Number(el.textContent))
// Each stat read by its own label, so a value under the wrong label shows.
const statsByLabel = () =>
  Object.fromEntries([...container.querySelectorAll('[data-stat]')].map((el) => [el.getAttribute('data-stat'), Number(el.querySelector('[data-stat-value]')!.textContent)]))
const gradeEl = () => container.querySelector('[data-grade]')!
const cells = () => [...container.querySelectorAll<HTMLElement>('[data-strip-cell]')]
const byText = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))
const MOTION = ['dc-grade-drop', 'dc-strip-fill']
const hasMotion = (el: Element) => MOTION.some((c) => el.classList.contains(c))
const waiting = (el: Element) => el.classList.contains('dc-score-wait')
const notice = () => container.querySelector('[data-share-notice]')?.textContent ?? null

function expected(state: GameState) {
  const last = state.history[state.history.length - 1]
  return [last.maiScore, hitsTaken(state), last.creditsAfter]
}

describe('the score screen shows the numbers grade.ts reads', () => {
  it('shows the grade, the three stats and one square a turn in the strip\'s colours', () => {
    setReducedMotion(true)
    for (const state of [WON(), LOST()]) {
      show(state)
      expect(gradeEl().textContent).toBe(gradeOf(state))
      const last = state.history[state.history.length - 1]
      expect(statsByLabel()).toEqual({ 'FINAL MAI': last.maiScore, 'HITS TAKEN': hitsTaken(state), 'CREDITS LEFT': last.creditsAfter })
      for (const [label, value] of Object.entries(statsByLabel())) {
        expect([...container.querySelectorAll(`[data-stat="${label}"]`)].map((el) => el.textContent), label).toEqual([`${label}${value.toFixed(label === 'FINAL MAI' ? 1 : 0)}`])
      }
      expect(statValues()).toEqual(expected(state))
      expect(cells().map((c) => c.getAttribute('data-strip-cell'))).toEqual(turnStrip(state))
    }
    // The positive control: these campaigns took hits and their strips
    // are not one colour, so equal lists are not empty agreement.
    expect(hitsTaken(WON())).toBeGreaterThan(0)
    expect(new Set(turnStrip(LOST())).size).toBeGreaterThan(1)
  })

  it('marks a Daily Op OFFICIAL only when this finish claimed its date, and free play as free play', () => {
    setReducedMotion(true)
    show(WON(), TODAY, 'official')
    expect(container.querySelector('[data-standing]')?.textContent).toBe('OFFICIAL')
    expect(container.querySelector('[data-run-mode]')?.textContent).toMatch(/^DAILY OP\s*1/)
    show(WON(), TODAY, 'practice')
    expect(container.querySelector('[data-standing]')?.textContent).toBe('PRACTICE')
    // A Daily Op that arrived finished claimed nothing here.
    show(WON(), TODAY, null)
    expect(container.querySelector('[data-standing]')?.textContent).toBe('PRACTICE')
    show(WON())
    expect(container.querySelector('[data-standing]')).toBeNull()
    expect(container.querySelector('[data-run-mode]')?.textContent).toBe('FREE PLAY · STANDARD · SEED 20260712')
  })
})

describe('the reveal (brief 7.2)', () => {
  it('counts the stats up one at a time, each landing with a blip, then drops the grade, then fills the strip', () => {
    const played: string[] = []
    vi.spyOn(getAudioEngine(), 'play').mockImplementation((cue) => {
      played.push(cue)
      return true
    })
    const state = WON()
    const finals = expected(state)
    show(state)
    const blips = () => played.filter((c) => c === 'tick-up').length

    // Nothing yet: every stat at 0, the grade and the strip waiting.
    expect(statValues()).toEqual([0, 0, 0])
    expect(waiting(gradeEl())).toBe(true)
    expect(cells().every(waiting)).toBe(true)
    step(SCORE_MOTION.leadMs)

    for (let i = 0; i < finals.length; i += 1) {
      // Halfway through stat i's turn: it is on its way, the ones after it
      // have not started, and the ones before it have landed.
      step(SCORE_MOTION.statMs / 2)
      const mid = statValues()
      expect(mid[i], `stat ${i} is not counting`).not.toBe(0)
      expect(mid[i], `stat ${i} landed at once`).not.toBe(finals[i])
      expect(mid.slice(i + 1), `a stat after ${i} started early`).toEqual(finals.slice(i + 1).map(() => 0))
      expect(mid.slice(0, i)).toEqual(finals.slice(0, i))
      expect(blips(), `a blip before stat ${i} landed`).toBe(i)
      expect(waiting(gradeEl()), 'the grade arrived before the stats had').toBe(true)
      // The blip marks the landing: none a moment before the count ends,
      // and the number and its blip together a moment after.
      step(SCORE_MOTION.countMs - SCORE_MOTION.statMs / 2 - 20)
      expect(blips(), `stat ${i}'s blip came before its count ended`).toBe(i)
      step(40)
      expect(statValues()[i], `stat ${i} did not land`).toBe(finals[i])
      expect(blips(), `stat ${i} landed without its blip`).toBe(i + 1)
      step(SCORE_MOTION.statMs - SCORE_MOTION.countMs - 20)
    }

    // The grade drops in; the strip is still waiting.
    expect(gradeEl().classList.contains('dc-grade-drop')).toBe(true)
    expect(cells().every(waiting), 'the strip filled before the grade had dropped').toBe(true)
    step(SCORE_MOTION.gradeMs)

    // The strip fills left to right: every square has the fill, each one
    // starting a step after the one before it.
    const delays = cells().map((c) => {
      expect(c.classList.contains('dc-strip-fill')).toBe(true)
      return parseFloat(c.style.animationDelay)
    })
    expect(delays).toEqual(cells().map((_, i) => i * SCORE_MOTION.stripStepMs))
    // And nothing more happens: three blips, no fourth.
    step(10_000)
    expect(blips()).toBe(3)
  })

  it('shows everything at once under reduced motion: no count, no drop, no fill, no blips', () => {
    setReducedMotion(true)
    const played: string[] = []
    vi.spyOn(getAudioEngine(), 'play').mockImplementation((cue) => {
      played.push(cue)
      return true
    })
    const state = WON()
    // Watch every paint from the first, so a first frame at 0 that an
    // effect corrects still counts against it. The mount itself is one
    // record, the tree added to the container; any record INSIDE a stat's
    // value is a stat painted once and then changed.
    const observer = new MutationObserver(() => {})
    observer.observe(container, { subtree: true, childList: true, characterData: true })
    show(state)
    const records = observer.takeRecords()
    expect(records.length, 'the mount recorded nothing, so this watches nothing').toBeGreaterThan(0)
    const inStat = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest('[data-stat-value]') !== null
    expect(records.filter((r) => inStat(r.target)).length, 'a stat was painted, then changed').toBe(0)
    expect(statValues(), 'the stats did not arrive whole').toEqual(expected(state))
    for (const el of [gradeEl(), ...cells()]) {
      expect(waiting(el), 'a piece is hidden waiting for a reveal that never runs').toBe(false)
      expect(hasMotion(el), 'a piece moves under reduced motion').toBe(false)
    }
    step(10_000)
    expect(played.filter((c) => c === 'tick-up'), 'a blip played for a number that never counted').toEqual([])
    observer.disconnect()
  })

  it('keeps what is on screen when reduced motion is turned on mid-reveal and off again', () => {
    const played: string[] = []
    vi.spyOn(getAudioEngine(), 'play').mockImplementation((cue) => {
      played.push(cue)
      return true
    })
    const state = WON()
    show(state)
    step(SCORE_MOTION.leadMs)
    step(SCORE_MOTION.statMs)
    expect(played.filter((c) => c === 'tick-up'), 'the first stat did not land').toHaveLength(1)
    expect(statValues()[1], 'the second stat had not started, so this is not mid-reveal').toBe(0)
    flipReducedMotion(true)
    expect(statValues(), 'turning reduced motion on did not show everything').toEqual(expected(state))
    flipReducedMotion(false)
    step(10_000)
    expect(statValues(), 'turning it off again took numbers back off the screen').toEqual(expected(state))
    expect(waiting(gradeEl()) || cells().some(waiting), 'turning it off again hid the grade or the strip').toBe(false)
    expect(played.filter((c) => c === 'tick-up'), 'the reveal replayed its blips').toHaveLength(1)
  })
})

describe("the score screen's stylesheet", () => {
  // The applyCss technique from the cold open's suite: the media queries
  // are rewritten to always or never match, and jsdom computes the rest.
  function applyCss(reduced: boolean) {
    document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
    const css = STYLESHEET.replace(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll('(prefers-reduced-motion: no-preference)', reduced ? 'not all' : 'all')
      .replaceAll('(prefers-reduced-motion: reduce)', reduced ? 'all' : 'not all')
    expect(css.includes('prefers-reduced-motion'), 'a form of the query this test does not state').toBe(false)
    const style = document.createElement('style')
    style.setAttribute('data-test-css', '')
    style.textContent = css
    document.head.appendChild(style)
  }
  function animationOf(cls: string): string {
    const el = document.createElement('div')
    el.className = cls
    container.appendChild(el)
    const cs = getComputedStyle(el)
    const a = `${cs.getPropertyValue('animation-name')} ${cs.getPropertyValue('animation')}`.trim()
    el.remove()
    return a
  }

  it('keeps every motion inside the no-preference guard, and stops it again under reduce', () => {
    // Two locks, each held on its own: a rule that animates outside the
    // guard, or a reduce block that no longer stops it, fails here even
    // while the other lock would hide it in the rendered test below.
    const style = document.createElement('style')
    style.setAttribute('data-test-css', '')
    style.textContent = STYLESHEET
    document.head.appendChild(style)
    const rules = [...style.sheet!.cssRules]
    const animated = (r: CSSRule) => r instanceof CSSStyleRule && /animation/.test(r.style.cssText) && !/animation:\s*none/.test(r.style.cssText)
    expect(rules.filter(animated).map((r) => (r as CSSStyleRule).selectorText), 'a rule animates outside any guard').toEqual([])
    const media = rules.filter((r): r is CSSMediaRule => r instanceof CSSMediaRule)
    const guarded = media.filter((m) => m.conditionText.includes('no-preference')).flatMap((m) => [...m.cssRules].filter(animated).map((r) => (r as CSSStyleRule).selectorText))
    expect(guarded.sort()).toEqual(MOTION.map((c) => `.${c}`).sort())
    const stopped = media
      .filter((m) => /reduced-motion:\s*reduce/.test(m.conditionText))
      .flatMap((m) => [...m.cssRules].filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && /animation:\s*none/.test(r.style.cssText)))
      .flatMap((r) => r.selectorText.split(',').map((s) => s.trim()))
    expect(stopped.sort(), 'the reduce block does not stop every motion').toEqual(MOTION.map((c) => `.${c}`).sort())
  })

  it('moves nothing under reduced motion, and runs each motion at the duration the screen times it by', () => {
    applyCss(true)
    for (const cls of MOTION) expect(animationOf(cls), `${cls} runs under reduced motion`).not.toMatch(/dc-/)
    applyCss(false)
    expect(animationOf('dc-grade-drop')).toMatch(/dc-grade-drop/)
    expect(animationOf('dc-strip-fill')).toMatch(/dc-strip-fill/)
    const duration = (cls: string) => {
      const m = STYLESHEET.match(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([0-9.]+)(m?s)`))
      expect(m, `${cls} has no duration`).not.toBeNull()
      return Number(m![1]) * (m![2] === 's' ? 1000 : 1)
    }
    expect(duration('dc-grade-drop')).toBe(SCORE_MOTION.gradeMs)
    expect(duration('dc-strip-fill')).toBe(SCORE_MOTION.stripCellMs)
  })
})

describe('the countdown to the next Daily Op', () => {
  it('counts to the next local midnight, a second at a time', () => {
    setReducedMotion(true)
    show(WON())
    const text = () => container.querySelector('[data-countdown]')!.textContent
    expect(text()).toBe('NEXT DAILY OP IN08:00:00')
    step(1000)
    expect(text()).toBe('NEXT DAILY OP IN07:59:59')
  })

  it('says the next one is open when a Daily Op finishes after the midnight that ended its date', () => {
    setReducedMotion(true)
    vi.setSystemTime(new Date(2026, 8, 28, 0, 30))
    show(WON(), TODAY, 'official')
    expect(container.querySelector('[data-countdown]')!.textContent).toMatch(/^DAILY OP\s*2 IS OPEN NOW$/)
  })

  it('counts down rather than naming an earlier Daily Op when the clock is set back', () => {
    setReducedMotion(true)
    show(WON(), { dateKey: '20260928', n: 2 }, 'official')
    expect(container.querySelector('[data-countdown]')!.textContent).toBe('NEXT DAILY OP IN08:00:00')
  })
})

describe('share', () => {
  const click = async (el: Element) => {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
  }

  it('opens the native share sheet with the share text where there is one', async () => {
    setReducedMotion(true)
    const shared: unknown[] = []
    vi.stubGlobal('navigator', { share: async (data: unknown) => void shared.push(data) })
    const state = WON()
    show(state, TODAY, 'official')
    await click(byText(/share result/i)!)
    expect(shared).toEqual([{ text: shareText(state, { n: 1, official: true }) }])
    expect(notice()).toBe('Result shared.')
    expect(container.querySelector('[data-share-notice]')!.getAttribute('role')).toBe('status')
  })

  it('falls back to the clipboard where there is no sheet, or the sheet fails, but not when the player closes it', async () => {
    setReducedMotion(true)
    const state = WON()
    const text = shareText(state, { n: 1, official: false })
    let copied = ''
    vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state, TODAY, 'practice')
    await click(byText(/copy result/i)!)
    expect(copied).toBe(text)
    expect(notice()).toBe('Result summary copied.')

    const failing = (name: string) => async () => {
      throw Object.assign(new Error(name), { name })
    }
    copied = ''
    vi.stubGlobal('navigator', { share: failing('NotAllowedError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state, TODAY, 'practice')
    await click(byText(/share result/i)!)
    expect(copied, 'a failed sheet did not fall back to the clipboard').toBe(text)

    copied = ''
    vi.stubGlobal('navigator', { share: failing('AbortError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state, TODAY, 'practice')
    await click(byText(/share result/i)!)
    expect(copied, 'closing the sheet copied anyway').toBe('')
    expect(notice()).toBe('')
  })
})

describe('the debrief (brief 4.8)', () => {
  it('lists every threat the run faced, with its techniques and sources, once it is opened', async () => {
    setReducedMotion(true)
    // The won line: it took hits, held a threat and met an opportunity.
    const state = WON()
    show(state)
    expect(container.querySelector('[data-debrief]'), 'the debrief rendered before it was opened').toBeNull()
    const open = byText(/^DEBRIEF$/)!
    expect(open.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      open.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    await settle()
    expect(open.getAttribute('aria-expanded')).toBe('true')

    // What it should list, from the history and the content directly.
    const facedIds = [...new Set(state.history.flatMap((rec) => rec.events.map((ev) => ev.eventId)))].filter(
      (id) => (DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat',
    )
    expect(facedIds.length, 'the run faced no threat, so this asserts nothing').toBeGreaterThan(2)
    const items = [...container.querySelectorAll('[data-debrief-threat]')]
    expect(items.map((li) => li.getAttribute('data-debrief-threat'))).toEqual(facedIds)
    for (const li of items) {
      const def = DEFAULT_SCENARIO.events.find((e) => e.id === li.getAttribute('data-debrief-threat'))!
      const techniques = [...li.querySelectorAll('[data-debrief-technique] a')]
      expect(techniques.map((a) => a.textContent)).toEqual(def.techniqueRefs.map(techniqueLabel))
      expect(techniques.map((a) => a.getAttribute('href'))).toEqual(def.techniqueRefs.map((r) => r.url))
      const urls = [...new Set(def.learnMoreCards.flatMap((c) => c.sources.map((s) => s.url)))]
      const links = [...li.querySelectorAll('[data-debrief-source] a')]
      expect(links.map((a) => a.getAttribute('href'))).toEqual(urls)
      for (const a of [...techniques, ...links]) expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
    // Each threat's turns, from the history: the turn it came on and
    // whether it landed.
    for (const li of items) {
      const id = li.getAttribute('data-debrief-threat')
      const met = state.history.flatMap((rec) => rec.events.filter((ev) => ev.eventId === id).map((ev) => `T${rec.turn} ${ev.effectiveSeverity > 0 ? 'hit' : 'held'}`))
      expect(li.querySelector('[data-debrief-turns]')!.textContent, id!).toBe(met.join(' · '))
    }
    const heldThreat = state.history.some((rec) =>
      rec.events.some((ev) => ev.effectiveSeverity === 0 && facedIds.includes(ev.eventId)),
    )
    expect(heldThreat, 'no threat was held, so held is never shown').toBe(true)
    // An opportunity is not a threat, and this run met one.
    const opportunities = state.history.flatMap((rec) => rec.events).filter((ev) => DEFAULT_SCENARIO.events.find((e) => e.id === ev.eventId)?.kind === 'opportunity')
    expect(opportunities.length, 'this run met no opportunity, so the filter is untested').toBeGreaterThan(0)
    expect(items.some((li) => opportunities.some((o) => o.eventId === li.getAttribute('data-debrief-threat')))).toBe(false)
  })
})
