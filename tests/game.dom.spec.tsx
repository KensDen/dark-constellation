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
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { PLAYBACK_SPEED_KEY } from '../src/director'
import { SOUND_TOGGLE_LABELS, chromeCopy } from '../src/ui/brief'
import { getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { FakeAudioContext, installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'

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
