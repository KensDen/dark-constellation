// @vitest-environment jsdom
//
// What would have helped, where the player looks (critique row M3). The
// sentence naming the missing defense used to render only inside the
// aftermath's collapsed ledger, open by default only at INSTANT. Now the
// short form is a line of its own on the hit card, under the severity
// line, and the verdict's second line on a turn something landed; the
// ledger keeps the full sentence. Rendered against the game's own beats
// and records, found by walking real play.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats, type Beat } from '../src/director'
import DirectorView from '../src/director/DirectorView'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions, TurnRecord } from '../src/engine/types'
import AftermathCard from '../src/ui/board/AftermathCard'
import { verdictFor } from '../src/ui/verdict'
import { full, short } from '../src/ui/wouldHaveHelped'
import { POLICIES } from './policies'
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

const line = () => container.querySelector('[data-would-have-helped]')
const isThreat = (id: string) => (DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat'

// The first turn of real play, over a few seeds and both scripted lines,
// then the sweep gate's policies (tests/policies.ts), with a visible beat
// or a record that has the shape a test needs. The policies come after
// the scripts, so a shape the scripts reach is found where it always was;
// they were added in v1.3 Round 0 because the six-turn game's scripts
// never land a fully defended threat ahead of one with a defense missing
// (the verdict test below), and the NOVICE line does, on turn 6, where
// the BLACKOUT CHAIN gets through sensor fusion ahead of the drawn move.
const scripted = (script: Record<number, TurnActions>) => (state: GameState) => script[state.turn] ?? NO_OP
const LINES: ((state: GameState) => TurnActions)[] = [scripted(LOSS_SCRIPT), scripted(WIN_SCRIPT), ...POLICIES.map((p) => p.policy)]
function find<T>(pick: (before: GameState, after: GameState) => T | undefined): T {
  for (const play of LINES) {
    for (const seed of [20260712, 4041, 1, 2, 3, 7]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, play(state), turnRng(state.seed, state.turn))
        const found = pick(state, after)
        if (found) return found
        state = after
      }
    }
  }
  throw new Error('no turn in the sweep has the shape this test needs')
}

const beatWhere = (match: (b: Beat, after: GameState) => boolean) =>
  find((before, after) => {
    const beat = deriveBeats(before, after).find((b) => b.visible && match(b, after))
    return beat ? { before, after, beat } : undefined
  })

function renderBeat(f: { before: GameState; after: GameState; beat: Beat }) {
  act(() => {
    root.render(
      <DirectorView before={f.before} after={f.after} beats={[f.beat]} onPresented={() => {}} onDone={() => {}} />,
    )
  })
}

const resolvedOf = (after: GameState, beat: Beat) => after.history.at(-1)!.events.find((e) => e.eventId === beat.subjectId)!
const landedThreat = (b: Beat) => b.kind === 'threat' && (b.severity?.effective ?? 0) > 0

describe('the hit card (critique row M3)', () => {
  it('names the missing defense in amber, on its own line under the severity line', () => {
    const f = beatWhere((b, after) => landedThreat(b) && short(resolvedOf(after, b), after, after.scenario) !== '')
    renderBeat(f)
    const expected = short(resolvedOf(f.after, f.beat), f.after, f.after.scenario)
    expect(expected).toMatch(/^Would have helped: /)
    expect(line(), 'the hit card has no would-have-helped line').not.toBeNull()
    expect(line()!.textContent).toBe(expected)
    expect(line()!.className).toContain('text-alert-amber')
    expect(line()!.previousElementSibling?.textContent ?? '', 'the line is not under the severity line').toMatch(/^Severity /)
  })

  it('says nothing on a threat that was held, or once every applicable defense was owned', () => {
    // A held threat with a defense still missing, so short() has words to
    // print and only the landed rule keeps them off the card.
    const held = beatWhere((b, after) => b.kind === 'threat' && b.severity?.effective === 0 && short(resolvedOf(after, b), after, after.scenario) !== '')
    renderBeat(held)
    expect(container.textContent, 'the control: the held card did not render').toMatch(/Severity /)
    expect(line(), 'a held threat claims something would have helped').toBeNull()
    const f = beatWhere(landedThreat)
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === f.beat.subjectId)!
    renderBeat({ ...f, after: { ...f.after, counters: [...f.after.counters, ...def.counters] } })
    expect(container.textContent, 'the control: the landed card did not render').toMatch(/Severity /)
    expect(line(), 'with everything owned the short line still names a defense').toBeNull()
  })
})

describe('the verdict (critique row M3)', () => {
  function renderAftermath(record: TurnRecord, state: GameState) {
    act(() => {
      root.render(<AftermathCard record={record} state={state} scenario={state.scenario} reducedMotion ledgerOpen={false} />)
    })
  }
  const recordWhere = (match: (r: TurnRecord, after: GameState) => boolean) =>
    find((_, after) => {
      const r = after.history.at(-1)!
      return match(r, after) ? { record: r, state: after } : undefined
    })

  it('carries the short line for the first threat that landed as its second line, outside the ledger', () => {
    // Two threats landing, so "first" is a choice the test can see.
    const { record, state } = recordWhere(
      (r, after) =>
        r.events.filter((ev) => isThreat(ev.eventId) && ev.effectiveSeverity > 0 && short(ev, after, after.scenario) !== '').length > 1,
    )
    renderAftermath(record, state)
    const first = record.events.find((ev) => isThreat(ev.eventId) && ev.effectiveSeverity > 0)!
    expect(line(), 'the verdict has no second line').not.toBeNull()
    expect(line()!.textContent).toBe(short(first, state, state.scenario))
    expect(line()!.closest('details'), 'the line is still inside the collapsed ledger').toBeNull()
    expect(line()!.previousElementSibling?.textContent, 'the line is not right under the verdict').toBe(verdictFor(record, state.scenario))
    // The ledger keeps the full sentence.
    expect(container.querySelector('details')!.textContent).toContain(full(first, state, state.scenario))
  })

  it('names the first threat that landed, not the first threat, when one was held before it', () => {
    const { record, state } = recordWhere((r, after) => {
      const threats = r.events.filter((ev) => isThreat(ev.eventId))
      const first = threats.find((ev) => ev.effectiveSeverity > 0)
      return threats[0]?.effectiveSeverity === 0 && !!first && short(first, after, after.scenario) !== ''
    })
    renderAftermath(record, state)
    const first = record.events.find((ev) => isThreat(ev.eventId) && ev.effectiveSeverity > 0)!
    expect(line(), 'the verdict has no second line').not.toBeNull()
    expect(line()!.textContent).toBe(short(first, state, state.scenario))
  })

  it('follows the first threat that landed even when nothing was missing against it', () => {
    // The brief's rule as written: "the second line is short for the first
    // landed event". When every defense against that one was owned, short
    // is empty and the verdict has no second line, even if a later threat
    // that landed was missing one (the hit card still names it during
    // playback, and the ledger keeps the full sentence). Pinned so a
    // change to the rule comes here; raised for Ken in FIX batch 1.
    const { record, state } = recordWhere((r, after) => {
      const landed = r.events.filter((ev) => isThreat(ev.eventId) && ev.effectiveSeverity > 0)
      return landed.length > 1 && short(landed[0], after, after.scenario) === '' && landed.slice(1).some((ev) => short(ev, after, after.scenario) !== '')
    })
    renderAftermath(record, state)
    expect(container.textContent, 'the control: the aftermath did not render').toMatch(/AFTERMATH/)
    expect(line(), 'the verdict named a later threat than the first that landed').toBeNull()
  })

  it('has no second line on a turn nothing landed', () => {
    const { record, state } = recordWhere((r) => r.events.some((ev) => isThreat(ev.eventId)) && r.events.every((ev) => ev.effectiveSeverity === 0))
    renderAftermath(record, state)
    expect(container.textContent, 'the control: the aftermath did not render').toMatch(/AFTERMATH/)
    expect(line()).toBeNull()
  })
})
