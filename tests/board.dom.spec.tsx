// @vitest-environment jsdom
//
// The board rendered (v1.2 R1, brief section 4): the layer panels and
// their tiles, the chips and defense icons on the headers, the sheets
// with their STEP n OF m headers, and the round's second guard, that the
// PROCURE sheet's DEFENSES never render a threat name from
// Countermeasure.counters (HARDEN's guard until v1.3 Round 0 merged HARDEN
// and INTEL into PROCURE). The fixture is the one tests/game.dom.spec.tsx
// documents; the same masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { briefFree } from '../src/engine/rules'
import { turnRng } from '../src/engine/rng'
import { LAYERS, type GameState } from '../src/engine/types'
import { callSigns, cartCallSigns } from '../src/ui/board/board'
import { assetPrice } from '../src/engine/scoring'
import { ACTIONS, resolveLabel } from '../src/ui/board/actions'
import ProcureSheet, { PROCURE_STEPS } from '../src/ui/board/ProcureSheet'
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

const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const sheet = (id: string) => container.querySelector(`[data-sheet="${id}"]`)
const stepHeader = (id: string) => sheet(id)?.textContent?.match(/STEP (\d+) OF (\d+)/)?.slice(1, 3).map(Number)

const shortNames = () => DEFAULT_SCENARIO.events.map((e) => e.name.split(' (')[0])

describe('the board (v1.2 R1)', () => {
  it("GUARD (b): PROCURE's DEFENSES never render a threat name from Countermeasure.counters", () => {
    // Brief 4.4, the answer-key fix. A countermeasure shows its vector
    // icons and its blurb, not the names of the threats it answers; that
    // mapping stays in the Glossary. The defenses were the HARDEN sheet
    // until v1.3 Round 0 merged it into PROCURE, so the positive controls
    // read the DEFENSES section, and every countered event's name, short
    // and full, is checked against the whole sheet's text, so a line in
    // ASSETS, INTEL or a footnote would fail it the same as the old
    // "Answers:" line did. (Ruling R1's earned answer key rewrites this
    // guard in a later step.) A saved 'procure' phase opens PROCURE (the
    // 'harden' phase left the save format with its sheet in v1.3 Round 0).
    render(gameAt(3), 'procure')
    const procure = sheet('procure')
    expect(procure, 'the PROCURE sheet is not open').not.toBeNull()
    const defenses = procure!.querySelector('[data-procure-defenses]')
    expect(defenses, 'PROCURE has no DEFENSES section').not.toBeNull()
    const offeredText = defenses!.textContent ?? ''
    const text = procure!.textContent ?? ''
    // The retainer is a defense like any other since v1.3 Round 0, but it
    // answers no threat, so it carries no vector icon, and its tile reads
    // the recovery line rather than its blurb (its own test below pins
    // that line). It stays in the leak check through the full list.
    const offered = DEFAULT_SCENARIO.countermeasures.filter((cm) => cm.id !== 'irRetainer')
    // The positive controls, so the section cannot pass by being empty:
    // each countermeasure's name and blurb are there, and each has at least
    // one vector icon with the vector's player-facing name as its alt text.
    for (const cm of offered) {
      expect(offeredText, `${cm.id} is not offered`).toContain(cm.name)
      expect(offeredText, `${cm.id} has no blurb`).toContain(cm.blurb)
    }
    const alts = [...defenses!.querySelectorAll('img')].map((img) => img.getAttribute('alt') ?? '')
    expect(alts.length, 'no vector icons in DEFENSES').toBeGreaterThanOrEqual(offered.length)
    for (const alt of alts) expect(Object.values(vectorLabels), `an icon's alt text is not a vector: ${alt}`).toContain(alt)
    // And the guard itself.
    const leaked: string[] = []
    for (const cm of DEFAULT_SCENARIO.countermeasures) {
      for (const id of cm.counters) {
        const ev = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
        for (const name of [ev.name, ev.name.split(' (')[0]]) {
          if (text.includes(name)) leaked.push(`${cm.id} shows "${name}"`)
        }
      }
    }
    expect(leaked.join('\n'), 'the PROCURE sheet names the threats a defense answers').toBe('')
  })

  it("offers the IR retainer in PROCURE's DEFENSES, says what it does to recovery, and buys it (critique row M8)", () => {
    // The retainer decides more games than any other purchase and sat on
    // INTEL's second step, where a player who hardens fully never looked.
    // It moved to HARDEN, and with HARDEN into PROCURE's DEFENSES in v1.3
    // Round 0. Its tile reads the scenario's two recovery rates. Since v1.3
    // Round 0 the retainer is a countermeasure like any other (no flag of
    // its own), so the tick queues it in the turn's defenses and the engine
    // buys it into state.counters.
    const state = gameAt(3)
    expect(state.counters.includes('irRetainer'), 'the fixture already owns the retainer').toBe(false)
    expect(briefFree(state), "the fixture's intel brief is free tonight, so its box is ticked before anything is queued").toBe(false)
    render(state, 'brief')
    click(byText(/^PROCURE/)!)
    const { base, withIrRetainer } = DEFAULT_SCENARIO.recovery
    const box = [...sheet('procure')!.querySelectorAll('[data-procure-defenses] input[type="checkbox"]')].find((b) =>
      /Incident response retainer/.test(b.closest('label')?.textContent ?? ''),
    ) as HTMLInputElement | undefined
    expect(box, 'the retainer is not in DEFENSES').toBeDefined()
    expect(box!.closest('label')!.textContent).toContain(
      `Recovers ${withIrRetainer} a turn on every meter instead of ${base}. Does not stop anything; shortens everything.`,
    )
    act(() => {
      box!.click()
    })
    expect(box!.checked, 'the retainer did not queue').toBe(true)
    // One order, the retainer's: it does not tick the intel brief beside
    // it on the same sheet.
    expect(byText(/^PROCURE/)!.textContent, 'PROCURE does not count the queued retainer').toContain('1 queued')
    const intel = sheet('procure')!.querySelector('[data-procure-intel] input[type="checkbox"]') as HTMLInputElement | null
    expect(intel, 'PROCURE has no INTEL order').not.toBeNull()
    expect(intel!.checked, 'the retainer ticked the intel order').toBe(false)
    // EXECUTE is a tap; the turn resolves on the click and the autosave
    // carries the next turn before any of the playback is seen.
    const execute = container.querySelector('button[data-execute]')
    expect(execute, 'EXECUTE is not on screen').not.toBeNull()
    click(execute!)
    const saved = JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')
    expect(saved?.state.turn, 'the turn did not resolve').toBe(state.turn + 1)
    expect(saved.state.counters, 'the retainer ticked in DEFENSES was not bought').toContain('irRetainer')
    // Read off the scenario, not written out: the sheet on a retuned
    // scenario says the retuned rates.
    const retuned = { ...DEFAULT_SCENARIO, recovery: { base: 3, withIrRetainer: 9 } }
    act(() => {
      root.render(
        <ProcureSheet
          scenario={retuned}
          state={state}
          step={1}
          pick={{}}
          onKind={() => {}}
          onBuy={() => {}}
          onBack={() => {}}
          onClose={() => {}}
          buyClass=""
          spendLine={null}
          queuedCounters={[]}
          onToggleCounter={() => {}}
          deniedClassFor={() => ''}
          intelChecked={false}
          onIntel={() => {}}
          intelClass=""
        />,
      )
    })
    expect(sheet('procure')!.querySelector('[data-procure-defenses]')!.textContent).toContain('Recovers 9 a turn on every meter instead of 3.')
  })

  it('renders one tile per asset on its layer, with the call sign and the exact integrity in its name', async () => {
    const state = gameAt(5)
    render(state, 'brief')
    for (const layer of LAYERS) {
      const panel = container.querySelector(`[aria-labelledby="layer-${layer}"]`)
      expect(panel, `no ${layer} panel`).not.toBeNull()
      expect(panel!.querySelector('h2')?.textContent).toBe(layer)
    }
    const signs = callSigns(state)
    for (const asset of state.assets) {
      const tile = [...container.querySelectorAll('button[data-asset-id]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${signs.get(asset.id)},`))
      expect(tile, `no tile for ${asset.id}`).toBeDefined()
      expect(tile!.getAttribute('aria-label')).toContain(`integrity ${asset.integrity}%`)
      expect(tile!.closest(`[aria-labelledby="layer-${asset.layer}"]`), `${asset.id} is on the wrong layer`).not.toBeNull()
    }
    // A ghost per pending asset.
    for (const pending of state.pipeline) {
      expect(container.textContent).toContain(`ETA ${pending.etaTurns}`)
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

  it('shows condition chips on the layer header with the elapsed time and the exact turns left', () => {
    // Find a turn with a live condition on this seed.
    let state = gameAt(1)
    while (state.status === 'playing' && state.conditions.length === 0) state = gameAt(state.turn + 1)
    expect(state.conditions.length, 'no condition reachable on this seed').toBeGreaterThan(0)
    render(state, 'brief')
    for (const c of state.conditions) {
      const def = DEFAULT_SCENARIO.events.find((e) => e.id === c.eventId)!
      for (const layer of def.layers) {
        const panel = container.querySelector(`[aria-labelledby="layer-${layer}"]`)!
        expect(panel.textContent, `${c.name} is not chipped on ${layer}`).toContain(c.name)
        expect(panel.textContent).toContain(`T+${state.turn - c.startedTurn}`)
        // The turns left since v1.3 Round 0 (brief 6.5 reverses v1.2 4.3's
        // "elapsed time only" on purpose: the player plans around the
        // clock). Every condition has a fixed clock, so the count is exact.
        expect(panel.textContent, `${c.name} on ${layer} does not show its turns left`).toContain(`${c.remainingTurns} left`)
      }
    }
    // Never an estimate: v1.2 marked the remaining span "~n left" when it
    // was a forecast of a random duration; v1.3's clocks are fixed, so a
    // tilde would tell the player it is a guess.
    expect(container.textContent, 'a chip shows its turns left as an estimate').not.toMatch(/~\d+ left/)
  })

  it('opens PROCURE with a STEP n OF m header over its three sections and walks it to a queued tile', () => {
    // One stepped sheet since v1.3 Round 0: HARDEN and INTEL are sections
    // of PROCURE's first step (DEFENSES, the IR retainer among them, and
    // INTEL), and SURGE left with its sheet. SYSTEM has its title and no
    // step header.
    const state = gameAt(2)
    render(state, 'brief')
    click(byText(/^PROCURE/)!)
    expect(stepHeader('procure'), 'PROCURE has no step header').toEqual([1, PROCURE_STEPS])
    expect(sheet('procure')!.querySelectorAll('[data-procure-kind]').length, 'PROCURE offers no assets').toBeGreaterThan(0)
    expect(sheet('procure')!.querySelector('[data-procure-defenses]')!.textContent, 'the retainer is not in DEFENSES').toMatch(/Incident response retainer/)
    // INTEL is the one intel brief since v1.3 Round 0 (D2 a), priced from
    // the scenario on a night it is not free; turn 2 of this fixture is not.
    expect(sheet('procure')!.querySelector('[data-procure-intel]')?.textContent, 'PROCURE has no INTEL order').toContain(
      `Intel brief (${DEFAULT_SCENARIO.prices.intelBrief} CR): names COLDVEIL's moves tonight`,
    )
    // PROCURE: kind, then the confirm, and the confirm carries the price.
    // The Tier A / Tier B step went with D2 (a): every asset is ordered at
    // the one price there is.
    click(container.querySelector('[data-procure-kind="drone"]')!)
    expect(stepHeader('procure')).toEqual([2, PROCURE_STEPS])
    expect(container.querySelector('[data-procure-tier]'), 'the tier step is back').toBeNull()
    const confirm = container.querySelector('[data-procure-buy]')!
    expect(confirm.textContent).toBe(`ORDER · ${assetPrice(DEFAULT_SCENARIO, 'drone')} CR`)
    click(confirm)
    // The sheet closes and the queued tile is on AIR, with its call sign:
    // the next drone ordinal, read off the fixture (v1.3's WIN_SCRIPT
    // orders a drone on turn 1, so turn 2 already flies three).
    expect(sheet('procure')).toBeNull()
    const [sign] = cartCallSigns(state, [{ kind: 'drone' }])
    expect(sign, 'the next drone is not a KESTREL').toMatch(/^KESTREL-\d+$/)
    const queued = container.querySelector(`[aria-labelledby="layer-AIR"] button[aria-label^="Remove ${sign},"]`)
    expect(queued, 'the buy did not become a queued tile on AIR').not.toBeNull()
    expect(byText(/^PROCURE/)!.textContent).toContain('1 queued')
    click(queued!)
    expect(container.querySelector('button[aria-label^="Remove"]'), 'the queued tile did not leave').toBeNull()
  })

  it('keeps EXECUTE a plain button with its accessible name, full width under the row of steps', () => {
    // Since R2b the steps are one row and the commit is full width under
    // it, in its own slot. A tap since v1.3 Round 0: the hold went with
    // the auto-advancing director, so the control is a plain button whose
    // name is its label.
    const state = gameAt(2)
    render(state, 'brief')
    const bar = container.querySelector('nav[aria-label="Actions"]')!
    const labels = [...bar.querySelectorAll('button[data-action] [data-label]')].map((b) => (b.textContent ?? '').trim())
    expect(labels).toEqual(ACTIONS.filter((a) => a.sheet !== null).map((a) => a.label))
    const commit = ACTIONS.find((a) => a.sheet === null)!
    const execute = bar.querySelector(`[data-action="${commit.id}"] button`)!
    expect(execute.hasAttribute('data-execute'), 'the commit slot does not hold EXECUTE').toBe(true)
    expect(execute.getAttribute('type')).toBe('button')
    expect(execute.className).not.toMatch(/dc-hold/)
    expect(execute.className).toMatch(/w-full/)
    expect(execute.getAttribute('aria-label') ?? execute.textContent, 'EXECUTE is not named by its label').toBe(resolveLabel(state.turn))
  })

  it('carries no developer parenthetical on any screen state a player reaches', () => {
    for (const phase of ['brief', 'procure', 'aftermath'] as const) {
      render(gameAt(3), phase)
      expect(container.textContent, `"in this build" at ${phase}`).not.toMatch(/in this build/i)
    }
    // The phases above open PROCURE at its first step, INTEL among its
    // sections; its second step, the confirm, is reached by picking a kind.
    render(gameAt(3), 'brief')
    click(byText(/^PROCURE/)!)
    click(container.querySelector('[data-procure-kind="sat"]')!)
    expect(stepHeader('procure'), 'PROCURE did not reach its confirm').toEqual([2, PROCURE_STEPS])
    expect(container.textContent).not.toMatch(/in this build/i)
  })
})
