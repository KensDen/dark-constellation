// @vitest-environment jsdom
//
// The Game.tsx render fixture (brief v1.2 row 4e), and the guards it makes
// possible.
//
// Eight guards reached this round still pinned by spelling: they read
// Game.tsx as text and asserted that some string was present. The Round 4c
// audit classified every one of them as unverified under principle 10 as
// qualified, because a text pin proves the spelling is there and not that
// the program behaves. One of the eight is a PRODUCT fix, which is worse
// than a test-layer gap: the mute control was unmounting at the loudest
// moment of a lost campaign, and its only guard was a substring that
// survives moving the control straight back inside the gate it was just
// moved out of.
//
// Everything here renders the real component and drives it the way a
// player does. None of these can be satisfied by writing the code
// differently.
//
// PRINCIPLE 15, stated before the code rather than after it. This file is a
// test double for a browser and a player, and a double's errors agree with
// the code's errors by construction. The constants below that could mask a
// class of bug, named:
//
//   - THE CONSTELLATION STUB. Constellation.tsx builds a three.js
//     WebGLRenderer, which jsdom cannot provide, and it is lazy() inside
//     Suspense, so loading it for real would make every render here
//     asynchronous. It is stubbed. That is safe TODAY for a reason that can
//     expire: the frame renders only on the start screen, and every guard
//     below is on the campaign screen, so nothing asserted here touches it.
//     The moment the frame moves to the play screen, which is exactly what
//     the deferred asset-light row is waiting for, this stub becomes
//     load-bearing and must be revisited.
//   - THE STORAGE STUB. jsdom under this vitest implements no Storage at
//     all. The stub covers getItem/setItem/removeItem/clear on string keys,
//     which is the whole of what the code calls. It cannot exercise quota
//     failures or a private-mode refusal; those paths are wrapped in
//     try/catch precisely because nothing here can reach them.
//   - THE MATCHMEDIA STUB reports one boolean. It cannot model a preference
//     that changes mid-session, so the mid-session path is not covered
//     here; the live subscription itself is covered in motion.ts's own
//     suite.
//   - THE AUDIO FAKE is the one from tests/fakeAudio.ts, whose own masking
//     constant (a clock that must not be zero) is documented there.
//   - THE NIGHT'S CHUNKS. The night (src/ui/night) is three chunks that
//     the board fetches as it opens and renders from once they are in.
//     They are imported once before the suite, so each is in hand on a
//     microtask, as a warm cache would have it. A fetch that fails, which
//     Game and the night answer with a single CONTINUE, is not reachable
//     here.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted above the import of Game, which is what vi.mock requires.
vi.mock('../src/ui/Constellation', () => ({
  default: () => null,
}))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { planFor } from '../src/engine/campaign'
import { eventById } from '../src/engine/rules'
import { maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import { captureGame, decodeSaveCode, encodeSaveCode } from '../src/persistence'
import { glossaryEntries } from '../src/ui/reference'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { newOperation } from '../src/ui/session'
import { DISCLOSURE_WORD_BUDGETS, JOB_FRAMING_HEADING, briefCopy, countWords, disclosureBlocks, jobFramingBlocks } from '../src/ui/brief'
import { FULL_BRIEF_OPEN, chainLine } from '../src/ui/board/boardModel'
import type { AssetKind, GameState, TurnActions, TurnRecord } from '../src/engine/types'
import { CONDITION_CUES, MOMENT_CUES, SECTION_6_ROWS, VISUAL_CLASS, outcomeSound, strikeSound, type Moment, type SoundCue } from '../src/cues'
import { nightOf, resultOf } from '../src/ui/night/nightModel'
import { ENDING, INSOLVENT_LINE } from '../src/ui/night/nightCopy'
import { SOUND_TOGGLE_LABELS, chromeCopy, firstInputCopy } from '../src/ui/brief'
import { getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { CROSSING_SOUND } from '../src/ui/cues/Meter'
import { FakeAudioContext, installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT, a } from './scripts'
import { POLICIES } from './policies'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let contexts: FakeAudioContext[]
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

function setReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

// The night's three chunks, loaded once, so each is in hand on a microtask
// (tests/night-r3.dom.spec.tsx does the same).
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  setReducedMotion(false)
  resetAudioEngineForTests()
  contexts = installFakeAudioContext().contexts
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // App.tsx arms this at the shell, above every screen. The fixture mounts
  // Game on its own, so it arms it here for the same reason: a control
  // inside Game is never what installs the listener.
  //
  // The uninstall is kept and called below. It is not tidiness: the
  // listener uninstalls itself on the first gesture, so a test that never
  // makes one leaves it attached, holding the engine that existed when it
  // was installed. The next test's first gesture then fires every
  // accumulated listener at once, each unlocking its own disposed engine
  // and building its own AudioContext. That is what three contexts in a
  // one-gesture test turned out to mean.
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
  vi.restoreAllMocks()
})


// Every text node inside a disclosure except its summary and any nested
// disclosure (Round 7). The first readers took li and p only, so text in a
// span, a div or a bare node was invisible to the budget and the join. The
// first replacement split at EVERY text node, which is lossy the other way:
// React renders "+{credits}" as two nodes, "+" and "10", and a space between
// them counts one word as two. So nodes inside the same block concatenate
// exactly as the browser shows them, and a space separates blocks.
const BLOCK = 'p,li,div,ul,ol,h1,h2,h3,h4,dt,dd,section,summary,details'
function bodyText(details: Element): string {
  let out = ''
  let lastBlock: Element | null = null
  const walker = document.createTreeWalker(details, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || el.closest('summary') || el.closest('details') !== details) continue
    const block = el.closest(BLOCK)
    out += (block !== lastBlock ? ' ' : '') + (n.textContent ?? '')
    lastBlock = block
  }
  return out.replace(/\s+/g, ' ').trim()
}

const ctx = () => contexts[0]

// A real campaign state, from the engine rather than hand-built.
function gameAt(turn: number, seed = 20260712): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

// The save format's phases (SavePhase since v1.3 Round 0: 'harden' left
// with its sheet). The night is presentation only and is never saved as
// itself: a save at 'aftermath' reloads onto END OF TURN for its last turn.
type Phase = 'brief' | 'procure' | 'aftermath'

// A fresh key per call, because Game seeds its own state from `initial`
// once at mount and App does the same thing for the same reason. Without
// it a second render reconciles the existing fiber and quietly keeps the
// first campaign, which is a fixture that lies rather than a test that
// fails.
let mounts = 0
function render(state: GameState, phase: Phase = 'procure') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: phase as never }} onExit={() => {}} />)
  })
}

const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}

// Load a save code the way a player does since v1.3 R1: SYSTEM, paste,
// Load save code.
function pasteThroughSystem(code: string) {
  const gear = container.querySelector('button[aria-label="System"]')
  expect(gear, 'no SYSTEM on the HUD').not.toBeNull()
  click(gear!)
  const paste = container.querySelector('[data-sheet="system"] textarea[aria-label="save code"]') as HTMLTextAreaElement | null
  expect(paste, 'the SYSTEM sheet has no paste box').not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(paste!, code)
    paste!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const load = byText(/^load save code$/i)
  expect(load, 'no load control').toBeDefined()
  expect(load!.hasAttribute('disabled'), 'the load control is disabled, so the paste did not register').toBe(false)
  click(load!)
}

// The glossary's entries arrive by chunk since the Round 1 fix batch (the
// overlay's module is lazy), so a tap opens the dialog at once and the
// entries land when the import settles. The glossary tests wait for that
// the way a player's browser does, and the ones that look at the dialog
// itself (that it opened, that it holds focus, that the game behind it is
// inert) look before the chunk lands as well as after.
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
}

// The budget readout's own span on the HUD, which is where the flash class
// lands. Since v1.3 R2 it shows the engine's balance, not the cart: an
// order moves REMAINING on the dock and leaves this figure where it was,
// so the player's own spend reaches it only when a turn plays out.
function budgetSpan(): HTMLElement {
  const el = container.querySelector('span[aria-label^="BUDGET"]')
  if (!el) throw new Error('the budget readout is not on screen')
  return el as HTMLElement
}
const readBudget = () => Number(/BUDGET (-?\d+)/.exec(budgetSpan().getAttribute('aria-label') ?? '')?.[1] ?? NaN)
// REMAINING on the dock: the balance less tonight's orders.
function readRemaining(): number {
  const el = container.querySelector('span[data-remaining]')
  if (!el) throw new Error('the dock shows no REMAINING')
  return Number(/REMAINING\s*(-?\d+)/.exec(el.textContent ?? '')?.[1] ?? NaN)
}

// THE BOARD'S CONTROLS (v1.3 R2, brief 5.4). PROCURE is one sheet behind
// the dock's PROCURE button, with ASSETS, DEFENSES and INTEL on it, and
// every line on it is a toggle: a tap orders one, a second tap cancels it.
// There is no confirm step and no refusal any more: an order the budget
// cannot take is disabled on the sheet. These drive the sheet the way a
// thumb does, by the attributes it carries for exactly this, so the tests
// above the board read the same as they did above the sections. A test
// that renders at 'procure' lands with PROCURE already open, which is what
// an autosave from that phase does too.
//
// Each selector names its tag (v1.2 R2 fix, after CI run #19). jsdom's
// selector engine answers a bare attribute selector by walking every
// element in the container, and since R2 most of those are sprite and
// backdrop rects; with the tag it starts from that tag's elements only.
// Measured on the decision board: 1.3ms a query without, 0.14ms with.
const sheetOpen = (id: string) => container.querySelector(`section[data-sheet="${id}"]`)
function openSheet(label: 'PROCURE') {
  if (sheetOpen(label.toLowerCase())) return
  const control = container.querySelector(`button[data-action="${label.toLowerCase()}"]`)
  if (!control) throw new Error(`no ${label} control on screen`)
  click(control)
}
// The PROCURE line for one asset kind, WITHOUT pressing it, since that
// press is what several tests inspect.
function procureKind(kind: AssetKind): HTMLButtonElement {
  openSheet('PROCURE')
  const k = container.querySelector(`button[data-procure-kind="${kind}"]`) as HTMLButtonElement | null
  if (!k) throw new Error(`PROCURE offers no ${kind}`)
  return k
}
// Order one asset of a kind (a tap on a line already ordered would cancel
// it, so an ordered line is left alone). Returns the line.
function buy(kind: AssetKind): HTMLButtonElement {
  const k = procureKind(kind)
  if (k.getAttribute('aria-pressed') !== 'true') click(k)
  return k
}
// The lines PROCURE carries, by section: the defenses (the IR retainer
// among them) and the intel order, which is a button on a night the brief
// is not free and a line of text on one it is.
const defenseButtons = () => [...container.querySelectorAll('button[data-procure-defense]')] as HTMLButtonElement[]
const intelButton = () => container.querySelector('button[data-procure-intel]') as HTMLButtonElement | null
const isRetainer = (b: HTMLButtonElement) => b.getAttribute('data-procure-defense') === 'irRetainer'
const pressed = (b: Element) => b.getAttribute('aria-pressed') === 'true'

// The full brief behind the TONIGHT card's toggle, opened the way a player
// opens it. It is its own chunk since v1.3 R2, so the open waits for the
// import to settle, as the Glossary's does below.
async function openFullBrief() {
  const toggle = container.querySelector('button[data-full-brief]')
  expect(toggle, 'the TONIGHT card has no full brief toggle').not.toBeNull()
  if (toggle!.getAttribute('aria-expanded') !== 'true') click(toggle!)
  await settle()
  expect(container.querySelector('div[data-brief-scroll]'), 'the full brief did not open').not.toBeNull()
}

// THE COMMIT AND THE NIGHT (v1.3 Round 3, brief 5.5). EXECUTE is a plain
// button that ends the turn on a click; the hold-to-resolve control and
// its keyboard path left in Round 0. A synthetic keydown does not click a
// plain button in jsdom, so the fixture clicks it, as a player taps it.
// What follows is THE NIGHT, which retired the v1.1 director's beats this
// round: COLDVEIL IS MOVING for 750ms, then per event a strike on the
// board and its card, the intel card on a first meeting, and END OF TURN
// with BEGIN TURN n+1 or DEBRIEF. Only the overlay and the strike run on
// timers; every card waits for a tap, so the fixture taps the night
// through by the one way on each card offers, as a player does.
//
// The night renders from chunks the board fetched ahead, so a tap that
// changes its stage is awaited and settled before anything is read.
const executeControl = () => container.querySelector('button[data-execute]') as HTMLButtonElement | null
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// Where the night is: the intel card (over the hit card it came from), a
// night card by its kind, the overlay or the strike; or off the night, on
// the deciding board (its dock) or the score screen (its save code).
type Stage = 'intel' | 'hit' | 'call' | 'debris' | 'opportunity' | 'end' | 'moving' | 'strike' | 'board' | 'score' | 'none'
function nightStage(): Stage {
  if (container.querySelector('div[data-intel-file]')) return 'intel'
  const card = container.querySelector('section[data-night-card]')
  if (card) return card.getAttribute('data-night-card') as Stage
  if (container.querySelector('div[data-moving]')) return 'moving'
  if (container.querySelector('div[data-strike-banner]')) return 'strike'
  if (container.querySelector('nav[data-dock]')) return 'board'
  if (container.querySelector('textarea[data-outcome-save-code]')) return 'score'
  return 'none'
}
const inNight = () => !['board', 'score', 'none'].includes(nightStage())
// The night's two clocks, run in steps a caller can sample between.
const NIGHT_STEP_MS = 300
async function wait(ms: number, sample?: () => void) {
  for (let left = ms; left > 0; left -= NIGHT_STEP_MS) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(NIGHT_STEP_MS, left))
    })
    await act(async () => {})
    sample?.()
  }
}
// Tap the night on screen through to its end. The overlay and each strike
// are given their time; a card is given `dwell` first, when the caller
// wants what it plays on its own clock (its result tiles tick, and a new
// condition's alarm and a streak's fanfare sound, after it arrives, and a
// tap takes the card away before they can); then its way on is tapped:
// FILE IT, the call (HOLD unless told otherwise), COLLECT INTEL CARD or
// CONTINUE, and BEGIN TURN or DEBRIEF, which ends the night. With
// `stopAt: 'end'` it stops on END OF TURN, untapped. Returns every card
// it met, in order, and the taps it took.
interface NightOpts {
  sample?: () => void
  onCard?: (stage: Stage) => void
  call?: 'burn' | 'hold'
  dwell?: number
  stopAt?: 'end'
}
async function playNight(opts: NightOpts = {}): Promise<{ seen: Stage[]; taps: number }> {
  const seen: Stage[] = []
  let taps = 0
  for (let i = 0; i < 120; i += 1) {
    if (nightStage() === 'none') await settle()
    const stage = nightStage()
    if (stage === 'moving' || stage === 'strike') {
      await wait(NIGHT_STEP_MS, opts.sample)
      continue
    }
    if (stage === 'board' || stage === 'score' || stage === 'none') break
    seen.push(stage)
    opts.onCard?.(stage)
    if (stage === 'end' && opts.stopAt === 'end') break
    if (opts.dwell) await wait(opts.dwell, opts.sample)
    const way =
      container.querySelector('button[data-file-it]') ??
      container.querySelector(`button[data-call="${opts.call ?? 'hold'}"]`) ??
      container.querySelector('button[data-collect]') ??
      container.querySelector('button[data-continue]') ??
      container.querySelector('button[data-begin]')
    if (!way) break
    await tap(way)
    taps += 1
    opts.sample?.()
    if (stage === 'end') break
  }
  return { seen, taps }
}
// The engine's record of the turn a board is deciding, resolved as
// EXECUTE resolves it with nothing ordered and HOLD on the call, which is
// what the fixture taps.
function recordOf(state: GameState): TurnRecord {
  const next = resolveTurn(state, { ...NO_OP, debris: 'hold' }, turnRng(state.seed, state.turn))
  return next.history[next.history.length - 1]
}
// What the game played, cue by cue, from a spy on the audio engine. Every
// cue goes through fireCue (src/audio/useSound.ts), so what the spy hears
// is what the speaker would have.
function spyPlay(): string[] {
  const played: string[] = []
  vi.spyOn(getAudioEngine(), 'play').mockImplementation((cue) => {
    played.push(cue)
    return true
  })
  return played
}
// Every element under the container whose class names a dc- class, in
// document order: what querySelectorAll('[class*="dc-"]') returns, found
// with a TreeWalker instead, because jsdom's selector engine tests the
// substring on every element through its full matcher. Measured on the
// decision board: 1.64ms a scan by selector, 0.21ms walked, the same 122
// elements. The opening drive scans at every step of the night.
function dcClassed(within: Element = container): Element[] {
  const walker = document.createTreeWalker(within, NodeFilter.SHOW_ELEMENT)
  const out: Element[] = (within.getAttribute('class') ?? '').includes('dc-') ? [within] : []
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    if ((n.getAttribute('class') ?? '').includes('dc-')) out.push(n)
  }
  return out
}
const classesOf = (els: Element[]) => els.flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
// Every class the registry can paint, derived rather than matched by
// prefix, so a stray dc- class from a stylesheet cannot pass for a cue.
const CUE_CLASSES = new Set(Object.values(VISUAL_CLASS).filter(Boolean))
// The night's motion, by class: every treatment the registry paints, and
// the ones that ride with them (a through tile's entrance; the strike's
// reticle, lock-on, burst, strobe and falling score; the HELD flash), plus
// the board's own (the badges, the pulses, an order sliding in). Each is
// put on only with motion allowed. The flash colours are not here: they
// are meaning, not motion, and play in both modes.
const isMotion = (c: string) =>
  CUE_CLASSES.has(c) || /^dc-(tile-hit|reticle|lock-on|burst|hit-strobe|mai-float|shield-flash|stamp-pop|decode|badge-|pulse-|manifest-in)/.test(c)

describe('the fixture renders the real campaign screen', () => {
  it('mounts a turn in progress without a browser', () => {
    render(gameAt(3))
    expect(container.querySelector('header[data-hud]'), 'the HUD did not render').not.toBeNull()
    expect(container.textContent, 'the HUD did not render its budget').toMatch(/BUDGET/)
    expect(buttons().length, 'no controls rendered').toBeGreaterThan(0)
  })
})

// THE DECLARATION, driven through a whole turn. Search the operation's
// turns for one whose night folds the player's order with a non-negative
// unchosen part, and report the tone the budget took on the move that
// moved it. `order` places the order through the controls; the spend is
// read off REMAINING, which is where an order shows while the player
// decides (v1.3 R2: the HUD's budget is the engine's balance until the
// turn plays). Since v1.3 R3 the night folds the order into the budget on
// its first board, tonight's orders landed: COLDVEIL IS MOVING's, or under
// reduced motion, where the overlay is skipped, the first card's.
async function declarationSweep(order: () => void, motion: 'motion' | 'reduced') {
  setReducedMotion(motion === 'reduced')
  const attempt = async (turn: number) => {
    const state = gameAt(turn)
    if (state.status !== 'playing') return null
    render(state, 'procure')
    const pre = readRemaining()
    order()
    const spend = pre - readRemaining()
    if (spend <= 0) return null
    const execute = executeControl()
    if (!execute || execute.disabled) return null
    const tone = () => {
      const span = budgetSpan()
      return /dc-flash-bad/.test(span.className) ? 'bad' : /dc-flash-good/.test(span.className) ? 'good' : 'neutral'
    }
    // The balance the HUD showed while the player decided, which is where
    // the night starts from: the fold lands on its very first board.
    const steps: { credits: number; tone: string }[] = [{ credits: readBudget(), tone: tone() }]
    await tap(execute)
    if (!inNight()) return null
    // EXECUTE commits on a tap since v1.3 Round 0, and the night is tapped
    // through card by card, sampled between the steps of the overlay and
    // of each strike, and after every tap.
    const sample = () => {
      if (!container.querySelector('span[aria-label^="BUDGET"]')) return
      steps.push({ credits: readBudget(), tone: tone() })
    }
    sample()
    await playNight({ sample })
    const moved = steps.findIndex((st, i) => i > 0 && st.credits !== steps[i - 1].credits)
    if (moved <= 0) return null
    const delta = steps[moved].credits - steps[moved - 1].credits
    return { turn, spend, delta, unchosen: delta + spend, tone: steps[moved].tone }
  }
  const tried: string[] = []
  let found: Awaited<ReturnType<typeof attempt>> = null
  for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns && !found; turn += 1) {
    const r = await attempt(turn)
    if (!r) continue
    tried.push(`turn ${r.turn}: moved ${r.delta} with ${r.spend} chosen, unchosen ${r.unchosen}`)
    if (r.unchosen >= 0) found = r
  }
  return { found, tried }
}

describe('the declaration chain, asserted by execution', () => {
  // The chain runs from Game's declaration to the Readout to the pure tone
  // rule (through the v1.1 director until v1.3 R3; through the night
  // since), and the Round 4 opening pass proved four of those links could
  // be reverted one line at a time with the suite, typecheck and lint all
  // green. It was pinned by four regular expressions over two source
  // files, and named the highest-risk of the eight because of it.
  //
  // What it protects: spending is a decision, not damage. The night folds
  // the player's own purchase into the first board it shows, so without
  // the declaration reaching the readout ungated, every turn in which the
  // player bought anything paints the spend in the damage colour.
  it('does not paint the player-s own spend as damage', () => {
    const state = gameAt(2)
    render(state, 'procure')
    const before = budgetSpan().getAttribute('aria-label')
    const remaining = readRemaining()
    // Order the cheapest thing on offer.
    buy('sat')
    // The order shows on REMAINING; the HUD's budget is the balance and
    // holds still while the player decides (v1.3 R2, QC G-102).
    expect(readRemaining(), 'the order did not reach REMAINING').toBeLessThan(remaining)
    expect(budgetSpan().getAttribute('aria-label'), 'the HUD budget moved with the cart, which R2 retired').toBe(before)
    expect(budgetSpan().className, 'a purchase was painted as damage').not.toMatch(/dc-flash-bad/)
    expect(budgetSpan().className, 'a purchase was painted as a gain').not.toMatch(/dc-flash-good/)
  })

  it('carries the declaration through a real night, move by move', async () => {
    // The chain end to end, which the four source regexes stood in for.
    //
    // The turn is not hard-coded. Under the director most turns could not
    // tell a working declaration from a severed one, because the fold beat
    // also carried a repair bill and the unchosen part read as damage
    // either way. The night's first board is tonight's orders landed and
    // nothing else (repair bills wait for END OF TURN), so a turn with an
    // order to place discriminates; the search stays, and fails if it
    // finds none, so it can never quietly stand on a blind turn and report
    // success.
    const { found, tried } = await declarationSweep(() => buy('sat'), 'motion')
    expect(
      found,
      `no turn in the sweep folds a purchase with a non-negative unchosen part, so none of them can tell a working declaration from a severed one. Tried:\n${tried.join('\n')}`,
    ).not.toBeNull()

    // The rule, over the numbers the screen actually showed. The player's
    // own spend is not damage, so a fold that is nothing but the purchase
    // must not take the damage colour.
    const expected = found!.unchosen > 0 ? 'good' : 'neutral'
    expect(
      found!.tone,
      `turn ${found!.turn}: the budget moved ${found!.delta} with ${found!.spend} of it chosen, so the unchosen part is ${found!.unchosen}`,
    ).toBe(expected)
  })
})

describe('the declaration covers the defenses as well as the assets', () => {
  it('does not paint a defense order as damage either', async () => {
    // The retired pin held FOUR links; the fixture's first version drove
    // three. The fourth is the `chosen` prop, whose other arm was live:
    // countermeasures and the IR retainer were bought in the hardening
    // phase and each moves the ticker. Narrowing it to
    // `chosen={phase === 'procure'}` left every countermeasure purchase
    // flashing magenta and ticking down like damage, with the suite green.
    //
    // Since v1.3 Round 0 the defenses are ordered in PROCURE beside the
    // assets, through their own lines. Since v1.3 R2 an order no longer
    // moves the HUD's budget while the player decides, so the defense
    // order is carried through the night that folds it, as the asset buy
    // is above: the same sweep, with a defense as the order.
    const orderDefense = () => {
      openSheet('PROCURE')
      const line = defenseButtons().find((b) => !b.disabled && !pressed(b))
      expect(line, 'PROCURE offered no defense to order').toBeDefined()
      click(line!)
    }
    const { found, tried } = await declarationSweep(orderDefense, 'motion')
    expect(
      found,
      `no turn in the sweep folds a defense order with a non-negative unchosen part. Tried:\n${tried.join('\n')}`,
    ).not.toBeNull()
    const expected = found!.unchosen > 0 ? 'good' : 'neutral'
    expect(
      found!.tone,
      `turn ${found!.turn}: a defense order of ${found!.spend} folded into a ${found!.delta} move was painted ${found!.tone}`,
    ).toBe(expected)
  })
})

describe('the declaration holds when the night arrives at once', () => {
  it('does not paint the buy as damage when reduced motion skips the overlay', async () => {
    // Until v1.3 R3 this guarded SKIP: finishPlayback deliberately did not
    // clear chosenSpend, because SKIP ended playback in the same commit
    // that jumped credits to the engine's after-state, and that jump still
    // carried the purchase. SKIP retired with the director. The night has
    // one other road for the fold, and it is this guard's subject now:
    // under reduced motion there is no overlay, so the board goes from the
    // one EXECUTE left straight to the first card's, which folds the order
    // together with whatever the first event moved (on a night that opens
    // with an opportunity, its windfall). A declaration cleared or never
    // set on that road paints the spend as damage there and nowhere else.
    //
    // Searched for a discriminating turn, for the same reason the motion
    // test is: a turn with nothing to order cannot tell a surviving
    // declaration from a cleared one.
    const { found, tried } = await declarationSweep(() => buy('sat'), 'reduced')
    expect(
      found,
      `no turn lets the night arrive at once onto a non-negative unchosen part, so none can tell a surviving declaration from a cleared one. Tried:\n${tried.join('\n')}`,
    ).not.toBeNull()
    const expected = found!.unchosen > 0 ? 'good' : 'neutral'
    expect(
      found!.tone,
      `turn ${found!.turn}: the night's first card moved the budget ${found!.delta} with ${found!.spend} of it chosen`,
    ).toBe(expected)
  })
})

describe('the mute control, asserted by execution', () => {
  // The product fix from Round 4d, whose only guard was a substring that
  // survives its own reversion.
  // Since R1b the toggles live in the SYSTEM sheet behind the HUD's gear,
  // so the sheet is opened first; the claim, that the toggles are there
  // whatever the campaign's status, is the same.
  const openSystem = () => click(container.querySelector('button[aria-label="System"]')!)

  it('is on screen while the campaign is playing', () => {
    render(gameAt(3))
    openSystem()
    expect(byText(new RegExp(`^${SOUND_TOGGLE_LABELS.effects} (ON|OFF)$`)), 'no effects toggle').toBeDefined()
    expect(byText(new RegExp(`^${SOUND_TOGGLE_LABELS.music} (ON|OFF)$`)), 'no music toggle').toBeDefined()
  })

  it('is still on screen once the campaign has been decided', async () => {
    // The defect: the toggles rode the save row, which is gated on the
    // status being 'playing'. The deciding turn's night runs with the
    // status already won or lost, and that is when the BLACKOUT CHAIN and
    // the defeat sting play. Moving the control back inside that gate is
    // the exact reversion a substring pin cannot see. The finished
    // campaign arrives at 'aftermath', so it lands on its last END OF
    // TURN, which is the night.
    let state = gameAt(1)
    while (state.status === 'playing') {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    expect(state.status, 'the sweep never finished a campaign').not.toBe('playing')
    render(state, 'aftermath')
    await settle()
    expect(nightStage(), 'the decided campaign did not land on its last END OF TURN').toBe('end')
    openSystem()
    expect(
      byText(new RegExp(`^${SOUND_TOGGLE_LABELS.effects} (ON|OFF)$`)),
      'the mute control vanished when the campaign was decided',
    ).toBeDefined()
    // And the campaign-only controls are correctly gone, so this is not
    // passing because the whole row was left rendered unconditionally.
    expect(byText(/^Save$/), 'Save is still offered on a finished campaign').toBeUndefined()
  })
})

describe('the procurement sounds, asserted by execution', () => {
  // Two section 6 rows whose only proof was that the string play('buy-click')
  // appeared somewhere in Game.tsx, which survives losing four of its five
  // call sites.
  it('clicks with the buy voice, at more than one of its call sites', () => {
    // The old pin survived losing four of five call sites, and the first
    // version of this guard pressed one control and asserted only that
    // SOME sound happened, which cannot tell buy-click from the refusal
    // buzz. Identified by pitch now, since that is what reaches the graph.
    //
    // Turn 3 because its intel brief is not free, so both of the brief's
    // controls (PROCURE's INTEL line and the TONIGHT card's intel row) are
    // live and each is pressed.
    const state = gameAt(3)
    render(state, 'procure')
    const engine = getAudioEngine()
    // Unlock, then take the fingerprint of each voice from the engine
    // itself rather than writing frequencies down here.
    act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    const fingerprint = (cue: 'buy-click' | 'denied-buzz') => {
      ctx().reset()
      engine.play(cue)
      return ctx().oscillators().map((o) => o.frequency.first())
    }
    const buyVoice = fingerprint('buy-click')
    const denyVoice = fingerprint('denied-buzz')
    expect(buyVoice, 'the two voices are indistinguishable, so this proves nothing').not.toEqual(denyVoice)
    const voiced = (what: string, press: () => void) => {
      ctx().reset()
      press()
      expect(ctx().oscillators().map((o) => o.frequency.first()), `${what} did not sound the buy voice`).toEqual(buyVoice)
      done.push(what)
    }

    const done: string[] = []
    // Call site one: a fleet order, a tap on its PROCURE line.
    const sat = procureKind('sat')
    expect(pressed(sat), 'the fixture already ordered a sat').toBe(false)
    voiced('the fleet order', () => click(sat))
    expect(pressed(sat), 'the tap did not order the sat').toBe(true)

    // Call site two: taking it back out again, a second tap on the same
    // line (removeAsset since v1.3 R2).
    voiced('cancelling the order on its line', () => click(sat))
    expect(pressed(sat), 'the second tap did not cancel the order').toBe(false)

    // The same cancel from the board: the queued tile on the asset strip,
    // which is a different control on the same handler.
    click(sat)
    const queued = container.querySelector('button[data-queued="sat"]')
    expect(queued, 'the ordered sat put no queued tile on the strip').not.toBeNull()
    voiced('cancelling the order from the strip', () => click(queued!))
    expect(container.querySelector('button[data-queued="sat"]'), 'the strip tile did not cancel the order').toBeNull()

    // Call site three: the intel brief, a different control entirely, in
    // PROCURE's INTEL section since v1.3 Round 0 (its own sheet on the
    // v1.2 board). Since v1.5 R2 it is ordered there alone (the TONIGHT
    // card's row opens PROCURE at it) and locks once ordered, a status
    // with no control to cancel it.
    openSheet('PROCURE')
    const intel = intelButton()
    expect(intel, 'the intel brief is free tonight, so its order goes unheard').not.toBeNull()
    voiced('the intel brief in PROCURE', () => click(intel!))
    expect(intelButton(), 'the ordered brief is still a control').toBeNull()
    expect(container.querySelector('[data-procure-intel][data-locked]')?.textContent, 'the ordered brief does not say it is locked').toContain('LOCKED')
    expect(container.querySelector('button[data-brief-order]'), 'the TONIGHT card still offers the ordered brief').toBeNull()
    expect(container.querySelector('[data-brief-locked]')?.textContent).toBe(`${DEFAULT_SCENARIO.prices.intelBrief} CR · LOCKED`)

    // Call sites four and five lived in the HARDENING phase, which the
    // first render never reached. Two of the five were therefore still
    // covered only by the source text pin the fixture was written to
    // replace, so deleting the sound from toggleCounter silenced every
    // countermeasure purchase with the suite green. On the v1.2 board both
    // were the HARDEN sheet (the IR retainer was the INTEL sheet's second
    // step until critique row M8 moved it there); since v1.3 Round 0 both
    // are PROCURE's DEFENSES section.
    const counter = defenseButtons().find((b) => !b.disabled && !pressed(b) && !isRetainer(b))
    expect(counter, 'PROCURE offered no defense').toBeDefined()
    voiced('a countermeasure order', () => click(counter!))
    // One new defense a night (v1.4): with that one ordered the retainer
    // reads 1 A TURN, so the order is taken back before the retainer's.
    expect(defenseButtons().find(isRetainer)!.hasAttribute('data-capped'), 'the retainer is open beside a defense ordered tonight').toBe(true)
    click(counter!)
    expect(pressed(counter!), 'the second tap did not cancel the defense').toBe(false)

    const retainer = defenseButtons().find(isRetainer)
    expect(retainer, 'the retainer is not among the defenses').toBeDefined()
    expect(retainer!.disabled, 'the fixture already owns the retainer, so its voice goes unheard').toBe(false)
    voiced('the retainer', () => click(retainer!))

    expect(done.length, `only pressed ${done.join(', ')}`).toBe(6)
  })
})

// THE REFUSAL, since v1.3 R2. The cannot-afford cue (the tile's shake,
// the spend line's flash and the buzz) left with the two-step sheet:
// PROCURE turns off an order it cannot afford instead of refusing it on a
// tap (brief 5.4). What the retired shake guards protected still applies,
// in the form the sheet allows: the control that cannot be afforded is
// the one that says so, and only it. A sheet that greyed out every line
// at once, or none, or keyed off the cart rather than the price of the
// line, is the mis-attribution those guards existed to prevent.
//
// Checks every order line on the open sheet against REMAINING: a line
// not yet ordered (and not owned, and not arriving after the last turn) is
// off exactly when its price is more than REMAINING. Returns the ids the
// budget turned off, so a caller can say which ones it needs refused.
function affordGate(label: string): string[] {
  const left = readRemaining()
  const refused: string[] = []
  const lines = [
    ...[...container.querySelectorAll('button[data-procure-kind]')].map((b) => [b, b.getAttribute('data-procure-kind')!] as const),
    ...defenseButtons().map((b) => [b, b.getAttribute('data-procure-defense')!] as const),
    ...(intelButton() ? [[intelButton()!, 'intel'] as const] : []),
  ] as (readonly [HTMLButtonElement, string])[]
  for (const [b, id] of lines) {
    if (pressed(b)) continue
    if (/Arrives after the last turn/.test(b.textContent ?? '')) {
      expect(b.disabled, `${label}: ${id} arrives too late and is still offered`).toBe(true)
      continue
    }
    // One new defense a turn (v1.4): with the turn's ordered, the others
    // are off for the cap, whatever their price, and say so instead of a
    // price (tests/procure-cap.dom.spec.tsx).
    if (b.hasAttribute('data-capped')) {
      expect(b.disabled, `${label}: ${id} is capped and still offered`).toBe(true)
      expect(/\d A TURN/.test(b.textContent ?? ''), `${label}: ${id} is capped and does not say so`).toBe(true)
      continue
    }
    // The card's cost chip (v1.6 R1: "10 CR", where "+ ADD · 10 CR" was).
    const price = Number(/^(\d+) CR$/.exec(b.querySelector('[data-cost]')?.textContent ?? '')?.[1] ?? NaN)
    expect(Number.isNaN(price), `${label}: ${id} shows no price`).toBe(false)
    expect(b.disabled, `${label}: ${id} at ${price} CR against ${left} remaining`).toBe(price > left)
    if (b.disabled) refused.push(id)
  }
  return refused
}

describe('every refusable control answers for its own refusal', () => {
  it('turns off the intel brief the filled budget cannot take, and only what it cannot take', () => {
    // The intel brief was the second refusable control the retired guard
    // covered, after the fleet tiles. Turn 2 since v1.3 Round 0: turn 1's
    // brief is free, so it has no control to refuse. One new defense a
    // night since v1.4, so the fill below takes one defense, not every one
    // it can afford: the budget is set by hand to 80 CR, where the fleet
    // and that defense leave less than the brief's price.
    render({ ...gameAt(2), credits: 80 }, 'procure')
    expect(affordGate('nothing ordered'), 'the empty cart already refused something').toEqual([])
    // Fill the budget the way a player does, the fleet first and then the
    // defenses in the order the sheet lists them, until nothing more fits.
    for (const kind of ['sat', 'groundStation', 'drone'] as AssetKind[]) {
      const k = procureKind(kind)
      if (!k.disabled) click(k)
    }
    for (const b of defenseButtons()) if (!b.disabled && !pressed(b) && !isRetainer(b)) click(b)
    const refused = affordGate('a filled cart')
    expect(refused.length, 'the filled cart refused nothing, so the gate was never exercised').toBeGreaterThan(0)
    expect(
      refused,
      `the filled cart still covers the intel brief (${readRemaining()} CR left), so its refusal is never reached`,
    ).toContain('intel')
    // A tap on the refused control orders nothing.
    const before = readRemaining()
    click(intelButton()!)
    expect(pressed(intelButton()!), 'the refused brief was still ordered').toBe(false)
    expect(readRemaining(), 'the refused brief still took the budget').toBe(before)
    // And cancelling an order gives the room back, so the gate follows the
    // budget rather than latching.
    const ordered = defenseButtons().find((b) => pressed(b) && !b.disabled)
    expect(ordered, 'nothing ordered to cancel').toBeDefined()
    click(ordered!)
    affordGate('after a cancel')
  })

  it('turns off the retainer too, which sits among the defenses', () => {
    // The IR retainer is the fourth refusable id and the only one that
    // lived in the hardening phase. Guarding the intel control alone left
    // this one unguarded, which a mutation showed. Since v1.3 Round 0 it is
    // one of PROCURE's DEFENSES, and the budget is filled with the other
    // defenses in that section first.
    //
    // Until v1.4 the budget was filled with the other ten defenses (103 CR
    // against 100 on turn 1). With one new defense a night a second
    // defense turns the retainer off for the cap, not the budget, so the
    // fill is the fleet, which the cap does not touch, on a budget set by
    // hand to 80 CR: the three assets leave 10, under the retainer's 12.
    // The refusal is asserted, so this cannot pass on a budget that never
    // filled.
    render({ ...gameAt(1), credits: 80 }, 'brief')
    openSheet('PROCURE')
    const retainer = () => defenseButtons().find(isRetainer)!
    expect(retainer(), 'the retainer is not on screen').toBeDefined()
    expect(retainer().disabled, 'the retainer is off before anything was ordered').toBe(false)
    for (const kind of ['sat', 'groundStation', 'drone'] as AssetKind[]) {
      const k = procureKind(kind)
      if (!k.disabled) click(k)
    }
    expect(retainer().hasAttribute('data-capped'), 'the fill ordered a defense, so the retainer is off for the cap').toBe(false)
    const refused = affordGate('the fleet ordered')
    expect(refused, `the other defenses never filled the budget (${readRemaining()} CR left)`).toContain('irRetainer')
    click(retainer())
    expect(pressed(retainer()), 'the refused retainer was still ordered').toBe(false)
  })
})

describe('the chrome the reading budget counts, asserted by execution', () => {
  // reading-diet.spec.ts bounds chromeCopy and firstInputCopy, which are
  // module return values, and nothing there can tell a rendered line from
  // one inside a branch nothing reaches. The first version of this guard
  // hand-copied seven of the twelve entries, so it had the same blind
  // spot for the other five: wrapping the Posture detail disclosure in
  // `{false && ...}` kept charging its words against the budget and
  // passed both guards.
  //
  // Derived from the two lists themselves, so a line added to the count is
  // a line this has to find on the deciding board. Turns 1, 2 and 3 cover
  // FIRST ORDERS, SECOND ORDERS and a paid brief night with its intel row.
  const missingOn = (state: GameState, lines: string[]) => {
    render(state, 'brief')
    const text = container.textContent ?? ''
    return lines.filter((line) => !text.includes(line))
  }

  it('renders every control the bound claims to cover', () => {
    for (const turn of [1, 2, 3]) {
      const state = gameAt(turn)
      expect(missingOn(state, chromeCopy(state)).join(', '), `turn ${turn}: chrome charges the budget for controls the screen does not render`).toBe('')
    }
    // The count itself, so this cannot pass by chromeCopy shrinking.
    // Eighteen since v1.2 R1: the five action-bar labels and the playback
    // speed control joined the first screen, the heading and the phase
    // button left it.
    // Sixteen since R1b: the five step numbers and the HOLD caption joined
    // the bar, and the six system controls left the first screen for the
    // sheet behind the gear, whose one word stands for them here.
    // Seventeen since R2b: RESOLVE's label became "Hold to resolve turn n"
    // in place of RESOLVE and HOLD, and the objective line's tag and
    // sentence joined the bar.
    // Eleven since v1.3 Round 0: HARDEN, INTEL and SURGE left the bar with
    // their three labels and three step numbers, and the commit's label
    // became "Execute turn n", one line as its hold instruction was.
    // Fourteen on turn 3 since v1.3 R2, which rebuilt the list from the new
    // board: the HUD's two labels and SYSTEM, the full brief's toggle, one
    // "reveal ›" for each of the night's five unnamed moves, the brief's
    // price button, and the dock's REMAINING, WORST CASE, PROCURE and
    // EXECUTE.
    expect(chromeCopy(gameAt(3)).length, 'the chrome list changed size without this guard noticing').toBe(14)
  })

  it('renders every reading line the first-input budget counts', () => {
    // The same join for the reading: every line firstInputCopy charges
    // against FIRST_INPUT_WORD_BUDGET is on the deciding board, so the
    // budget measures the screen rather than a list beside it.
    for (const turn of [1, 2, 3]) {
      const state = gameAt(turn)
      expect(missingOn(state, firstInputCopy(state)).join(' | '), `turn ${turn}: the reading budget counts lines the board does not render`).toBe('')
    }
    // And with an order placed, which changes what the TONIGHT card and
    // the orders card say (a brief ordered names the moves).
    const state = gameAt(3)
    render(state, 'brief')
    click(container.querySelector('button[data-brief-order]')!)
    click(container.querySelector('[data-sheet="procure"] button[data-procure-intel]')!)
    click(container.querySelector('[data-sheet="procure"] button[data-confirm]')!)
    const text = container.textContent ?? ''
    const ordered = { buyAssets: [], buyCounters: [], intelBrief: true }
    expect(
      firstInputCopy(state, ordered).filter((line) => !text.includes(line)).join(' | '),
      'with the brief ordered, the reading budget counts lines the board does not render',
    ).toBe('')
  })
})

describe('reduced motion keeps the sequence (brief v1.2)', () => {
  it('enters the night with the preference set, its cards arriving at once', async () => {
    // The round's central claim, and until v1.2 it had no guard at all:
    // the speed tests that stood beside it read which speed button was
    // pressed, and the decision that actually produces the
    // eleven-silent-rows regression is made at Game.tsx's resolve, not in
    // the speed default. Adding one term there
    // (`speed !== 'instant' && !reducedMotion`) restored the exact v1.1
    // behaviour at the other end of the same decision with the whole suite
    // green. Three lenses raised it independently. The speeds went in v1.3
    // Round 0 and the director in Round 3; EXECUTE opens the night on
    // every turn, so the same regression is now one `!reducedMotion` term
    // between EXECUTE and the night.
    //
    // So this resolves a real turn with the preference on and asserts the
    // player reaches the night, which is the only place its rows can
    // sound, and that the move's strike is heard there: under reduced
    // motion the strike is skipped and its sound plays as the card
    // arrives (brief 5.5).
    setReducedMotion(true)
    const state = gameAt(3)
    render(state, 'brief')
    const played = spyPlay()
    const execute = executeControl()
    expect(execute, 'the EXECUTE control is not on screen').not.toBeNull()
    await tap(execute!)
    expect(container.querySelector('div[data-moving]'), 'the overlay played under reduced motion').toBeNull()
    expect(
      nightStage(),
      'a reduced-motion turn skipped the night, so none of its cues can sound',
    ).toBe('hit')
    const first = recordOf(state).events[0]
    expect(played, 'the first move-s strike was not heard as its card arrived').toContain(strikeSound(first.eventId, first.effectiveSeverity > 0))
    // And the cues really are static. Asserted at first as "no dc-card-in
    // on screen", which is vacuous: the opening beat never carried that
    // class in either mode, so deleting the reduced term from useCueClass
    // entirely would have passed. Measured instead against the same first
    // card WITHOUT the preference (the next test), which is the only way
    // to tell a static cue from a cue that was never there.
    const cueClassesNow = classesOf(dcClassed()).filter(isMotion)
    expect(cueClassesNow, `reduced motion still animated: ${cueClassesNow.join(', ')}`).toEqual([])
  })

  it('does animate the same card when the preference is off, so the check above is not vacuous', async () => {
    // The control for the assertion above. Without it, "no animation
    // classes on screen" is satisfied by a screen that never animates in
    // either mode, and the guard measures nothing.
    setReducedMotion(false)
    render(gameAt(3), 'brief')
    await tap(executeControl()!)
    expect(nightStage(), 'EXECUTE did not open COLDVEIL IS MOVING').toBe('moving')
    // On to the first card: the overlay and the strike run on their own.
    for (let i = 0; i < 20 && (nightStage() === 'moving' || nightStage() === 'strike'); i += 1) await wait(NIGHT_STEP_MS)
    const label = container.querySelector('section[data-night-card]')?.getAttribute('aria-label')
    expect(label, 'the overlay and the strike never gave way to a card').toBeTruthy()
    const cueClasses = classesOf(dcClassed()).filter(isMotion)
    expect(cueClasses.length, 'the first card animates nothing even with motion allowed').toBeGreaterThan(0)
    // And it is the card the reduced-motion player gets at once.
    setReducedMotion(true)
    render(gameAt(3), 'brief')
    await tap(executeControl()!)
    expect(container.querySelector('section[data-night-card]')?.getAttribute('aria-label'), 'the two modes met different first cards').toBe(label)
  })

  it('plays the night to its end rather than skipping it', async () => {
    // Completion under the preference, which section 8 asks for. It used
    // to be satisfied for free because instant finishes synchronously.
    // Since v1.3 Round 0 nothing in the turn's playback advances without a
    // tap, so the player taps it through, and the turn must take more than
    // one tap to get there: a night that ended on its first tap would be a
    // skip by another name. Since v1.3 R3 that is a card for every event
    // the engine resolved, then END OF TURN, counted against the engine's
    // own record of the turn.
    setReducedMotion(true)
    const state = gameAt(3)
    render(state, 'brief')
    await tap(executeControl()!)
    expect(inNight(), 'the night did not start').toBe(true)
    const record = recordOf(state)
    const { seen, taps } = await playNight()
    expect(nightStage(), 'the night never handed back to the board').toBe('board')
    const cards = seen.filter((s) => s === 'hit' || s === 'debris' || s === 'opportunity')
    expect(cards.length, `the night ended without showing every event the engine resolved: met ${seen.join(', ')}`).toBe(record.events.length)
    expect(seen[seen.length - 1], 'the turn ended without END OF TURN').toBe('end')
    expect(container.querySelector('header[data-hud]')?.textContent, 'BEGIN TURN did not open the next turn').toContain(`TURN ${state.turn + 1} OF`)
    expect(taps, 'the night ended on its first tap').toBeGreaterThan(1)
    expect(record.events.length, 'the turn had a single event, so a skip and a full night look alike').toBeGreaterThan(1)
  })
})

describe('the operation ends on its last END OF TURN, from the player-s starting state (Round 5)', () => {
  // THE ROUND'S CENTRAL CLAIM: a campaign played to its end shows a
  // distinct ending at its loudest moment, and a loss is named by its real
  // cause rather than one label for every defeat. Round 5 showed it with
  // four cinematic scenes, which retired with the director in v1.3 R3; the
  // last END OF TURN shows it now, its ending block read from the
  // engine's status and loss reason, with the victory fanfare or the
  // defeat sting.
  //
  // Driven from a real campaign rather than from the component, per
  // principle 16. Three rounds running, the central fix shipped behind a
  // guard that could not detect its own reversion; the mechanism each
  // time was a guard written against the code that changed instead of
  // against the behaviour the round existed to produce.

  // Play a whole campaign under one script and stop on the turn that ends
  // it, so the ending is the one a player actually reaches.
  function finalTurn(script: Record<number, TurnActions>, seeds = [20260712, 7, 1, 2, 3, 4041, 11, 13]) {
    for (const seed of seeds) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        if (after.status !== 'playing') return { before: state, after }
        state = after
      }
    }
    throw new Error('no seed in the sweep finished a campaign under this script')
  }

  // Drive Game from the board of the deciding turn, through EXECUTE and its
  // night, to the last END OF TURN, untapped. Returns that card, the cards
  // met on the way and every cue the night played. The deciding turn's
  // orders, when the script has any, go in through PROCURE as a player
  // places them: since v1.4 the prepared script orders a defense on its
  // last night (one new defense a night left it one to place).
  async function playToEnd(before: GameState, orders: TurnActions = NO_OP) {
    render(before, 'brief')
    if (orders.buyCounters.length > 0 || orders.buyAssets.length > 0) {
      openSheet('PROCURE')
      for (const id of orders.buyCounters) click(container.querySelector(`button[data-procure-defense="${id}"]`)!)
      for (const { kind } of orders.buyAssets) click(procureKind(kind))
      click(container.querySelector('button[data-confirm]')!)
    }
    const played = spyPlay()
    await tap(executeControl()!)
    expect(inNight(), 'the deciding turn did not enter the night').toBe(true)
    const { seen } = await playNight({ stopAt: 'end' })
    return { end: container.querySelector('section[data-night-card="end"]'), seen, played }
  }

  it('closes a lost campaign on the loss, named by its real cause', async () => {
    const { before, after } = finalTurn(LOSS_SCRIPT)
    const { end, seen, played } = await playToEnd(before)
    expect(end, `a lost campaign reached its end with no END OF TURN; met ${seen.join(', ') || 'nothing'}`).not.toBeNull()
    expect(after.lossReason, 'the losing campaign recorded no cause').toBeDefined()
    const ending = end!.querySelector('[data-ending]')
    expect(ending, 'the last END OF TURN of a lost campaign shows no ending').not.toBeNull()
    expect(ending!.getAttribute('data-ending'), 'a lost campaign showed an ending that is not its cause').toBe(after.lossReason)
    // The cause in words (the QC gauntlet's Q17, when the defeat said LINK
    // LOST for every loss): the card says its own cause's line and no
    // other cause's.
    const causeLines: Record<NonNullable<GameState['lossReason']>, string> = {
      insolvency: INSOLVENT_LINE,
      maiCollapse: ENDING.maiCollapse.line(DEFAULT_SCENARIO.collapseThreshold),
      belowThreshold: ENDING.belowThreshold.line(DEFAULT_SCENARIO.winThreshold),
    }
    for (const [reason, line] of Object.entries(causeLines)) {
      expect(ending!.textContent!.includes(line), `the ending ${reason === after.lossReason ? 'does not say' : 'says'} the ${reason} line`).toBe(reason === after.lossReason)
    }
    expect(ending!.textContent, 'a lost campaign says the mission held').not.toContain(ENDING.won.head)
    expect(end!.querySelector('button[data-begin]')?.textContent, 'the last END OF TURN does not lead to the debrief').toBe('DEBRIEF')
    expect(played, 'a lost campaign did not sound the defeat sting').toContain('defeat-sting')
    expect(played, 'a lost campaign sounded the victory fanfare').not.toContain('victory-fanfare')
  })

  it('closes a won campaign on the win', async () => {
    // The positive control for the test above, and vice versa. Either one
    // alone passes against a card that always shows the other ending, or
    // none; together they cannot.
    const { before, after } = finalTurn(WIN_SCRIPT)
    expect(after.status, 'the prepared line lost this campaign').toBe('won')
    const { end, seen, played } = await playToEnd(before, WIN_SCRIPT[before.turn])
    expect(end, `a won campaign reached its end with no END OF TURN; met ${seen.join(', ') || 'nothing'}`).not.toBeNull()
    const ending = end!.querySelector('[data-ending]')
    expect(ending?.getAttribute('data-ending'), 'a won campaign showed a losing ending').toBe('won')
    expect(ending!.textContent, 'the winning ending does not say the mission held').toContain(ENDING.won.head)
    expect(ending!.textContent).toContain(ENDING.won.line(DEFAULT_SCENARIO.totalTurns))
    expect(end!.querySelector('button[data-begin]')?.textContent, 'the last END OF TURN does not lead to the debrief').toBe('DEBRIEF')
    expect(played, 'a won campaign did not sound the victory fanfare').toContain('victory-fanfare')
    expect(played, 'a won campaign sounded the defeat sting').not.toContain('defeat-sting')
  })

  it('shows no ending on an ordinary END OF TURN', async () => {
    // The control for every presence check above: [data-ending] is not
    // something END OF TURN always carries, so finding it means an
    // operation really ended rather than the attribute being ambient, and
    // an ordinary close plays neither outcome voice.
    render(gameAt(1), 'brief')
    const played = spyPlay()
    await tap(executeControl()!)
    await playNight({ stopAt: 'end' })
    const end = container.querySelector('section[data-night-card="end"]')
    expect(end, 'turn 1 never reached END OF TURN').not.toBeNull()
    expect(end!.querySelector('[data-ending]'), 'an ordinary END OF TURN showed an ending').toBeNull()
    expect(end!.querySelector('button[data-begin]')?.textContent).toBe('BEGIN TURN 2')
    expect(played, 'an ordinary END OF TURN did not sound its chime').toContain(MOMENT_CUES['end-of-turn'].sound)
    for (const voice of ['victory-fanfare', 'defeat-sting']) expect(played, `an ordinary END OF TURN sounded ${voice}`).not.toContain(voice)
  })

  it('shows the campaign-s score on its last END OF TURN, not one of the meters it is built from', async () => {
    // Written as presented.meters.linkAvailability at first, under the
    // label "Final MAI" on Round 5's victory scene: a real number under the
    // wrong name, which no presence check can see. The scene retired with
    // the director; the last END OF TURN's SCORE is where the campaign's
    // number shows now, so the guard moves there. The fixture picks a
    // campaign where the two differ at the one decimal the card prints,
    // and fails if it cannot find one, so it cannot pass by standing where
    // they happen to agree.
    let fixture: { before: GameState; after: GameState } | null = null
    for (const seed of [20260712, 7, 1, 2, 3, 4041]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        if (after.status === 'won' && maiScore(after).toFixed(1) !== after.meters.linkAvailability.toFixed(1)) {
          fixture = { before: state, after }
          break
        }
        state = after
      }
      if (fixture) break
    }
    expect(
      fixture,
      'no won campaign in the sweep has a score that differs from link availability, so this cannot discriminate',
    ).not.toBeNull()
    const { end } = await playToEnd(fixture!.before, WIN_SCRIPT[fixture!.before.turn])
    expect(end, 'the night never reached the last END OF TURN').not.toBeNull()
    const shown = end!.querySelector('[data-end-score] b')?.textContent
    expect(shown, 'the last END OF TURN shows no score').toBeTruthy()
    // Joined to the engine's own scoring of the finished state, not to the
    // record the card reads it from.
    expect(shown, 'the last END OF TURN shows a number that is not the campaign-s score').toBe(maiScore(fixture!.after).toFixed(1))
  })
})

describe('each card of the night says the same under reduced motion (Round 5)', () => {
  // The brief asks for the static form to be DESIGNED rather than derived
  // by subtraction, and Round 4e is why: the refusal cue there shipped
  // through a motion-only class and did nothing at all for a
  // reduced-motion player, in the round that made reduced motion a
  // first-class path.
  //
  // So the test is not "no animation classes". It is that the same
  // INFORMATION is on screen in both modes, and only its arrival differs.
  // It was written for Round 5's scenes, which retired with the director;
  // the night's cards make the same promise (brief 5.5: under reduced
  // motion the overlay and the strike are skipped and the cards arrive at
  // once), so it runs over every card of an operation that meets each kind.
  const words = (t: string) => t.replace(/[\d.]+/g, '#').replace(/\s+/g, ' ').trim()

  async function cardsUnder(reduced: boolean) {
    // A new player's device for each run, so both meet the same threats
    // for the first time and file the same cards.
    vi.stubGlobal('localStorage', memoryStorage())
    setReducedMotion(reduced)
    // Seed 24 on STANDARD, with these orders, meets every kind of card
    // (GUARD R3 (f) in tests/night-r3.dom.spec.tsx plays the same
    // operation).
    const plan: Record<number, string[]> = { 2: ['antiJam', 'pntAuth', 'groundZeroTrust'], 3: ['linkAuth'] }
    render(newGame(DEFAULT_SCENARIO, 24, 'standard'), 'brief')
    const cards: { stage: Stage; text: string; animated: number }[] = []
    for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns && executeControl(); turn += 1) {
      if (plan[turn]) {
        openSheet('PROCURE')
        for (const id of plan[turn]) click(container.querySelector(`button[data-procure-defense="${id}"]`)!)
      }
      await tap(executeControl()!)
      await playNight({
        onCard: (stage) => {
          const el = container.querySelector(stage === 'intel' ? 'div[data-intel-file]' : 'section[data-night-card]')!
          cards.push({ stage, text: words(el.textContent ?? ''), animated: classesOf(dcClassed(el)).filter(isMotion).length })
        },
      })
    }
    return cards
  }

  it('shows the same information in both modes, and animates in only one', async () => {
    const moving = await cardsUnder(false)
    const still = await cardsUnder(true)
    expect([...new Set(moving.map((c) => c.stage))].sort(), 'the operation did not meet every kind of card').toEqual(
      ['call', 'debris', 'end', 'hit', 'intel', 'opportunity'],
    )
    expect(still.map((c) => c.stage), 'reduced motion met a different night').toEqual(moving.map((c) => c.stage))
    for (const [i, card] of moving.entries()) {
      // The words are the information. Digits are masked, because the
      // intel card's count ticks up as it arrives with motion allowed.
      expect(still[i].text, `${card.stage} card ${i} says something different under reduced motion`).toBe(card.text)
      // And the positive control, which is what stops this being vacuous:
      // with motion allowed the card really does carry an entrance, so "no
      // entrance under reduce" is a difference rather than an absence in
      // both modes.
      expect(card.animated, `${card.stage} card ${i} has no entrance at all, so the check below proves nothing`).toBeGreaterThan(0)
      expect(still[i].animated, `${card.stage} card ${i} still animates under reduced motion`).toBe(0)
    }
  })
})

describe('the save code is on the screen, not only on the clipboard', () => {
  // ROUND 6D'S ONE DEFECT. encodeSaveCode produced the string, the
  // clipboard took it, and no screen ever rendered it, so a player whose
  // browser gates the clipboard API was told to "select and copy manually"
  // from nothing. A lost campaign and an impossible instruction.
  //
  // PRINCIPLE 17'S BLIND SIDE, which is why this asserts the way it does.
  // Deriving the expected code from encodeSaveCode and comparing it to
  // what encodeSaveCode put on screen would be one structure agreeing with
  // itself: it would pass on an empty string if the renderer and the
  // encoder both produced one. So the screen is joined to the DECODER
  // instead. What the player can read has to round-trip back into the
  // campaign they just played, through a function that knows nothing about
  // how it was rendered.
  // The outcome screen renders when the campaign is over AND the phase has
  // moved past the aftermath (Game.tsx: status !== 'playing' && phase is
  // neither 'aftermath' nor 'night'). Rendering a finished campaign at
  // phase 'aftermath' shows its last END OF TURN (the damage report until
  // v1.3 R3), not the outcome, which is the first thing this fixture got
  // wrong.
  const OUTCOME_PHASE: Phase = 'brief'

  function finishedCampaign(): GameState {
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    while (state.status === 'playing') {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    return state
  }

  const codeBox = () => container.querySelector('[data-outcome-save-code]') as HTMLTextAreaElement | null

  // PRESENCE IS NOT VISIBILITY, and querySelector cannot tell them apart.
  // Adding `hidden` to the code box left the first version of these guards
  // green, which is this round's own defect one level up: Round 6d found a
  // save code that existed as a STRING but not on screen, and the guard
  // fixing it asserted the box existed as an ELEMENT but not that a player
  // could see it.
  //
  // NAMED LIMIT (principle 15): jsdom computes no layout, so this cannot
  // see hiding done by a CSS class, by zero size, or by something painted
  // over the top. It catches the attribute-level and inline-style ways,
  // which are the ways code in this repo would do it.
  function visibleToPlayer(el: Element | null): boolean {
    let node: Element | null = el
    while (node && node !== document.body) {
      if (node instanceof HTMLElement) {
        if (node.hidden) return false
        if (node.getAttribute('aria-hidden') === 'true') return false
        if (node.hasAttribute('inert')) return false
        const style = node.style
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
      }
      node = node.parentElement
    }
    return el !== null
  }

  it('renders a code the player can read and select', () => {
    const final = finishedCampaign()
    expect(final.status, 'this campaign never ended, so there is no outcome screen').not.toBe('playing')
    render(final, OUTCOME_PHASE)

    const box = codeBox()
    expect(box, 'the outcome screen renders no save code at all').not.toBeNull()
    expect(visibleToPlayer(box), 'the save code is in the document but not in front of the player').toBe(true)
    expect(box!.value.length, 'the save code box is empty').toBeGreaterThan(0)
    // Selectable and not editable: the failure path this exists for is a
    // player selecting it by hand.
    expect(box!.readOnly, 'the code is editable, so a stray keystroke destroys it').toBe(true)
    expect(box!.getAttribute('aria-label'), 'the code box is unlabelled').toBeTruthy()
  })

  it('renders a code that decodes back into the campaign that was played', () => {
    const final = finishedCampaign()
    render(final, OUTCOME_PHASE)
    const shown = codeBox()!.value

    // THE JOIN. decodeSaveCode is a different structure from the renderer
    // and from the encoder, and it validates every field the engine reads.
    const restored = decodeSaveCode(shown)
    expect(restored.state.seed, 'the rendered code is not this campaign').toBe(final.seed)
    expect(restored.state.turn).toBe(final.turn)
    expect(restored.state.status).toBe(final.status)
    expect(restored.state.credits).toBe(final.credits)
    expect(restored.state.history.length).toBe(final.history.length)
  })

  it('shows the same string it puts on the clipboard', async () => {
    // The memoisation is load-bearing, not tidiness: captureGame stamps a
    // timestamp, so a per-render code would show the player one string and
    // copy another. That is a worse bug than the one this round fixes.
    const final = finishedCampaign()
    render(final, OUTCOME_PHASE)
    const first = codeBox()!.value

    // MOVE THE CLOCK. captureGame stamps a timestamp, so a code recomputed
    // per render differs from the one already on screen ONLY if time has
    // passed. This fixture runs on fake timers, which freeze Date, so two
    // mutations that recompute the code produced byte-identical strings and
    // slept: the memoisation this round argued hardest for had no guard
    // that could fail for it. The timers are load-bearing elsewhere here,
    // so the fix is to advance the clock rather than to remove them.
    // A RE-RENDER, not a remount: the fixture's render() uses a fresh key
    // each call, which tears Game down, and a new mount legitimately
    // restamps. Clicking a control that flashes a notice re-renders the
    // same instance, which is what a player does.
    // The share control is the score screen's, which arrives by chunk
    // since v1.2 R5; the save code and its export stay in Game.
    await settle()
    vi.setSystemTime(new Date(Date.now() + 90_000))
    const copyResultButton = byText(/copy result/i)
    expect(copyResultButton, 'no control here re-renders without remounting, so this asserts nothing').toBeDefined()
    await act(async () => {
      copyResultButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    expect(codeBox()!.value, 'the code moved under the player when the clock did').toBe(first)

    let copied = ''
    vi.stubGlobal('navigator', {
      clipboard: { writeText: async (t: string) => { copied = t } },
    })
    // Found by the name the SYSTEM sheet gives the same action, read from
    // its list, so the two screens cannot call one control two things.
    const copyName = SYSTEM_CONTROLS.find((c) => c.id === 'export')!.name
    const exportButton = byText(new RegExp(`^${copyName}$`, 'i'))
    expect(exportButton, `the outcome screen has no control named "${copyName}", as the SYSTEM sheet names it`).toBeDefined()
    await act(async () => {
      exportButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })

    expect(codeBox()!.value, 'the rendered code changed between renders').toBe(first)
    expect(copied, 'the clipboard got a different string from the one on screen').toBe(first)
  })

  it('stamps a second finished campaign in the same mount with its own code', async () => {
    // THE CASE THE FIX WAS WRITTEN FOR, which had no guard until a
    // mutation said so. The stamp used to be taken once per MOUNT, so a
    // player who finished a campaign, pressed New campaign and finished
    // another would export the second one carrying the first one's
    // timestamp. Keying the stamp on the finished state fixes it, and
    // nothing here exercised two campaigns in one mount, so reverting to
    // "stamp once and never again" left the suite green.
    const first = finishedCampaign()
    render(first, OUTCOME_PHASE)
    const firstCode = codeBox()!.value
    expect(firstCode.length).toBeGreaterThan(0)

    // PLAY AGAIN (NEW CAMPAIGN until v1.3 R4, when the debrief took the
    // ways on into its chunk, so it is settled first), WITHOUT remounting:
    // this is the same component instance, which is the whole point.
    await settle()
    const newCampaign = byText(/^play again$/i)
    expect(newCampaign, 'the outcome screen has no way to start again').toBeDefined()
    click(newCampaign!)
    // Straight to turn 1 of a new operation since v1.3 R1 (no start screen).
    expect(codeBox(), 'the code box survived into the new operation').toBeNull()
    expect(container.querySelector('[data-board]'), 'PLAY AGAIN did not start a new operation').not.toBeNull()

    // A different finished campaign, loaded through the paste box.
    const second = (() => {
      let state = newGame(DEFAULT_SCENARIO, 41, 'standard')
      while (state.status === 'playing') {
        state = resolveTurn(state, LOSS_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      }
      return state
    })()
    expect(second.seed, 'both campaigns share a seed, so their codes could match legitimately').not.toBe(first.seed)
    vi.setSystemTime(new Date(Date.now() + 120_000))
    const code = encodeSaveCode(captureGame(second, 'aftermath', new Date().toISOString()))
    pasteThroughSystem(code)
    await settle()

    // A pasted code carries phase 'aftermath', and the outcome screen is
    // gated on the phase NOT being that, so the load lands on the last END
    // OF TURN of the campaign (the damage report until v1.3 R3). DEBRIEF
    // is the control that moves on, and the re-review flagged this same
    // gate as the reason an earlier assertion was matching the wrong
    // screen.
    expect(
      container.querySelector('section[data-night-card="end"] [data-card-head]')?.textContent,
      'the loaded aftermath is not END OF TURN for the campaign-s last turn',
    ).toBe(`END OF TURN ${second.history.length}`)
    const toReport = container.querySelector('button[data-begin]')
    expect(toReport?.textContent, 'no way from the loaded END OF TURN to the outcome screen').toBe('DEBRIEF')
    await tap(toReport!)

    // The second campaign's own code, stamped when IT finished.
    //
    // Asserted on the TIMESTAMP, read off the artifact. Comparing the two
    // code strings proves nothing here: they differ because the campaigns
    // differ, whatever the stamp does, and a mutation that stamps once and
    // never again passed every other assertion in this test. decodeSaveCode
    // returns only { state, phase } and drops savedAt, so the field is read
    // from the payload directly.
    const savedAtOf = (code: string) =>
      JSON.parse(atob(code.trim().slice('DC1-'.length))).savedAt as string

    const secondShown = codeBox()
    expect(secondShown, 'the second campaign renders no code').not.toBeNull()
    expect(decodeSaveCode(secondShown!.value).state.seed, 'the rendered code is not the second campaign').toBe(second.seed)
    expect(
      new Date(savedAtOf(secondShown!.value)).getTime(),
      'the second campaign carries the first one timestamp, so the stamp is per mount rather than per campaign',
    ).toBeGreaterThan(new Date(savedAtOf(firstCode)).getTime())
  })

  it('never tells the player to select something that is not rendered', async () => {
    // The exact wording is not pinned; the promise is. Any message that
    // tells a player to select or copy from the screen has to be on a
    // screen that renders the code.
    const playing = gameAt(3)
    render(playing, 'brief')
    expect(codeBox(), 'the brief screen renders a code box').toBeNull()
    // Copy save code lives in the SYSTEM sheet since R1b.
    click(container.querySelector('button[aria-label="System"]')!)
    const inPlayExport = byText(/copy save code/i)
    expect(inPlayExport, 'the brief screen has no export control').toBeDefined()

    vi.stubGlobal('navigator', {
      clipboard: { writeText: async () => { throw new Error('blocked') } },
    })
    await act(async () => {
      inPlayExport!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })

    const notice = container.textContent ?? ''
    const failed = /copy failed/i.test(notice)
    expect(failed, 'the copy did not fail, so this asserts nothing about the failure path').toBe(true)
    expect(
      /select (the code|and copy)/i.test(notice),
      'a screen with no code box told the player to select the code',
    ).toBe(false)
  })
})

// A turn whose intel brief actually carries a technique tag ON ARRIVAL,
// SEARCHED for rather than assumed. briefCopy returns tag: undefined
// whenever the lead event has no technique ref, and turn 3 at the
// fixture's seed was one of those, so the first version of these guards
// asserted against a screen with no tag on it and failed for a reason that
// had nothing to do with the code under test. Round 4e learned this with
// a hardcoded turn number; this is the same lesson.
//
// A tag exists only while the intel brief is active, and only when the
// turn has a fixed slot: briefCopy returns no tag at all without the
// brief, and none with it either when every slot is a draw, because naming
// a maybe as a fact is the thing that code refuses to do. Through v1.2 the
// brief was an intel LEVEL the player invested in, so TOP_INTEL_SCRIPT
// funded it; since v1.3 Round 0 it is a per-turn order (brief D2 a), free
// on turn 1 and on the turns an allied data share covers. Turn 1's one
// slot is a draw, so turn 1 carries no tag although its brief is free; the
// fixed slots are turn 4's conjunction and turn 6's chain. The screen
// arrives with nothing in the cart, so the search asks briefCopy what the
// full brief shows on arrival (briefed only when the brief is free tonight),
// not what it would show if the brief were ordered. The search as v1.2
// left it passed a truthy string as `briefed`, which asks the latter, and
// returned a turn whose brief carried no tag. A free brief on a fixed
// turn needs the data share, which is a draw, so the seeds searched run on
// past the four named ones (seed 11 is the first that has it today).
function turnWithATag(): GameState {
  for (const seed of [20260712, 11, 41, 104, ...Array.from({ length: 60 }, (_, i) => i + 1)]) {
    let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
    for (let i = 0; i < DEFAULT_SCENARIO.totalTurns && state.status === 'playing'; i += 1) {
      if (briefCopy(state).tag) return state
      state = resolveTurn(state, TOP_INTEL_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
  }
  throw new Error('no turn of any line searched carries a technique tag, so these guards assert nothing')
}

describe('the technique tag opens the GLOSSARY entry', () => {
  // Until Round 6e the tag was an external anchor with target=_blank, which
  // sent the player off-site on their first hop. The brief names GLOSSARY
  // twice and Glossary.tsx has existed since Round 3.5; the audit called
  // it brief-stale and was wrong, because no ruling in eighteen versions
  // reversed it.
  //
  // Since v1.3 R2 the tag sits in the full brief behind the TONIGHT card's
  // toggle, so each test opens it first, as a player does.
  const tag = () => container.querySelector('[data-technique-tag]') as HTMLElement | null
  const overlay = () => container.querySelector('[data-glossary-overlay]')

  it('opens the glossary in place, without leaving the game', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const el = tag()
    expect(el, 'the intel brief renders no technique tag').not.toBeNull()
    // A button, not a link out. The old shape is the defect.
    expect(el!.tagName, 'the tag is still an anchor').toBe('BUTTON')
    expect(el!.getAttribute('href'), 'the tag still carries an href').toBeNull()
    expect(overlay(), 'the glossary is open before anything was tapped').toBeNull()

    click(el!)
    expect(overlay(), 'tapping the tag opened nothing').not.toBeNull()
    // The dialog is there before its chunk is, with the terminal fallback
    // inside it rather than an empty box.
    expect(overlay()!.textContent, 'the dialog opened empty while its chunk loads').toMatch(/LOADING MODULE|glossary/i)
    await settle()
    expect(overlay(), 'the overlay closed when its chunk landed').not.toBeNull()
  })

  it('lands on the entry for the technique that was tapped', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const key = tag()!.getAttribute('data-technique-tag')!
    click(tag()!)
    await settle()
    const focused = container.querySelector('[data-glossary-focus]')
    expect(focused, 'the glossary opened with no entry focused, which is opening the glossary and leaving them to look').not.toBeNull()
    expect(focused!.getAttribute('data-glossary-focus'), 'the wrong entry was focused').toBe(key)
  })

  it('keeps the external citation on the entry', async () => {
    // Both halves matter. Keeping the player in the game is worth nothing
    // if the live-verified framework reference is dropped on the way.
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const key = tag()!.getAttribute('data-technique-tag')!
    click(tag()!)
    await settle()
    const focused = container.querySelector('[data-glossary-focus]')!
    const links = [...focused.querySelectorAll('a')]
    expect(links.length, 'the focused entry carries no citation at all').toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href'), 'a citation link has no target').toBeTruthy()
      expect(a.getAttribute('href')!.startsWith('http'), 'a citation is not an external reference').toBe(true)
      expect(a.getAttribute('rel'), 'an external link has no rel').toContain('noreferrer')
    }
    // And it is the citation for THIS technique, joined through the entry
    // rather than assumed from the order of the list.
    const entry = glossaryEntries().find((e) => e.key === key)
    expect(entry, 'the tag resolves to no glossary entry at all').toBeDefined()
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual(entry!.refs.map((r) => r.url).sort())
  })

  it('comes back to the campaign it left, with state no autosave carries', async () => {
    // THE REASON THIS IS AN OVERLAY RATHER THAN A ROUTE. Sending the player
    // to the glossary screen would unmount Game, and the autosave carries
    // the turn and the phase but not the component's own state, so reading
    // one technique mid-turn would silently discard it.
    //
    // The probe is the notice line. It is Game state, nothing persists it,
    // and it survives only if the component was never torn down. The
    // procurement cart is the same class of thing and was the first
    // choice, but a top-intel turn cannot always afford a purchase, and
    // the save-code paste box is on the start screen rather than this one,
    // so both would have failed for reasons unrelated to what is asserted.
    render(turnWithATag(), 'brief')
    await openFullBrief()
    // Copy save code lives in the SYSTEM sheet since R1b; the sheet stays
    // open across the glossary round trip, like the cart does.
    click(container.querySelector('button[aria-label="System"]')!)
    const exportButton = byText(/copy save code/i)
    expect(exportButton, 'the brief screen has no export control, so this asserts nothing').toBeDefined()
    await act(async () => {
      exportButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    const noticeBefore = (container.textContent ?? '').match(/Save code copied[^|]*|Copy failed[^|]*/)
    expect(noticeBefore, 'no notice appeared, so its survival proves nothing').not.toBeNull()

    click(tag()!)
    expect(overlay()).not.toBeNull()
    await settle()
    const back = [...container.querySelectorAll('button')].find((b) => /back to brief/i.test(b.textContent ?? ''))
    expect(back, 'the overlay has no way back').toBeDefined()
    click(back!)
    expect(overlay(), 'the overlay would not close').toBeNull()

    expect(
      container.textContent,
      'opening a glossary entry threw away state the component was holding',
    ).toContain(noticeBefore![0].trim())
    // The board has no "intel brief" heading; the TONIGHT card is the
    // landmark the brief lives under since v1.3 R2, and its full brief is
    // still open where the player left it.
    expect(container.querySelector('section[data-tonight]'), 'coming back landed somewhere other than the brief').not.toBeNull()
    expect(tag(), 'coming back closed the full brief the tag was read from').not.toBeNull()
  })
})

describe('the glossary overlay is a dialog a keyboard can use', () => {
  // Four review lenses found the same thing independently: the first
  // version declared role="dialog" and aria-modal="true" and implemented
  // none of it. Escape was a React onKeyDown on a div with no tabIndex, so
  // it only fired for events inside its own subtree, and after pressing
  // the tag focus sits on the tag button, which is a SIBLING. The keydown
  // never crossed the overlay. Declaring aria-modal without keeping it is
  // worse than not declaring it: it promises a screen reader an inertness
  // nothing enforces.
  const tag = () => container.querySelector('[data-technique-tag]') as HTMLElement | null
  const overlay = () => container.querySelector('[data-glossary-overlay]') as HTMLElement | null

  it('closes on Escape pressed where the player actually is', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const el = tag()!
    click(el)
    expect(overlay(), 'the overlay did not open').not.toBeNull()
    await settle()

    // Dispatched from the element that really holds focus, which is the
    // tag button outside the overlay. A handler bound to the overlay's own
    // subtree cannot see this, which is the whole defect.
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(overlay(), 'Escape did not close the overlay').toBeNull()
  })

  it('moves focus into the dialog and gives it back', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const el = tag()!
    act(() => el.focus())
    expect(document.activeElement, 'the tag never took focus, so this asserts nothing').toBe(el)

    click(el)
    // Focus moves the moment the dialog opens, not when its chunk lands.
    expect(overlay()!.contains(document.activeElement), 'focus stayed outside the dialog').toBe(true)
    await settle()
    expect(overlay()!.contains(document.activeElement), 'the chunk landing threw focus out of the dialog').toBe(true)

    const back = [...container.querySelectorAll('button')].find((b) => /back to brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(document.activeElement, 'closing the dialog dropped focus to the document').toBe(el)
  })

  it('makes the game behind it inert rather than only covering it', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    const main = container.querySelector('main')!
    expect(main.hasAttribute('inert'), 'the game is inert before anything opened').toBe(false)
    click(tag()!)
    expect(main.hasAttribute('inert'), 'aria-modal was declared over a page that is still reachable').toBe(true)
    expect(main.getAttribute('aria-hidden')).toBe('true')
    await settle()
    const back = [...container.querySelectorAll('button')].find((b) => /back to brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(main.hasAttribute('inert'), 'the game stayed inert after the dialog closed').toBe(false)
  })

  it('does not nest a second main or a second h1 in the document', async () => {
    render(turnWithATag(), 'brief')
    await openFullBrief()
    // The deciding board carries no h1 of its own since v1.3 R2 (the HUD's
    // line is a paragraph), so the count is taken from the page before the
    // overlay opens rather than written down.
    const h1s = container.querySelectorAll('h1').length
    expect(h1s, 'the board already carries more than one h1').toBeLessThanOrEqual(1)
    click(tag()!)
    // While the chunk loads too: the fallback is a block, not a landmark.
    expect(container.querySelectorAll('main').length, 'the loading fallback put a second main on the page').toBe(1)
    await settle()
    const mains = container.querySelectorAll('main')
    expect(mains.length, 'the overlay put a second main landmark on the page').toBe(1)
    expect(mains[0].querySelector('[data-glossary-overlay]'), 'the overlay is nested inside the game main').toBeNull()
    expect(container.querySelectorAll('h1').length, 'the overlay added an h1 to the page').toBe(h1s)
  })
})

describe('a loaded campaign is not a campaign that was played here', () => {
  // CONFIRMED BY THE PASS, and Round 6e is what made it reachable: until
  // the save code was rendered, a finished-state code was hard to come by,
  // because Save and Copy save code render only while playing. Now a player
  // can paste a friend's MISSION ASSURED code, or reload their own to
  // re-read it, and the effect that posts a score treated "this state is
  // finished" as "a run finished here".
  const SCORE_KEY = 'dc-scores'
  const scores = () => {
    try {
      return JSON.parse(localStorage.getItem(SCORE_KEY) ?? '[]') as unknown[]
    } catch {
      return []
    }
  }

  function finished(): GameState {
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    while (state.status === 'playing') {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    return state
  }

  it('posts no score for a campaign that arrived already over', () => {
    expect(scores(), 'the board is not empty at the start, so this asserts nothing').toHaveLength(0)
    const over = finished()
    expect(over.status).not.toBe('playing')
    render(over, 'brief')
    expect(scores(), 'loading a finished code posted a score the player never earned').toHaveLength(0)
  })

  it('still posts a score for a campaign that finishes here', async () => {
    // THE POSITIVE CONTROL, and it has to be real: nothing in this repo
    // guarded score recording before this round, so a fix that suppressed
    // the post on arrival could have suppressed every post and no existing
    // test would have noticed.
    //
    // So this plays the last turn through the controls: EXECUTE, which
    // commits on a tap since v1.3 Round 0, and then the night tapped
    // through to its END OF TURN and DEBRIEF.
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    while (state.status === 'playing' && state.turn < DEFAULT_SCENARIO.totalTurns) {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    expect(state.status, 'this line ended early, so the last turn is not the one being played').toBe('playing')
    expect(state.turn, 'not at the final turn').toBe(DEFAULT_SCENARIO.totalTurns)
    expect(scores(), 'the board is not empty at the start').toHaveLength(0)

    render(state, 'brief')
    const execute = executeControl()
    expect(execute, 'no commit control on the final turn').not.toBeNull()
    await tap(execute!)
    // Run the night out so the campaign reaches its end state and the
    // score screen.
    await playNight()
    expect(nightStage(), 'the final turn never reached the score screen').toBe('score')

    expect(scores().length, 'a campaign played to its end here posted no score').toBeGreaterThan(0)
  })

  it('posts no score when a finished code is PASTED, which is the path a player takes', async () => {
    // THE PATH THE DEFECT IS ON. The guard above mounts Game with a
    // finished campaign as `initial`, which covers the constructor half.
    // The half a player actually reaches is loadCode -> beginGame, and a
    // mutation reverting exactly that line slept because nothing drove it:
    // principle 16, guarding the mechanism that was easy to reach instead
    // of the path the player takes.
    const code = encodeSaveCode(captureGame(finished(), 'aftermath', new Date().toISOString()))
    expect(scores(), 'the board is not empty at the start').toHaveLength(0)

    // A new operation, as the title starts one: the paste box is in SYSTEM
    // since v1.3 R1 retired the start screen.
    mounts += 1
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={newOperation('standard', 20260712)} onExit={() => {}} />)
    })
    expect(container.querySelector('button[data-begin]'), 'the new operation is already over, so this asserts nothing').toBeNull()
    pasteThroughSystem(code)
    await settle()

    // THE LOAD ACTUALLY HAPPENED, asserted on something only true AFTER it:
    // the pasted campaign is finished, so it lands on its last END OF TURN
    // offering DEBRIEF (FINAL REPORT until v1.3 R3), which the fresh
    // operation it replaced never could.
    expect(container.querySelector('button[data-begin]')?.textContent, 'the pasted, finished campaign never loaded').toBe('DEBRIEF')

    expect(scores(), 'pasting a finished code posted a score the player never earned').toHaveLength(0)
  })

  it('posts a score for a campaign STARTED the normal way and played to its end', async () => {
    // THE OTHER DIRECTION, on the other path. The control above drives the
    // MOUNT path, which seeds Game from `initial` and exercises the useRef
    // initialiser. The line fix 1 adds to beginGame had no control at all
    // in the fail-to-post direction: setting it wrongly there would mean
    // no campaign a player starts ever posts a score, and nothing would
    // have failed. Found as a split vote.
    //
    // So this starts an operation as the title's PLAY does since v1.3 R1
    // (newOperation, straight to turn 1) and plays every turn through the
    // controls, which is the path every real campaign takes.
    expect(scores(), 'the board is not empty at the start').toHaveLength(0)
    mounts += 1
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={newOperation('standard', 20260712)} onExit={() => {}} />)
    })
    expect(container.querySelector('span[aria-label^="BUDGET"]'), 'the campaign did not start').not.toBeNull()

    // Each night ends on BEGIN TURN n+1, back to the board, and the last
    // on DEBRIEF, to the score screen.
    for (let turn = 0; turn < DEFAULT_SCENARIO.totalTurns + 2; turn += 1) {
      const execute = executeControl()
      if (!execute) break
      await tap(execute)
      await playNight()
    }
    expect(nightStage(), 'the operation was not played through to its debrief').toBe('score')

    expect(scores().length, 'a campaign started and played to its end here posted no score').toBeGreaterThan(0)
  })

  it('clears the autosave when a campaign finishes here', async () => {
    // The other half of the effect fix 1 rewrote, which was guarded in
    // NEITHER direction: the only autosave assertion checked it was not
    // null. A finished run must not be offered for resume.
    const nearEnd = (() => {
      let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
      while (state.status === 'playing' && state.turn < DEFAULT_SCENARIO.totalTurns) {
        state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      }
      return state
    })()
    render(nearEnd, 'brief')
    expect(localStorage.getItem('dc-autosave'), 'nothing autosaved while playing').not.toBeNull()

    await tap(executeControl()!)
    await playNight()
    expect(nightStage(), 'the final turn never reached the score screen').toBe('score')
    expect(
      localStorage.getItem('dc-autosave'),
      'a finished campaign is still offered for resume',
    ).toBeNull()
  })

  it('does not clear an in-progress autosave when a finished code is loaded', () => {
    const playing = gameAt(4)
    render(playing, 'brief')
    const saved = localStorage.getItem('dc-autosave')
    expect(saved, 'nothing was autosaved, so this asserts nothing').not.toBeNull()

    render(finished(), 'brief')
    expect(
      localStorage.getItem('dc-autosave'),
      'loading a finished code threw away the campaign the player had in progress',
    ).not.toBeNull()
  })
})

// ---------------------------------------------------------------------
// THE OPENING (Round 7b). The guard of record for the round's claim.
//
// tests/opening.spec.ts sweeps the opening across seeds and is breadth;
// this drives three real turns through the real component and is the only
// thing that can say the player MET the vocabulary rather than that the
// engine produced the material for it.
//
// THE JOIN IS (visual, sound), OBSERVED. The visual is read off the cue
// classes on screen at the moment a sound plays, and the sound off a spy
// on the audio engine, so the pair is what the screen painted next to what
// the speaker played. Since v1.3 R3 the night plays the turn (brief 5.5)
// and the v1.1 director's beats are retired: the section 6 rows name the
// night's moments (src/cues.ts), and a row is credited from what was
// painted and played, never from membership. Two rows that share a moment
// (a move landing and the BLACKOUT CHAIN, the two endings) are told apart
// by the sound it played, and two that share a sound by the class painted
// with it.
//
// WHY IT WAS RED BEFORE ROUND 7B'S FIX: turn 1's two visible beats,
// `turn-start` and `quiet`, both resolved to transmission / data-burst, so
// the whole adversary phase of a new player's first turn was the blip the
// turn had opened with. Assertion one below fails on that tree and cannot
// be satisfied by padding a later turn.
describe('the opening shows the vocabulary (Round 7b)', () => {
  // Drive one turn from the board through its night, recording what was
  // painted and what was played, step by step.
  //
  // A drive either places a SCRIPT's orders for the turn through the
  // controls (each asset and each defense through its PROCURE line, the
  // intel brief through PROCURE's INTEL line), so the engine can replay
  // exactly what was ordered and a seed chosen by engine search lands
  // where it was chosen; or, with no script, it orders the first thing on
  // offer and then everything else the budget lets it, as a new player
  // does.
  type DriveOpts = { seed?: number; script?: Record<number, TurnActions>; overbuy?: boolean }
  function placeOrders(orders: TurnActions) {
    for (const b of orders.buyAssets) {
      expect(pressed(buy(b.kind)), `the drive could not order a ${b.kind}, so the engine search does not describe this drive`).toBe(true)
    }
    if (orders.buyCounters.length === 0 && !orders.intelBrief) return
    openSheet('PROCURE')
    for (const id of orders.buyCounters) {
      const line = container.querySelector(`button[data-procure-defense="${id}"]`) as HTMLButtonElement | null
      expect(line, `PROCURE offers no "${id}" to order`).not.toBeNull()
      if (!pressed(line!)) click(line!)
      expect(pressed(line!), `the drive could not order "${id}", so the engine search does not describe this drive`).toBe(true)
    }
    if (orders.intelBrief) {
      const ib = intelButton()
      if (ib && !ib.disabled && !pressed(ib)) {
        click(ib)
        expect(pressed(ib), 'the drive could not order the intel brief').toBe(true)
      }
    }
  }
  // Every line PROCURE still leaves on, the fleet first and then the
  // defenses, ordered until nothing more fits: the player who spends it
  // all. The refusal they used to tap into left with the cannot-afford cue
  // (v1.3 R2); the sheet turns those lines off instead. The defenses that
  // stop one of tonight's moves are left alone, because this player's
  // night has to land: the old over-buyer spent everything on servicers
  // and no defense, and the strike control below needs moves that land.
  function spendItAll(turn: number, seed: number) {
    const stops = new Set(
      (planFor({ scenario: DEFAULT_SCENARIO, seed }, turn)?.slots ?? []).flatMap((slot) =>
        (slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])).flatMap((id) => eventById(DEFAULT_SCENARIO, id).counters),
      ),
    )
    openSheet('PROCURE')
    for (const k of [...container.querySelectorAll('button[data-procure-kind]')] as HTMLButtonElement[]) if (!k.disabled && !pressed(k)) click(k)
    for (const b of defenseButtons()) {
      if (!b.disabled && !pressed(b) && !stops.has(b.getAttribute('data-procure-defense') as never)) click(b)
    }
  }
  // Each card is held for longer than its own sounds take before the
  // drive taps on: a strength-4 move's last result tile ticks at 910ms and
  // its alarm or fanfare sounds at 1,130ms (src/ui/night/cards.tsx).
  const CARD_DWELL_MS = 1500
  interface Drive {
    pairs: Set<string>
    sounds: Set<string>
    visuals: Set<string>
    // Split out because the first version of this collector did not: it
    // fed every sound from the moment the turn started into one set, so
    // `buy-click`, `denied-buzz` and `execute-sweep` were in it before the
    // adversary phase produced anything. The assertion that turn 1 plays a
    // cue it did not open with was therefore true on every run whatever
    // the director did, INCLUDING on the tree Round 7b existed to fix.
    // The player's own button is not the game answering back.
    playback: Set<string>
    // Each sound the night played, with the cue classes on screen either
    // side of it: the pair join for a sound two rows share.
    heardWith: { sound: string; classes: Set<string> }[]
    // The cue classes on screen at each step with a night card up.
    onCards: Set<string>[]
    // The tiles the shield landed on, anything else it landed on, and the
    // tiles a move that got through struck.
    shielded: Set<string>
    shieldStray: string[]
    struck: Set<string>
  }
  async function driveTurn(turn: number, opts: DriveOpts = {}): Promise<Drive> {
    const engine = getAudioEngine()
    const played: string[] = []
    const spy = vi.spyOn(engine, 'play').mockImplementation((cue) => {
      played.push(cue)
      return true
    })
    const d: Drive = {
      pairs: new Set(),
      sounds: new Set(),
      visuals: new Set(),
      playback: new Set(),
      heardWith: [],
      onCards: [],
      shielded: new Set(),
      shieldStray: [],
      struck: new Set(),
    }

    // A scripted drive places the script's orders and nothing else. An
    // unscripted one buys the first thing on offer, because a new player
    // buys something, and the procurement cues are rows of their own.
    const orders = opts.script?.[turn]
    if (opts.script) {
      if (orders) placeOrders(orders)
    } else buy('sat')
    // Then spend everything the turn can take. Until v1.3 R2 a new player
    // tapped past their balance here, and that refusal was a section 6 row
    // of its own; PROCURE turns an order it cannot afford off since then,
    // so the drive spends to the floor instead, which is what reaches the
    // insolvency below.
    if (opts.overbuy ?? !opts.script) spendItAll(turn, opts.seed ?? 20260712)
    const execute = executeControl()
    expect(execute, 'the commit control is not on screen').not.toBeNull()
    await tap(execute!)

    // Tap the night through and sample the screen between the steps of the
    // overlay and of each strike, through each card's dwell and after each
    // tap. The cue classes on screen are the visuals the registry
    // resolved; whatever the spy caught since the last sample is the sound
    // that went with them, and it is paired with the screen either side of
    // it: a sound a tap plays answers what the player tapped (COLLECT
    // INTEL CARD glows until it is pressed, and the press takes the glow
    // away with the card's way on) as much as what the tap brought.
    //
    // `mark` is drained HERE, after the commit, so nothing the player's own
    // buttons played can enter the playback set or the pairing. The first
    // version started the window at zero and paired the first card class
    // with the entire procurement phase.
    let mark = played.length
    let before = new Set<string>()
    const sample = () => {
      const classes = new Set(classesOf(dcClassed()).filter((c) => CUE_CLASSES.has(c)))
      const around = new Set([...before, ...classes])
      before = classes
      const fresh = played.slice(mark)
      mark = played.length
      for (const s of fresh) {
        d.sounds.add(s)
        d.playback.add(s)
        d.heardWith.push({ sound: s, classes: around })
      }
      for (const c of classes) d.visuals.add(c)
      for (const c of around) for (const s of fresh) d.pairs.add(`${c}|${s}`)
      if (container.querySelector('section[data-night-card]')) d.onCards.push(classes)
      // WHERE the shield landed, which is the observable that matters: the
      // registry says it runs on the tile the move was aimed at, and a
      // collector that only unions the screen sees the class wherever it
      // went.
      for (const el of container.querySelectorAll('.dc-shield-tile')) {
        if (el.matches('button[data-asset-id][data-shield="held"]')) d.shielded.add(el.getAttribute('data-asset-id')!)
        else d.shieldStray.push(el.outerHTML.slice(0, 80))
      }
      for (const el of container.querySelectorAll('button[data-struck="hit"]')) d.struck.add(el.getAttribute('data-asset-id')!)
    }
    await playNight({ sample, dwell: CARD_DWELL_MS, call: orders?.debris ?? 'hold' })
    for (const s of played.slice(mark)) {
      d.sounds.add(s)
      d.playback.add(s)
    }
    // The procurement sounds are still recorded, in `sounds`, because the
    // buy row is a real section 6 row that only fires there, as EXECUTE's
    // sweep does from its own button. They are simply not evidence about
    // the adversary phase.
    for (const s of played) d.sounds.add(s)
    spy.mockRestore()
    return d
  }

  async function driveOpening(turns = 3, opts: DriveOpts = {}) {
    // A new player's device for each drive: nothing filed, nothing met.
    vi.stubGlobal('localStorage', memoryStorage())
    const perTurn: Drive[] = []
    render(newGame(DEFAULT_SCENARIO, opts.seed ?? 20260712, 'standard'), 'brief')
    for (let t = 0; t < turns; t += 1) {
      perTurn.push(await driveTurn(t + 1, opts))
      // BEGIN TURN, tapped at the end of the night, has opened the next
      // board; DEBRIEF, after an operation that ended, the score screen.
      if (!executeControl()) break
    }
    return perTurn
  }

  it('gives a new player-s first turn a cue it did not open with', async () => {
    // THE ROUND'S HEADLINE ASSERTION, from the player's seat. The
    // transmission bar opens every turn; the question is whether anything
    // else ever arrives. On the pre-round tree turn 1 played data-burst
    // twice and painted dc-transmission-in twice, and this fails.
    const [turnOne] = await driveOpening(1)
    const beyond = [...turnOne.playback].filter((s) => s !== 'data-burst' && s !== 'silent')
    expect(
      beyond.length,
      `turn 1's night played only the transmission blip: ${[...turnOne.playback].join(', ') || 'nothing at all'}`,
    ).toBeGreaterThan(0)
    const painted = [...turnOne.visuals].filter((c) => c !== 'dc-transmission-in')
    expect(
      painted.length,
      `turn 1 painted only the transmission bar: ${[...turnOne.visuals].join(', ') || 'nothing at all'}`,
    ).toBeGreaterThan(0)
  })

  // WHAT A NIGHT PRESENTS: the moments it plays, each with the sound it
  // plays it with, from the night's own model of the turn
  // (src/ui/night/nightModel.ts, which tests/night-model.spec.ts proves
  // against the engine) and the registry's own voice for each. A threat
  // strikes (a hit, the deck's voice; a block, the block's), its tiles
  // tick (up for a blocked point, down for one through), a new condition
  // sounds its alarm and a block from the second in a row the streak; a
  // threat met for the first time is collected and filed; the call, an
  // opportunity; END OF TURN and the next turn's start, or the outcome on
  // the last. Returns the lowest score the HUD shows on the way.
  function presents(before: GameState, after: GameState, filed: Set<string>, out: Map<Moment, Set<SoundCue>>): number {
    const add = (m: Moment, s: SoundCue) => {
      if (!out.has(m)) out.set(m, new Set())
      out.get(m)!.add(s)
    }
    const night = nightOf(before, after)
    add('moving', MOMENT_CUES.moving.sound)
    let floor = Math.min(maiScore(before), maiScore(night.opening), maiScore(after))
    for (const step of night.steps) {
      floor = Math.min(floor, step.scoreAfter)
      const { ev } = step
      if (step.kind === 'opportunity') {
        add('opportunity', MOMENT_CUES.opportunity.sound)
        continue
      }
      if (step.kind === 'debris') add('debris-call', MOMENT_CUES['debris-call'].sound)
      else {
        const r = resultOf(ev)
        add(r.through > 0 ? 'strike-hit' : 'strike-block', strikeSound(ev.eventId, r.through > 0))
        if (r.blocked > 0) add('result-tiles', 'tick-up')
        if (r.through > 0) add('result-tiles', 'tick-down')
        if (ev.condition) add('condition', CONDITION_CUES[ev.eventId]?.sound ?? MOMENT_CUES.condition.sound)
        if (r.through === 0 && step.streak >= 2) add('streak', MOMENT_CUES.streak.sound)
      }
      if (!filed.has(ev.eventId)) {
        filed.add(ev.eventId)
        add('collect', MOMENT_CUES.collect.sound)
        add('file', MOMENT_CUES.file.sound)
      }
    }
    if (after.status === 'playing') {
      add('end-of-turn', MOMENT_CUES['end-of-turn'].sound)
      add('turn-start', MOMENT_CUES['turn-start'].sound)
    } else add('outcome', outcomeSound(after.status === 'won'))
    return floor
  }

  // The first seed on which a scripted line's opening presents every
  // moment in `want`, found by the engine so the drive that replays the
  // same orders through the controls lands where the search said it would.
  function firstSeedShowing(script: Record<number, TurnActions>, want: Moment[], who: string): number {
    for (let seed = 1; seed <= 400; seed += 1) {
      let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
      const shown = new Map<Moment, Set<SoundCue>>()
      const filed = new Set<string>()
      for (let t = 0; t < 3 && st.status === 'playing'; t += 1) {
        const next = resolveTurn(st, script[st.turn] ?? NO_OP, turnRng(st.seed, st.turn))
        presents(st, next, filed, shown)
        st = next
      }
      if (want.every((m) => shown.has(m))) return seed
    }
    throw new Error(`no seed in 400 lets ${who} see ${want.join(', ')} inside three turns`)
  }

  // THE EXCUSES, COMPUTED FROM v1.3 PLAY rather than written down. Until
  // v1.3 Round 0 this file named four rows the engine "cannot produce in
  // three turns" and trusted tests/opening.spec.ts to prove it; the 6-turn
  // plan made two of the four false at once (GNSS denial from turn 2's
  // jamming arms the chain on turn 3, and spending everything on turn 1
  // ends a campaign in insolvency), and the hand-written list kept
  // excusing them. So a row is excused here only when no line of play the
  // suite knows reaches it inside three turns: every script in
  // tests/scripts.ts and every policy of the sweep gate, over 120 seeds.
  // A row the night carries is reached when a night presents one of its
  // moments, with one of the row's own sounds where two rows share the
  // moment; the score row is reached when the score the HUD shows, step by
  // step, goes under the win line; every other row fires from a control or
  // a meter on any turn, so it is never excused. The excuses are then
  // checked against the drives below, so a sweep too narrow to reach a
  // row the drives meet fails rather than excusing it.
  function openingExcuses(): Set<string> {
    const lines: ((s: GameState) => TurnActions)[] = [
      ...[WIN_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, LAZY_SCRIPT, TOP_INTEL_SCRIPT].map(
        (script) => (s: GameState) => script[s.turn] ?? NO_OP,
      ),
      ...POLICIES.map((p) => p.policy),
    ]
    const presented = new Map<Moment, Set<SoundCue>>()
    let floor = Infinity
    for (const line of lines) {
      for (let seed = 1; seed <= 120; seed += 1) {
        let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
        const filed = new Set<string>()
        for (let t = 0; t < 3 && st.status === 'playing'; t += 1) {
          const next = resolveTurn(st, line(st), turnRng(st.seed, st.turn))
          floor = Math.min(floor, presents(st, next, filed, presented))
          st = next
        }
      }
    }
    expect(presented.size, 'the sweep presented nothing, so every night row would be excused').toBeGreaterThan(5)
    // A moment two rows claim is told apart by its sound.
    const claims = new Map<Moment, number>()
    for (const r of SECTION_6_ROWS) for (const m of r.moments ?? []) claims.set(m, (claims.get(m) ?? 0) + 1)
    const reached = (row: (typeof SECTION_6_ROWS)[number]) => {
      if (row.moments?.length) {
        const sounds = [row.sound, ...(row.soundPartners ?? [])]
        return row.moments.some((m) => {
          const heard = presented.get(m)
          if (!heard) return false
          return (claims.get(m) ?? 0) < 2 || sounds.some((s) => heard.has(s))
        })
      }
      if (row.sound === CROSSING_SOUND.below) return floor < DEFAULT_SCENARIO.winThreshold
      return true
    }
    return new Set(SECTION_6_ROWS.filter((r) => !r.deferred && !reached(r)).map((r) => r.beat))
  }

  it('meets the rows the opening is not excused from, by the end of the third turn', async () => {
    // THREE PLAYERS since v1.3 Round 0, each covering rows the others
    // cannot:
    //   - THE WAITING PLAYER orders exactly one drone a turn and no
    //     defense, so the night's moves land: the strike lands, its tiles
    //     tick down, and a condition attaches with its alarm. Each of those
    //     needs a move to get through.
    //   - THE PREPARED PLAYER replays WIN_SCRIPT's first three turns (a
    //     drone and the primary defense of each move tonight), so the
    //     nights are HELD: the block's shield and its chime, and the
    //     defense streak from the second block in a row, exist only when
    //     nothing gets through, which v1.3 makes the player earn (brief
    //     6.2, M2); and an opportunity lands inside three turns on the seed
    //     the search finds.
    //   - THE OVER-BUYER, on the fixture's seed, spends everything PROCURE
    //     leaves on, short of the defenses that would hold the night.
    //     Spending all 100 CR on turn 1 leaves nothing for the repair bill
    //     when a point gets through, and the close below zero ends the
    //     campaign in insolvency (brief 6.1), so this drive is one turn
    //     long and it meets "Campaign lost" on its END OF TURN, which v1.3
    //     play reaches inside the opening. Until v1.3 R2 it also tapped
    //     past the balance, which tripped the cannot-afford row; PROCURE
    //     disables an order it cannot afford since then, and the row is
    //     deferred in SECTION_6_ROWS (src/cues.ts) until a control can
    //     refuse.
    // Every row v1.3 play can produce in three turns is required of at
    // least one of them. The alternative, excusing whichever row a single
    // drive misses, is the "unreached, not unreachable" error 7b's
    // re-review found twice.
    //
    // And the scripted players' seeds are DERIVED, not chosen: the engine
    // finds the first on which the waiting player's move lands and leaves
    // a condition, and the first on which the prepared player blocks, earns
    // the streak and meets an opportunity (a draw at 0.2 on turns 2 and
    // 3), and the drives replay the same orders, so they land where the
    // search said they would.
    const waitScript: Record<number, TurnActions> = Object.fromEntries(
      [1, 2, 3].map((t) => [t, a({ buyAssets: [{ kind: 'drone' }] })]),
    )
    const waitSeed = firstSeedShowing(waitScript, ['strike-hit', 'condition'], 'a waiting player')
    const preparedSeed = firstSeedShowing(WIN_SCRIPT, ['strike-block', 'streak', 'opportunity'], 'a prepared player')
    const waits = await driveOpening(3, { seed: waitSeed, script: waitScript })
    const prepared = await driveOpening(3, { seed: preparedSeed, script: WIN_SCRIPT })
    const overbuys = await driveOpening(3)
    const turns = [...waits, ...prepared, ...overbuys]
    const heard = new Set<string>()
    for (const t of turns) for (const s of t.sounds) heard.add(s)

    // Derived from SECTION_6_ROWS, minus the rows v1.3 play cannot
    // produce in three turns (computed above, against the engine) and the
    // rows still deferred. A row added later is required by default: one
    // the opening cannot reach changes the computed set and fails the pin
    // below until it is excused on purpose. Today the computation excuses
    // the score row (the lowest score the HUD shows, over the sweep, stays
    // above the win line), "Campaign won" (the plan is six turns) and,
    // since v1.3 R3, "BLACKOUT CHAIN fires": the director met that row
    // when the chain was ARMED, a beat that retired with it, and the night
    // meets it only when the chain itself strikes, which is turn 6's fixed
    // move. "The debris call and its result" joined with its row in v1.3
    // R3: the conjunction is turn 4's fixed move, past the opening.
    // "Surge token spent", excused here until v1.3 Round 0, left the table
    // with SURGE.
    const excused = openingExcuses()
    // THE COMPUTED EXCUSES ARE PINNED. openingExcuses() decides a row is
    // reached from the night's model and the registry's voices, the same
    // lookups that sound the night this test drives, so a cue regression
    // (say, a block that plays the hit's voice again) would stop the sweep
    // presenting that row's sound, move the row into the excused set and
    // take it out of `required`, all with this test green. Pinning the
    // measured output turns that into a failure here. If the engine, the
    // plan or the cue table really changes what three turns can reach,
    // re-measure (print [...openingExcuses()].sort()), confirm each row
    // left or joined for a reason v1.3 play explains, and re-pin it
    // deliberately; never re-pin to make a red run green.
    expect(
      [...excused].sort(),
      'the excused rows changed: re-measure and re-pin deliberately',
    ).toEqual(['BLACKOUT CHAIN fires', 'Campaign won', 'Mission assurance crosses below the win line', 'The debris call and its result'])
    // THE EXCUSE LIST IS CHECKED IN BOTH DIRECTIONS, the way the sibling
    // breadth file checks its own. A hand-written set that subtracts from
    // a required set is granted for free otherwise: adding Round 7b's own
    // central row to it left all 54 tests in this file green.
    //
    // A sound two rows share cannot credit either on its own: the row's
    // own class must be painted alongside it, and no class of the other
    // row's. A class on every card the drives met (the card's entrance,
    // which every night card carries) tells no card from another, so it
    // is not counted against a row. Derived from the table rather than
    // listed: data-burst (BEGIN TURN and COLLECT) and resolve-chime (an
    // opportunity and END OF TURN) are the live cases today, and the next
    // one should not need this comment edited.
    const heardWith = turns.flatMap((t) => t.heardWith)
    const onCards = turns.flatMap((t) => t.onCards)
    expect(onCards.length, 'the drives never sampled a night card').toBeGreaterThan(0)
    const everyCard = new Set([...onCards[0]].filter((c) => onCards.every((s) => s.has(c))))
    const met = (row: (typeof SECTION_6_ROWS)[number]) => {
      if (row.soundPerSubject === 'condition') return [...heard].some((s) => s.startsWith('alarm-'))
      const sounds: string[] = [row.sound, ...(row.soundPartners ?? [])]
      const cls = VISUAL_CLASS[row.visual]
      const sharers = SECTION_6_ROWS.filter((r) => r !== row && r.sound === row.sound)
      if (sharers.length) {
        const others = sharers.map((r) => VISUAL_CLASS[r.visual]).filter((c) => c && c !== cls && !everyCard.has(c))
        return !!cls && heardWith.some((h) => sounds.includes(h.sound) && h.classes.has(cls) && !others.some((o) => h.classes.has(o)))
      }
      return sounds.some((snd) => heard.has(snd))
    }
    const names = new Set(SECTION_6_ROWS.map((r) => r.beat))
    for (const name of excused) {
      expect(names.has(name), `the drive excuses "${name}", which is not a section 6 row`).toBe(true)
      const row = SECTION_6_ROWS.find((r) => r.beat === name)!
      expect(met(row), `the drive excuses "${name}" and then produces it anyway`).toBe(false)
    }
    // `met` is the credit for EVERY row. It was written for the pair join
    // and then called only in the excuse loop, while the credit that
    // decides whether the vocabulary claim passes stayed sound-only for
    // twelve of thirteen required rows: the pair join was advertised and
    // not used.
    const required = SECTION_6_ROWS.filter((r) => !r.deferred && !excused.has(r.beat))
    const missed = required.filter((row) => !met(row))
    expect(
      missed.map((r) => `${r.beat} (${r.sound})`).join('\n'),
      `heard across three turns: ${[...heard].sort().join(', ')}`,
    ).toBe('')
  })

  it('pairs what was painted with what was played, so a silent animation cannot pass', async () => {
    // The pair is the point. A visual with no voice and a voice with no
    // visual both satisfy the two assertions above taken separately.
    //
    // A block, which Round 7b's quiet beat became in v1.3 R3: a defense
    // that holds a move is a win at a glance and to the ear (brief 5.5),
    // the shield on the tile with the block's chime. Until v1.4 the
    // prepared line ordered the primary defense of both of turn 1's moves
    // and held that night on every seed; with one new defense a night it
    // holds turn 3 outright on every seed instead (anti-jam, encrypted
    // backhaul and link authentication answer both of its slots), so the
    // drive plays three nights.
    const turns = await driveOpening(3, { script: WIN_SCRIPT })
    const pairs = new Set<string>()
    for (const t of turns) for (const p of t.pairs) pairs.add(p)
    expect(pairs.size, 'nothing was ever observed painting and sounding together').toBeGreaterThan(1)
    const shieldClass = VISUAL_CLASS[MOMENT_CUES['strike-block'].visual]
    const blockSound = MOMENT_CUES['strike-block'].sound
    expect([...pairs].join(' '), `pairs observed: ${[...pairs].join(', ')}`).toContain(`${shieldClass}|${blockSound}`)
    // ON THE TILE THE ENGINE NAMED, not merely somewhere on screen. The
    // registry puts the shield on the tile the move was aimed at, and the
    // engine records that tile with the move (ResolvedEvent.targetAssetId),
    // so the expectation is built from the engine's record of the same two
    // nights, never from the strike's own lookup. Without this, a shield
    // painted on the wrong tile, or on the strip's header, passes every
    // assertion above.
    const blockedTargets = new Set<string>()
    let st = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    for (let t = 0; t < 3; t += 1) {
      const next = resolveTurn(st, WIN_SCRIPT[st.turn] ?? NO_OP, turnRng(st.seed, st.turn))
      for (const step of nightOf(st, next).steps) {
        const id = step.ev.targetAssetId
        if (step.kind === 'threat' && step.ev.effectiveSeverity === 0 && id && step.before.assets.some((x) => x.id === id)) blockedTargets.add(id)
      }
      st = next
    }
    expect(blockedTargets.size, 'the prepared nights blocked nothing aimed at a tile, so this proves nothing').toBeGreaterThan(0)
    const shielded = new Set<string>()
    for (const t of turns) for (const id of t.shielded) shielded.add(id)
    expect(turns.flatMap((t) => t.shieldStray), 'the shield landed on something that is not a tile it held').toEqual([])
    expect([...shielded].sort(), 'the shield landed on tiles other than the ones the blocked moves were aimed at').toEqual([...blockedTargets].sort())
    // The control: a night whose moves all land strikes its tiles and
    // shields none, so the assertions above are not satisfied by a strip
    // that shields whatever a move touches. The over-buyer leaves out every
    // defense that would hold turn 1; that its moves really struck is
    // asserted, so the control cannot pass on a night that touched nothing.
    const [landed] = await driveOpening(1)
    expect(landed.struck.size, 'the over-buyer-s moves struck no tile, so the shield-s absence proves nothing').toBeGreaterThan(0)
    expect([...landed.shielded], 'a night with nothing blocked put the shield on a tile').toEqual([])
    expect(landed.pairs.has(`${shieldClass}|${blockSound}`), 'a night with nothing blocked played the block').toBe(false)
  })

  // The start screen that also carried the job framing left in v1.3 R1
  // (brief 5.1): the framing now renders only in the full brief, which the
  // guards below read.

  // THE DISCLOSURES SINCE v1.3 R2. The deciding board carries one: the
  // full brief behind the TONIGHT card's toggle. "What these numbers mean"
  // and "Posture detail" left with the v1.2 board's reference and nothing
  // replaces them, and the BLACKOUT CHAIN line is no longer a disclosure:
  // it is a line on the TONIGHT card, counted by the reading budget.
  const RETIRED_DISCLOSURES: string[] = []

  it('bounds every disclosure the brief screen renders, not only the one the round touched', async () => {
    // Round 7b bounded the "Expand full brief" panel and named the constant
    // as though it covered every disclosure. Three more sat unmeasured on
    // the same screen, the largest at 263 words. The set is derived from
    // the rendered DOM: every <details> the brief screen carries must have
    // a budget, and so must the full brief, so a disclosure added later
    // fails here until someone says how long it may be.
    const states: [string, GameState][] = []
    const push = (label: string, script: Record<number, TurnActions>, turn: number, seed = 20260712) => {
      let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (st.status === 'playing' && st.turn < turn) {
        st = resolveTurn(st, script[st.turn] ?? NO_OP, turnRng(st.seed, st.turn))
      }
      if (st.status === 'playing') states.push([label, st])
    }
    // Six turns since v1.3 Round 0, so the late states are turns 4 to 6
    // (they were turns 7 to 12 of the twelve-turn game).
    push('turn 1', {}, 1)
    push('prepared, turn 4', WIN_SCRIPT, 4)
    push('prepared, turn 6', WIN_SCRIPT, 6)
    // The fullest posture: seed 20's prepared fleet at turn 6, the full
    // fleet and nine defenses with their upkeep, which the full brief's
    // posture lines list.
    push('prepared, turn 6, seed 20', WIN_SCRIPT, 6, 20)
    // The allied data share's free-brief line, which renders only while the
    // brief is free for turns still to come: seed 1's share covers turns 5
    // and 6, so turn 5 carries it.
    push('prepared, turn 5, seed 1', WIN_SCRIPT, 5, 1)
    // The in-transit line, which no prepared state carries (its one drone
    // lands at the close it was ordered): a sat ordered on turn 1 is still
    // in transit on turn 2.
    push('a sat in transit, turn 2', { 1: { ...NO_OP, buyAssets: [{ kind: 'sat' }] } }, 2)
    push('top intel, turn 5', TOP_INTEL_SCRIPT, 5)
    push('passive, turn 5', LOSS_SCRIPT, 5)
    // The chain line renders only while the chain is armed, so find a
    // state that arms it rather than hoping one of the above does. Armed
    // means GNSS denial is live (state.flags.lidarFallback until v1.3
    // Round 0), and a prepared line never arms it, because its anti-jam
    // holds the jamming that leaves the denial; the passive line lets it
    // land.
    const armed = (st: GameState) => gnssDenied(st.conditions, st.scenario)
    for (let seed = 1; seed <= 40 && !states.some(([, st]) => armed(st)); seed += 1) {
      let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (st.status === 'playing' && !armed(st)) {
        st = resolveTurn(st, LOSS_SCRIPT[st.turn] ?? NO_OP, turnRng(st.seed, st.turn))
      }
      if (st.status === 'playing' && armed(st)) states.push([`chain armed, seed ${seed}`, st])
    }
    expect(states.some(([, st]) => armed(st)), 'no state armed the chain, so its line was never checked').toBe(true)

    const rendered = new Set<string>()
    const unbudgeted = new Set<string>()
    const measure = (label: string, key: string, root: Element) => {
      // Block by block, and only this disclosure's own blocks: textContent
      // merges sibling items and a nested <details> would be counted twice.
      const words = countWords(bodyText(root))
      const budget = DISCLOSURE_WORD_BUDGETS[key]
      if (budget === undefined) {
        unbudgeted.add(`"${key}" (${words} words, ${label})`)
        return
      }
      expect(words, `${label}: "${key}" renders ${words} words against ${budget}`).toBeLessThanOrEqual(budget)
      rendered.add(key)
    }
    for (const [label, st] of states) {
      render(st, 'brief')
      for (const d of container.querySelectorAll('details')) measure(label, d.querySelector('summary')?.textContent?.trim() ?? '', d)
      await openFullBrief()
      measure(label, FULL_BRIEF_OPEN, container.querySelector('div[data-brief-scroll]')!)
      // The chain line, where it renders, is the TONIGHT card's and the
      // reading budget's: the card prints exactly the line firstInputCopy
      // counts.
      if (armed(st)) {
        const chain = container.querySelector('p[data-chain]')
        expect(chain, `${label}: the chain is armed and the TONIGHT card does not say so`).not.toBeNull()
        expect((chain!.textContent ?? '').trim(), `${label}: the chain line is not the one the reading budget counts`).toBe(chainLine())
        expect(firstInputCopy(st), `${label}: the reading budget does not count the chain line`).toContain(chainLine())
      }
    }
    expect([...unbudgeted].join('\n'), 'a disclosure on the brief screen has no budget').toBe('')
    // Every budget must correspond to something the screen renders, or the
    // map is bounding a disclosure that no longer exists. The three the
    // R2 board retired are named, so a fourth stale key fails here, and so
    // does removing one of the three without editing this line.
    const stale = Object.keys(DISCLOSURE_WORD_BUDGETS).filter((key) => !rendered.has(key))
    expect(stale.sort(), 'a budget bounds a disclosure the brief screen never rendered').toEqual([...RETIRED_DISCLOSURES].sort())
  })

  it('puts a disclosure on the brief screen that adds to what is above it', async () => {
    // Item 2, from the player's seat rather than from briefCopy. The panel
    // used to expand into a longer copy of its own summary; on three of
    // four intel levels it expanded into a SHORTER one.
    render(newGame(DEFAULT_SCENARIO, 20260712, 'standard'), 'brief')
    // The panel, found through the control the player taps rather than by
    // querySelector over the page.
    const toggle = container.querySelector('button[data-full-brief]')
    expect(toggle, 'the brief screen offers no expand control').not.toBeNull()
    expect(toggle!.textContent, 'the expand control does not say what it opens').toBe(FULL_BRIEF_OPEN)
    await openFullBrief()
    expect(toggle!.getAttribute('aria-expanded'), 'the open full brief does not say it is open').toBe('true')
    const panel = container.querySelector('div[data-brief-scroll]') as HTMLElement
    // Read the panel BLOCK BY BLOCK, not as one textContent string.
    // textContent concatenates sibling elements with no separator, so
    // "<li>...at full integrity.</li><li>Nothing in transit.</li>" comes
    // back as "...integrity.Nothing in transit." and two words become one.
    // Over ten list items that lost nine words, and the first version of
    // the join below reported a 100-word panel against a 109-word array.
    // A lossy reader is a measurement that disagrees with the screen in
    // the direction that makes the bound look satisfied.
    const body = [...panel.querySelectorAll('li, p')]
      .map((el) => el.textContent ?? '')
      .filter(Boolean)
      .join(' ')
    const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    // The summary is the headline and the vector THE PLAYER IS LOOKING AT,
    // taken from briefCopy for the same state rather than scraped off a
    // parent element. The first version of this walked up from an <h2> and
    // subtracted the body from it, which is the nearest observable rather
    // than the one the claim is about: it passed with the panel reverted
    // to the engine's forecast, which is the exact defect item 2 exists to
    // remove. The mutation that reverted Game.tsx slept through it.
    const copy = briefCopy(newGame(DEFAULT_SCENARIO, 20260712, 'standard'))
    const summaryWords = words([copy.headline, copy.vector, copy.tag ?? ''].join(' '))
    const novel = [...words(body)].filter((w) => !summaryWords.has(w))
    expect(
      novel.length,
      `the disclosure added ${novel.length} words the summary did not already carry: "${body.trim().slice(0, 200)}"`,
    ).toBeGreaterThan(5)
    // THE CEILING, MEASURED ON THE RENDERED PANEL. tests/reading-diet.spec.ts
    // bounds briefCopy().full, which is a module's return value: nothing
    // joins that string to the element the player opens, so JSX rendered
    // inside this panel is invisible to it. That is exactly how the
    // turn-1 job framing sat unmeasured while the bound read 90 of 100,
    // and moving the framing into brief.ts fixed the instance without
    // fixing the mechanism. This measures the subtree.
    expect(
      countWords(body),
      `the expand panel renders ${countWords(body)} words: "${body.trim().slice(0, 200)}"`,
    ).toBeLessThanOrEqual(DISCLOSURE_WORD_BUDGETS[FULL_BRIEF_OPEN])
    // And the two figures must agree, which is the join: if they diverge,
    // something renders in the panel that briefCopy does not know about.
    expect(
      countWords(body),
      'the rendered panel and the measured array disagree, so something renders that the budget cannot see',
    ).toBe(countWords(disclosureBlocks(copy).join(' ')))
    // THE JOB AND THE POSTURE ARE TWO SECTIONS, not one list. Round 7b
    // folded the turn-1 job into the posture bullets, and at 375px the
    // player's instructions ran straight into their fleet status with no
    // heading and no numbering. Asserted as structure the player sees: a
    // heading, the numbered job as paragraphs, and the posture as a list.
    const heading = [...panel.querySelectorAll('p')].find((p) => (p.textContent ?? '').trim() === 'Your job')
    expect(heading, 'the turn-1 disclosure has no "Your job" heading').toBeDefined()
    const jobParas = [...panel.querySelectorAll('p')].map((p) => (p.textContent ?? '').trim())
    expect(jobParas.some((p) => p.startsWith('1. ')), 'the job lines lost their numbering').toBe(true)
    const listItems = [...panel.querySelectorAll('li')].map((li) => (li.textContent ?? '').trim())
    expect(listItems.some((li) => /^\d\. /.test(li)), 'a numbered job line was rendered inside the posture list').toBe(false)
    expect(listItems.length, 'the posture list is empty').toBeGreaterThan(0)
    // ORDER, which the checks above cannot see: the job comes first and the
    // posture list after it, and the job's blocks are exactly the shared
    // framing, heading first. Moving the framing below the list passed every
    // assertion above until this line existed.
    const list = panel.querySelector('ul')!
    expect(
      heading!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the job heading does not come before the posture list',
    ).toBeTruthy()
    const jobBlocks = [...panel.querySelectorAll('p')]
      .filter((el) => el.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)
      .map((el) => (el.textContent ?? '').trim())
    expect(jobBlocks).toEqual([JOB_FRAMING_HEADING, ...jobFramingBlocks(DEFAULT_SCENARIO)])
    // And it is THIS panel, not some other block on the screen: the body
    // must carry what briefCopy built, so rendering the engine's forecast
    // here fails rather than reading as a different-but-fine disclosure.
    expect(body, 'the expand panel is not rendering the brief the screen built').toContain(copy.full[0])
  })
})
