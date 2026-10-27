// @vitest-environment jsdom
//
// The debrief (v1.3 brief 5.6, Round 4), rendered on its own with real
// finished campaigns from the engine. It replaced the v1.2 score screen,
// and this suite replaced that screen's: the numbers it shows are read
// through src/ui/debriefModel.ts, whose own suite (tests/debrief.spec.ts)
// holds them to the engine's record; this holds the screen to them, and
// its motion to the brief: the six tiles rise in a step apart and count up
// with a blip each, the grade drops in with its sound, the filed cards
// step in and the strip fills; reduced motion shows everything at once.
//
// GUARD R4 (b), on screen: the grade, the six stats and FILED THIS GAME
// are the engine's, the list read from this device's Dossier and the run's
// own record of it at turn 1.
// GUARD R4 (e), the debrief's half: no retired word (section 4) on a won
// or a lost debrief, its text nodes read apart.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Debrief from '../src/ui/Debrief'
import { DEBRIEF_MOTION } from '../src/ui/debriefMotion'
import { FILED_SHOWN, debriefStats, filedThisGame, lossLead, nextTime } from '../src/ui/debriefModel'
import { shareText } from '../src/ui/reportCard'
import { HOOK } from '../src/ui/night/nightCopy'
import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, turnStrip } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { runKey, type DailyOp, type DailyStanding } from '../src/persistence'
import { getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const STYLESHEET = readFileSync(join(SRC, 'ui', 'debrief.css'), 'utf8')

let container: HTMLDivElement
let root: Root
let unlisten: () => void

// A storage of its own per test: the run's record, the Dossier and the
// daily ledger are all read from it.
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

// The debrief's lower sections arrive in a chunk of their own (v1.6 R2),
// fetched as the debrief loads; here before the first mount, as they are
// in the game long before a player scrolls to them.
beforeAll(async () => {
  await import('../src/ui/DebriefMore')
  await new Promise((r) => setTimeout(r, 0))
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 27, 16, 0, 0))
  setReducedMotion(false)
  resetAudioEngineForTests()
  installFakeAudioContext()
  vi.stubGlobal('localStorage', memoryStorage())
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
// A won campaign (S, 6 hits) and a lost one (D, 9 hits), both with a
// mixed strip. The win is seed 6 since v1.4: the prepared script orders one
// new defense a night, and on 20260712 it now wins at B.
// Seed 16 since v1.6 R1, an S for the prepared script on the seed's
// other order (seed 6 under v1.5's one order).
const WON = () => play(16, WIN_SCRIPT)
const LOST = () => play(20260712, LOSS_SCRIPT)
const TODAY: DailyOp = { dateKey: '20260927', n: 1 }

// The threats a game met, in order.
const metIn = (s: GameState) => {
  const out: string[] = []
  for (const rec of s.history) for (const ev of rec.events) if ((DEFAULT_SCENARIO.events.find((e) => e.id === ev.eventId)?.kind ?? 'threat') === 'threat' && !out.includes(ev.eventId)) out.push(ev.eventId)
  return out
}
// This device as a first game leaves it: the run began on an empty
// Dossier and filed every card it met, in 2:03 on the clock.
function firstGameOnDevice(s: GameState, daily?: DailyOp) {
  localStorage.setItem('dc-run', JSON.stringify({ game: runKey(s.seed, s.difficulty, daily?.dateKey), before: [], ms: 123_000 }))
  localStorage.setItem('dc-dossier', JSON.stringify(metIn(s)))
}

let played: string[] = []
// Each showing is a new debrief, as each finished game is: it reads the
// device's records once, as it opens.
let mounts = 0
function show(state: GameState, daily?: DailyOp, standing: DailyStanding | null = null, onPlayAgain = () => {}, onTitle = () => {}) {
  act(() => {
    mounts += 1
    root.render(<Debrief key={mounts} state={state} daily={daily} standing={standing} onPlayAgain={onPlayAgain} onTitle={onTitle} />)
  })
}
const listen = () => {
  played = []
  vi.spyOn(getAudioEngine(), 'play').mockImplementation((cue) => {
    played.push(cue)
    return true
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
const statsByLabel = () =>
  Object.fromEntries([...container.querySelectorAll('[data-stat]')].map((el) => [el.getAttribute('data-stat'), Number(el.querySelector('[data-stat-value]')!.textContent)]))
// The grade lands with its shield, which carries the reveal's classes.
const gradeEl = () => container.querySelector('[data-shield]')!
const gradeLetter = () => container.querySelector('[data-grade]')!
const cells = () => [...container.querySelectorAll<HTMLElement>('[data-strip-cell]')]
const tiles = () => [...container.querySelectorAll<HTMLElement>('[data-stat]')]
const filedRows = () => [...container.querySelectorAll<HTMLElement>('[data-filed-card]')]
const byText = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))
const MOTION = ['dc-stamp-in', 'dc-shield-pop', 'dc-rays-in', 'dc-burst-fly', 'dc-stat-in', 'dc-filed-in', 'dc-strip-fill', 'dc-section-in']
const hasMotion = (el: Element) => MOTION.some((c) => el.classList.contains(c))
const waiting = (el: Element) => el.classList.contains('dc-score-wait')
const notice = () => container.querySelector('[data-share-notice]')?.textContent ?? null
// The six values in the order the screen shows them, won or lost: what
// held first (v1.3 R5 for a win; both since v1.6 R1).
const WIN_FIRST = ['MOVES BLOCKED', 'BEST STREAK', 'POINTS SAVED']
const finals = (state: GameState) => {
  const all = debriefStats(state)
  const order = [...WIN_FIRST.map((l) => all.find((s) => s.label === l)!), ...all.filter((s) => !WIN_FIRST.includes(s.label))]
  return order.map((s) => s.value)
}
// An element's words, each text node apart (textContent runs one node's
// last word into the next one's first).
function words(el: Element): string {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  while (walk.nextNode()) out.push(walk.currentNode.textContent ?? '')
  return out.join(' ')
}

describe('GUARD R4 (b): the debrief shows the engine\'s grade, stats and filed cards', () => {
  it('shows the grade and the six stats, in the brief\'s order, from the engine', () => {
    setReducedMotion(true)
    for (const state of [WON(), LOST()]) {
      show(state)
      expect(gradeLetter().textContent).toBe(gradeOf(state))
      expect(container.querySelector('[data-mission]')!.textContent).toBe(state.status === 'won' ? 'MISSION HELD' : 'MISSION LOST')
      const events = state.history.flatMap((r) => r.events)
      const last = state.history[state.history.length - 1]
      expect(statsByLabel()).toEqual({
        'HITS TAKEN': events.filter((e) => e.effectiveSeverity > 0).length,
        'MOVES BLOCKED': events.filter((e) => e.outcome === 'held' && e.eventId !== 'debris-conjunction' && DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind !== 'opportunity').length,
        'BEST STREAK': last.bestStreak,
        'BUDGET LEFT': last.creditsAfter,
        'DEFENSES KEPT': state.counters.length,
        'POINTS SAVED': Math.round(state.saved * 10) / 10,
      })
      // One order, won or lost (v1.6 R1): what held first (v1.3 R5).
      expect(tiles().map((t) => t.getAttribute('data-stat'))).toEqual(['MOVES BLOCKED', 'BEST STREAK', 'POINTS SAVED', 'HITS TAKEN', 'BUDGET LEFT', 'DEFENSES KEPT'])
      expect(container.querySelector('[data-final]')!.textContent).toContain(`Final mission assurance ${last.maiScore.toFixed(1)}, needed ${DEFAULT_SCENARIO.winThreshold}`)
    }
  })

  it('lists the cards this game filed, with their hooks, and the rest as a count, first screen only', () => {
    setReducedMotion(true)
    const state = LOST()
    firstGameOnDevice(state)
    const met = metIn(state)
    expect(met.length, 'the game met too few threats to overflow the list').toBeGreaterThan(FILED_SHOWN)
    show(state)
    expect(filedRows().map((r) => r.getAttribute('data-filed-card'))).toEqual(met.slice(0, FILED_SHOWN))
    for (const r of filedRows()) expect(r.textContent).toContain(HOOK[r.getAttribute('data-filed-card')!])
    expect(container.querySelector('[data-filed-more]')!.textContent).toBe(`and ${met.length - FILED_SHOWN} more, in the Dossier`)
    expect(container.querySelector('[data-dossier-total]')!.textContent).toBe(`${met.length} / 18`)
    expect(container.querySelector('[data-final]')!.textContent).toContain('played in 2:03')
    // The list sits in the first screen's block, before WHAT YOU CAN NOW SAY.
    expect(container.querySelector('[data-debrief-first] [data-filed-this-game]')).not.toBeNull()
  })

  it('lists only what was filed since turn 1, and says so when nothing was', () => {
    setReducedMotion(true)
    const state = WON()
    const met = metIn(state)
    // Every card but the last was filed before this game began.
    localStorage.setItem('dc-run', JSON.stringify({ game: runKey(state.seed, state.difficulty), before: met.slice(0, -1), ms: 0 }))
    localStorage.setItem('dc-dossier', JSON.stringify(met))
    show(state)
    expect(filedRows().map((r) => r.getAttribute('data-filed-card'))).toEqual(filedThisGame(state, new Set(met.slice(0, -1)), new Set(met)))
    expect(filedRows().map((r) => r.getAttribute('data-filed-card'))).toEqual(met.slice(-1))
    // Every card already filed: nothing new.
    localStorage.setItem('dc-run', JSON.stringify({ game: runKey(state.seed, state.difficulty), before: met, ms: 0 }))
    show(WON())
    expect(filedRows()).toHaveLength(0)
    expect(container.querySelector('[data-filed-none]')!.textContent).toBe('No new cards this game.')
  })

  it('claims no list and no time for a run with no record of its own (a pasted code)', () => {
    setReducedMotion(true)
    const state = WON()
    localStorage.setItem('dc-dossier', JSON.stringify(metIn(state)))
    // A record for another run.
    localStorage.setItem('dc-run', JSON.stringify({ game: runKey(state.seed + 1, state.difficulty), before: [], ms: 99_000 }))
    show(state)
    expect(filedRows()).toHaveLength(0)
    expect(container.querySelector('[data-filed-none]')!.textContent).toBe('Cards filed on this device show in the Dossier.')
    expect(container.querySelector('[data-final]')!.textContent).not.toMatch(/played in/)
  })

  it('leads a loss with its largest drop, and a win with none', () => {
    setReducedMotion(true)
    const lost = LOST()
    show(lost)
    const lead = lossLead(lost)!
    expect(container.querySelector('[data-loss-lead]')!.textContent).toBe(`BIGGEST DROP · TURN ${lead.turn}${lead.line}`)
    // The turn's net and the move's own drop in one sentence that says how
    // they relate (v1.6 R1, Ken's ruling of 26 October 2026), the move's
    // from its own scores (v1.5 R1; R6b's fresh eyes, item 7).
    expect(lead.line.startsWith(`-${lead.drop.toFixed(1)} net this turn`), lead.line).toBe(true)
    const rec = lost.history.find((r) => r.turn === lead.turn)!
    const worst = rec.events.filter((e) => e.effectiveSeverity > 0).sort((a, b) => b.effectiveSeverity - a.effectiveSeverity)[0]
    if (worst) expect(lead.line).toContain(`, -${(Math.round((worst.scoreBefore - worst.scoreAfter) * 10) / 10).toFixed(1)} of it from one strike: `)
    show(WON())
    expect(container.querySelector('[data-loss-lead]')).toBeNull()
  })

  it('marks the run in its eyebrow: the Daily Op and its number, practice when it is not the official run', () => {
    setReducedMotion(true)
    const eyebrow = () => container.querySelector('[data-debrief-eyebrow]')!.textContent
    show(WON(), TODAY, 'official')
    expect(eyebrow()).toBe('DEBRIEF · OP FIRST LIGHT · DAILY OP #1')
    show(WON(), TODAY, 'practice')
    expect(eyebrow()).toBe('DEBRIEF · OP FIRST LIGHT · DAILY OP #1 · PRACTICE')
    // A Daily Op that arrived finished claimed nothing here.
    show(WON(), TODAY, null)
    expect(eyebrow()).toBe('DEBRIEF · OP FIRST LIGHT · DAILY OP #1 · PRACTICE')
    show(WON())
    expect(eyebrow()).toBe('DEBRIEF · OP FIRST LIGHT · PRACTICE')
  })

  it('draws one square a turn, says what each colour means (QC G-062), and marks the grade on the ladder', () => {
    setReducedMotion(true)
    for (const state of [WON(), LOST()]) {
      show(state)
      expect(cells().map((c) => c.getAttribute('data-strip-cell'))).toEqual(turnStrip(state))
      const word = { green: 'score held or rose', amber: 'dropped less than 3', magenta: 'dropped 3 or more, or lost an asset' }
      expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(turnStrip(state).map((c, i) => `Turn ${i + 1}: ${word[c]}`))
      expect(container.querySelector('[data-strip-legend]')!.textContent).toBe('score held or rosedropped less than 3dropped 3 or more, or lost an asset')
      expect([...container.querySelectorAll('[data-rung]')].map((r) => r.getAttribute('data-rung'))).toEqual(['S', 'A', 'B', 'C', 'D', 'F'])
      expect(container.querySelector('[data-rung][data-mine]')!.getAttribute('data-rung')).toBe(gradeOf(state))
      // The win line sits between C and D (R5, question 7).
      const line = container.querySelector('[data-win-line]')!
      expect(line.textContent).toBe(`WIN LINE ${state.scenario.winThreshold}`)
      expect(line.previousElementSibling!.getAttribute('data-rung')).toBe('C')
      expect(line.nextElementSibling!.getAttribute('data-rung')).toBe('D')
    }
    expect(new Set(turnStrip(LOST())).size).toBeGreaterThan(1)
  })

  it('GUARD R4 (e): says no retired word on a won or a lost debrief', () => {
    setReducedMotion(true)
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
      ['score screen', /score screen/i],
      ['seed', /\bseed\b/i],
      ['survived', /\bsurviv\w*/i],
      ['ASSURED', /MISSION ASSURED|MISSION FAILED/],
    ]
    for (const [state, daily] of [
      [WON(), undefined],
      [LOST(), TODAY],
    ] as const) {
      firstGameOnDevice(state, daily)
      show(state, daily, 'official')
      const text = `${words(container)} ${[...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' ')}`
      for (const [word, re] of RETIRED) expect(re.test(text), `${word}: "${text.match(re)?.[0]}"`).toBe(false)
    }
  })
})

describe('NEXT TIME names an order of purchases and what it does to the game (v1.4; v1.5 R1)', () => {
  it('says the turn to order it on and the score the same game ends on, never "by turn" or "would have"', () => {
    let earlier = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const state of [play(seed, WIN_SCRIPT), play(seed, LOSS_SCRIPT)]) {
        const next = nextTime(state)
        if (!next || state.lossReason === 'insolvency') continue
        show(state)
        const text = container.querySelector('[data-next-time] p')!.textContent!
        expect(text, `seed ${seed}: "${text}"`).not.toMatch(/by turn|would have/)
        if (next.kind === 'earlier') {
          earlier += 1
          expect(text, `seed ${seed}: "${text}"`).toContain(`on turn ${next.orderOn}`)
          expect(text, `seed ${seed}: "${text}"`).toContain(`Played again with every other order the same, this game ends at ${next.final.toFixed(1)}, not ${next.was.toFixed(1)}`)
          if (next.ahead) expect(text).toContain(next.aheadTo !== null ? `move ${next.ahead} to turn ${next.aheadTo}` : `in place of ${next.ahead}`)
          else expect(text).toContain('when you ordered no defense')
          if (!next.won) expect(text).toContain('still under the win line of 70')
        }
        // The retired words a line about ordering could slip into (GUARD
        // R4 (e) below holds the whole debrief to the full list).
        expect(text, `seed ${seed}: "${text}"`).not.toMatch(/\b(buy|buys|bought|purchas\w*|credits?)\b/i)
      }
    }
    expect(earlier, 'no NEXT TIME named a better order').toBeGreaterThan(0)
  })

  it('leads an insolvent run with the budget, not a defense (v1.5 R1)', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let s = newGame(DEFAULT_SCENARIO, seed, 'standard')
      // Each asset PROCURE offers and the first defense that fits, each
      // turn, until the budget breaks.
      while (s.status === 'playing') {
        const buyAssets: { kind: 'drone' | 'sat' | 'groundStation' }[] = []
        let left = s.credits
        for (const kind of ['drone', 'sat', 'groundStation'] as const) {
          if (DEFAULT_SCENARIO.prices[kind] > left) continue
          buyAssets.push({ kind })
          left -= DEFAULT_SCENARIO.prices[kind]
        }
        const d = DEFAULT_SCENARIO.countermeasures.find((c) => !s.counters.includes(c.id) && c.cost <= left)
        s = resolveTurn(s, { buyAssets, buyCounters: d ? [d.id] : [], intelBrief: false, debris: 'hold' }, turnRng(s.seed, s.turn))
      }
      if (s.lossReason !== 'insolvency') continue
      show(s)
      expect(container.querySelector('[data-next-time] p')!.textContent).toBe(`Keep WORST CASE at 0 or above. Orders, upkeep and repairs took the budget below zero on turn ${s.history.length}.`)
      return
    }
    throw new Error('no insolvent run in 40 seeds')
  })
})

describe('GUARD R5 (a): a won debrief and a lost one differ in layout, not only in colour', () => {
  // Read with motion off, where a win must still read as a win, and by
  // structure alone: which blocks the first screen holds, in what order,
  // and which shapes they carry. No class and no colour is compared.
  const C_WIN = () => {
    // Seed 53 since v1.6 R1, where each seed plays its own order (seed 3
    // under v1.5's one order now grades D); seed 3 since v1.4, one new
    // defense a night, where seed 24's plan ordered three on turn 2.
    let state = newGame(DEFAULT_SCENARIO, 53, 'standard')
    const plan: Record<number, TurnActions> = {
      2: { ...NO_OP, buyCounters: ['antiJam'] },
      // Encrypted backhaul since the engine round of R6 (Decisions Q1), which
      // took link authentication off the listening threats.
      3: { ...NO_OP, buyCounters: ['encryptedBackhaul'] },
    }
    while (state.status === 'playing') state = resolveTurn(state, plan[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    return state
  }
  const blocks = () =>
    [...container.querySelector('[data-debrief-first]')!.children].map((el) =>
      ['data-debrief-eyebrow', 'data-hero', 'data-hero-lines', 'data-loss-lead', 'data-stats', 'data-filed-this-game'].find((a) => el.hasAttribute(a)) ?? el.tagName,
    )
  const shapes = () => ({
    shield: container.querySelector('[data-debrief-first] [data-shield] [data-sprite]')?.getAttribute('data-sprite') ?? null,
    stamp: !!container.querySelector('[data-debrief-first] [data-stamp]'),
    rays: container.querySelector('[data-debrief-first] .dc-rays')?.classList.contains('dc-rays-lost') ? 'lost' : container.querySelector('[data-debrief-first] .dc-rays') ? 'won' : null,
    sparks: container.querySelectorAll('[data-debrief-first] [data-spark]').length,
  })
  const tileOrder = () => [...container.querySelectorAll('[data-stats] [data-stat]')].map((t) => t.getAttribute('data-stat'))

  it('gives a win and a loss one shape: the same hero in the same place, the same tiles in one order, the drop under the hero (v1.6 R1)', () => {
    // Ken's ruling of 26 October 2026. Until v1.6 a win had a hero of its
    // own and a loss led with BIGGEST DROP over a plain grade row, its
    // tiles in another order.
    setReducedMotion(true)
    const c = C_WIN()
    expect(gradeOf(c), 'the C fixture no longer grades C').toBe('C')
    show(c)
    const win = blocks()
    // The reason and the final lines sit in the hero itself (v1.6 R1).
    expect(win).toEqual(['data-debrief-eyebrow', 'data-hero', 'data-stats', 'data-filed-this-game'])
    expect(container.querySelector('[data-hero] [data-hero-lines] [data-reason]'), 'the reason is not in the hero').not.toBeNull()
    expect(shapes()).toEqual({ shield: 'win-shield', stamp: true, rays: 'won', sparks: 0 })
    expect(container.querySelector('[data-hero]')!.getAttribute('data-tier')).toBe('C')
    expect(container.querySelector('[data-tier-line]')!.textContent).toBe('HELD THE LINE')
    expect(container.querySelector('[data-hero] [data-grade]')!.textContent).toBe('C')
    expect(container.querySelector('[data-hero] [data-margin]')!.textContent).toMatch(/^FINAL \d+\.\d · \d+\.\d ABOVE WIN LINE$/)
    const winTiles = tileOrder()

    show(LOST())
    const loss = blocks()
    // The same blocks, the drop under the hero.
    expect(loss).toEqual(['data-debrief-eyebrow', 'data-hero', 'data-loss-lead', 'data-stats', 'data-filed-this-game'])
    expect(shapes()).toEqual({ shield: 'loss-shield', stamp: true, rays: 'lost', sparks: 0 })
    expect(container.querySelector('[data-hero] [data-grade]')!.textContent).toBe('D')
    expect(container.querySelector('[data-hero] [data-stamp]')!.className).toContain('text-dc-hostile')
    expect(container.querySelector('[data-hero] [data-margin]')!.textContent).toMatch(/^FINAL \d+\.\d · \d+\.\d BELOW WIN LINE$/)
    expect(tileOrder(), 'a loss orders its tiles another way').toEqual(winTiles)
  })

  it('scales the win by its grade: an S carries more than a C', () => {
    setReducedMotion(true)
    show(WON())
    expect(gradeOf(WON())).toBe('S')
    expect(shapes()).toEqual({ shield: 'win-shield', stamp: true, rays: 'won', sparks: 4 })
    expect(container.querySelector('[data-hero]')!.getAttribute('data-tier')).toBe('S')
    expect(container.querySelector('[data-tier-line]')!.textContent).toBe('TOP GRADE')
  })
})

describe('the reveal (brief 5.6 and 8.3)', () => {
  it('lands a loss\'s grade first and plainly, on its tick down; then raises the tiles a step apart, counting up, a blip each; then the cards and the strip', () => {
    listen()
    const state = LOST()
    firstGameOnDevice(state)
    const want = finals(state)
    // The tiles open on what held since v1.6 R1, which a loss with no
    // orders has none of, so the count is watched on the first tile with
    // enough to count (HITS TAKEN).
    const k = want.findIndex((v) => v >= 5)
    expect(k, 'too few hits to see the count mid-way').toBeGreaterThanOrEqual(0)
    show(state)
    const blips = () => played.filter((c) => c === 'tick-up').length
    expect(tiles().every(waiting), 'a tile showed before the reveal').toBe(true)
    expect(waiting(gradeEl())).toBe(true)
    expect(filedRows().every(waiting) && cells().every(waiting)).toBe(true)

    const M = DEBRIEF_MOTION
    step(M.leadMs)
    // The grade, in the win's shape (v1.6 R1): the cracked shield and the
    // stamp land as a win's do, with no burst and the loss's own sound.
    expect(waiting(gradeEl()), 'the grade did not land first').toBe(false)
    expect(gradeEl().classList.contains('dc-shield-pop'), "a loss's shield does not land as a win's").toBe(true)
    expect(container.querySelector('[data-burst]'), 'a loss burst').toBeNull()
    expect(played.filter((c) => c === 'tick-down')).toHaveLength(1)
    expect(played, 'a loss played the fanfare').not.toContain('commendation-fanfare')
    expect(tiles().every(waiting), 'a tile rose with the grade').toBe(true)
    step(M.lossMs)
    expect(waiting(tiles()[0]), 'the first tile did not rise').toBe(false)
    expect(tiles()[0].classList.contains('dc-stat-in')).toBe(true)
    expect(waiting(tiles()[1]), 'the second tile rose with the first').toBe(true)
    // Each tile lands at the end of its own count, with its blip.
    step(M.countMs)
    expect(statValues()[0]).toBe(want[0])
    expect(blips()).toBe(1)
    // Half its own count in, tile k is on its way, not landed.
    const mid = k * M.statStepMs + M.countMs / 2
    expect(mid, 'tile k is half way before the first tile lands').toBeGreaterThanOrEqual(M.countMs)
    step(mid - M.countMs)
    expect(statValues()[k]).not.toBe(0)
    expect(statValues()[k]).not.toBe(want[k])
    step((want.length - 1) * M.statStepMs + M.countMs - mid)
    expect(statValues()).toEqual(want)
    expect(blips()).toBe(want.length)
    expect(filedRows().every(waiting) && cells().every(waiting), 'the cards came before the tiles had landed').toBe(true)
    step(M.beatMs)
    expect(filedRows().map((r) => parseFloat(r.style.animationDelay))).toEqual(filedRows().map((_, i) => i * M.rowStepMs))
    expect(cells().map((c) => parseFloat(c.style.animationDelay))).toEqual(cells().map((_, i) => i * M.stripStepMs))
    for (const el of [...filedRows(), ...cells()]) expect(hasMotion(el)).toBe(true)
    step(10_000)
    expect(blips(), 'a blip after the reveal').toBe(want.length)
  })

  it('lands a win\'s grade first: the stamp, the shield with the grade, the rays and a burst sized by the grade, on the fanfare, then the tiles', () => {
    listen()
    const state = WON()
    expect(gradeOf(state)).toBe('S')
    show(state)
    const hero = () => container.querySelector('[data-hero]')!
    const stamp = () => hero().querySelector('[data-stamp]')!
    const shield = () => hero().querySelector('[data-shield]')!
    expect(waiting(stamp()) && waiting(shield()), 'the win showed before the reveal').toBe(true)
    expect(hero().querySelector('[data-burst]'), 'the burst flew early').toBeNull()
    const M = DEBRIEF_MOTION
    step(M.leadMs)
    expect(stamp().classList.contains('dc-stamp-in')).toBe(true)
    expect(shield().classList.contains('dc-shield-pop')).toBe(true)
    expect(hero().querySelector('.dc-rays')!.classList.contains('dc-rays-in')).toBe(true)
    // An S bursts the most: two rings.
    expect(hero().querySelectorAll('[data-burst] .dc-burst-fly')).toHaveLength(28)
    expect(played.filter((c) => c === 'commendation-fanfare')).toHaveLength(1)
    expect(played).not.toContain('tick-down')
    expect(tiles().every(waiting), 'a tile rose during the win\'s moment').toBe(true)
    step(M.heroMs)
    expect(waiting(tiles()[0]), 'the tiles did not follow the win\'s moment').toBe(false)
    step(10_000)
    expect(played.filter((c) => c === 'commendation-fanfare'), 'the fanfare played twice').toHaveLength(1)
  })

  it('shows everything at once under reduced motion: no count, no drop, no fill, no blips, and the grade sounds once', () => {
    setReducedMotion(true)
    listen()
    const state = WON()
    firstGameOnDevice(state)
    const observer = new MutationObserver(() => {})
    observer.observe(container, { subtree: true, childList: true, characterData: true })
    show(state)
    const records = observer.takeRecords()
    expect(records.length, 'the mount recorded nothing, so this watches nothing').toBeGreaterThan(0)
    const inStat = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest('[data-stat-value]') !== null
    expect(records.filter((r) => inStat(r.target)).length, 'a stat was painted, then changed').toBe(0)
    expect(statValues(), 'the stats did not arrive whole').toEqual(finals(state))
    for (const el of [gradeEl(), ...tiles(), ...filedRows(), ...cells()]) {
      expect(waiting(el), 'a piece is hidden waiting for a reveal that never runs').toBe(false)
      expect(hasMotion(el), 'a piece moves under reduced motion').toBe(false)
    }
    step(10_000)
    expect(played.filter((c) => c === 'tick-up'), 'a blip played for a number that never counted').toEqual([])
    expect(played.filter((c) => c === 'commendation-fanfare'), 'the grade did not sound, or sounded twice').toHaveLength(1)
    observer.disconnect()
  })

  it('keeps what is on screen when reduced motion is turned on mid-reveal and off again', () => {
    listen()
    const state = WON()
    show(state)
    step(DEBRIEF_MOTION.leadMs + DEBRIEF_MOTION.heroMs + DEBRIEF_MOTION.countMs)
    expect(played.filter((c) => c === 'tick-up'), 'the first stat did not land').toHaveLength(1)
    flipReducedMotion(true)
    expect(statValues(), 'turning reduced motion on did not show everything').toEqual(finals(state))
    flipReducedMotion(false)
    step(10_000)
    expect(statValues(), 'turning it off again took numbers back off the screen').toEqual(finals(state))
    expect(waiting(gradeEl()) || cells().some(waiting) || tiles().some(waiting), 'turning it off again hid a piece').toBe(false)
    expect(played.filter((c) => c === 'tick-up'), 'the reveal replayed its blips').toHaveLength(1)
  })
})

describe("the debrief's stylesheet", () => {
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
    for (const cls of MOTION) expect(animationOf(cls), `${cls} does not run`).toMatch(/dc-/)
    const duration = (cls: string) => {
      const m = STYLESHEET.match(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([0-9.]+)(m?s)`))
      expect(m, `${cls} has no duration`).not.toBeNull()
      return Number(m![1]) * (m![2] === 's' ? 1000 : 1)
    }
    expect(duration('dc-burst-fly')).toBe(DEBRIEF_MOTION.burstMs)
    expect(duration('dc-stat-in')).toBe(DEBRIEF_MOTION.statInMs)
    expect(duration('dc-filed-in')).toBe(DEBRIEF_MOTION.rowInMs)
    expect(duration('dc-strip-fill')).toBe(DEBRIEF_MOTION.stripCellMs)
  })
})

describe('the countdown to the next Daily Op, and yesterday\'s grade', () => {
  it('counts to the next local midnight, a second at a time, once today\'s Daily Op is in', () => {
    setReducedMotion(true)
    localStorage.setItem('dc-daily', JSON.stringify({ '20260927': { n: 1, seed: 1, outcome: 'won', mai: 75, turns: 6, recordedAt: '2026-09-27T15:00:00Z' } }))
    show(WON())
    const text = () => container.querySelector('[data-countdown]')!.textContent
    expect(text()).toBe('NEXT DAILY OP IN08:00:00')
    step(1000)
    expect(text()).toBe('NEXT DAILY OP IN07:59:59')
  })

  it("says today's Daily Op is open on a practice debrief while today's official run is not in (R6 question 14)", () => {
    setReducedMotion(true)
    show(WON())
    expect(container.querySelector('[data-countdown]')!.textContent).toBe('DAILY OP #1 IS OPEN NOW')
  })

  it('says the next one is open when a Daily Op finishes after the midnight that ended its date', () => {
    setReducedMotion(true)
    vi.setSystemTime(new Date(2026, 8, 28, 0, 30))
    show(WON(), TODAY, 'official')
    expect(container.querySelector('[data-countdown]')!.textContent).toBe('DAILY OP #2 IS OPEN NOW')
  })

  it('keeps the streak and names the previous Daily Op by number when a run finishes after midnight (R6 question 14)', () => {
    setReducedMotion(true)
    vi.setSystemTime(new Date(2026, 8, 29, 0, 30))
    const rec = (n: number, outcome: string) => ({ n, seed: n, outcome, lossReason: outcome === 'lost' ? 'belowThreshold' : undefined, mai: outcome === 'won' ? 74 : 61.2, turns: 6, recordedAt: '2026-09-28T20:00:00Z' })
    localStorage.setItem('dc-daily', JSON.stringify({ '20260927': rec(1, 'lost'), '20260928': rec(2, 'won') }))
    show(WON(), { dateKey: '20260928', n: 2 }, 'official')
    expect(container.querySelector('[data-streak]')!.textContent).toBe('DAILY OP STREAK 2')
    expect(container.querySelector('[data-yesterday]')!.textContent).toBe('DAILY OP #1 · GRADE D')
    expect(container.querySelector('[data-countdown]')!.textContent).toBe('DAILY OP #3 IS OPEN NOW')
  })

  it('counts down rather than naming an earlier Daily Op when the clock is set back', () => {
    setReducedMotion(true)
    show(WON(), { dateKey: '20260928', n: 2 }, 'official')
    expect(container.querySelector('[data-countdown]')!.textContent).toBe('NEXT DAILY OP IN08:00:00')
  })

  it("shows yesterday's official grade on a Daily Op's debrief (brief 6.10), and nothing without one", () => {
    setReducedMotion(true)
    show(WON(), { dateKey: '20260928', n: 2 }, 'official')
    expect(container.querySelector('[data-yesterday]')).toBeNull()
    localStorage.setItem('dc-daily', JSON.stringify({ '20260927': { n: 1, seed: 1, outcome: 'lost', lossReason: 'belowThreshold', mai: 61.2, turns: 6, recordedAt: '2026-09-27T20:00:00Z' } }))
    show(WON(), { dateKey: '20260928', n: 2 }, 'official')
    // By number: after midnight "yesterday" would name the wrong day (R6 question 14).
    expect(container.querySelector('[data-yesterday]')!.textContent).toBe('DAILY OP #1 · GRADE D')
    // Free play has no yesterday.
    show(WON())
    expect(container.querySelector('[data-yesterday]')).toBeNull()
  })
})

describe('the ways on', () => {
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
    // In the go colour, not amber (R7 fresh eyes: it read as a warning).
    expect(container.querySelector('[data-share-notice]')!.className).toContain('text-dc-go')
    expect(container.querySelector('[data-share-notice]')!.getAttribute('role')).toBe('status')
  })

  it('falls back to the clipboard where there is no sheet, or the sheet fails, but not when the player closes it', async () => {
    setReducedMotion(true)
    const state = WON()
    const text = shareText(state)
    let copied = ''
    vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state)
    await click(byText(/copy result/i)!)
    expect(copied).toBe(text)
    expect(copied.split('\n'), 'free play shares four lines').toHaveLength(4)
    expect(notice()).toBe('Result copied. Paste it anywhere.')
    expect(container.querySelector('[data-share-notice]')!.className).toContain('text-dc-go')
    const failing = (name: string) => async () => {
      throw Object.assign(new Error(name), { name })
    }
    copied = ''
    vi.stubGlobal('navigator', { share: failing('NotAllowedError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state)
    await click(byText(/share result/i)!)
    expect(copied, 'a failed sheet did not fall back to the clipboard').toBe(text)
    copied = ''
    vi.stubGlobal('navigator', { share: failing('AbortError'), clipboard: { writeText: async (t: string) => void (copied = t) } })
    show(state)
    await click(byText(/share result/i)!)
    expect(copied, 'closing the sheet copied anyway').toBe('')
    expect(notice()).toBe('')
    // A copy that fails says so in amber, the one notice that is a warning.
    vi.stubGlobal('navigator', { clipboard: { writeText: failing('NotAllowedError') } })
    show(state)
    await click(byText(/copy result/i)!)
    expect(notice()).toBe('Copy failed; try again.')
    expect(container.querySelector('[data-share-notice]')!.className).toContain('text-dc-warn')
  })

  it('offers SHARE and PLAY AGAIN on the bar pinned under the thumb, then DOSSIER n / 18 and BACK TO TITLE, in that order', async () => {
    setReducedMotion(true)
    const state = WON()
    firstGameOnDevice(state)
    let again = 0
    let title = 0
    show(state, undefined, null, () => (again += 1), () => (title += 1))
    const order = [...container.querySelectorAll('button')].map((b) => b.textContent)
    const n = metIn(state).length
    expect(order.slice(-4)).toEqual(['COPY RESULT', 'PLAY AGAIN', `DOSSIER ${n} / 18`, 'BACK TO TITLE'])
    const bar = container.querySelector('[data-debrief-bar]')!
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['COPY RESULT', 'PLAY AGAIN'])
    expect(bar.className).toMatch(/\bsticky\b/)
    expect(bar.className).toMatch(/\bbottom-0\b/)
    await click(byText(/^PLAY AGAIN$/)!)
    await click(byText(/^BACK TO TITLE$/)!)
    expect([again, title]).toEqual([1, 1])
  })

  it('opens the Dossier over the debrief, and BACK TO DEBRIEF returns to it with focus on DOSSIER', async () => {
    setReducedMotion(true)
    const state = WON()
    firstGameOnDevice(state)
    show(state)
    await click(container.querySelector('[data-open-dossier]')!)
    await settle()
    const overlay = container.querySelector('[data-dossier-overlay]')
    expect(overlay, 'DOSSIER opened nothing').not.toBeNull()
    expect(overlay!.querySelector('h2')!.textContent).toBe('COLDVEIL DOSSIER')
    expect(container.querySelector('[data-debrief]')!.hasAttribute('inert'), 'the debrief stays live under the Dossier').toBe(true)
    await click(byText(/^BACK TO DEBRIEF$/)!)
    step(10)
    expect(container.querySelector('[data-dossier-overlay]')).toBeNull()
    expect(document.activeElement?.hasAttribute('data-open-dossier'), 'focus did not come back to DOSSIER').toBe(true)
  })
})
