// @vitest-environment jsdom
//
// A real door to the Field Library from play (critique row M7). The only
// route was 10px of underlined "learn more" beside a disclosure on a card
// that moved on by itself after a dwell, and three disclosures deep once
// the turn had played. Now:
// - LEARN MORE is a full-width 44px button on every REAL WORLD line;
// - tapping it during playback asks for the library without moving the
//   card on, the card waits behind the library, and the playback goes on
//   once the library closes. Since v1.3 Round 0 (brief 5.5) nothing moves
//   a card on its own, so the hold that tap used to set is gone; what is
//   left to guard is the tap itself and the playback's keys;
// - the aftermath lists the turn's threats, landed or held, each with the
//   same button above the ledger. Opportunities have no entries.
// The library itself is Game's (tests/field-library.dom.spec.tsx opens it
// for real); here the provider is a stub, so what the button asks for and
// when is what is measured.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats, type Beat } from '../src/director'
import DirectorView from '../src/director/DirectorView'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnRecord } from '../src/engine/types'
import AftermathCard from '../src/ui/board/AftermathCard'
import { techniqueLabel } from '../src/ui/labels'
import { LearnMore } from '../src/ui/learnMore'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const kindOf = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat'
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button[data-learn-more]')]
const beatShown = () => container.textContent?.match(/beat (\d+) of \d+/)?.[1]

// A turn of real play whose shape a test needs.
function find<T>(pick: (before: GameState, after: GameState) => T | undefined): T {
  for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
    for (const seed of [20260712, 4041, 1, 2, 3, 7]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        const found = pick(state, after)
        if (found) return found
        state = after
      }
    }
  }
  throw new Error('no turn in the sweep has the shape this test needs')
}

describe('LEARN MORE on the playback card (critique row M7)', () => {
  // A turn with a threat card that is not its last visible beat, so the
  // playback has somewhere to go on to.
  const turn = find((before, after) => {
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible)
    const at = visible.findIndex((b) => b.kind === 'threat')
    return at >= 0 && at < visible.length - 1 ? { before, after, beats, position: at + 1 } : undefined
  })

  function render(open: (id: string, from: HTMLElement) => void, held = false) {
    act(() => {
      root.render(
        <LearnMore.Provider value={open}>
          <DirectorView before={turn.before} after={turn.after} beats={turn.beats} onPresented={() => {}} onDone={() => {}} held={held} />
        </LearnMore.Provider>,
      )
    })
  }
  // Tapped through with the playback's own Next, one beat a tap.
  const next = () => {
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next')
    if (!button) throw new Error('the playback renders no Next control')
    act(() => button.click())
  }
  const toThreatCard = () => {
    for (let guard = 0; guard < 100 && Number(beatShown() ?? 0) < turn.position; guard += 1) next()
    expect(Number(beatShown()), 'playback never reached the threat card').toBe(turn.position)
  }
  // A key with nothing focused, which is where the playback listens for
  // Space; Escape it takes from anywhere.
  const press = (key: string) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })

  it('is a full-width 44px button in the go colour, keeping its words for a screen reader', () => {
    render(() => {})
    toThreatCard()
    const [button] = buttons()
    expect(button, 'the threat card has no LEARN MORE').toBeDefined()
    const beat = turn.beats.filter((b: Beat) => b.visible)[turn.position - 1]
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === beat.subjectId)!
    expect(button.getAttribute('data-learn-more')).toBe(def.id)
    expect(button.textContent).toBe(`LEARN MORE in the Field Library: ${techniqueLabel(def.techniqueRefs[0])}`)
    expect(button.querySelector('.sr-only')?.textContent).toBe(` in the Field Library: ${techniqueLabel(def.techniqueRefs[0])}`)
    for (const cls of ['w-full', 'min-h-11', 'font-mono', 'text-xs', 'border-dc-go', 'bg-dc-go/10']) expect(button.className.split(' ')).toContain(cls)
    expect(button.className, 'still the old underlined link').not.toMatch(/underline|text-\[10px\]/)
  })

  it('asks for the library without moving the card on, and the card waits behind it until it closes', () => {
    // This case proved PAUSE ON INTENT: the tap held the beat before the
    // library opened, because the card moved on by itself after a dwell.
    // v1.3 Round 0 retired the dwell (brief 5.5), and the hold went with
    // it. What it was for still stands, that the card the player asked
    // about is the card on screen when they come back, and two things can
    // still take it away: the tap, which lands inside the card and would
    // step it if the card's own click took it, and a key meant for the
    // library, which the playback must leave alone while it is held.
    const asked: string[] = []
    const open = (id: string) => {
      asked.push(id)
    }
    render(open)
    toThreatCard()
    const held = beatShown()
    const beat = turn.beats.filter((b: Beat) => b.visible)[turn.position - 1]
    act(() => buttons()[0].click())
    expect(asked, 'LEARN MORE did not ask for the library about this card').toEqual([beat.subjectId])
    expect(beatShown(), 'the tap on LEARN MORE moved the card on').toBe(held)
    // The library opens (Game holds the board), and its keys are its own.
    render(open, true)
    press(' ')
    press('Escape')
    expect(beatShown(), 'a key meant for the library moved the card on behind it').toBe(held)
    // It closes, and the same key is the playback's again.
    render(open, false)
    press(' ')
    expect(beatShown() !== held, 'the playback stayed held after the library closed').toBe(true)
  })
})

describe('the aftermath lists the turn\'s threats with LEARN MORE (critique row M7)', () => {
  // A turn with a threat that landed, one that was held, and an
  // opportunity, so every branch of the list is on screen.
  const { record, state } = find((_, after) => {
    const r = after.history.at(-1)!
    const threats = r.events.filter((ev) => kindOf(ev.eventId) === 'threat')
    const shape =
      threats.some((ev) => ev.effectiveSeverity > 0) &&
      threats.some((ev) => ev.effectiveSeverity === 0) &&
      r.events.some((ev) => kindOf(ev.eventId) === 'opportunity')
    return shape ? { record: r as TurnRecord, state: after } : undefined
  })

  it('names each threat, landed or held, with a LEARN MORE above the ledger, and no opportunity', () => {
    const asked: string[] = []
    act(() => {
      root.render(
        <LearnMore.Provider value={(id) => asked.push(id)}>
          <AftermathCard record={record} state={state} scenario={state.scenario} reducedMotion ledgerOpen={false} />
        </LearnMore.Provider>,
      )
    })
    const threats = record.events.filter((ev) => kindOf(ev.eventId) === 'threat')
    const list = container.querySelector('[data-aftermath-threats]')
    expect(list, 'the aftermath lists no threats').not.toBeNull()
    expect(list!.closest('details'), 'the list is inside the collapsed ledger').toBeNull()
    expect(list!.nextElementSibling?.tagName, 'the list is not right above the ledger').toBe('DETAILS')
    const items = [...list!.querySelectorAll('li')]
    expect(items.map((li) => li.firstChild?.textContent)).toEqual(threats.map((ev) => ev.name))
    expect(items.map((li) => li.textContent?.replace(/LEARN MORE.*$/, ''))).toEqual(
      threats.map((ev) => `${ev.name} ${ev.effectiveSeverity > 0 ? 'landed' : 'held'}`),
    )
    const inList = [...list!.querySelectorAll<HTMLButtonElement>('button[data-learn-more]')]
    expect(inList.map((b) => b.getAttribute('data-learn-more'))).toEqual(threats.map((ev) => ev.eventId))
    for (const b of inList) expect(b.textContent).toMatch(/^LEARN MORE/)
    // One tap from the end of the turn.
    act(() => inList[0].click())
    expect(asked).toEqual([threats[0].eventId])
  })
})
