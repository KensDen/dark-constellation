// @vitest-environment jsdom
//
// The board rendered (v1.2 R1, brief section 4; v1.3 R2, brief 5.3 and
// 5.4): the asset strip's columns and their tiles, the condition chips on
// the column heads, the one PROCURE sheet, EXECUTE on the dock, and the
// round's second guard, that PROCURE's DEFENSES never render a threat
// name from Countermeasure.counters the player has not earned (HARDEN's
// guard until v1.3 Round 0 merged HARDEN and INTEL into PROCURE). The
// fixture is the one tests/game.dom.spec.tsx documents; the same masking
// constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { ASSET_HEAL_PER_TURN, briefFree } from '../src/engine/rules'
import { turnRng } from '../src/engine/rng'
import { LAYERS, type GameState } from '../src/engine/types'
import { callSigns, cartCallSigns, turnBudget, vectorsOf } from '../src/ui/board/board'
import { assetPrice } from '../src/engine/scoring'
import { resolveLabel } from '../src/ui/board/actions'
import { PROCURE_KINDS, chipTurns } from '../src/ui/board/boardModel'
import Procure from '../src/ui/board/Procure'
import { vectorLabels } from '../src/ui/labels'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
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
  vi.restoreAllMocks()
})

function gameAt(turn: number, seed = 20260712): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

let mounts = 0
function render(state: GameState, phase: 'brief' | 'procure' | 'aftermath' = 'brief') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase }} onExit={() => {}} />)
  })
}

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const sheet = (id: string) => container.querySelector(`[data-sheet="${id}"]`)
const procureButton = () => container.querySelector('[data-dock] button[data-action="procure"]')!
const defenseTile = (id: string) => sheet('procure')!.querySelector(`button[data-procure-defense="${id}"]`)

describe('the board (v1.2 R1, v1.3 R2)', () => {
  it("GUARD (b): PROCURE's DEFENSES never render a threat name from Countermeasure.counters the player has not earned", () => {
    // Brief 4.4, the answer-key fix, as ruling R1 rewrote it: a defense may
    // name a threat the player has met on this device or tonight's intel
    // brief named, never another (tests/answer-key.spec.ts holds the
    // engine's key to that). The fixture has met nothing (fresh storage)
    // and its brief is not free, so with nothing ordered the sheet names
    // none: a defense says how many threats it stops and their vectors.
    // Every countered event's name, short and full, is checked against the
    // whole sheet's text, so a line in ASSETS, INTEL or a footnote would
    // fail it the same as the old "Answers:" line did. A saved 'procure'
    // phase opens PROCURE (the 'harden' phase left the save format with its
    // sheet in v1.3 Round 0).
    const state = gameAt(3)
    expect(briefFree(state), "the fixture's intel brief is free tonight, so the sheet may name its moves").toBe(false)
    render(state, 'procure')
    const procure = sheet('procure')
    expect(procure, 'the PROCURE sheet is not open').not.toBeNull()
    const defenses = procure!.querySelector('[data-procure-defenses]')
    expect(defenses, 'PROCURE has no DEFENSES section').not.toBeNull()
    const offeredText = defenses!.textContent ?? ''
    const text = procure!.textContent ?? ''
    // The positive controls, so the section cannot pass by being empty:
    // each countermeasure's name and blurb are there, and each one that
    // answers a threat says its vectors by their player-facing names on its
    // stops line. The retainer answers none; its own test below pins its
    // line. It stays in the leak check through the full list.
    // Since v1.6 R1 a card's blurb opens behind the key in its corner, and
    // its stops line is the tags' accessible name; each blurb opened is
    // read into the leak check below.
    let blurbs = ''
    for (const cm of DEFAULT_SCENARIO.countermeasures) {
      expect(offeredText, `${cm.id} is not offered`).toContain(cm.name)
      expect(offeredText, `${cm.id} shows its blurb before its key is tapped`).not.toContain(cm.blurb)
      click(procure!.querySelector(`button[data-procure-about="${cm.id}"]`)!)
      const blurb = procure!.querySelector(`[data-procure-blurb="${cm.id}"]`)?.textContent ?? ''
      expect(blurb, `${cm.id} has no blurb behind its key`).toContain(cm.blurb)
      blurbs += blurb
      if (cm.counters.length === 0) continue
      const stops = defenseTile(cm.id)!.querySelector('[data-stops]')!.getAttribute('aria-label') ?? ''
      // The debris call's defense stops nothing: it answers the call.
      if (cm.id === 'ssaManeuver') {
        expect(stops).toBe('Makes the debris call: exact odds, free burn.')
        continue
      }
      expect(stops, `${cm.id} does not count what it stops`).toMatch(/^Answers: \d+ threats? you have not met yet/)
      for (const v of vectorsOf(cm, DEFAULT_SCENARIO)) expect(stops, `${cm.id} does not say its vector ${v}`).toContain(vectorLabels[v].toUpperCase())
    }
    // And the guard itself.
    const leaked = (body: string) => {
      const out: string[] = []
      for (const cm of DEFAULT_SCENARIO.countermeasures) {
        for (const id of cm.counters) {
          const ev = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
          for (const name of [ev.name, ev.name.split(' (')[0]]) {
            if (body.includes(name)) out.push(`${cm.id} shows "${name}"`)
          }
        }
      }
      return out
    }
    expect(leaked(text + blurbs).join('\n'), 'the PROCURE sheet names the threats a defense answers').toBe('')
    // The control on the guard: ordering the brief earns tonight's names,
    // and the same check sees them, so it is not blind to a name.
    click(procure!.querySelector('button[data-procure-intel]')!)
    expect(leaked(sheet('procure')!.textContent ?? '').length, 'the brief named nothing, so the check above could be blind').toBeGreaterThan(0)
  })

  it("offers the IR retainer in PROCURE's DEFENSES, says what it does to recovery, and orders it (critique row M8)", () => {
    // The retainer decides more games than any other purchase and sat on
    // INTEL's second step, where a player who hardens fully never looked.
    // It moved to HARDEN, and with HARDEN into PROCURE's DEFENSES in v1.3
    // Round 0. Its stops line reads the scenario's two recovery rates. It
    // is a countermeasure like any other, so the tap queues it in the
    // turn's defenses and the engine adds it to state.counters.
    const state = gameAt(3)
    expect(state.counters.includes('irRetainer'), 'the fixture already owns the retainer').toBe(false)
    expect(briefFree(state), "the fixture's intel brief is free tonight, so its line is not an order").toBe(false)
    render(state, 'brief')
    click(procureButton())
    const { base, withIrRetainer } = DEFAULT_SCENARIO.recovery
    const tile = defenseTile('irRetainer')
    expect(tile, 'the retainer is not in DEFENSES').not.toBeNull()
    // Since v1.5 R1 it names the meters it speeds and says the assets' own
    // healing is the same either way (R6b's fresh eyes, item 3).
    expect(tile!.querySelector('[data-stops]')!.getAttribute('aria-label')).toBe(
      `Link, data and sensor health recover ${withIrRetainer} a turn instead of ${base}; damaged assets heal ${ASSET_HEAL_PER_TURN} a turn with or without it. Stops no move, and counts as the turn's new defense.`,
    )
    click(tile!)
    expect(defenseTile('irRetainer')!.getAttribute('aria-pressed'), 'the retainer did not queue').toBe('true')
    // One order, the retainer's: it does not order the intel brief beside
    // it on the same sheet. (The dock's badge has its own guard, R2 (e) in
    // tests/board-r2.dom.spec.tsx.)
    expect(sheet('procure')!.querySelector('button[data-confirm]')!.textContent, 'PROCURE does not count the queued retainer').toBe('CONFIRM 1 ORDER')
    const intel = sheet('procure')!.querySelector('button[data-procure-intel]')
    expect(intel, 'PROCURE has no INTEL order').not.toBeNull()
    expect(intel!.getAttribute('aria-pressed'), 'the retainer ordered the intel brief').toBe('false')
    // EXECUTE is a tap; the turn resolves on the click and the autosave
    // carries the next turn before any of the playback is seen.
    click(sheet('procure')!.querySelector('button[data-confirm]')!)
    const execute = container.querySelector('button[data-execute]')
    expect(execute, 'EXECUTE is not on screen').not.toBeNull()
    click(execute!)
    const saved = JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')
    expect(saved?.state.turn, 'the turn did not resolve').toBe(state.turn + 1)
    expect(saved.state.counters, 'the retainer ordered in DEFENSES was not added').toContain('irRetainer')
    // Read off the scenario, not written out: the sheet on a retuned
    // scenario says the retuned rates.
    const retuned = { ...DEFAULT_SCENARIO, recovery: { base: 3, withIrRetainer: 9 } }
    act(() => {
      root.render(
        <Procure
          state={{ ...state, scenario: retuned }}
          actions={NO_OP}
          focus={null}
          onToggleAsset={() => {}}
          onToggleCounter={() => {}}
          onOrderBrief={() => {}}
          onClose={() => {}}
          remaining={state.credits}
          cost={0}
          orders={0}
        />,
      )
    })
    // The line is the tags' accessible name, and the tag reads the rate.
    expect(defenseTile('irRetainer')!.querySelector('[data-stops]')!.getAttribute('aria-label')).toContain('Link, data and sensor health recover 9 a turn instead of 3;')
    expect(defenseTile('irRetainer')!.textContent).toContain('Recovery 9 a turn')
  })

  it('renders one tile per asset in its column of the strip, with the call sign and the exact integrity in its name', async () => {
    const state = gameAt(5)
    render(state, 'brief')
    const strip = container.querySelector('[data-strip]')
    expect(strip, 'no asset strip').not.toBeNull()
    for (const layer of LAYERS) {
      const column = strip!.querySelector(`[data-layer="${layer}"]`)
      expect(column, `no ${layer} column`).not.toBeNull()
      expect(column!.querySelector('h2')?.textContent).toBe(layer)
    }
    const signs = callSigns(state)
    for (const asset of state.assets) {
      const tile = [...container.querySelectorAll('button[data-asset-id]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${signs.get(asset.id)},`))
      expect(tile, `no tile for ${asset.id}`).toBeDefined()
      expect(tile!.getAttribute('aria-label')).toContain(`integrity ${asset.integrity}%`)
      expect(tile!.closest(`[data-layer="${asset.layer}"]`), `${asset.id} is on the wrong layer`).not.toBeNull()
    }
    // A transit tile per pending asset.
    for (const pending of state.pipeline) {
      const ghost = container.querySelector(`[data-asset-id="${pending.id}"][data-state="transit"]`)
      expect(ghost, `no transit tile for ${pending.id}`).not.toBeNull()
      expect(ghost!.textContent).toContain(`ETA ${pending.etaTurns}`)
    }
    // Tapping a tile opens its intel card (R3), which carries the exact
    // integrity the R1 detail line used to print; the card's chunk loads
    // on first open.
    const first = container.querySelector('button[data-asset-id]')!
    click(first)
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(container.querySelector('section[data-intel-card="tile"]')?.textContent).toMatch(/INTEGRITY\d+%/)
  })

  it('reads a condition\'s last turn LAST, never 0T or a stored 1T (v1.5 R1)', () => {
    // Stored 1: the night it last presses, on the board before it and in
    // play; stored 2 reads its turns left in the view's own count.
    expect(chipTurns(1, 0)).toBe('LAST')
    expect(chipTurns(1, 1)).toBe('LAST')
    expect(chipTurns(2, 1)).toBe('1T')
    expect(chipTurns(2, 2)).toBe('2T')
  })

  it('shows condition chips on the column head with the exact turns left', () => {
    // Find a turn with a live condition, over seeds since v1.6 R1: the
    // seed's order decides which nights leave one.
    let state = gameAt(1)
    for (let seed = 20260712; seed < 20260712 + 40 && state.conditions.length === 0; seed += 1)
      for (let turn = 2; turn <= DEFAULT_SCENARIO.totalTurns && state.conditions.length === 0; turn += 1) {
        const s = gameAt(turn, seed)
        if (s.status === 'playing' && s.turn === turn) state = s
      }
    expect(state.conditions.length, 'no condition reachable on this seed').toBeGreaterThan(0)
    render(state, 'brief')
    for (const c of state.conditions) {
      const def = DEFAULT_SCENARIO.events.find((e) => e.id === c.eventId)!
      for (const layer of def.layers) {
        // Read with the chip's no-break space (v1.3 R3: the turns stay with
        // their dot when a narrow column wraps the chip) as a space.
        const chips = [...container.querySelectorAll(`[data-strip] [data-layer="${layer}"] [data-condition-chip]`)].map((el) => el.textContent?.replace(/\u00a0/g, ' '))
        // The turns left since v1.3 Round 0 (brief 6.5 reverses v1.2 4.3's
        // "elapsed time only" on purpose: the player plans around the
        // clock), in R2's short form, JAMMED · 2T. Every condition has a
        // fixed clock, so the count is exact.
        expect(chips, `${c.name} on ${layer} is not chipped with its turns left`).toContain(`${c.name} · ${chipTurns(c.remainingTurns, c.remainingTurns)}`)
        // The count held to the name by no-break spaces (v1.5 R1: in the
        // narrow GROUND column "· 0T" wrapped onto a line of its own).
        const raw = [...container.querySelectorAll(`[data-strip] [data-layer="${layer}"] [data-condition-chip]`)].map((el) => el.textContent)
        expect(raw).toContain(`${c.name}\u00a0·\u00a0${chipTurns(c.remainingTurns, c.remainingTurns)}`)
      }
    }
    // Never an estimate: v1.2 marked the remaining span "~n left" when it
    // was a forecast of a random duration; v1.3's clocks are fixed, so a
    // tilde would tell the player it is a guess.
    expect(container.querySelector('[data-strip]')!.textContent, 'a chip shows its turns left as an estimate').not.toMatch(/~\s*\d/)
  })

  it('opens PROCURE as one sheet over its three sections and orders a drone to a queued tile', () => {
    // One sheet since v1.3 R2 (brief 5.4): ASSETS, DEFENSES (the IR
    // retainer among them) and INTEL, with no step header and no confirm
    // step; a tap orders, a second tap cancels, and the footer closes.
    const state = gameAt(2)
    render(state, 'brief')
    click(procureButton())
    const procure = sheet('procure')!
    expect(procure.textContent, 'a step header is back').not.toMatch(/STEP \d+ OF \d+/)
    expect(procure.querySelector('h2')!.textContent).toBe(`PROCURE · ${turnBudget(state)} CR LEFT`)
    expect([...procure.querySelectorAll('[data-procure-kind]')].map((b) => b.getAttribute('data-procure-kind')), 'PROCURE offers other assets').toEqual(PROCURE_KINDS)
    expect(procure.querySelector('[data-procure-defenses]')!.textContent, 'the retainer is not in DEFENSES').toMatch(/Incident response retainer/)
    // INTEL is the one intel brief since v1.3 Round 0 (D2 a), priced from
    // the scenario on a night it is not free; turn 2 of this fixture is not.
    expect(briefFree(state)).toBe(false)
    const intel = procure.querySelector('button[data-procure-intel]')
    expect(intel?.textContent, 'PROCURE has no INTEL order').toContain('Intel brief')
    // A cost chip, the whole card the tap (v1.6 R1: no link-style "+ ADD").
    expect(intel!.querySelector('[data-cost]')!.textContent).toBe(`${DEFAULT_SCENARIO.prices.intelBrief} CR`)
    expect(procure.textContent).not.toContain('+ ADD')
    // The drone: one tap orders it at its one price, and the sheet stays.
    const drone = procure.querySelector('[data-procure-kind="drone"]')!
    expect(drone.querySelector('[data-cost]')!.textContent).toBe(`${assetPrice(DEFAULT_SCENARIO, 'drone')} CR`)
    click(drone)
    expect(sheet('procure'), 'the sheet closed on a tap').toBe(procure)
    expect(drone.getAttribute('aria-pressed')).toBe('true')
    expect(drone.querySelector('[data-cost]')!.textContent).toBe(`${assetPrice(DEFAULT_SCENARIO, 'drone')} CR · ORDERED`)
    click(procure.querySelector('button[data-confirm]')!)
    // The sheet closes and the queued tile is on AIR, with its call sign:
    // the next drone ordinal, read off the fixture (v1.3's WIN_SCRIPT
    // orders a drone on turn 1, so turn 2 already flies three).
    expect(sheet('procure')).toBeNull()
    const [sign] = cartCallSigns(state, [{ kind: 'drone' }])
    expect(sign, 'the next drone is not a KESTREL').toMatch(/^KESTREL-\d+$/)
    const queued = container.querySelector(`[data-strip] [data-layer="AIR"] button[data-queued="drone"][aria-label^="Cancel the order for ${sign},"]`)
    expect(queued, 'the order did not become a queued tile on AIR').not.toBeNull()
    click(queued!)
    expect(container.querySelector('button[data-queued]'), 'the queued tile did not leave').toBeNull()
  })

  it('keeps EXECUTE a plain button on the dock with its accessible name', () => {
    // A tap since v1.3 Round 0: the hold went with the auto-advancing
    // director, so the control is a plain button. Since R2 it sits on the
    // dock beside PROCURE, prints EXECUTE and is named by resolveLabel.
    const state = gameAt(2)
    render(state, 'brief')
    const execute = container.querySelector('[data-dock] button[data-execute]')!
    expect(execute, 'EXECUTE is not on the dock').not.toBeNull()
    expect(execute.getAttribute('data-action')).toBe('resolve')
    expect(execute.getAttribute('type')).toBe('button')
    expect(execute.className).not.toMatch(/dc-hold/)
    expect(execute.textContent).toBe('EXECUTE')
    expect(execute.getAttribute('aria-label'), 'EXECUTE is not named by its label').toBe(resolveLabel(state.turn))
  })

  it('carries no developer parenthetical on any screen state a player reaches', async () => {
    for (const phase of ['brief', 'procure', 'aftermath'] as const) {
      render(gameAt(3), phase)
      expect(container.textContent, `"in this build" at ${phase}`).not.toMatch(/in this build/i)
    }
    // PROCURE with an order queued, and the TONIGHT card's full brief,
    // whose chunk loads on first open.
    render(gameAt(3), 'brief')
    click(container.querySelector('button[data-full-brief]')!)
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(container.querySelector('[data-brief-scroll]'), 'the full brief did not open').not.toBeNull()
    click(procureButton())
    click(container.querySelector('[data-procure-kind="sat"]')!)
    expect(container.querySelector('[data-procure-kind="sat"]')!.getAttribute('aria-pressed'), 'PROCURE did not order the sat').toBe('true')
    expect(container.textContent).not.toMatch(/in this build/i)
  })
})
