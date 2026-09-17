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
import { newGame, resolveTurn } from '../src/engine/reducer'
import { maiScore } from '../src/engine/scoring'
import { RECAP_MAX, recapTechniques } from '../src/ui/cues/Scene'
import { turnRng } from '../src/engine/rng'
import { captureGame, decodeSaveCode, encodeSaveCode } from '../src/persistence'
import { glossaryEntries } from '../src/ui/reference'
import { briefCopy } from '../src/ui/brief'
import type { GameState, TurnActions } from '../src/engine/types'
import { PLAYBACK_SPEED_KEY, SECTION_6_ROWS, deriveBeats, type Beat } from '../src/director'
import DirectorView from '../src/director/DirectorView'
import { SOUND_TOGGLE_LABELS, chromeCopy } from '../src/ui/brief'
import { getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { FakeAudioContext, installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT } from './scripts'

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

const ctx = () => contexts[0]

// A real campaign state, from the engine rather than hand-built.
function gameAt(turn: number, seed = 20260712): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

type Phase = 'brief' | 'procure' | 'harden' | 'playback' | 'aftermath'

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

// The credits readout's own span, which is where the flash class lands.
function creditsSpan(): HTMLElement {
  const el = container.querySelector('[aria-label^="Credits"]')
  if (!el) throw new Error('the credits readout is not on screen')
  return el as HTMLElement
}

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
    // Buy the cheapest thing on offer, whatever it is.
    const buy = buttons().find((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
    expect(buy, 'the procurement phase offered nothing to buy').toBeDefined()
    click(buy!)
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
      const buy = buttons().find((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
      if (!buy) return null
      const read = () => Number(/Credits (\d+)/.exec(creditsSpan().getAttribute('aria-label') ?? '')?.[1] ?? 0)
      const beforeBuy = read()
      click(buy)
      const spend = beforeBuy - read()
      if (spend <= 0) return null

      const toHarden = byText(/To hardening/i)
      if (!toHarden) return null
      click(toHarden)
      const execute = byText(/Hold to resolve/i)
      if (!execute) return null
      // The keyboard path commits at once, which is the control's
      // documented behaviour: holding a key is not the same gesture as
      // holding a pointer, and there is nothing to read while it happens.
      act(() => {
        execute.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })

      const steps: { credits: number; bad: boolean; good: boolean }[] = []
      for (let i = 0; i < 40; i += 1) {
        const el = container.querySelector('[aria-label^="Credits"]')
        if (el) {
          const m = /Credits (\d+)/.exec(el.getAttribute('aria-label') ?? '')
          steps.push({
            credits: m ? Number(m[1]) : -1,
            bad: /dc-flash-bad/.test(el.className),
            good: /dc-flash-good/.test(el.className),
          })
        }
        act(() => {
          vi.advanceTimersByTime(400)
        })
      }
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

describe('the declaration covers both decision phases', () => {
  it('does not paint a hardening buy as damage either', () => {
    // The retired pin held FOUR links; the fixture's first version drove
    // three. The fourth is the `chosen` prop, whose harden arm is live:
    // countermeasures and the IR retainer are bought in the hardening
    // phase and each moves the ticker. Narrowing it to
    // `chosen={phase === 'procure'}` left every countermeasure purchase
    // flashing magenta and ticking down like damage, with the suite green.
    render(gameAt(3), 'harden')
    const before = creditsSpan().getAttribute('aria-label')
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    const box = boxes.find((b) => !b.disabled && !b.checked)
    expect(box, 'the hardening phase offered nothing to buy').toBeDefined()
    act(() => {
      box!.click()
    })
    expect(creditsSpan().getAttribute('aria-label'), 'the hardening buy did not move the ticker').not.toBe(before)
    expect(creditsSpan().className, 'a hardening buy was painted as damage').not.toMatch(/dc-flash-bad/)
  })
})

describe('the declaration survives leaving playback early', () => {
  it('does not paint the buy as damage when the player skips out of playback', () => {
    // finishPlayback deliberately does NOT clear chosenSpend, because SKIP
    // and a mid-turn INSTANT choice end playback in the same commit that
    // jumps credits to the engine's after-state, and that jump still
    // carries the purchase. The retired source pin did not cover this
    // either, and the fixture only ever let playback finish naturally, so
    // adding setChosenSpend(0) to finishPlayback left the suite green.
    //
    // Searched for a discriminating turn, for the same reason the natural
    // completion test does: on most turns the remainder carries a repair
    // bill too, so the tone reads as damage whether or not the declaration
    // survived, and the assertion would prove nothing.
    const attempt = (turn: number) => {
      const state = gameAt(turn)
      if (state.status !== 'playing') return null
      render(state, 'procure')
      const buy = buttons().find((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
      if (!buy) return null
      const read = () => Number(/Credits (\d+)/.exec(creditsSpan().getAttribute('aria-label') ?? '')?.[1] ?? 0)
      const pre = read()
      click(buy)
      const spend = pre - read()
      if (spend <= 0) return null
      const toHarden = byText(/To hardening/i)
      if (!toHarden) return null
      click(toHarden)
      const execute = byText(/Hold to resolve/i)
      if (!execute) return null
      act(() => {
        execute.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      if (!/beat \d+ of \d+/.test(container.textContent ?? '')) return null
      const beforeSkip = read()
      const skip = byText(/^Skip/i)
      if (!skip) return null
      click(skip)
      act(() => {
        vi.advanceTimersByTime(50)
      })
      if (/beat \d+ of \d+/.test(container.textContent ?? '')) return null
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
  it('is on screen while the campaign is playing', () => {
    render(gameAt(3))
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
    // Call site one: a fleet tile.
    const tile = buttons().find((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
    expect(tile, 'nothing to buy').toBeDefined()
    ctx().reset()
    click(tile!)
    expect(ctx().oscillators().map((o) => o.frequency.first()), 'the fleet tile did not sound the buy voice').toEqual(
      buyVoice,
    )
    pressed.push('fleet tile')

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

    // Call site three: the intel upgrade, a different control entirely.
    const intel = [...container.querySelectorAll('input[type="checkbox"]')].find((b) =>
      /Raise intel/i.test(b.closest('label')?.textContent ?? ''),
    ) as HTMLInputElement | undefined
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

    // Call sites four and five live in the HARDENING phase, which this
    // render never reaches. Two of the five were therefore still covered
    // only by the source text pin the fixture was written to replace, so
    // deleting the sound from toggleCounter silenced every countermeasure
    // purchase with the suite green.
    click(byText(/To hardening/i)!)
    const hardenBoxes = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    const counter = hardenBoxes().find(
      (b) => !b.disabled && !b.checked && !/Incident response/i.test(b.closest('label')?.textContent ?? ''),
    )
    expect(counter, 'the hardening phase offered no countermeasure').toBeDefined()
    ctx().reset()
    act(() => {
      counter!.click()
    })
    expect(
      ctx().oscillators().map((o) => o.frequency.first()),
      'a countermeasure purchase did not sound the buy voice',
    ).toEqual(buyVoice)
    pressed.push('countermeasure')

    const retainer = hardenBoxes().find((b) =>
      /Incident response retainer/i.test(b.closest('label')?.textContent ?? ''),
    )
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
      `only pressed ${pressed.join(', ')}; the old pin already covered one, and two of the five live in the hardening phase`,
    ).toBeGreaterThanOrEqual(4)
  })
})

describe('the cannot-afford cue, asserted by execution', () => {
  it('shakes the tile, flashes the spend line and buzzes when the cart cannot take it', () => {
    // Pinned before by reading Game.tsx for the class names. The cue is
    // three channels at once and the point is that they fire together.
    const broke: GameState = { ...gameAt(2), credits: 1 }
    render(broke, 'procure')
    const buy = buttons().find((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
    expect(buy, 'nothing to try to buy').toBeDefined()
    act(() => {
      buy!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    const before = ctx() ? ctx().startedCount() : 0
    const balanceBefore = creditsSpan().getAttribute('aria-label')
    click(buy!)
    // Scoped to the elements that own each channel. Asked container-wide
    // at first, which proved only that the nonce fired once: both classes
    // hang off the same nonce, so moving the flash onto the tile beside
    // the shake left both queries satisfied while the spend line never
    // flashed, and the failure message named an element nothing inspected.
    const tile = buy!.closest('.dc-tile') ?? buy!
    expect(tile.className, 'the refused tile did not shake').toMatch(/dc-shake/)
    // The spend line is identified by WHAT IT IS, not by what it is not.
    // Scoped negatively at first ("some paragraph carrying the flash that
    // is not an ancestor of the pressed button"), which any other
    // paragraph on the screen satisfies: moving the flash onto the intel
    // tile left the budget line silent on every refusal and passed.
    const spendLine = [...container.querySelectorAll('p')].find((el) => /Planned spend/i.test(el.textContent ?? ''))
    expect(spendLine, 'the planned-spend line is not on screen').toBeDefined()
    expect(spendLine!.className, 'the spend line did not flash').toMatch(/dc-flash-bad/)
    expect(spendLine!.contains(buy!), 'the spend line and the tile are the same element').toBe(false)
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
    // The budget is credits PLUS this turn's income, so zeroing credits is
    // not enough to force a refusal; the cart is filled first instead,
    // which is also how a player actually reaches this.
    render(gameAt(3), 'procure')
    const tiles = () =>
      buttons().filter((b) => /\(\d+\)/.test(b.textContent ?? '') && !/hold/i.test(b.textContent ?? ''))
    for (let i = 0; i < 12; i += 1) {
      const t = tiles().find((b) => !/dc-shake/.test(b.className))
      if (!t) break
      click(t)
      if (container.querySelector('.dc-shake')) break
    }
    const intel = [...container.querySelectorAll('input[type="checkbox"]')].find((b) =>
      /Raise intel/i.test(b.closest('label')?.textContent ?? ''),
    ) as HTMLInputElement | undefined
    expect(intel, 'the intel upgrade is not on screen').toBeDefined()
    expect(intel!.disabled, 'the intel upgrade is maxed, so it cannot be refused').toBe(false)
    // EXCLUSIVITY, which is the whole point: the loop above left a fleet
    // tile refused and shaking, and this control must not be shaking with
    // it. Without this the tile could key off `denied !== null` and shake
    // for every refusal anywhere, which is the mis-attribution the fix
    // exists to prevent, and both tests would still pass.
    const before = intel!.closest('.dc-tile')
    expect(before, 'the intel upgrade is not on a tile that can carry a cue').not.toBeNull()
    expect(container.querySelector('.dc-shake'), 'the loop did not leave a refusal on screen').not.toBeNull()
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
    expect(tile, 'the intel upgrade is not on a tile that can carry a cue').not.toBeNull()
    expect(tile!.className, 'a refused intel upgrade did not shake').toMatch(/dc-shake/)
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

  it('shakes the retainer tile too, which lives in the other decision phase', () => {
    // The IR retainer is the fourth refusable id and the only one in the
    // hardening phase. Guarding the intel tile alone left this one's fix
    // unguarded, which a mutation showed.
    render(gameAt(3), 'harden')
    const boxes = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    const retainer = boxes().find((b) => /Incident response retainer/i.test(b.closest('label')?.textContent ?? ''))
    expect(retainer, 'the retainer is not on screen').toBeDefined()
    expect(retainer!.disabled, 'the retainer is already active, so it cannot be refused').toBe(false)
    // Fill the budget with the countermeasures on offer until one refuses.
    for (const box of boxes()) {
      if (box === retainer || box.disabled || box.checked) continue
      act(() => {
        box.click()
      })
      if (container.querySelector('.dc-shake')) break
    }
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
      // The heading carries a turn number and the transmission label is
      // rendered by the teletype bar as its own entity; both are matched
      // by shape below rather than by exact string.
      if (/^1\. Intel brief, turn \d+$/.test(line)) continue
      if (line.startsWith('>')) continue
      if (!text.includes(line)) missing.push(line)
    }
    expect(missing.join(', '), 'chrome charges the budget for controls the screen does not render').toBe('')
    expect(text).toMatch(/1\. Intel brief, turn \d+/)
    expect(text).toContain('INCOMING TRANSMISSION_')
    // The count itself, so this cannot pass by chromeCopy shrinking.
    expect(chromeCopy(state).length, 'the chrome list changed size without this guard noticing').toBe(12)
  })
})

describe('reduced motion keeps the sequence (brief v1.2)', () => {
  it('derives beats and enters playback with the preference set', () => {
    // The round's central claim, and until now it had no guard at all: the
    // two tests below read which speed button is pressed, and the decision
    // that actually produces the eleven-silent-rows regression is made at
    // Game.tsx's resolve, not in defaultSpeed. Adding one term there
    // (`speed !== 'instant' && !reducedMotion`) restored the exact v1.1
    // behaviour at the other end of the same decision with the whole suite
    // green. Three lenses raised it independently.
    //
    // So this resolves a real turn with the preference on and asserts the
    // player reaches playback, which is the only place the eleven director
    // rows can sound.
    setReducedMotion(true)
    render(gameAt(3), 'harden')
    const execute = byText(/Hold to resolve/i)
    expect(execute, 'the resolve control is not on screen').toBeDefined()
    act(() => {
      execute!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
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
      .flatMap((el) => el.className.split(/\s+/))
      .filter((c) => /^dc-(transmission-in|card-in|badge-|phase-dim|pulse-|manifest-in|strobe|shake)/.test(c))
    expect(cueClassesNow, `reduced motion still animated: ${cueClassesNow.join(', ')}`).toEqual([])
  })

  it('does animate the same beat when the preference is off, so the check above is not vacuous', () => {
    // The control for the assertion above. Without it, "no animation
    // classes on screen" is satisfied by a screen that never animates in
    // either mode, and the guard measures nothing.
    setReducedMotion(false)
    render(gameAt(3), 'harden')
    act(() => {
      byText(/Hold to resolve/i)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const cueClasses = [...container.querySelectorAll('[class*="dc-"]')]
      .flatMap((el) => el.className.split(/\s+/))
      .filter((c) => /^dc-(transmission-in|card-in|badge-|phase-dim|pulse-|manifest-in)/.test(c))
    expect(cueClasses.length, 'the opening beat animates nothing even with motion allowed').toBeGreaterThan(0)
  })

  it('plays the sequence to its end rather than skipping it', () => {
    // Completion under the preference, which section 8 asks for. It used
    // to be satisfied for free because instant finishes synchronously.
    setReducedMotion(true)
    render(gameAt(3), 'harden')
    const execute = byText(/Hold to resolve/i)
    act(() => {
      execute!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.textContent, 'playback did not start').toMatch(/beat \d+ of \d+/)
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(container.textContent, 'playback never reached the aftermath').not.toMatch(/beat \d+ of \d+/)
  })

  it('does not fall through to instant, so playback actually runs', () => {
    // The decoupling. Reduced motion used to select instant, instant
    // derives no beats, and eleven of the sixteen cue rows therefore had
    // nothing to attach to for a player who had asked for nothing to move
    // rather than for nothing to be told.
    setReducedMotion(true)
    const state = gameAt(2)
    render(state, 'harden')
    const speedControls = buttons().filter((b) => /^(1x|2x|instant)$/i.test(b.textContent?.trim() ?? ''))
    expect(speedControls.length, 'the speed control is not on screen').toBeGreaterThan(0)
    const pressed = speedControls.find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed, 'no speed is selected').toBeDefined()
    expect(
      pressed!.textContent?.trim().toLowerCase(),
      'reduced motion still selects instant, so playback is skipped and eleven cue rows never sound',
    ).not.toBe('instant')
  })

  it('leaves a stored instant preference alone, because that was a choice', () => {
    localStorage.setItem(PLAYBACK_SPEED_KEY, 'instant')
    setReducedMotion(true)
    render(gameAt(2), 'harden')
    const pressed = buttons()
      .filter((b) => /^(1x|2x|instant)$/i.test(b.textContent?.trim() ?? ''))
      .find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed?.textContent?.trim().toLowerCase(), 'a stored choice was overridden').toBe('instant')
  })
})


// Render a whole turn's playback and advance until the named scene is on
// screen. Rendering an outcome beat ALONE leaves the presented state at
// `before`, because the director builds the final state by applying every
// earlier patch; the scenes read the presented state, so in isolation they
// legitimately show pre-turn numbers. Both content guards below were
// written against a lone beat first and failed for exactly that reason,
// which is a fact about the fixture rather than about the scenes.
function playUntilScene(before: GameState, after: GameState, beats: Beat[], want: string): Element | null {
  act(() => {
    root.render(
      <DirectorView
        before={before}
        after={after}
        beats={beats}
        speed="1x"
        onSpeedChange={() => {}}
        onPresented={() => {}}
        onDone={() => {}}
      />,
    )
  })
  for (let i = 0; i < 80; i += 1) {
    const el = container.querySelector(`[data-scene="${want}"]`)
    if (el) return el
    act(() => {
      vi.advanceTimersByTime(400)
    })
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

  // Drive Game from the hardening phase of the deciding turn through to
  // the outcome beat, and return the scene on screen.
  function playToOutcome(before: GameState) {
    render(before, 'harden')
    act(() => {
      byText(/Hold to resolve/i)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.textContent, 'the deciding turn did not enter playback').toMatch(/beat \d+ of \d+/)
    // Advance to the OUTCOME scene specifically. A losing campaign passes
    // through the blackout scene on the way, so breaking on the first
    // [data-scene] would read the wrong one; the first version of this
    // helper did exactly that and reported 'blackout' for both endings.
    const seen: string[] = []
    for (let i = 0; i < 80; i += 1) {
      const el = container.querySelector('[data-scene]')
      const name = el?.getAttribute('data-scene') ?? null
      if (name && seen[seen.length - 1] !== name) seen.push(name)
      if (name === 'victory' || name === 'defeat') return { el: el!, seen }
      act(() => {
        vi.advanceTimersByTime(400)
      })
    }
    return { el: null, seen }
  }

  it('plays the defeat scene when a campaign is lost', () => {
    const { before } = finalTurn(LOSS_SCRIPT)
    const { el, seen } = playToOutcome(before)
    expect(el, `a lost campaign reached its end with no outcome scene; saw ${seen.join(', ') || 'nothing'}`).not.toBeNull()
    expect(el!.getAttribute('data-scene'), 'a lost campaign played the winning scene').toBe('defeat')
    expect(el!.textContent, 'the defeat scene does not say what was lost').toMatch(/Link lost/i)
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
    // beat and not about how long playback took to reach it. Instant is
    // not usable here: it skips to done and shows no beat at all.
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
          speed="1x"
          onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
    expect(cards.map((c) => c.textContent?.trim())).toEqual(independent)
    // Bounded, because a twelve turn campaign can fire two dozen and the
    // reading diet bounds what the player is asked to take in.
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
            speed="1x"
            onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
    const f = firstBeat((b) => b.kind === 'commendation' && (b.patch.credits ?? 0) > 0)
    expect(f, 'the sweep produced no commendation carrying a bonus').not.toBeNull()
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
    // And it lands on the right number. Read without advancing timers:
    // one beat at 1x finishes after its dwell and the card unmounts, so
    // advancing past it reads an empty screen rather than a settled one.
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
    const f = firstBeat((b) => b.kind === 'commendation' && (b.patch.credits ?? 0) > 0)!
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
    const f = firstBeat((b) => b.kind === 'commendation' && (b.patch.credits ?? 0) > 0)!
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
          speed="1x"
          onSpeedChange={() => {}}
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

    // Advance past the dwell to the second beat and read what the player
    // sees as it opens.
    act(() => {
      vi.advanceTimersByTime(600)
    })
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
    // beats cannot be adjacent, but a commendation and an outcome can, and
    // they are, on any campaign won on a turn that earned one.
    const won = (() => {
      for (const seed of [20260712, 7, 1, 2, 3, 4041, 11, 13]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
          if (after.status === 'won') {
            const bs = deriveBeats(state, after)
            if (bs.some((b) => b.kind === 'commendation' && (b.patch.credits ?? 0) > 0)) {
              return { before: state, after, beats: bs }
            }
          }
          state = after
        }
      }
      return null
    })()
    expect(won, 'no campaign in the sweep is won on a turn that also earns a commendation').not.toBeNull()
    const bonus = won!.beats.find((b) => b.kind === 'commendation')!.patch.credits ?? 0
    setReducedMotion(false)
    const scene = playUntilScene(won!.before, won!.after, won!.beats, 'victory')
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
    const exportButton = byText(/export save code/i)
    expect(exportButton, 'the outcome screen has no export control').toBeDefined()
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
    expect(codeBox(), 'the code box survived into the start screen').toBeNull()

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
    const paste = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(paste, code)
      paste.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(byText(/load from code/i)!)

    // A pasted code carries phase 'aftermath', and the outcome screen is
    // gated on the phase NOT being that, so the load lands on the damage
    // report. View final report is the control that moves on, and the
    // re-review flagged this same gate as the reason an earlier assertion
    // was matching the wrong screen.
    const toReport = byText(/view final report/i)
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
    const inPlayExport = byText(/export code/i)
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

describe('the technique tag opens the GLOSSARY entry', () => {
  // Until Round 6e the tag was an external anchor with target=_blank, which
  // sent the player off-site on their first hop. The brief names GLOSSARY
  // twice and Glossary.tsx has existed since Round 3.5; the audit called
  // it brief-stale and was wrong, because no ruling in eighteen versions
  // reversed it.
  const tag = () => container.querySelector('[data-technique-tag]') as HTMLElement | null
  const overlay = () => container.querySelector('[data-glossary-overlay]')

  // A turn whose intel brief actually carries a technique tag, SEARCHED
  // for rather than assumed. briefCopy returns tag: undefined whenever the
  // lead event has no technique ref at the current intel level, and turn 3
  // at the fixture's seed is one of those, so the first version of these
  // guards asserted against a screen with no tag on it and failed for a
  // reason that had nothing to do with the code under test. Round 4e
  // learned this with a hardcoded turn number; this is the same lesson.
  function turnWithATag(): GameState {
    // A tag exists only at INTEL LEVEL 3, and only when the turn has a
    // fixed slot: briefCopy returns no tag at all below that, and returns
    // none at level 3 either when every slot is a draw, because naming a
    // maybe as a fact is the thing that code refuses to do. The prepared
    // line never buys the top tier, so the first version of this search
    // swept a whole campaign and found nothing, which is the guard working
    // rather than failing. TOP_INTEL_SCRIPT is the line that funds it.
    for (const seed of [20260712, 11, 41, 104]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      for (let i = 0; i < DEFAULT_SCENARIO.totalTurns && state.status === 'playing'; i += 1) {
        if (briefCopy(state, 'Standard').tag) return state
        state = resolveTurn(state, TOP_INTEL_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      }
    }
    throw new Error('no turn of any line searched carries a technique tag, so these guards assert nothing')
  }

  it('opens the glossary in place, without leaving the game', () => {
    render(turnWithATag(), 'brief')
    const el = tag()
    expect(el, 'the intel brief renders no technique tag').not.toBeNull()
    // A button, not a link out. The old shape is the defect.
    expect(el!.tagName, 'the tag is still an anchor').toBe('BUTTON')
    expect(el!.getAttribute('href'), 'the tag still carries an href').toBeNull()
    expect(overlay(), 'the glossary is open before anything was tapped').toBeNull()

    click(el!)
    expect(overlay(), 'tapping the tag opened nothing').not.toBeNull()
  })

  it('lands on the entry for the technique that was tapped', () => {
    render(turnWithATag(), 'brief')
    const key = tag()!.getAttribute('data-technique-tag')!
    click(tag()!)
    const focused = container.querySelector('[data-glossary-focus]')
    expect(focused, 'the glossary opened with no entry focused, which is opening the glossary and leaving them to look').not.toBeNull()
    expect(focused!.getAttribute('data-glossary-focus'), 'the wrong entry was focused').toBe(key)
  })

  it('keeps the external citation on the entry', () => {
    // Both halves matter. Keeping the player in the game is worth nothing
    // if the live-verified framework reference is dropped on the way.
    render(turnWithATag(), 'brief')
    const key = tag()!.getAttribute('data-technique-tag')!
    click(tag()!)
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
    const exportButton = byText(/export code/i)
    expect(exportButton, 'the brief screen has no export control, so this asserts nothing').toBeDefined()
    await act(async () => {
      exportButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    const noticeBefore = (container.textContent ?? '').match(/Save code copied[^|]*|Copy failed[^|]*/)
    expect(noticeBefore, 'no notice appeared, so its survival proves nothing').not.toBeNull()

    click(tag()!)
    expect(overlay()).not.toBeNull()
    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    expect(back, 'the overlay has no way back').toBeDefined()
    click(back!)
    expect(overlay(), 'the overlay would not close').toBeNull()

    expect(
      container.textContent,
      'opening a glossary entry threw away state the component was holding',
    ).toContain(noticeBefore![0].trim())
    expect(container.textContent, 'coming back landed somewhere other than the brief').toMatch(/intel brief/i)
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

  function turnWithATag(): GameState {
    for (const seed of [20260712, 11, 41, 104]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      for (let i = 0; i < DEFAULT_SCENARIO.totalTurns && state.status === 'playing'; i += 1) {
        if (briefCopy(state, 'Standard').tag) return state
        state = resolveTurn(state, TOP_INTEL_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      }
    }
    throw new Error('no turn of any line searched carries a technique tag')
  }

  it('closes on Escape pressed where the player actually is', () => {
    render(turnWithATag(), 'brief')
    const el = tag()!
    click(el)
    expect(overlay(), 'the overlay did not open').not.toBeNull()

    // Dispatched from the element that really holds focus, which is the
    // tag button outside the overlay. A handler bound to the overlay's own
    // subtree cannot see this, which is the whole defect.
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(overlay(), 'Escape did not close the overlay').toBeNull()
  })

  it('moves focus into the dialog and gives it back', () => {
    render(turnWithATag(), 'brief')
    const el = tag()!
    act(() => el.focus())
    expect(document.activeElement, 'the tag never took focus, so this asserts nothing').toBe(el)

    click(el)
    expect(overlay()!.contains(document.activeElement), 'focus stayed outside the dialog').toBe(true)

    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(document.activeElement, 'closing the dialog dropped focus to the document').toBe(el)
  })

  it('makes the game behind it inert rather than only covering it', () => {
    render(turnWithATag(), 'brief')
    const main = container.querySelector('main')!
    expect(main.hasAttribute('inert'), 'the game is inert before anything opened').toBe(false)
    click(tag()!)
    expect(main.hasAttribute('inert'), 'aria-modal was declared over a page that is still reachable').toBe(true)
    expect(main.getAttribute('aria-hidden')).toBe('true')
    const back = [...container.querySelectorAll('button')].find((b) => /back to the brief/i.test(b.textContent ?? ''))
    click(back!)
    expect(main.hasAttribute('inert'), 'the game stayed inert after the dialog closed').toBe(false)
  })

  it('does not nest a second main or a second h1 in the document', () => {
    render(turnWithATag(), 'brief')
    click(tag()!)
    const mains = container.querySelectorAll('main')
    expect(mains.length, 'the overlay put a second main landmark on the page').toBe(1)
    expect(mains[0].querySelector('[data-glossary-overlay]'), 'the overlay is nested inside the game main').toBeNull()
    expect(container.querySelectorAll('h1').length, 'the overlay added a second h1').toBe(1)
  })
})

describe('a loaded campaign is not a campaign that was played here', () => {
  // CONFIRMED BY THE PASS, and Round 6e is what made it reachable: until
  // the save code was rendered, a finished-state code was hard to come by,
  // because Save and Export code render only while playing. Now a player
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
    // So this plays the last turn through the controls. The keyboard path
    // on the hold control commits at once, which is its documented
    // behaviour and what the fixture already uses elsewhere.
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    while (state.status === 'playing' && state.turn < DEFAULT_SCENARIO.totalTurns) {
      state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }
    expect(state.status, 'this line ended early, so the last turn is not the one being played').toBe('playing')
    expect(state.turn, 'not at the final turn').toBe(DEFAULT_SCENARIO.totalTurns)
    expect(scores(), 'the board is not empty at the start').toHaveLength(0)

    render(state, 'brief')
    const toProcure = byText(/To procurement/i)
    expect(toProcure, 'no way into procurement').toBeDefined()
    click(toProcure!)
    const toHarden = byText(/To hardening/i)
    expect(toHarden, 'no way into hardening').toBeDefined()
    click(toHarden!)
    const execute = byText(/Hold to resolve/i)
    expect(execute, 'no commit control on the final turn').toBeDefined()
    act(() => {
      execute!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    // Run the playback out so the campaign reaches its end state.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

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

    // The start screen, with no campaign: that is where the paste box is.
    mounts += 1
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={null} onExit={() => {}} />)
    })
    const paste = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement | null
    expect(paste, 'the start screen has no paste box, so this asserts nothing').not.toBeNull()

    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(paste!, code)
      paste!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const load = byText(/load from code/i)
    expect(load, 'no load control').toBeDefined()
    expect(load!.hasAttribute('disabled'), 'the load control is disabled, so the paste did not register').toBe(false)
    click(load!)

    // THE LOAD ACTUALLY HAPPENED, asserted on something only true AFTER
    // it. The first version matched /assured|link lost|mission/i, which the
    // START SCREEN satisfies: its job framing reads "with the Mission
    // Assurance Index (MAI) at...". So deleting the beginGame call left
    // this green, because a failed load renders the very screen the regex
    // matched. A vacuous assertion inside the guard written to close a
    // vacuous guard, found by the re-review.
    expect(byText(/start campaign/i), 'still on the start screen, so the code never loaded').toBeUndefined()
    expect(container.querySelector('[aria-label="game seed"]'), 'the start screen is still mounted').toBeNull()
    expect(container.querySelector('[aria-label^="Credits"]'), 'no campaign HUD, so nothing loaded').not.toBeNull()

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
    // So this presses Start campaign and plays twelve turns through the
    // controls, which is the path every real campaign takes.
    expect(scores(), 'the board is not empty at the start').toHaveLength(0)
    mounts += 1
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={null} onExit={() => {}} />)
    })
    const startButton = byText(/start campaign/i)
    expect(startButton, 'no way to start a campaign').toBeDefined()
    click(startButton!)
    expect(container.querySelector('[aria-label^="Credits"]'), 'the campaign did not start').not.toBeNull()

    for (let turn = 0; turn < DEFAULT_SCENARIO.totalTurns + 2; turn += 1) {
      const toProcure = byText(/To procurement/i)
      if (!toProcure) break
      click(toProcure)
      const toHarden = byText(/To hardening/i)
      if (!toHarden) break
      click(toHarden)
      const execute = byText(/Hold to resolve/i)
      if (!execute) break
      act(() => {
        execute.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      const next = byText(/To turn \d+ intel brief|View final report/i)
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

    click(byText(/To procurement/i)!)
    click(byText(/To hardening/i)!)
    act(() => {
      byText(/Hold to resolve/i)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
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
