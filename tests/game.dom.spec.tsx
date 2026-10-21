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

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted above the import of Game, which is what vi.mock requires.
vi.mock('../src/ui/Constellation', () => ({
  default: () => null,
}))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { maiScore } from '../src/engine/scoring'
import { RECAP_MAX, recapTechniques } from '../src/ui/cues/Scene'
import { LOSS_LABEL } from '../src/ui/cues/defeat'
import { turnRng } from '../src/engine/rng'
import { captureGame, decodeSaveCode, encodeSaveCode } from '../src/persistence'
import { glossaryEntries } from '../src/ui/reference'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { newOperation } from '../src/ui/session'
import { STRIKE_MS } from '../src/ui/board/strike'
import { CHAIN_ARMED_LINE, DISCLOSURE_WORD_BUDGETS, JOB_FRAMING_HEADING, briefCopy, countWords, disclosureBlocks, jobFramingBlocks, postureDetailLines } from '../src/ui/brief'
import type { AssetKind, GameState, TurnActions } from '../src/engine/types'
import {
  CONDITION_CUES,
  SECTION_6_ROWS,
  VISUAL_CLASS,
  applyPatch,
  cloneModeled,
  deriveBeats,
  soundFor,
  visualFor,
  type Beat,
  type BeatKind,
} from '../src/director'
import DirectorView from '../src/director/DirectorView'
import { SOUND_TOGGLE_LABELS, chromeCopy } from '../src/ui/brief'
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
// with its sheet) and the presentation-only playback.
type Phase = 'brief' | 'procure' | 'playback' | 'aftermath'

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

// The credits readout's own span, which is where the flash class lands.
function creditsSpan(): HTMLElement {
  const el = container.querySelector('[aria-label^="Credits"]')
  if (!el) throw new Error('the credits readout is not on screen')
  return el as HTMLElement
}

// THE BOARD'S CONTROLS (v1.2 R1; one sheet since v1.3 Round 0). The
// numbered sections had one buy button per fleet tile; the board has a
// PROCURE sheet behind a pinned action bar. Its first step holds ASSETS,
// DEFENSES and INTEL, which were three sheets (PROCURE, HARDEN, INTEL)
// until v1.3 Round 0 merged them, and an asset opens a confirm step that
// carries its price: there is no tier step since D2 retired the tiers,
// and an asset has one price. These drive the sheet the way
// a thumb does, by the attributes it carries for exactly this, so the
// tests above the board read the same as they did above the sections. A
// test that renders at 'procure' lands with PROCURE already open, which is
// what an autosave from that phase does too.
//
// Each selector names its tag (v1.2 R2 fix, after CI run #19). jsdom's
// selector engine answers a bare attribute selector by walking every
// element in the container, and since R2 most of those are sprite and
// backdrop rects; with the tag it starts from that tag's elements only.
// Measured on the decision board: 1.3ms a query without, 0.14ms with.
const sheetOpen = (id: string) => container.querySelector(`section[data-sheet="${id}"]`)
function openSheet(label: 'PROCURE') {
  if (sheetOpen(label.toLowerCase())) return
  const control = byText(new RegExp(`^${label}`))
  if (!control) throw new Error(`no ${label} control on screen`)
  click(control)
}
// Walk the PROCURE sheet to its confirm step for one kind and return the
// confirm control WITHOUT pressing it, since that press is what several
// tests inspect. A sheet already on its confirm step (after a refusal) is
// left there.
function reachBuy(kind: AssetKind): HTMLButtonElement {
  openSheet('PROCURE')
  const k = container.querySelector(`button[data-procure-kind="${kind}"]`)
  if (k) click(k)
  const confirm = container.querySelector('button[data-procure-buy]') as HTMLButtonElement | null
  if (!confirm) throw new Error('the PROCURE sheet never reached its confirm step')
  return confirm
}
function buy(kind: AssetKind): HTMLButtonElement {
  const confirm = reachBuy(kind)
  click(confirm)
  return confirm
}
// The checkboxes PROCURE's first step carries, by section: the defenses
// (the IR retainer among them) and the intel order.
const defenseBoxes = () => [...container.querySelectorAll('ul[data-procure-defenses] input[type="checkbox"]')] as HTMLInputElement[]
const intelBox = () => container.querySelector('p[data-procure-intel] input[type="checkbox"]') as HTMLInputElement | null
const isRetainer = (b: HTMLInputElement) => /Incident response retainer/i.test(b.closest('label')?.textContent ?? '')

// THE COMMIT AND THE PLAYBACK (v1.3 Round 0, brief 5.5). EXECUTE is a
// plain button that ends the turn on a click; the hold-to-resolve control
// and its keyboard path went with the auto-advancing director. A
// synthetic keydown does not click a plain button in jsdom, so the
// fixture clicks it, as a player taps it.
//
// Nothing advances on its own any more: a beat stays on screen until the
// player moves on, so the fixture moves the turn on the way a player
// does, by pressing Next. The strike is the one part of a beat that still
// runs on timers (a landed hit locks on for LOCK_SHARE of STRIKE_MS
// before the board takes the damage and the hit sounds), so each beat is
// given its strike's length before the tap, in steps a caller can sample
// between. The first step clears the 20ms gap useCueClass leaves when a
// treatment repeats on the next beat, so a sample never reads that gap.
const executeControl = () => container.querySelector('button[data-execute]') as HTMLButtonElement | null
const inPlayback = () => /beat \d+ of \d+/.test(container.textContent ?? '')
const BEAT_STEPS_MS = [40, ...Array.from({ length: Math.ceil(STRIKE_MS / 300) }, () => 300)]
function playBeat(sample?: () => void) {
  for (const ms of BEAT_STEPS_MS) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
    sample?.()
  }
}
function tapNext(): boolean {
  const next = buttons().find((b) => (b.textContent ?? '').trim() === 'Next')
  if (!next) return false
  click(next)
  return true
}
// Tap the turn on screen through to its aftermath, letting each beat play
// first. Returns how many taps it took.
function playOut(sample?: () => void, limit = 80): number {
  let taps = 0
  for (; taps < limit && inPlayback(); taps += 1) {
    playBeat(sample)
    if (!tapNext()) break
  }
  return taps
}
// Every element under the container whose class names a dc- class, in
// document order: what querySelectorAll('[class*="dc-"]') returns, found
// with a TreeWalker instead, because jsdom's selector engine tests the
// substring on every element through its full matcher. Measured on the
// decision board: 1.64ms a scan by selector, 0.21ms walked, the same 122
// elements. The opening drive scans at every playback step.
function dcClassed(): Element[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
  const out: Element[] = []
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    if ((n.getAttribute('class') ?? '').includes('dc-')) out.push(n)
  }
  return out
}
// The dearest thing on offer, which a refusal drive buys until the cart
// refuses: the RPO servicer, at the one price there is since the tiers
// went.
const DEAREST: AssetKind = 'rpoSat'
// The control that moves on after a turn, on the action bar.
const NEXT_TURN = /^NEXT TURN|^FINAL REPORT/

describe('the fixture renders the real campaign screen', () => {
  it('mounts a turn in progress without a browser', () => {
    render(gameAt(3))
    expect(container.textContent, 'the HUD did not render').toMatch(/Credits/)
    expect(buttons().length, 'no controls rendered').toBeGreaterThan(0)
  })
})

describe('the declaration chain, asserted by execution', () => {
  // The chain runs Director to DirectorView to Game to Readout to the pure
  // tone rule, and the Round 4 opening pass proved four of those links
  // could be reverted one line at a time with the suite, typecheck and lint
  // all green. It was pinned by four regular expressions over two source
  // files, and named the highest-risk of the eight because of it.
  //
  // What it protects: spending credits is a decision, not damage. Playback
  // folds the player's own purchase into the next visible beat, so without
  // the declaration reaching the readout ungated, every turn in which the
  // player bought anything paints the spend in the damage colour.
  it('does not paint the player-s own spend as damage', () => {
    const state = gameAt(2)
    render(state, 'procure')
    // Buy the cheapest thing on offer.
    buy('sat')
    // The ticker shows the cart during procurement, so the number falls.
    // It must not carry the damage colour: the fall is the player's own.
    expect(creditsSpan().className, 'a purchase was painted as damage').not.toMatch(/dc-flash-bad/)
    expect(creditsSpan().className, 'a purchase was painted as a gain').not.toMatch(/dc-flash-good/)
  })

  it('carries the declaration through a real playback, beat by beat', () => {
    // The chain end to end, which the four source regexes stood in for.
    //
    // The turn is not hard-coded, because most turns CANNOT tell a working
    // declaration from a severed one: if the fold beat also carries a
    // repair bill, the unchosen part is negative and the tone reads as
    // damage either way. The fixture searches for a turn whose fold is the
    // purchase and nothing else, and fails if it finds none, so it can
    // never quietly stand on a blind turn and report success.
    const attempt = (turn: number) => {
      const state = gameAt(turn)
      if (state.status !== 'playing') return null
      render(state, 'procure')
      const read = () => Number(/Credits (\d+)/.exec(creditsSpan().getAttribute('aria-label') ?? '')?.[1] ?? 0)
      const beforeBuy = read()
      buy('sat')
      const spend = beforeBuy - read()
      if (spend <= 0) return null

      // EXECUTE commits on a tap since v1.3 Round 0, and the playback is
      // tapped through beat by beat, sampled between the strike's steps.
      const execute = executeControl()
      if (!execute) return null
      click(execute)

      const steps: { credits: number; bad: boolean; good: boolean }[] = []
      const sample = () => {
        const el = container.querySelector('[aria-label^="Credits"]')
        if (el) {
          const m = /Credits (\d+)/.exec(el.getAttribute('aria-label') ?? '')
          steps.push({
            credits: m ? Number(m[1]) : -1,
            bad: /dc-flash-bad/.test(el.className),
            good: /dc-flash-good/.test(el.className),
          })
        }
      }
      sample()
      playOut(sample)
      const moved = steps.findIndex((st, i) => i > 0 && st.credits !== steps[i - 1].credits)
      if (moved <= 0) return null
      const delta = steps[moved].credits - steps[moved - 1].credits
      const tone = steps[moved].bad ? 'bad' : steps[moved].good ? 'good' : 'neutral'
      return { turn, spend, delta, unchosen: delta + spend, tone }
    }

    const tried: string[] = []
    let found: ReturnType<typeof attempt> = null
    for (let turn = 1; turn <= 8 && !found; turn += 1) {
      const r = attempt(turn)
      if (!r) continue
      tried.push(`turn ${r.turn}: moved ${r.delta} with ${r.spend} chosen, unchosen ${r.unchosen}`)
      if (r.unchosen >= 0) found = r
    }
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
      `turn ${found!.turn}: credits moved ${found!.delta} with ${found!.spend} of it chosen, so the unchosen part is ${found!.unchosen}`,
    ).toBe(expected)
  })
})

describe('the declaration covers the defenses as well as the assets', () => {
  it('does not paint a defense order as damage either', () => {
    // The retired pin held FOUR links; the fixture's first version drove
    // three. The fourth is the `chosen` prop, whose other arm was live:
    // countermeasures and the IR retainer were bought in the hardening
    // phase and each moves the ticker. Narrowing it to
    // `chosen={phase === 'procure'}` left every countermeasure purchase
    // flashing magenta and ticking down like damage, with the suite green.
    //
    // Since v1.3 Round 0 the defenses are ordered in PROCURE beside the
    // assets, through their own control (a checkbox, not the asset
    // confirm). The 'harden' phase left the save format with its sheet in
    // the same round (a save that carries it is refused as stale), so the
    // arrival rendered here is the 'procure' one, which opens the sheet
    // the defenses now live on.
    render(gameAt(3), 'procure')
    expect(sheetOpen('procure'), 'a procurement-phase arrival did not open PROCURE').not.toBeNull()
    const before = creditsSpan().getAttribute('aria-label')
    const box = defenseBoxes().find((b) => !b.disabled && !b.checked)
    expect(box, 'PROCURE offered no defense to order').toBeDefined()
    act(() => {
      box!.click()
    })
    expect(creditsSpan().getAttribute('aria-label'), 'the defense order did not move the ticker').not.toBe(before)
    expect(creditsSpan().className, 'a defense order was painted as damage').not.toMatch(/dc-flash-bad/)
  })
})

describe('the declaration survives leaving playback early', () => {
  it('does not paint the buy as damage when the player skips out of playback', () => {
    // finishPlayback deliberately does NOT clear chosenSpend, because SKIP
    // ends playback in the same commit that jumps credits to the engine's
    // after-state, and that jump still carries the purchase. (A mid-turn
    // INSTANT choice did the same until v1.3 Round 0 retired the speeds.)
    // The retired source pin did not cover this either, and the fixture
    // only ever let playback finish naturally, so adding setChosenSpend(0)
    // to finishPlayback left the suite green.
    //
    // Searched for a discriminating turn, for the same reason the natural
    // completion test does: on most turns the remainder carries a repair
    // bill too, so the tone reads as damage whether or not the declaration
    // survived, and the assertion would prove nothing.
    const attempt = (turn: number) => {
      const state = gameAt(turn)
      if (state.status !== 'playing') return null
      render(state, 'procure')
      const read = () => Number(/Credits (\d+)/.exec(creditsSpan().getAttribute('aria-label') ?? '')?.[1] ?? 0)
      const pre = read()
      buy('sat')
      const spend = pre - read()
      if (spend <= 0) return null
      const execute = executeControl()
      if (!execute) return null
      click(execute)
      if (!inPlayback()) return null
      const beforeSkip = read()
      const skip = byText(/^Skip/i)
      if (!skip) return null
      click(skip)
      act(() => {
        vi.advanceTimersByTime(50)
      })
      if (inPlayback()) return null
      const delta = read() - beforeSkip
      const span = creditsSpan()
      const tone = /dc-flash-bad/.test(span.className)
        ? 'bad'
        : /dc-flash-good/.test(span.className)
          ? 'good'
          : 'neutral'
      return { turn, spend, delta, unchosen: delta + spend, tone }
    }

    const tried: string[] = []
    let found: ReturnType<typeof attempt> = null
    for (let turn = 1; turn <= 8 && !found; turn += 1) {
      const r = attempt(turn)
      if (!r) continue
      tried.push(`turn ${r.turn}: skipped out on a ${r.delta} move with ${r.spend} chosen, unchosen ${r.unchosen}`)
      if (r.unchosen >= 0) found = r
    }
    expect(
      found,
      `no turn lets the player skip out onto a non-negative unchosen part, so none can tell a surviving declaration from a cleared one. Tried:\n${tried.join('\n')}`,
    ).not.toBeNull()
    const expected = found!.unchosen > 0 ? 'good' : 'neutral'
    expect(
      found!.tone,
      `turn ${found!.turn}: skipping out moved credits ${found!.delta} with ${found!.spend} of it chosen`,
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
    expect(byText(new RegExp(`^${SOUND_TOGGLE_LABELS.effects}$`)), 'no effects toggle').toBeDefined()
    expect(byText(new RegExp(`^${SOUND_TOGGLE_LABELS.music}$`)), 'no music toggle').toBeDefined()
  })

  it('is still on screen once the campaign has been decided', () => {
    // The defect: the toggles rode the save row, which is gated on the
    // status being 'playing'. The deciding turn's playback runs with the
    // status already won or lost, and that is when the BLACKOUT CHAIN and
    // the defeat sting play. Moving the control back inside that gate is
    // the exact reversion a substring pin cannot see.
    let state = gameAt(1)
    while (state.status === 'playing') {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    expect(state.status, 'the sweep never finished a campaign').not.toBe('playing')
    render(state, 'aftermath')
    openSystem()
    expect(
      byText(new RegExp(`^${SOUND_TOGGLE_LABELS.effects}$`)),
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

    const pressed: string[] = []
    // Call site one: a fleet buy, through the PROCURE sheet's confirm.
    const confirm = reachBuy('sat')
    ctx().reset()
    click(confirm)
    expect(ctx().oscillators().map((o) => o.frequency.first()), 'the fleet buy did not sound the buy voice').toEqual(
      buyVoice,
    )
    pressed.push('fleet buy')

    // Call site two: taking it back out again, which is the same control.
    const remove = byText(/^Remove$|^remove$/i) ?? buttons().find((b) => /remove/i.test(b.textContent ?? ''))
    if (remove) {
      ctx().reset()
      click(remove)
      expect(
        ctx().oscillators().map((o) => o.frequency.first()),
        'removing from the cart did not sound the buy voice',
      ).toEqual(buyVoice)
      pressed.push('remove')
    }

    // Call site three: the intel upgrade, a different control entirely,
    // in PROCURE's INTEL section since v1.3 Round 0 (its own sheet on the
    // v1.2 board).
    openSheet('PROCURE')
    const intel = intelBox()
    if (intel && !intel.disabled) {
      ctx().reset()
      act(() => {
        intel.click()
      })
      expect(
        ctx().oscillators().map((o) => o.frequency.first()),
        'the intel upgrade did not sound the buy voice',
      ).toEqual(buyVoice)
      pressed.push('intel')
    }

    // Call sites four and five lived in the HARDENING phase, which the
    // first render never reached. Two of the five were therefore still
    // covered only by the source text pin the fixture was written to
    // replace, so deleting the sound from toggleCounter silenced every
    // countermeasure purchase with the suite green. On the v1.2 board both
    // were the HARDEN sheet (the IR retainer was the INTEL sheet's second
    // step until critique row M8 moved it there); since v1.3 Round 0 both
    // are PROCURE's DEFENSES section, on the step already open.
    const counter = defenseBoxes().find((b) => !b.disabled && !b.checked && !isRetainer(b))
    expect(counter, 'PROCURE offered no defense').toBeDefined()
    ctx().reset()
    act(() => {
      counter!.click()
    })
    expect(
      ctx().oscillators().map((o) => o.frequency.first()),
      'a countermeasure purchase did not sound the buy voice',
    ).toEqual(buyVoice)
    pressed.push('countermeasure')

    const retainer = defenseBoxes().find(isRetainer)
    expect(retainer, 'the retainer is not among the defenses').toBeDefined()
    expect(retainer!.disabled, 'the fixture already owns the retainer, so its voice goes unheard').toBe(false)
    if (retainer && !retainer.disabled && !retainer.checked) {
      ctx().reset()
      act(() => {
        retainer.click()
      })
      expect(
        ctx().oscillators().map((o) => o.frequency.first()),
        'the retainer did not sound the buy voice',
      ).toEqual(buyVoice)
      pressed.push('retainer')
    }

    expect(
      pressed.length,
      `only pressed ${pressed.join(', ')}; the old pin already covered one, and two of the five are defense orders`,
    ).toBeGreaterThanOrEqual(4)
  })
})

describe('the cannot-afford cue, asserted by execution', () => {
  it('shakes the tile, flashes the spend line and buzzes when the cart cannot take it', () => {
    // Pinned before by reading Game.tsx for the class names. The cue is
    // three channels at once and the point is that they fire together.
    const broke: GameState = { ...gameAt(2), credits: 1 }
    render(broke, 'procure')
    const buy = reachBuy('sat')
    act(() => {
      buy.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    const before = ctx() ? ctx().startedCount() : 0
    const balanceBefore = creditsSpan().getAttribute('aria-label')
    click(buy)
    // Scoped to the elements that own each channel. Asked container-wide
    // at first, which proved only that the nonce fired once: both classes
    // hang off the same nonce, so moving the flash onto the tile beside
    // the shake left both queries satisfied while the spend line never
    // flashed, and the failure message named an element nothing inspected.
    const tile = buy.closest('.dc-tile') ?? buy
    expect(tile.className, 'the refused tile did not shake').toMatch(/dc-shake/)
    // The spend line is identified by WHAT IT IS, not by what it is not.
    // Scoped negatively at first ("some paragraph carrying the flash that
    // is not an ancestor of the pressed button"), which any other
    // paragraph on the screen satisfies: moving the flash onto the intel
    // tile left the budget line silent on every refusal and passed.
    const spendLine = [...container.querySelectorAll('p')].find((el) => /Planned spend/i.test(el.textContent ?? ''))
    expect(spendLine, 'the planned-spend line is not on screen').toBeDefined()
    expect(spendLine!.className, 'the spend line did not flash').toMatch(/dc-flash-bad/)
    expect(spendLine!.contains(buy), 'the spend line and the tile are the same element').toBe(false)
    expect(ctx().startedCount(), 'the refusal was silent').toBeGreaterThan(before)
    // And nothing was added to the cart: a cue that fired alongside a
    // successful buy would be a different bug wearing the same clothes.
    expect(creditsSpan().getAttribute('aria-label'), 'the refusal still took the credits').toBe(balanceBefore)
  })
})

describe('every refusable control answers for its own refusal', () => {
  it('shakes the control the player actually touched, not just the fleet tiles', () => {
    // afford() is called with four tile ids, and only two of them were
    // ever matched in the tree: a refused intel upgrade or IR retainer
    // buzzed and flashed the spend line while the control the player
    // touched sat still, so the refusal was not attributable to it. The
    // brief's shake-flash row is three channels; those two had two.
    // The cart is filled to force the refusal rather than the credits
    // zeroed, which is how a player actually reaches this. (Through v1.2
    // the budget was credits PLUS the turn's income, so zeroing was not
    // even enough; funding arrives at the close since v1.3 Round 0.)
    //
    // Since the board (v1.2 R1) the fleet buy's refusal is no longer on
    // screen when the intel control is examined. The intel control had a
    // sheet of its own on the v1.2 board; since v1.3 Round 0 it sits on
    // PROCURE's first step, while the refused fleet buy stays on the
    // confirm step, so the player steps back to reach it. The exclusivity
    // claim is kept in the form the board allows, that a refusal elsewhere
    // leaves this control still, and the attribution claim, that the
    // control touched is the one that shakes, is as it was.
    // The cart is filled with sats, as the numbered layout's first tile
    // was, so what is left is less than the intel brief.
    //
    // Turn 2 since v1.3 Round 0. The budget is the balance alone now
    // (funding arrives at the close), and the turn has to leave less than
    // the brief's 8 CR once the sats fill it: on this line turn 3 opens on
    // 103 CR, three sats leave 13 and the brief is simply bought, while
    // turn 2 opens on 91 and three sats leave 1. Turn 1 cannot serve,
    // because its brief is free and its control is disabled. The leftover
    // is asserted below, so a retuned price fails here by name.
    render(gameAt(2), 'procure')
    for (let i = 0; i < 12; i += 1) {
      buy('sat')
      if (container.querySelector('.dc-shake')) break
    }
    expect(container.querySelector('.dc-shake'), 'the loop did not leave a refusal on screen').not.toBeNull()
    const planned = /Planned spend: (\d+) of (\d+)/.exec(container.textContent ?? '')
    expect(planned, 'the spend line is not on screen').not.toBeNull()
    expect(
      Number(planned![2]) - Number(planned![1]),
      'the filled cart still covers the intel brief, so its refusal is never reached',
    ).toBeLessThan(DEFAULT_SCENARIO.prices.intelBrief)
    const back = container.querySelector('button[aria-label="Back a step"]')
    expect(back, 'the refused confirm step offers no way back to the first step').not.toBeNull()
    click(back!)
    const intel = intelBox()
    expect(intel, 'the intel brief is not on screen').not.toBeNull()
    expect(intel!.disabled, 'the intel brief is free tonight, so it cannot be refused').toBe(false)
    // EXCLUSIVITY: a refusal on the fleet buy must not have left this
    // control shaking. Without this the tile could key off
    // `denied !== null` and shake for every refusal anywhere, which is the
    // mis-attribution the fix exists to prevent.
    const before = intel!.closest('.dc-tile')
    expect(before, 'the intel brief is not on a tile that can carry a cue').not.toBeNull()
    expect(before!.className, 'the intel tile shook for a refusal on a different control').not.toMatch(/dc-shake/)
    act(() => {
      intel!.click()
    })
    // A second refusal replays the same animation, and useCueClass drops
    // the class for RESTART_GAP_MS first so the browser will restart it.
    // Without advancing past that gap the class is legitimately absent and
    // the assertion below reads a frame that never reaches a player.
    act(() => {
      vi.advanceTimersByTime(40)
    })
    const tile = intel!.closest('.dc-tile')
    expect(tile, 'the intel brief is not on a tile that can carry a cue').not.toBeNull()
    expect(tile!.className, 'a refused intel brief did not shake').toMatch(/dc-shake/)
    expect(intel!.checked, 'the refusal still bought it').toBe(false)
    // And the shake is on the intel tile specifically, not inherited from
    // the fleet tile that filled the cart.
    // The colour channel too, because the shake is motion and a
    // reduced-motion player never sees it. Carried by the shake alone at
    // first, so the fix reached nobody with the preference set.
    expect(tile!.className, 'the refused tile has no channel that survives reduced motion').toMatch(
      /border-hero-magenta/,
    )
  })

  it('shakes the retainer tile too, which sits among the defenses', () => {
    // The IR retainer is the fourth refusable id and the only one that
    // lived in the hardening phase. Guarding the intel tile alone left
    // this one's fix unguarded, which a mutation showed. It was a HARDEN
    // tile since critique row M8 (the INTEL sheet's second step before
    // that), and since v1.3 Round 0 it is one of PROCURE's DEFENSES; the
    // budget is filled with the other defenses in that section first, as
    // it was through the hardening phase.
    //
    // Turn 1 since v1.3 Round 0, measured: the budget is the balance
    // alone, and on this line turn 3 opens on 103 CR owning three
    // defenses, so the other seven (71 CR) never fill it and the retainer
    // is simply bought. Turn 1 owns none, and the other ten cost 103
    // against 100, so the last of them refuses with 5 CR left, under the
    // retainer's price. The refusal is asserted, so this cannot pass on a
    // budget that never filled.
    render(gameAt(1), 'brief')
    openSheet('PROCURE')
    // Fill the budget with the other countermeasures until one refuses.
    for (const box of defenseBoxes()) {
      if (box.disabled || box.checked || isRetainer(box)) continue
      act(() => {
        box.click()
      })
      if (container.querySelector('.dc-shake')) break
    }
    expect(container.querySelector('.dc-shake'), 'the other defenses never filled the budget').not.toBeNull()
    const retainer = defenseBoxes().find(isRetainer)
    expect(retainer, 'the retainer is not on screen').toBeDefined()
    expect(retainer!.disabled, 'the retainer is already active, so it cannot be refused').toBe(false)
    const before = retainer!.closest('.dc-tile')
    expect(before, 'the retainer is not on a tile that can carry a cue').not.toBeNull()
    expect(before!.className, 'the retainer shook for a refusal on a different control').not.toMatch(/dc-shake/)
    act(() => {
      retainer!.click()
    })
    act(() => {
      vi.advanceTimersByTime(40)
    })
    const tile = retainer!.closest('.dc-tile')
    expect(tile!.className, 'a refused retainer did not shake').toMatch(/dc-shake/)
    expect(tile!.className, 'the refused retainer has no channel that survives reduced motion').toMatch(
      /border-hero-magenta/,
    )
    expect(retainer!.checked, 'the refusal still bought it').toBe(false)
  })
})

describe('the chrome the reading budget counts, asserted by execution', () => {
  it('renders every control the bound claims to cover', () => {
    // reading-diet.spec.ts bounds chromeCopy and pins its strings against
    // Game.tsx as text, which cannot tell a rendered control from one
    // inside a branch nothing reaches. The first version of this guard
    // hand-copied seven of the twelve entries, so it had the same blind
    // spot for the other five: wrapping the Posture detail disclosure in
    // `{false && ...}` kept charging its words against the budget and
    // passed both guards.
    //
    // Derived from chromeCopy itself now, so a control added to the count
    // is a control this has to find on screen.
    const state = gameAt(3)
    render(state, 'brief')
    const text = container.textContent ?? ''
    const missing: string[] = []
    for (const line of chromeCopy(state)) {
      // The transmission label is rendered by the teletype bar as its own
      // entity, so it is matched by shape below rather than by exact
      // string. (The numbered section heading left with the board.)
      if (line.startsWith('>')) continue
      if (!text.includes(line)) missing.push(line)
    }
    expect(missing.join(', '), 'chrome charges the budget for controls the screen does not render').toBe('')
    expect(text).toContain('INCOMING TRANSMISSION_')
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
    expect(chromeCopy(state).length, 'the chrome list changed size without this guard noticing').toBe(11)
  })
})

describe('reduced motion keeps the sequence (brief v1.2)', () => {
  it('derives beats and enters playback with the preference set', () => {
    // The round's central claim, and until now it had no guard at all: the
    // speed tests that stood beside it read which speed button was
    // pressed, and the decision that actually produces the
    // eleven-silent-rows regression is made at Game.tsx's resolve, not in
    // the speed default. Adding one term there
    // (`speed !== 'instant' && !reducedMotion`) restored the exact v1.1
    // behaviour at the other end of the same decision with the whole suite
    // green. Three lenses raised it independently. The speeds are gone
    // since v1.3 Round 0 and resolve derives beats on every turn, so the
    // same regression is now one `!reducedMotion` term on that derivation.
    //
    // So this resolves a real turn with the preference on and asserts the
    // player reaches playback, which is the only place the eleven director
    // rows can sound.
    setReducedMotion(true)
    render(gameAt(3), 'brief')
    const execute = executeControl()
    expect(execute, 'the EXECUTE control is not on screen').not.toBeNull()
    click(execute!)
    // Playback renders a beat counter; the aftermath does not.
    expect(
      container.textContent,
      'a reduced-motion turn skipped straight to the aftermath, so no director cue can sound',
    ).toMatch(/beat \d+ of \d+/)
    // And the cues really are static. Asserted at first as "no dc-card-in
    // on screen", which is vacuous: the opening beat is a transmission and
    // never carries that class in either mode, so deleting the reduced
    // term from useCueClass entirely would have passed. Measured instead
    // against the same opening beat WITHOUT the preference, which is the
    // only way to tell a static cue from a cue that was never there.
    const cueClassesNow = [...container.querySelectorAll('[class*="dc-"]')]
      .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
      .filter((c) => /^dc-(transmission-in|card-in|badge-|phase-dim|pulse-|manifest-in|strobe|shake)/.test(c))
    expect(cueClassesNow, `reduced motion still animated: ${cueClassesNow.join(', ')}`).toEqual([])
  })

  it('does animate the same beat when the preference is off, so the check above is not vacuous', () => {
    // The control for the assertion above. Without it, "no animation
    // classes on screen" is satisfied by a screen that never animates in
    // either mode, and the guard measures nothing.
    setReducedMotion(false)
    render(gameAt(3), 'brief')
    click(executeControl()!)
    const cueClasses = [...container.querySelectorAll('[class*="dc-"]')]
      .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
      .filter((c) => /^dc-(transmission-in|card-in|badge-|phase-dim|pulse-|manifest-in)/.test(c))
    expect(cueClasses.length, 'the opening beat animates nothing even with motion allowed').toBeGreaterThan(0)
  })

  it('plays the sequence to its end rather than skipping it', () => {
    // Completion under the preference, which section 8 asks for. It used
    // to be satisfied for free because instant finishes synchronously.
    // Since v1.3 Round 0 every beat waits for a tap, so the player taps it
    // through, and the turn must take more than one tap to get there: a
    // playback that ended on its first tap would be a skip by another name.
    setReducedMotion(true)
    render(gameAt(3), 'brief')
    click(executeControl()!)
    expect(container.textContent, 'playback did not start').toMatch(/beat \d+ of \d+/)
    const visible = Number(/beat \d+ of (\d+)/.exec(container.textContent ?? '')?.[1] ?? 0)
    const taps = playOut()
    expect(container.textContent, 'playback never reached the aftermath').not.toMatch(/beat \d+ of \d+/)
    expect(byText(NEXT_TURN), 'the turn ended without offering the next one').toBeDefined()
    expect(taps, 'the playback ended without showing every beat it counted').toBe(visible)
    expect(visible, 'the turn had a single beat, so a skip and a full playback look alike').toBeGreaterThan(1)
  })
})


// Render a whole turn's playback and tap through it until the named scene
// is on screen (every beat waits for a tap since v1.3 Round 0). Rendering
// an outcome beat ALONE leaves the presented state at `before`, because
// the director builds the final state by applying every earlier patch;
// the scenes read the presented state, so in isolation they legitimately
// show pre-turn numbers. Both content guards below were written against a
// lone beat first and failed for exactly that reason, which is a fact
// about the fixture rather than about the scenes.
function playUntilScene(before: GameState, after: GameState, beats: Beat[], want: string): Element | null {
  act(() => {
    root.render(
      <DirectorView
        before={before}
        after={after}
        beats={beats}
        onPresented={() => {}}
        onDone={() => {}}
      />,
    )
  })
  for (let i = 0; i < 80; i += 1) {
    const el = container.querySelector(`[data-scene="${want}"]`)
    if (el) return el
    playBeat()
    if (!tapNext()) return null
  }
  return null
}

describe('the cinematics, from the player-s starting state (Round 5)', () => {
  // THE ROUND'S CENTRAL CLAIM, asserted here: a campaign played to its end
  // shows a distinct scene at each of the four loudest moments, and the
  // loss scene is chosen by what the beat IS rather than by what its title
  // SAYS.
  //
  // Driven from a real campaign rather than from the component this round
  // touched, per principle 16. Three rounds running, the central fix
  // shipped behind a guard that could not detect its own reversion; the
  // mechanism each time was a guard written against the code that changed
  // instead of against the behaviour the round existed to produce.

  // Play a whole campaign under one script and stop on the turn that ends
  // it, so the outcome beat is the one a player actually reaches.
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

  // Drive Game from the board of the deciding turn, through EXECUTE, to
  // the outcome beat, and return the scene on screen.
  function playToOutcome(before: GameState) {
    render(before, 'brief')
    click(executeControl()!)
    expect(container.textContent, 'the deciding turn did not enter playback').toMatch(/beat \d+ of \d+/)
    // Tap through to the OUTCOME scene specifically. A losing campaign
    // passes through the blackout scene on the way, so breaking on the
    // first [data-scene] would read the wrong one; the first version of
    // this helper did exactly that and reported 'blackout' for both
    // endings.
    const seen: string[] = []
    for (let i = 0; i < 80; i += 1) {
      const el = container.querySelector('[data-scene]')
      const name = el?.getAttribute('data-scene') ?? null
      if (name && seen[seen.length - 1] !== name) seen.push(name)
      if (name === 'victory' || name === 'defeat') return { el: el!, seen }
      playBeat()
      if (!tapNext()) break
    }
    return { el: null, seen }
  }

  it('plays the defeat scene when a campaign is lost', () => {
    const { before, after } = finalTurn(LOSS_SCRIPT)
    const { el, seen } = playToOutcome(before)
    expect(el, `a lost campaign reached its end with no outcome scene; saw ${seen.join(', ') || 'nothing'}`).not.toBeNull()
    expect(el!.getAttribute('data-scene'), 'a lost campaign played the winning scene').toBe('defeat')
    // The label names the real cause since the QC gauntlet (Q17), not
    // LINK LOST for every defeat.
    expect(after.lossReason, 'the losing campaign recorded no cause').toBeDefined()
    expect(el!.textContent, 'the defeat scene does not say what ended the campaign').toContain(LOSS_LABEL[after.lossReason!])
    expect(el!.textContent).not.toMatch(/Link lost/i)
  })

  it('plays the victory scene when a campaign is won', () => {
    // The positive control for the test above, and vice versa. Either one
    // alone passes against a renderer that always emits the other, or one
    // that emits nothing; together they cannot.
    const { before } = finalTurn(WIN_SCRIPT)
    const { el, seen } = playToOutcome(before)
    expect(el, `a won campaign reached its end with no outcome scene; saw ${seen.join(', ') || 'nothing'}`).not.toBeNull()
    expect(el!.getAttribute('data-scene'), 'a won campaign played the losing scene').toBe('victory')
    expect(el!.textContent, 'the victory scene does not say the mission held').toMatch(/Mission assured/i)
  })

  it('chooses the loss scene by the beat-s own field, not by its title', () => {
    // Finding 3.10. The two titles both begin with the word MISSION, so
    // the old string match inverted the treatment on any edit to either,
    // and Round 5 is the round that would edit them. Proven by changing
    // the title to something the old match could not recognise and
    // checking the scene is unmoved.
    const { before, after } = finalTurn(LOSS_SCRIPT)
    const beats = deriveBeats(before, after)
    const outcome = beats.find((b) => b.kind === 'outcome')
    expect(outcome, 'the deciding turn produced no outcome beat').toBeDefined()
    expect(outcome!.lost, 'the outcome beat does not carry the loss field').toBe(true)

    const renamed = beats.map((b) =>
      b.kind === 'outcome' ? { ...b, title: 'CAMPAIGN CONCLUDED: assurance not held' } : b,
    )
    expect(
      renamed.find((b) => b.kind === 'outcome')!.title.startsWith('MISSION FAILED'),
      'the renamed title still matches the old derivation, so this proves nothing',
    ).toBe(false)
    // The renamed outcome beat on its own, so the assertion is about that
    // beat and not about how many taps playback took to reach it.
    const renamedOutcome = renamed.find((b) => b.kind === 'outcome')!
    // The two outcome voices, taken from the engine so the comparison is
    // an identity rather than a written frequency.
    installGestureUnlock()
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const engine = getAudioEngine()
    const voiceOf = (cue: 'defeat-sting' | 'victory-fanfare') => {
      contexts[0].reset()
      engine.play(cue)
      return contexts[0].oscillators().map((o) => o.frequency.first())
    }
    // The outcome voice must be PRESENT in what sounded, not the whole of
    // it: the scene's count-up starts at zero and rises, so the readout
    // correctly reports a gain and ticks alongside the fanfare. Asserting
    // the exact sequence would make this test fail whenever a scene gained
    // a number, which is not what it is about.
    const sounded = (voice: (number | undefined)[], seq: (number | undefined)[]) =>
      voice.every((hz) => seq.includes(hz))
    const defeatVoice = voiceOf('defeat-sting')
    const victoryVoice = voiceOf('victory-fanfare')
    expect(defeatVoice, 'the two outcome voices are identical, so this proves nothing').not.toEqual(victoryVoice)
    contexts[0].reset()
    act(() => {
      root.render(
        <DirectorView
          before={before}
          after={after}
          beats={[renamedOutcome]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    const sting = contexts[0].oscillators().map((o) => o.frequency.first())
    const scene = container.querySelector('[data-scene]')
    expect(scene, 'the renamed outcome beat rendered no scene').not.toBeNull()
    expect(scene!.getAttribute('data-scene'), 'renaming the outcome inverted the treatment').toBe('defeat')
    // THE WHOLE TREATMENT, not just the scene I added this round. The
    // scene reads beat.lost directly, so asserting only the scene left the
    // view's own derivation free to go back to matching the title, which
    // drives the card's colour and the sound: a renamed loss would have
    // rendered friendly with a victory fanfare while the scene below it
    // said LINK LOST. That is principle 16 exactly, caught by a mutation:
    // the guard was written against the code this round touched instead of
    // against the behaviour the finding was about.
    // The CARD, named by its own marker. Reached with
    // closest('div.border') at first, which returns the scene's own root:
    // the scenes carry a border too, so the assertion read the colour the
    // scene set for itself and the card was free to render friendly.
    const card = container.querySelector('[data-beat-card]')
    expect(card, 'the beat card is not on screen').not.toBeNull()
    expect(card!.className, 'a renamed loss rendered in the friendly colour').toMatch(/hero-magenta/)
    expect(sounded(defeatVoice, sting), 'a renamed loss did not sound the defeat sting').toBe(true)
    expect(sounded(victoryVoice, sting), 'a renamed loss sounded the victory fanfare').toBe(false)
    // And the control: the same beat with the field cleared renders the
    // other scene, so this is reading the field rather than defaulting.
    act(() => root.unmount())
    root = createRoot(container)
    contexts[0].reset()
    act(() => {
      root.render(
        <DirectorView
          before={before}
          after={after}
          beats={[{ ...renamedOutcome, lost: false }]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    expect(
      container.querySelector('[data-scene]')?.getAttribute('data-scene'),
      'clearing the loss field did not change the scene, so the field is not what chooses it',
    ).toBe('victory')
    // And the WIN side of the same two derivations, which had no control
    // at all: dropping the field test from DirectorView entirely
    // (`beat?.kind === 'outcome'`) renders a won campaign hostile with a
    // defeat sting while the scene inside it still reads Mission assured,
    // and every assertion above passes because they only ever looked at a
    // loss.
    const wonCard = container.querySelector('[data-beat-card]')
    expect(wonCard!.className, 'a won campaign rendered in the hostile colour').not.toMatch(/hero-magenta/)
    const wonSting = contexts[0].oscillators().map((o) => o.frequency.first())
    expect(sounded(victoryVoice, wonSting), 'a won campaign did not sound the victory fanfare').toBe(true)
    expect(sounded(defeatVoice, wonSting), 'a won campaign sounded the defeat sting').toBe(false)
  })

  it('renders no scene at all on an ordinary beat', () => {
    // The control for every presence check above: [data-scene] is not
    // something the card always carries, so finding it means a scene
    // really played rather than the attribute being ambient.
    let fixture: { before: GameState; after: GameState; beat: Beat } | null = null
    outer: for (const seed of [20260712, 1, 2, 3]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        for (const b of deriveBeats(state, after)) {
          if (b.visible && b.kind === 'threat' && b.subjectId !== 'blackout-chain') {
            fixture = { before: state, after, beat: b }
            break outer
          }
        }
        state = after
      }
    }
    expect(fixture, 'the sweep produced no ordinary threat beat').not.toBeNull()
    act(() => {
      root.render(
        <DirectorView
          before={fixture!.before}
          after={fixture!.after}
          beats={[fixture!.beat]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    expect(container.querySelector('[data-scene]'), 'an ordinary threat beat played a cinematic scene').toBeNull()
  })
})

describe('each scene states what it does under reduced motion (Round 5)', () => {
  // The brief asks for the static form to be DESIGNED rather than derived
  // by subtraction, and Round 4e is why: the refusal cue there shipped
  // through a motion-only class and did nothing at all for a
  // reduced-motion player, in the round that made reduced motion a
  // first-class path.
  //
  // So the test is not "no animation classes". It is that the same
  // INFORMATION is on screen in both modes, and only its arrival differs.

  function sceneUnder(reduced: boolean, beat: Beat, before: GameState, after: GameState) {
    setReducedMotion(reduced)
    act(() => {
      root.render(
        <DirectorView
          before={before}
          after={after}
          beats={[beat]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    const el = container.querySelector('[data-scene]')
    const text = el?.textContent ?? ''
    const animated = [...container.querySelectorAll('[class*="dc-scene"]')].length
    act(() => root.unmount())
    root = createRoot(container)
    return { present: !!el, text, animated }
  }

  // One beat of each kind that carries a scene, taken from real play.
  function beatsWithScenes() {
    const found = new Map<string, { beat: Beat; before: GameState; after: GameState }>()
    for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          for (const b of deriveBeats(state, after)) {
            const scene =
              b.kind === 'outcome' ? (b.lost ? 'defeat' : 'victory') : b.kind === 'commendation' ? 'commendation' : b.kind === 'chain-armed' ? 'blackout' : null
            if (scene && !found.has(scene)) found.set(scene, { beat: b, before: state, after })
          }
          state = after
        }
      }
    }
    return found
  }

  it('shows the same information in both modes, and animates in only one', () => {
    const fixtures = beatsWithScenes()
    expect([...fixtures.keys()].sort(), 'the sweep did not produce all four scenes').toEqual([
      'blackout',
      'commendation',
      'defeat',
      'victory',
    ])
    for (const [name, f] of fixtures) {
      const moving = sceneUnder(false, f.beat, f.before, f.after)
      const still = sceneUnder(true, f.beat, f.before, f.after)
      expect(moving.present, `${name} did not render with motion allowed`).toBe(true)
      expect(still.present, `${name} vanished under reduced motion`).toBe(true)
      // The words are the information. Trimmed, because a count-up may
      // render a different digit mid-animation.
      const words = (t: string) => t.replace(/[\d.]+/g, '#').replace(/\s+/g, ' ').trim()
      expect(words(still.text), `${name} says something different under reduced motion`).toBe(words(moving.text))
      // And the positive control, which is what stops this being vacuous:
      // with motion allowed the scene really does carry an entrance, so
      // "no entrance under reduce" is a difference rather than an absence
      // in both modes.
      expect(moving.animated, `${name} has no entrance at all, so the check below proves nothing`).toBeGreaterThan(0)
      expect(still.animated, `${name} still animates under reduced motion`).toBe(0)
    }
  })
})

describe('the scenes carry real content, not just their entrance (Round 5)', () => {
  // Both of these were written after the scenes passed every other guard
  // in this file while carrying a wrong number and an empty list. That is
  // principle 16's other form: the guard asserted the scene was THERE and
  // said nothing about what it contained.

  it('shows the campaign-s MAI on the victory scene, not one of the meters it is built from', () => {
    // Written as presented.meters.linkAvailability at first, under the
    // label "Final MAI": a real number under the wrong name, which no
    // presence check can see. The fixture picks a state where the two
    // differ, and fails if it cannot find one, so it cannot pass by
    // standing where they happen to agree.
    let fixture: { before: GameState; after: GameState; beat: Beat } | null = null
    for (const seed of [20260712, 7, 1, 2, 3, 4041]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        const outcome = deriveBeats(state, after).find((b) => b.kind === 'outcome' && !b.lost)
        if (outcome && Math.round(maiScore(after)) !== Math.round(after.meters.linkAvailability)) {
          fixture = { before: state, after, beat: outcome }
          break
        }
        state = after
      }
      if (fixture) break
    }
    expect(
      fixture,
      'no won campaign in the sweep has an MAI that differs from link availability, so this cannot discriminate',
    ).not.toBeNull()
    const scene = playUntilScene(
      fixture!.before,
      fixture!.after,
      deriveBeats(fixture!.before, fixture!.after),
      'victory',
    )
    expect(scene, 'playback never reached the victory scene').not.toBeNull()
    const readout = scene!.querySelector('[aria-label^="Final MAI"]')
    expect(readout, 'the victory scene shows no final MAI').not.toBeNull()
    const shown = Number(/Final MAI ([\d.]+)/.exec(readout!.getAttribute('aria-label') ?? '')?.[1] ?? NaN)
    // Compared without rounding: the readout writes the raw value, and
    // rounding it here would let a scene showing a neighbouring meter pass
    // whenever the two happened to round together.
    expect(shown, 'the victory scene shows a number that is not the MAI').toBeCloseTo(maiScore(fixture!.after), 5)
  })

  it('recaps the techniques that actually landed, on the defeat scene', () => {
    // The recap read beat.techniques, and the outcome beat carries none,
    // so the row's named treatment shipped as an empty list that every
    // other guard was happy with.
    const { before, after } = (() => {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const next = resolveTurn(state, LOSS_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          if (next.status !== 'playing') return { before: state, after: next }
          state = next
        }
      }
      throw new Error('no seed lost a campaign')
    })()
    // The expectation is built HERE, walking the engine's record directly,
    // rather than by calling the function that renders the list. Computed
    // with recapTechniques at first, which made every property of that
    // function unfalsifiable: reversing its walk so the recap showed the
    // campaign's FIRST techniques instead of the ones that ended it moved
    // the expectation identically and the test passed.
    const independent: string[] = []
    for (let i = after.history.length - 1; i >= 0 && independent.length < RECAP_MAX; i -= 1) {
      for (const ev of after.history[i].events) {
        for (const ref of ev.firedTechniqueRefs) {
          if (!independent.includes(ref.id) && independent.length < RECAP_MAX) independent.push(ref.id)
        }
      }
    }
    const expected = recapTechniques(after)
    expect(expected.map((t) => t.id), 'recapTechniques does not walk the record most recent first').toEqual(independent)
    expect(independent.length, 'this losing campaign fired no techniques, so the recap has nothing to show').toBeGreaterThan(0)
    // And the order is genuinely newest first, not the same list either
    // way round: a campaign whose techniques repeat every turn would make
    // the check above pass in both directions.
    const oldestFirst: string[] = []
    for (const rec of after.history) {
      for (const ev of rec.events) {
        for (const ref of ev.firedTechniqueRefs) if (!oldestFirst.includes(ref.id)) oldestFirst.push(ref.id)
      }
    }
    expect(
      oldestFirst.slice(0, RECAP_MAX),
      'this campaign fires the same techniques in both directions, so the order is unproven here',
    ).not.toEqual(independent)

    const scene = playUntilScene(before, after, deriveBeats(before, after), 'defeat')
    expect(scene, 'playback never reached the defeat scene').not.toBeNull()
    const cards = [...scene!.querySelectorAll('li')]
    expect(cards.length, 'the defeat scene recapped nothing').toBe(expected.length)
    // Each chip names the threat and carries the code beside it (Q17).
    expect(cards.map((c) => c.querySelector('[data-recap-code]')?.textContent?.trim())).toEqual(independent)
    expect(cards.every((c) => (c.textContent ?? '').trim() !== c.querySelector('[data-recap-code]')?.textContent?.trim()), 'a chip shows only its code').toBe(true)
    // Bounded, because a campaign can fire more techniques than this (two
    // dozen over the twelve turns of v1.2) and the reading diet bounds
    // what the player is asked to take in.
    expect(cards.length).toBeLessThanOrEqual(RECAP_MAX)
  })
})

describe('every beat kind reaches the scene the table says it plays (Round 5)', () => {
  // The gap this closes: nothing joined a beat KIND to the scene actually
  // rendered. sceneUnder only asked whether a scene was present and never
  // read its name, and the fixture that found the beats computed the
  // expected name from its own private copy of the mapping, so the
  // product's sceneFor was never compared with anything. Repointing
  // chain-armed at the commendation scene rendered the loudest hostile
  // moment in the game as a friendly blue box, with the whole suite green.
  //
  // Derived from SECTION_6_ROWS, so a row that changes its kinds or its
  // scene changes what this expects.
  it('renders the table-s scene for a real beat of each of its kinds', () => {
    const rows = SECTION_6_ROWS.filter((r) => r.scene)
    expect(rows.length, 'the table records no scenes').toBe(4)

    // A real beat for every (kind, scene) pair the table claims.
    const wanted = new Map<string, string>()
    for (const row of rows) for (const kind of row.kinds ?? []) wanted.set(`${kind}|${row.scene}`, row.beat)

    const found = new Map<string, { beat: Beat; before: GameState; after: GameState }>()
    for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13, 17, 23]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          for (const b of deriveBeats(state, after)) {
            if (!b.visible) continue
            for (const key of wanted.keys()) {
              const [kind, scene] = key.split('|')
              if (b.kind !== kind) continue
              // The chain row claims two kinds; the threat one only counts
              // when the subject really is the chain event.
              if (kind === 'threat' && b.subjectId !== 'blackout-chain') continue
              if (kind === 'outcome' && (scene === 'defeat') !== (b.lost === true)) continue
              if (!found.has(key)) found.set(key, { beat: b, before: state, after })
            }
          }
          state = after
        }
      }
    }

    const missing = [...wanted.keys()].filter((k) => !found.has(k))
    expect(
      missing.join(', '),
      'the sweep produced no beat for these (kind, scene) pairs, so they are unproven rather than proven',
    ).toBe('')

    for (const [key, f] of found) {
      const [kind, scene] = key.split('|')
      act(() => {
        root.render(
          <DirectorView
            before={f.before}
            after={f.after}
            beats={[f.beat]}
            onPresented={() => {}}
            onDone={() => {}}
          />,
        )
      })
      const el = container.querySelector('[data-scene]')
      expect(el, `a ${kind} beat rendered no scene, but the table says it plays ${scene}`).not.toBeNull()
      expect(
        el!.getAttribute('data-scene'),
        `a ${kind} beat (${wanted.get(key)}) rendered the wrong scene`,
      ).toBe(scene)
      act(() => root.unmount())
      root = createRoot(container)
    }
  })
})

describe('the scene numbers count, and the scene reads its own beat (Round 5)', () => {
  // All three guards below exist because a mutation reverting the product
  // fix slept. Each fix was made in response to the pass and shipped
  // without anything able to detect its reversion, which is principle 16's
  // subject and the reason it was written.

  function renderBeat(f: { before: GameState; after: GameState; beat: Beat }) {
    act(() => {
      root.render(
        <DirectorView
          before={f.before}
          after={f.after}
          beats={[f.beat]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
  }

  function firstBeat(match: (b: Beat) => boolean, scripts = [WIN_SCRIPT, LOSS_SCRIPT]) {
    for (const script of scripts) {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13, 17, 23]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          for (const b of deriveBeats(state, after)) if (b.visible && match(b)) return { before: state, after, beat: b }
          state = after
        }
      }
    }
    return null
  }

  const readoutValue = (root_: Element, label: string) => {
    const el = root_.querySelector(`[aria-label^="${label}"]`)
    return el ? Number(new RegExp(`${label} ([\\d.]+)`).exec(el.getAttribute('aria-label') ?? '')?.[1] ?? NaN) : null
  }

  // THE AWARD IS SET BY HAND since v1.3 Round 0. The commendation beat is
  // the defense streak now (brief 6.8), and the streak pays nothing on the
  // board: its bonus is added to the grade, so no real beat carries
  // credits. Scene.tsx still counts a bonus up for a commendation beat
  // that does carry one, and the count is what these guards are about, so
  // the beat is a REAL streak beat from real play with an award written
  // onto its patch. The tripwire below fails the day a real streak beat
  // pays, so the award is then read from play rather than invented.
  const AWARD = 12
  function streakWithAward(award = AWARD) {
    const f = firstBeat((b) => b.kind === 'commendation')
    expect(f, 'the sweep produced no defense streak beat').not.toBeNull()
    expect(
      f!.beat.patch.credits ?? 0,
      'a real streak beat carries credits, so these guards should read its award rather than set one',
    ).toBe(0)
    return { ...f!, beat: { ...f!.beat, patch: { ...f!.beat.patch, credits: award } } }
  }

  it('counts the commendation bonus up instead of painting it arrived', () => {
    // useCountUp only animates an instance that is ALREADY mounted, so a
    // readout born at its final number never counted: the bonus and the
    // final MAI were painted complete in their first frame, in both motion
    // modes, while the brief asks for them to count.
    //
    // Asserted through the TICK rather than through an intermediate digit.
    // act() flushes effects, so the pre-arrival frame is not observable
    // from outside React; what a player gets from a count that runs is the
    // readout reporting a gain, and a number painted at its final value
    // reports nothing at all. That is the same cue the HUD meters use.
    const f = streakWithAward()
    installGestureUnlock()
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const engine = getAudioEngine()
    contexts[0].reset()
    engine.play('tick-up')
    const tickUp = contexts[0].oscillators().map((o) => o.frequency.first())
    expect(tickUp.length, 'the tick voice scheduled nothing, so this cannot discriminate').toBeGreaterThan(0)

    setReducedMotion(false)
    contexts[0].reset()
    renderBeat(f!)
    const heard = contexts[0].oscillators().map((o) => o.frequency.first())
    expect(
      tickUp.every((hz) => heard.includes(hz)),
      'the bonus was painted at its final value, so nothing counted and the readout reported no gain',
    ).toBe(true)
    // And it lands on the right number. Read without advancing timers, a
    // habit from when one beat at 1x finished after its dwell and the card
    // unmounted; the beat waits for a tap since v1.3 Round 0, and the
    // readout's label carries the value it is counting to either way.
    expect(
      readoutValue(container.querySelector('[data-scene="commendation"]')!, 'Bonus credits'),
      'the bonus never arrived at its value',
    ).toBe(f!.beat.patch.credits ?? 0)
  })

  it('reports no gain under reduced motion, because nothing counted', () => {
    // The preference short-circuit. Without it the scene still holds zero
    // for a commit and then adopts the target, so the readout sees a
    // change and ticks for a count that never ran; the zero frame itself
    // is not observable through act(), but the tick is, and it is the
    // thing a player would actually notice.
    //
    // This is a deliberate departure from the HUD meters, which do tick on
    // a snap: there the number really did change during the turn, while
    // here it arrived with the scene.
    const f = streakWithAward()
    installGestureUnlock()
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const engine = getAudioEngine()
    contexts[0].reset()
    engine.play('tick-up')
    const tickUp = contexts[0].oscillators().map((o) => o.frequency.first())
    setReducedMotion(true)
    contexts[0].reset()
    renderBeat(f)
    const heard = contexts[0].oscillators().map((o) => o.frequency.first())
    expect(
      tickUp.every((hz) => heard.includes(hz)),
      'reduced motion reported a gain for a number that never counted',
    ).toBe(false)
    // And the number is nonetheless correct and complete.
    expect(
      readoutValue(container.querySelector('[data-scene="commendation"]')!, 'Bonus credits'),
      'reduced motion did not show the award',
    ).toBe(f.beat.patch.credits ?? 0)
  })

  it('makes no such report for a scene with no number, which is the control', () => {
    // The positive control: the defeat scene has no readout, so the tick
    // above is a consequence of the count rather than something every
    // scene emits on arrival.
    const f = firstBeat((b) => b.kind === 'outcome' && b.lost === true, [LOSS_SCRIPT])
    expect(f, 'no losing campaign in the sweep').not.toBeNull()
    installGestureUnlock()
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const engine = getAudioEngine()
    contexts[0].reset()
    engine.play('tick-up')
    const tickUp = contexts[0].oscillators().map((o) => o.frequency.first())
    setReducedMotion(false)
    contexts[0].reset()
    renderBeat(f!)
    const heard = contexts[0].oscillators().map((o) => o.frequency.first())
    expect(
      tickUp.every((hz) => heard.includes(hz)),
      'a scene with no number still reported a gain, so the tick proves nothing about counting',
    ).toBe(false)
  })

  it('darkens the layers the beat names, not a fixed three', () => {
    // The scene listed ORBIT, AIR and GROUND whatever happened, three
    // lines under a card header rendering the beat's own layer badges. The
    // chain event carries AIR alone.
    const partial = firstBeat(
      (b) => (b.kind === 'chain-armed' || (b.kind === 'threat' && b.subjectId === 'blackout-chain')) && !!b.layers && b.layers.length > 0 && b.layers.length < 3,
    )
    expect(partial, 'the sweep produced no blackout beat naming a subset of the layers').not.toBeNull()
    renderBeat(partial!)
    const listed = [...container.querySelectorAll('[data-scene="blackout"] li')].map((li) => li.textContent?.trim())
    expect(listed.length, 'the scene listed a different number of layers from the beat').toBe(partial!.beat.layers!.length)
    for (const layer of partial!.beat.layers!) {
      expect(listed.some((t) => t?.includes(layer)), `the scene did not darken ${layer}`).toBe(true)
    }
    // The verdict line answers to the same fact. It read "Navigation,
    // timing and downlink lost together. The drones are flying blind."
    // whatever went dark, which is a claim about the whole constellation
    // sitting under a list of one layer.
    const verdict = container.querySelector('[data-scene="blackout"] p:last-of-type')?.textContent ?? ''
    expect(verdict, 'the verdict line claims the whole constellation went dark').not.toMatch(/lost together/i)
    for (const layer of partial!.beat.layers!) {
      expect(verdict, `the verdict line does not name ${layer}`).toContain(layer)
    }
    // And the control: a blackout beat naming NO layer darkens all three,
    // so "listed only the beat's layers" is not satisfied by a scene that
    // always lists fewer.
    const whole = firstBeat((b) => b.kind === 'chain-armed' && (!b.layers || b.layers.length === 0))
    if (whole) {
      act(() => root.unmount())
      root = createRoot(container)
      renderBeat(whole)
      expect(
        [...container.querySelectorAll('[data-scene="blackout"] li')].length,
        'a blackout naming no layer should darken the whole constellation',
      ).toBe(3)
      // And its verdict line is the whole-constellation one, which is the
      // control for the assertion above.
      expect(
        container.querySelector('[data-scene="blackout"] p:last-of-type')?.textContent ?? '',
        'a whole-constellation blackout should say so',
      ).toMatch(/lost together/i)
    }
  })

  it('starts the second of two adjacent commendations from zero, not from the first award', () => {
    // The guard that replaces one which could not fail for its own reason.
    // The first version asserted node identity and the settled aria-label;
    // both hold while the behaviour is broken, because the key really does
    // make a new node and the aria-label is built from the value PROP
    // rather than from the digit on screen.
    //
    // So this reads the rendered digit, and drives two adjacent beats
    // through one mounted view, which is the only arrangement in which the
    // carry-over can happen at all: the stale number lived in Scene, and
    // Scene is only reused when the view is not remounted between beats.
    // (A turn derives one streak beat at most, so the second is a copy of
    // the first under its own id, as it always was here, and both carry
    // an award set by hand: see streakWithAward.)
    const f = streakWithAward()
    const first = f.beat.patch.credits ?? 0
    const second = { ...f.beat, id: `${f.beat.id}-b`, patch: { ...f.beat.patch, credits: first + 9 } }
    setReducedMotion(false)
    // Both beats in one beats array, advanced through by the director, so
    // DirectorView and its card subtree persist across the change.
    act(() => {
      root.render(
        <DirectorView
          before={f.before}
          after={f.after}
          beats={[f.beat, second]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    const digit = () =>
      container.querySelector('[data-scene="commendation"] span.tabular-nums')?.textContent?.trim() ?? ''
    // The count really runs: the digit opens below its target and settles
    // on it. rAF does not tick under fake timers, so the readout's own
    // safety settle is what lands it; that it opens at zero rather than at
    // the award is the behaviour under test.
    expect(digit(), 'the first commendation opened already arrived').toBe('0')
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(digit(), 'the first commendation did not settle on its award').toBe(String(first))

    // Tap on to the second beat (it advanced past a dwell until v1.3 Round
    // 0) and read what the player sees as it opens.
    expect(tapNext(), 'the playback offers no way on to the second beat').toBe(true)
    const onArrival = digit()
    expect(onArrival, 'the second commendation opened on the first award-s number').not.toBe(String(first))
    expect(onArrival, 'the second commendation did not open from zero').toBe('0')
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(digit(), 'the second commendation did not settle on its own award').toBe(String(first + 9))
  })

  it('does not carry a commendation-s credits into the victory scene-s MAI', () => {
    // The same root cause across a change of scene KIND, and the case the
    // first fix explicitly reasoned itself out of guarding: two outcome
    // beats cannot be adjacent, but a commendation and an outcome can.
    //
    // BUILT BY HAND since v1.3 Round 0, because real play cannot produce
    // it any more, for two reasons measured against the engine: the streak
    // pays nothing (see streakWithAward), and no won turn carries a streak
    // beat at all. The last turn's fixed BLACKOUT CHAIN is strength 3 with
    // one defense worth 2, so a point always gets through and resets the
    // streak; across 200 seeds of every sweep policy and WIN_SCRIPT, no
    // winning turn earned one. So the deciding turn is a real won turn,
    // and a real streak beat carrying an award is placed directly before
    // its outcome, which is the arrangement the carry-over needs.
    const won = (() => {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          if (after.status === 'won') return { before: state, after, beats: deriveBeats(state, after) }
          state = after
        }
      }
      return null
    })()
    expect(won, 'no campaign in the sweep is won').not.toBeNull()
    const streak = streakWithAward().beat
    const bonus = streak.patch.credits ?? 0
    const at = won!.beats.findIndex((b) => b.kind === 'outcome')
    expect(at, 'the won turn derived no outcome beat').toBeGreaterThanOrEqual(0)
    const beats = [...won!.beats.slice(0, at), streak, ...won!.beats.slice(at)]
    const visible = beats.filter((b) => b.visible)
    expect(
      visible[visible.indexOf(streak) + 1]?.kind,
      'the streak beat is not directly before the outcome, so nothing can carry across',
    ).toBe('outcome')
    setReducedMotion(false)
    const scene = playUntilScene(won!.before, won!.after, beats, 'victory')
    expect(scene, 'playback never reached the victory scene').not.toBeNull()
    const label = scene!.querySelector('[aria-label^="Final MAI"]')?.getAttribute('aria-label') ?? ''
    expect(label, 'the victory scene shows the commendation-s credits under the label Final MAI').not.toContain(
      ` ${bonus}`,
    )
    expect(Number(/Final MAI ([\d.]+)/.exec(label)?.[1] ?? NaN)).toBeCloseTo(maiScore(won!.after), 5)
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
  // neither 'aftermath' nor 'playback'). Rendering a finished campaign at
  // phase 'aftermath' shows the damage report, not the outcome, which is
  // the first thing this fixture got wrong.
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

  it('stamps a second finished campaign in the same mount with its own code', () => {
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

    // New campaign, WITHOUT remounting: this is the same component
    // instance, which is the whole point.
    const newCampaign = byText(/new campaign/i)
    expect(newCampaign, 'the outcome screen has no way to start again').toBeDefined()
    click(newCampaign!)
    // Straight to turn 1 of a new operation since v1.3 R1 (no start screen).
    expect(codeBox(), 'the code box survived into the new operation').toBeNull()
    expect(container.querySelector('[data-board]'), 'NEW CAMPAIGN did not start a new operation').not.toBeNull()

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

    // A pasted code carries phase 'aftermath', and the outcome screen is
    // gated on the phase NOT being that, so the load lands on the damage
    // report. View final report is the control that moves on, and the
    // re-review flagged this same gate as the reason an earlier assertion
    // was matching the wrong screen.
    const toReport = byText(/final report/i)
    expect(toReport, 'no way from the loaded aftermath to the outcome screen').toBeDefined()
    click(toReport!)

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
// banner shows on arrival (briefed only when the brief is free tonight),
// not what it would show if the brief were ordered. The search as v1.2
// left it passed a truthy string as `briefed`, which asks the latter, and
// returned a turn whose banner carried no tag. A free brief on a fixed
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
  const tag = () => container.querySelector('[data-technique-tag]') as HTMLElement | null
  const overlay = () => container.querySelector('[data-glossary-overlay]')

  it('opens the glossary in place, without leaving the game', async () => {
    render(turnWithATag(), 'brief')
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
    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    expect(back, 'the overlay has no way back').toBeDefined()
    click(back!)
    expect(overlay(), 'the overlay would not close').toBeNull()

    expect(
      container.textContent,
      'opening a glossary entry threw away state the component was holding',
    ).toContain(noticeBefore![0].trim())
    // The board has no "intel brief" heading; the transmission bar is
    // the landmark the brief lives under now.
    expect(container.textContent, 'coming back landed somewhere other than the brief').toContain('INCOMING TRANSMISSION_')
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
    const el = tag()!
    act(() => el.focus())
    expect(document.activeElement, 'the tag never took focus, so this asserts nothing').toBe(el)

    click(el)
    // Focus moves the moment the dialog opens, not when its chunk lands.
    expect(overlay()!.contains(document.activeElement), 'focus stayed outside the dialog').toBe(true)
    await settle()
    expect(overlay()!.contains(document.activeElement), 'the chunk landing threw focus out of the dialog').toBe(true)

    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(document.activeElement, 'closing the dialog dropped focus to the document').toBe(el)
  })

  it('makes the game behind it inert rather than only covering it', async () => {
    render(turnWithATag(), 'brief')
    const main = container.querySelector('main')!
    expect(main.hasAttribute('inert'), 'the game is inert before anything opened').toBe(false)
    click(tag()!)
    expect(main.hasAttribute('inert'), 'aria-modal was declared over a page that is still reachable').toBe(true)
    expect(main.getAttribute('aria-hidden')).toBe('true')
    await settle()
    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(main.hasAttribute('inert'), 'the game stayed inert after the dialog closed').toBe(false)
  })

  it('does not nest a second main or a second h1 in the document', async () => {
    render(turnWithATag(), 'brief')
    click(tag()!)
    // While the chunk loads too: the fallback is a block, not a landmark.
    expect(container.querySelectorAll('main').length, 'the loading fallback put a second main on the page').toBe(1)
    await settle()
    const mains = container.querySelectorAll('main')
    expect(mains.length, 'the overlay put a second main landmark on the page').toBe(1)
    expect(mains[0].querySelector('[data-glossary-overlay]'), 'the overlay is nested inside the game main').toBeNull()
    expect(container.querySelectorAll('h1').length, 'the overlay added a second h1').toBe(1)
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

  it('still posts a score for a campaign that finishes here', () => {
    // THE POSITIVE CONTROL, and it has to be real: nothing in this repo
    // guarded score recording before this round, so a fix that suppressed
    // the post on arrival could have suppressed every post and no existing
    // test would have noticed.
    //
    // So this plays the last turn through the controls: EXECUTE, which
    // commits on a tap since v1.3 Round 0, and then the playback tapped
    // through to its end.
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
    click(execute!)
    // Run the playback out so the campaign reaches its end state.
    playOut()
    expect(inPlayback(), 'the final turn never left playback').toBe(false)

    expect(scores().length, 'a campaign played to its end here posted no score').toBeGreaterThan(0)
  })

  it('posts no score when a finished code is PASTED, which is the path a player takes', () => {
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
    expect(byText(/final report/i), 'the new operation is already over, so this asserts nothing').toBeUndefined()
    pasteThroughSystem(code)

    // THE LOAD ACTUALLY HAPPENED, asserted on something only true AFTER it:
    // the pasted campaign is finished, so its aftermath offers FINAL
    // REPORT, which the fresh operation it replaced never could.
    expect(byText(/final report/i), 'the pasted, finished campaign never loaded').toBeDefined()

    expect(scores(), 'pasting a finished code posted a score the player never earned').toHaveLength(0)
  })

  it('posts a score for a campaign STARTED the normal way and played to its end', () => {
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
    expect(container.querySelector('[aria-label^="Credits"]'), 'the campaign did not start').not.toBeNull()

    for (let turn = 0; turn < DEFAULT_SCENARIO.totalTurns + 2; turn += 1) {
      const execute = executeControl()
      if (!execute) break
      click(execute)
      playOut()
      const next = byText(NEXT_TURN)
      if (!next) break
      click(next)
    }

    expect(scores().length, 'a campaign started and played to its end here posted no score').toBeGreaterThan(0)
  })

  it('clears the autosave when a campaign finishes here', () => {
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

    click(executeControl()!)
    playOut()
    expect(inPlayback(), 'the final turn never left playback').toBe(false)
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
// tests/opening.spec.ts sweeps derived beats across seeds and is breadth;
// this drives three real turns through the real component and is the only
// thing that can say the player MET the vocabulary rather than that the
// engine produced the material for it.
//
// THE JOIN IS (visual, sound), OBSERVED. The visual is read off the beat
// card's own class at the moment the beat is showing, and the sound off a
// spy on the audio engine, so the pair is what the screen painted next to
// what the speaker played. It is never `beat.kind`: `Section6Row.kinds`
// means OR on one row and AND on another (brief v2.3 Appendix E), so a
// membership join scores BLACKOUT CHAIN as met by the first ordinary
// threat of a first campaign.
//
// WHY IT IS RED BEFORE THE ROUND'S FIX: turn 1's two visible beats,
// `turn-start` and `quiet`, both resolved to transmission / data-burst, so
// the whole adversary phase of a new player's first turn was the blip the
// turn had opened with. Assertion one below fails on that tree and cannot
// be satisfied by padding a later turn.
describe('the opening shows the vocabulary (Round 7b)', () => {
  // Every class the registry can paint, derived rather than matched by
  // prefix, so a stray dc- class from the stylesheet cannot be mistaken
  // for a cue.
  const CUE_CLASSES = new Set(Object.values(VISUAL_CLASS).filter(Boolean))

  // Drive one turn from the intel brief to the aftermath, recording what
  // was painted and what was played, beat by beat.
  //
  // A drive either places a SCRIPT's orders for the turn through the
  // controls (each asset through the PROCURE confirm, each defense through
  // its DEFENSES checkbox, the intel brief through its INTEL row), so the
  // engine can replay exactly what was ordered and a seed chosen by engine
  // search lands where it was chosen; or, with no script, it buys the
  // first thing on offer and over-buys, as a new player does.
  type DriveOpts = { seed?: number; script?: Record<number, TurnActions>; overbuy?: boolean }
  function placeOrders(orders: TurnActions) {
    for (const b of orders.buyAssets) {
      buy(b.kind)
      expect(container.querySelector('.dc-shake'), `the drive could not order a ${b.kind}, so the engine search does not describe this drive`).toBeNull()
    }
    if (orders.buyCounters.length === 0 && !orders.intelBrief) return
    openSheet('PROCURE')
    for (const id of orders.buyCounters) {
      const name = DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!.name
      const box = defenseBoxes().find((b) => (b.closest('label')?.querySelector('span.text-sm')?.textContent ?? '').startsWith(name))
      expect(box, `PROCURE offers no "${name}" to order`).toBeDefined()
      act(() => {
        box!.click()
      })
      expect(box!.checked, `the drive could not order "${name}", so the engine search does not describe this drive`).toBe(true)
    }
    if (orders.intelBrief) {
      const ib = intelBox()
      if (ib && !ib.disabled) {
        act(() => {
          ib.click()
        })
        expect(ib.checked, 'the drive could not order the intel brief').toBe(true)
      }
    }
  }
  function driveTurn(turn: number, opts: DriveOpts = {}): {
    pairs: Set<string>
    sounds: Set<string>
    visuals: Set<string>
    // Classes observed on the CARD ELEMENT itself, as opposed to on a
    // marker inside it. A card-safe treatment must appear here or it is
    // not reaching the surface the registry says it runs on.
    onCard: Set<string>
    // Split out because the first version of this collector did not: it
    // fed every sound from the moment the turn started into one set, so
    // `buy-click`, `denied-buzz` and `execute-sweep` were in it before the
    // adversary phase produced anything. The assertion that turn 1 plays a
    // cue it did not open with was therefore true on every run whatever
    // the director did, INCLUDING on the tree this round exists to fix.
    // The player's own button is not the game answering back.
    playback: Set<string>
  } {
    const engine = getAudioEngine()
    const played: string[] = []
    const spy = vi.spyOn(engine, 'play').mockImplementation((cue) => {
      played.push(cue)
      return true
    })
    const pairs = new Set<string>()
    const sounds = new Set<string>()
    const visuals = new Set<string>()
    const playback = new Set<string>()
    const onCard = new Set<string>()

    // A scripted drive places the script's orders and nothing else. An
    // unscripted one buys the first thing on offer, because a new player
    // buys something, and the procurement cues are five of the seventeen
    // rows.
    const orders = opts.script?.[turn]
    if (opts.script) {
      if (orders) placeOrders(orders)
    } else buy('sat')
    // Then try to buy more than the turn can take. A new player taps past
    // their balance, and that refusal is a section 6 row of its own:
    // driving it is the difference between the row being MET and the row
    // being excused because the fixture was too careful to trip it.
    if (opts.overbuy ?? !opts.script) for (let i = 0; i < 12; i += 1) buy(DEAREST)
    // The drive spent surge authority here from Round 7 until v1.3 Round
    // 0, through the SURGE sheet on the board. SURGE left the game in that
    // round (D2), and its section 6 row with it.
    const execute = executeControl()
    expect(execute, 'the commit control is not on screen').not.toBeNull()
    click(execute!)

    // Tap the playback through and sample the card between the steps of
    // each beat. The card class is the visual the registry resolved;
    // whatever the spy caught since the last sample is the sound that went
    // with it.
    //
    // `mark` is drained HERE, after the commit, so nothing the player's own
    // buttons played can enter the playback set or the pairing. The first
    // version started the window at zero and paired the first card class
    // with the entire procurement phase.
    let mark = played.length
    const sample = () => {
      // TWO CHANNELS, kept distinct, because WHERE a class lands is the
      // observable that matters.
      //
      // DirectorView runs a card-safe treatment on the card itself and a
      // non-card-safe one on a marker inside the card, falling back to
      // dc-card-in for the card. A collector that unions the whole
      // container sees the class either way, so dropping a member from
      // CARD_SAFE_VISUALS becomes invisible: the treatment moves from the
      // card to the marker and the set still contains it. That is the
      // exact defect this round's own new cue shipped with, and widening
      // the collector to fix a different blindness re-created it.
      const cardEl = container.querySelector('div[data-beat-card]')
      const cardClasses = (cardEl?.className ?? '')
        .toString()
        .split(/\s+/)
        .filter((c) => CUE_CLASSES.has(c))
      const markerClasses = dcClassed()
        .filter((el) => el !== cardEl)
        .flatMap((el) => (el.className ?? '').toString().split(/\s+/))
        .filter((c) => CUE_CLASSES.has(c))
      for (const c of cardClasses) onCard.add(c)
      const classes = [...cardClasses, ...markerClasses]
      const fresh = played.slice(mark)
      mark = played.length
      for (const s of fresh) {
        sounds.add(s)
        playback.add(s)
      }
      for (const c of classes) visuals.add(c)
      for (const c of classes) for (const s of fresh) pairs.add(`${c}|${s}`)
    }
    playOut(sample, 60)
    for (const s of played.slice(mark)) {
      sounds.add(s)
      playback.add(s)
    }
    // The procurement sounds are still recorded, in `sounds`, because the
    // cannot-afford and buy rows are real section 6 rows that only fire
    // there. They are simply not evidence about the adversary phase.
    for (const s of played) sounds.add(s)
    spy.mockRestore()
    return { pairs, sounds, visuals, playback, onCard }
  }

  function driveOpening(turns = 3, opts: DriveOpts = {}) {
    const perTurn: ReturnType<typeof driveTurn>[] = []
    render(newGame(DEFAULT_SCENARIO, opts.seed ?? 20260712, 'standard'), 'brief')
    for (let t = 0; t < turns; t += 1) {
      perTurn.push(driveTurn(t + 1, opts))
      const onward = byText(/^NEXT TURN/)
      if (!onward) break
      click(onward)
    }
    return perTurn
  }

  it('gives a new player-s first turn a cue it did not open with', () => {
    // THE ROUND'S HEADLINE ASSERTION, from the player's seat. The
    // transmission bar opens every turn; the question is whether anything
    // else ever arrives. On the pre-round tree turn 1 played data-burst
    // twice and painted dc-transmission-in twice, and this fails.
    const [turnOne] = driveOpening(1)
    const beyond = [...turnOne.playback].filter((s) => s !== 'data-burst' && s !== 'silent')
    expect(
      beyond.length,
      `turn 1's adversary phase played only the transmission blip: ${
        [...turnOne.playback].join(', ') || 'nothing at all'
      }`,
    ).toBeGreaterThan(0)
    const painted = [...turnOne.visuals].filter((c) => c !== 'dc-transmission-in')
    expect(
      painted.length,
      `turn 1 painted only the transmission bar: ${[...turnOne.visuals].join(', ') || 'nothing at all'}`,
    ).toBeGreaterThan(0)
  })

  // The first seed on which a scripted line's opening shows every beat
  // kind in `want`, found by the engine so the drive that replays the same
  // orders through the controls lands where the search said it would.
  function firstSeedShowing(script: Record<number, TurnActions>, want: BeatKind[], who: string): number {
    for (let seed = 1; seed <= 400; seed += 1) {
      let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
      const kinds = new Set<string>()
      for (let t = 0; t < 3 && st.status === 'playing'; t += 1) {
        const next = resolveTurn(st, script[st.turn] ?? NO_OP, turnRng(st.seed, st.turn))
        for (const b of deriveBeats(st, next)) if (b.visible) kinds.add(b.kind)
        st = next
      }
      if (want.every((k) => kinds.has(k))) return seed
    }
    throw new Error(`no seed in 400 lets ${who} see ${want.join(', ')} inside three turns`)
  }

  // THE EXCUSES, COMPUTED FROM v1.3 PLAY (Round 0) rather than written
  // down. Until then this file named four rows the engine "cannot produce
  // in three turns" and trusted tests/opening.spec.ts to prove it; the
  // 6-turn plan made two of the four false at once (GNSS denial from turn
  // 2's jamming arms the chain on turn 3, and spending everything on turn
  // 1 ends a campaign in insolvency), and the hand-written list kept
  // excusing them. So a row is excused here only when no line of play the
  // suite knows reaches it inside three turns: every script in
  // tests/scripts.ts and every policy of the sweep gate, over 120 seeds.
  // A row the beats carry is reached when a visible beat presents one of
  // its (visual, sound) pairs, which is the join this file and the breadth
  // file both use; the MAI row is reached when the presented MAI, beat by
  // beat, goes under the win line; every other row fires from a control
  // or a meter on any turn, so it is never excused. The excuses are then
  // checked against the drives below, so a sweep too narrow to reach a
  // row the drives meet fails rather than excusing it.
  function openingExcuses(): Set<string> {
    const lines: ((s: GameState) => TurnActions)[] = [
      ...[WIN_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, LAZY_SCRIPT, TOP_INTEL_SCRIPT].map(
        (script) => (s: GameState) => script[s.turn] ?? NO_OP,
      ),
      ...POLICIES.map((p) => p.policy),
    ]
    const presented = new Set<string>()
    let floor = Infinity
    for (const line of lines) {
      for (let seed = 1; seed <= 120; seed += 1) {
        let st = newGame(DEFAULT_SCENARIO, seed, 'standard')
        for (let t = 0; t < 3 && st.status === 'playing'; t += 1) {
          const next = resolveTurn(st, line(st), turnRng(st.seed, st.turn))
          let shown = cloneModeled(st)
          for (const b of deriveBeats(st, next)) {
            shown = applyPatch(shown, b.patch)
            floor = Math.min(floor, maiScore(shown))
            if (!b.visible) continue
            presented.add(`${visualFor(b.cueKey, b.kind)}|${soundFor(b.cueKey, b.kind, b.lost ?? false)}`)
          }
          st = next
        }
      }
    }
    expect(presented.size, 'the sweep presented nothing, so every beat row would be excused').toBeGreaterThan(5)
    const pairsOf = (row: (typeof SECTION_6_ROWS)[number]) =>
      (row.soundPerSubject === 'condition'
        ? Object.values(CONDITION_CUES).map((c) => c.sound)
        : [row.sound, ...(row.soundPartners ?? [])]
      ).map((snd) => `${row.visual}|${snd}`)
    const reached = (row: (typeof SECTION_6_ROWS)[number]) => {
      if (row.kinds?.length) return pairsOf(row).some((p) => presented.has(p))
      if (row.sound === CROSSING_SOUND.below) return floor < DEFAULT_SCENARIO.winThreshold
      return true
    }
    return new Set(SECTION_6_ROWS.filter((r) => !r.deferred && !reached(r)).map((r) => r.beat))
  }

  it('meets the rows the opening is not excused from, by the end of the third turn', () => {
    // THREE PLAYERS since v1.3 Round 0, each covering rows the others
    // cannot. Until Round 0 one drive waited and one spent surge, because
    // with a single condition in the opening letting it persist and
    // surging it away were ALTERNATIVES; once SURGE left the board one
    // waited and one over-bought. The v1.3 opening splits three ways:
    //   - THE WAITING PLAYER orders exactly one drone a turn and no
    //     defense, so the night's moves land: a condition attaches,
    //     presses and clears, and GNSS denial arms the chain. Each of
    //     those needs a move to get through.
    //   - THE PREPARED PLAYER replays WIN_SCRIPT's first three turns (a
    //     drone and the primary defense of each move tonight), so the
    //     nights are HELD: the quiet beat and the defense streak exist only
    //     when nothing gets through, which v1.2 gave away on a turn that
    //     scripted no move and v1.3 makes the player earn (brief 6.2, M2).
    //   - THE OVER-BUYER, on the fixture's seed, buys and then taps past
    //     the balance, which is what trips the cannot-afford row. Spending
    //     all 100 CR on turn 1 leaves nothing for the repair bill when a
    //     point gets through, and the close below zero ends the campaign
    //     in insolvency (brief 6.1), so this drive is one turn long and it
    //     meets "Campaign lost", which v1.3 play reaches inside the opening.
    // Every row v1.3 play can produce in three turns is required of at
    // least one of them. The alternative, excusing whichever row a single
    // drive misses, is the "unreached, not unreachable" error 7b's
    // re-review found twice.
    //
    // And the scripted players' seeds are DERIVED, not chosen. "Condition
    // cleared" is a natural expiry, so the waiting player needs a seed on
    // which a condition runs out inside three turns, and the chain needs
    // GNSS denial live at a turn start; the prepared player needs a seed
    // on which an opportunity lands inside three turns (a draw at 0.2 on
    // turns 2 and 3). The engine finds the first of each, and the drives
    // replay the same orders, so they land where the search said they
    // would.
    const waitScript: Record<number, TurnActions> = Object.fromEntries(
      [1, 2, 3].map((t) => [t, a({ buyAssets: [{ kind: 'drone' }] })]),
    )
    const waitSeed = firstSeedShowing(waitScript, ['condition-pressure', 'condition-cleared', 'chain-armed'], 'a waiting player')
    const preparedSeed = firstSeedShowing(WIN_SCRIPT, ['quiet', 'commendation', 'opportunity'], 'a prepared player')
    const waits = driveOpening(3, { seed: waitSeed, script: waitScript })
    const prepared = driveOpening(3, { seed: preparedSeed, script: WIN_SCRIPT })
    const overbuys = driveOpening(3)
    const turns = [...waits, ...prepared, ...overbuys]
    const heard = new Set<string>()
    for (const t of turns) for (const s of t.sounds) heard.add(s)

    // Derived from SECTION_6_ROWS, minus the rows v1.3 play cannot
    // produce in three turns (computed above, against the engine) and the
    // rows still deferred. A row added later is required by default: one
    // the opening cannot reach changes the computed set and fails the pin
    // below until it is excused on purpose. Today the computation excuses
    // the MAI row (the presented MAI's floor over the sweep stays above
    // the win line) and "Campaign won" (the plan is six turns). "Surge
    // token spent", excused here until v1.3 Round 0, left the table with
    // SURGE.
    const excused = openingExcuses()
    // THE COMPUTED EXCUSES ARE PINNED. openingExcuses() decides a row is
    // reached from visualFor/soundFor, the same cue lookups that paint and
    // sound the beats this test drives, so a cue regression (say, a clear
    // that plays its condition's attach treatment again) would stop the
    // sweep presenting that row's pair, move the row into the excused set
    // and take it out of `required`, all with this test green. Pinning the
    // measured output turns that into a failure here. If the engine, the
    // plan or the cue table really changes what three turns can reach,
    // re-measure (print [...openingExcuses()].sort()), confirm each row
    // left or joined for a reason v1.3 play explains, and re-pin it
    // deliberately; never re-pin to make a red run green.
    expect(
      [...excused].sort(),
      'the excused rows changed: re-measure and re-pin deliberately',
    ).toEqual(['Campaign won', 'MAI crosses below the win line'])
    // THE EXCUSE LIST IS CHECKED IN BOTH DIRECTIONS, the way the sibling
    // breadth file checks its own. A hand-written set that subtracts from
    // a required set is granted for free otherwise: adding this round's
    // own central row to it left all 54 tests in this file green.
    const seen = new Set<string>()
    for (const t of turns) for (const p of t.pairs) seen.add(p)
    // A sound two rows share cannot credit either on its own. Derived from
    // the table rather than listed: resolve-chime is the live case today
    // and the next one should not need this comment edited.
    const owners = new Map<string, number>()
    for (const r of SECTION_6_ROWS) owners.set(r.sound, (owners.get(r.sound) ?? 0) + 1)
    const met = (row: (typeof SECTION_6_ROWS)[number]) => {
      if (row.soundPerSubject === 'condition') return [...heard].some((s) => s.startsWith('alarm-'))
      const sounds = [row.sound, ...(row.soundPartners ?? [])]
      const cls = VISUAL_CLASS[row.visual]
      if ((owners.get(row.sound) ?? 0) > 1) {
        // Shared: require the class this row's visual paints alongside it.
        return !!cls && sounds.some((snd) => seen.has(`${cls}|${snd}`))
      }
      return sounds.some((snd) => heard.has(snd))
    }
    const names = new Set(SECTION_6_ROWS.map((r) => r.beat))
    for (const name of excused) {
      expect(names.has(name), `the drive excuses "${name}", which is not a section 6 row`).toBe(true)
      const row = SECTION_6_ROWS.find((r) => r.beat === name)!
      expect(met(row), `the drive excuses "${name}" and then produces it anyway`).toBe(false)
    }
    // `met` is the credit for EVERY row now. It was written for the pair
    // join and then called only in the excuse loop, while the credit that
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

  it('pairs what was painted with what was played, so a silent animation cannot pass', () => {
    // The pair is the point. A visual with no voice and a voice with no
    // visual both satisfy the two assertions above taken separately.
    //
    // Two players since v1.3 Round 0. The quiet beat needs a night with
    // nothing through, which v1.3 makes the player earn (brief 6.2, M2):
    // the prepared line orders the primary defense of both of turn 1's
    // moves and holds that night on every seed, where the over-buyer's
    // turn 1 lets a point through (and on the fixture's seed ends the
    // campaign). The badge control at the end needs a condition to attach,
    // which only a night that lands can show, so the over-buyer's first
    // turn is driven as well; that the badge really ran is asserted, so
    // the control cannot pass on a drive that never attached one.
    const turns = [...driveOpening(2, { script: WIN_SCRIPT }), ...driveOpening(1)]
    const pairs = new Set<string>()
    for (const t of turns) for (const p of t.pairs) pairs.add(p)
    expect(pairs.size, 'no beat was ever observed painting and sounding together').toBeGreaterThan(1)
    // The quiet turn's own pair, which is the change the round exists to
    // make: before it, turn 1's second beat carried dc-transmission-in and
    // data-burst, the same pair as the first.
    expect([...pairs].join(' '), `pairs observed: ${[...pairs].join(', ')}`).toContain('dc-all-clear|all-clear')
    // ON THE CARD, not merely somewhere on screen. Without this, removing
    // 'all-clear' from CARD_SAFE_VISUALS moves the class to the marker and
    // every assertion above still passes.
    const card = new Set<string>()
    for (const t of turns) for (const c of t.onCard) card.add(c)
    expect(
      [...card],
      `classes observed on the card itself: ${[...card].join(', ') || 'none'}`,
    ).toContain('dc-all-clear')
    // The control: a treatment the registry keeps OFF the card must not
    // appear there, or the assertion above is satisfied by a card that
    // carries everything.
    const painted = new Set<string>()
    for (const t of turns) for (const v of t.visuals) painted.add(v)
    expect([...painted], 'no badge treatment ran at all, so its absence from the card proves nothing').toContain('dc-badge-attach')
    expect([...card], 'a badge treatment ran on the whole card').not.toContain('dc-badge-attach')
  })

  // The start screen that also carried the job framing left in v1.3 R1
  // (brief 5.1): the framing now renders only in the brief's disclosure,
  // which the guards above read.

  it('bounds every disclosure the brief screen renders, not only the one the round touched', () => {
    // Round 7b bounded the "Expand full brief" panel and named the constant
    // as though it covered every disclosure. Three more sat unmeasured on
    // the same screen, the largest at 263 words. The set is derived from
    // the rendered DOM: every <details> the brief screen carries must have
    // a budget, so a disclosure added later fails here until someone says
    // how long it may be.
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
    // Where Posture detail worsts, measured over 64 seeds of every script
    // and sweep policy: seed 20's prepared fleet at turn 6, 74 words, the
    // full fleet and nine defenses with their upkeep. Without it the set
    // records whatever these few states happen to reach, which is a lower
    // number than the game produces.
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
    // The chain disclosure renders only while the chain is armed, so find a
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
    expect(states.some(([, st]) => armed(st)), 'no state armed the chain, so its disclosure was never measured').toBe(true)

    const keyOf = (summary: string) => (summary.startsWith('BLACKOUT CHAIN ARMED') ? CHAIN_ARMED_LINE : summary)
    const worst = new Map<string, number>()
    const unbudgeted = new Set<string>()
    for (const [label, st] of states) {
      render(st, 'brief')
      for (const d of container.querySelectorAll('details')) {
        const summary = d.querySelector('summary')?.textContent?.trim() ?? ''
        const key = keyOf(summary)
        // Block by block, and only this disclosure's own blocks: textContent
        // merges sibling items and a nested <details> would be counted twice.
        const body = bodyText(d)
        const words = countWords(body)
        const budget = DISCLOSURE_WORD_BUDGETS[key]
        if (budget === undefined) {
          unbudgeted.add(`"${summary}" (${words} words, ${label})`)
          continue
        }
        expect(words, `${label}: "${key}" renders ${words} words against ${budget}`).toBeLessThanOrEqual(budget)
        worst.set(key, Math.max(worst.get(key) ?? 0, words))
      }
    }
    expect([...unbudgeted].join('\n'), 'a disclosure on the brief screen has no budget').toBe('')
    // Every budget must correspond to something the screen renders, or the
    // map is bounding a disclosure that no longer exists.
    for (const key of Object.keys(DISCLOSURE_WORD_BUDGETS)) {
      expect(worst.has(key), `"${key}" has a budget but never rendered on the brief screen`).toBe(true)
    }
    // Pinned HERE only where the text does not depend on the state, so a
    // handful of rendered states is the whole population. The two that vary
    // are swept over every line of play in tests/reading-diet.spec.ts, and
    // pinning them from seven named states is what produced a "worst" of 93
    // for a panel that reached 139 in legal play.
    // 257 since v1.3 Round 0 (263 before): the reference was rewritten to
    // the v1.3 rules. The surge and commendation lines and the sats' slip
    // left with their mechanics; the defense streak line, the upkeep and
    // insolvency order of the close, coverage per kind and the deploy lead
    // times came in.
    // 262 since the QC gauntlet (Q20, 21 October 2026): collapse is judged
    // "at a turn close" (G-030), and the conditions list names GNSS denial
    // and data leaks (G-115).
    expect(worst.get('What these numbers mean')).toBe(262)
    // 23 since v1.3 Round 0 (26 before): the chain's line no longer says
    // a fusion stack or an all-Tier-A drone fleet cancels the bonus, since
    // the tiers are gone and every defense now takes a share (brief 6.7).
    expect(worst.get(CHAIN_ARMED_LINE)).toBe(23)
    // The varying panels are JOINED instead: what renders must be exactly
    // what the swept function builds, so the sweep measures the screen.
    for (const [label, st] of states) {
      render(st, 'brief')
      const panel = [...container.querySelectorAll('details')].find(
        (d) => d.querySelector('summary')?.textContent?.trim() === 'Posture detail',
      )!
      // EXACT text, in order, with its tone. The first version compared word
      // COUNTS, so reordered lines, a lost colour and the reverted "any
      // phase" wording all passed a guard named for what renders.
      const rendered = [...panel.querySelectorAll('[data-posture-tone]')].map((el) => ({
        text: (el.textContent ?? '').trim(),
        tone: el.getAttribute('data-posture-tone'),
      }))
      expect(rendered, `${label}: Posture detail renders something postureDetailLines did not build`).toEqual(
        postureDetailLines(st).map((l) => ({ text: l.text, tone: l.tone })),
      )
      // The COLOUR, by meaning, stated here as a second structure: the
      // attribute above is what the code says the tone is, and a mutation
      // that repainted the class while leaving the attribute alone slept.
      // Since v1.3 Round 0 the amber line is the defenses' upkeep (the line
      // that can end the operation, as the surge rule was) and the blue
      // allied line is the free brief (it was the intel level boost).
      const meaning: [RegExp, string][] = [
        [/^Countermeasures:/, 'text-hero-blue'],
        [/^Allied intel:/, 'text-hero-blue'],
        [/^Keeping \d+ defenses? costs/, 'text-alert-amber'],
        [/^(Fleet|In transit)/, 'text-ink-dim'],
      ]
      for (const el of panel.querySelectorAll('[data-posture-tone]')) {
        const text = (el.textContent ?? '').trim()
        const want = meaning.find(([re]) => re.test(text))?.[1]
        expect(want, `${label}: no stated colour for "${text}"`).toBeDefined()
        expect(el.className, `${label}: "${text}" is not painted ${want}`).toContain(want!)
      }
      // And nothing else is in the panel beside those lines and the summary.
      expect(bodyText(panel), `${label}: Posture detail carries text outside its lines`).toBe(
        postureDetailLines(st).map((l) => l.text).join(' '),
      )
    }
  })

  it('puts a disclosure on the brief screen that adds to what is above it', () => {
    // Item 2, from the player's seat rather than from briefCopy. The panel
    // used to expand into a longer copy of its own summary; on three of
    // four intel levels it expanded into a SHORTER one.
    render(newGame(DEFAULT_SCENARIO, 20260712, 'standard'), 'brief')
    const summary = [...container.querySelectorAll('summary')].find((s) =>
      /Expand full brief/i.test(s.textContent ?? ''),
    )
    expect(summary, 'the brief screen offers no expand control').toBeDefined()
    // The panel, found through the control the player taps rather than by
    // querySelector over the page: three <details> render on this screen
    // and the first one is not this one.
    const panel = summary!.parentElement as HTMLElement
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
    // inside this <details> is invisible to it. That is exactly how the
    // turn-1 job framing sat unmeasured while the bound read 90 of 100,
    // and moving the framing into brief.ts fixed the instance without
    // fixing the mechanism. This measures the subtree.
    expect(
      countWords(body),
      `the expand panel renders ${countWords(body)} words: "${body.trim().slice(0, 200)}"`,
    ).toBeLessThanOrEqual(DISCLOSURE_WORD_BUDGETS['Expand full brief'])
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
    // And it is THIS panel, not some other <details> on the screen: the
    // body must carry what briefCopy built, so rendering the engine's
    // forecast here fails rather than reading as a different-but-fine
    // disclosure.
    expect(body, 'the expand panel is not rendering the brief the screen built').toContain(copy.full[0])
  })
})
