// @vitest-environment jsdom
//
// The board rendered (v1.2 R1, brief section 4): the layer panels and
// their tiles, the chips and defense icons on the headers, the sheets
// with their STEP n OF m headers, and the round's second guard, that the
// HARDEN sheet never renders a threat name from Countermeasure.counters.
// The fixture is the one tests/game.dom.spec.tsx documents; the same
// masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { LAYERS, type GameState } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { ACTIONS } from '../src/ui/board/actions'
import { PROCURE_STEPS } from '../src/ui/board/ProcureSheet'
import { HARDEN_STEPS } from '../src/ui/board/HardenSheet'
import { INTEL_STEPS } from '../src/ui/board/IntelSheet'
import { SURGE_STEPS } from '../src/ui/board/SurgeSheet'
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
function render(state: GameState, phase: 'brief' | 'procure' | 'harden' | 'aftermath' = 'brief') {
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
  it('GUARD (b): the HARDEN sheet never renders a threat name from Countermeasure.counters', () => {
    // Brief 4.4, the answer-key fix. A countermeasure shows its vector
    // icons and its blurb, not the names of the threats it answers; that
    // mapping stays in the Glossary. Every countered event's name, short
    // and full, is checked against the sheet's whole text, so a line in a
    // footnote or a title attribute would fail it the same as the old
    // "Answers:" line did.
    render(gameAt(3), 'harden')
    const harden = sheet('harden')
    expect(harden, 'the HARDEN sheet is not open').not.toBeNull()
    const text = harden!.textContent ?? ''
    const offered = DEFAULT_SCENARIO.countermeasures.filter((cm) => cm.id !== 'intelInvestment' && cm.id !== 'irRetainer')
    // The positive controls, so the sheet cannot pass by being empty: each
    // countermeasure's name and blurb are there, and each has at least one
    // vector icon with the vector's player-facing name as its alt text.
    for (const cm of offered) {
      expect(text, `${cm.id} is not offered`).toContain(cm.name)
      expect(text, `${cm.id} has no blurb`).toContain(cm.blurb)
    }
    const alts = [...harden!.querySelectorAll('img')].map((img) => img.getAttribute('alt') ?? '')
    expect(alts.length, 'no vector icons on the sheet').toBeGreaterThanOrEqual(offered.length)
    for (const alt of alts) expect(Object.values(vectorLabels), `an icon's alt text is not a vector: ${alt}`).toContain(alt)
    // And the guard itself.
    const leaked: string[] = []
    for (const cm of offered) {
      for (const id of cm.counters) {
        const ev = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
        for (const name of [ev.name, ev.name.split(' (')[0]]) {
          if (text.includes(name)) leaked.push(`${cm.id} shows "${name}"`)
        }
      }
    }
    expect(leaked.join('\n'), 'the HARDEN sheet names the threats a defense answers').toBe('')
  })

  it('renders one tile per asset on its layer, with the call sign and the exact integrity in its name', () => {
    const state = gameAt(5)
    render(state, 'brief')
    for (const layer of LAYERS) {
      const panel = container.querySelector(`[aria-labelledby="layer-${layer}"]`)
      expect(panel, `no ${layer} panel`).not.toBeNull()
      expect(panel!.querySelector('h2')?.textContent).toBe(layer)
    }
    const signs = callSigns(state)
    for (const asset of state.assets) {
      const tile = [...container.querySelectorAll('button[aria-pressed]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${signs.get(asset.id)},`))
      expect(tile, `no tile for ${asset.id}`).toBeDefined()
      expect(tile!.getAttribute('aria-label')).toContain(`integrity ${asset.integrity}%`)
      expect(tile!.closest(`[aria-labelledby="layer-${asset.layer}"]`), `${asset.id} is on the wrong layer`).not.toBeNull()
    }
    // A ghost per pending asset.
    for (const pending of state.pipeline) {
      expect(container.textContent).toContain(`ETA ${pending.etaTurns}`)
    }
    // Tapping a tile prints its full name and exact integrity.
    const first = container.querySelector('button[aria-pressed]')!
    click(first)
    expect(container.querySelector('[data-tile-detail]')?.textContent).toMatch(/integrity \d+%/)
  })

  it('shows condition chips on the layer header with elapsed time only', () => {
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
      }
    }
    // Never the remaining span below top intel (brief 4.3).
    if (state.intelLevel < 3) expect(container.textContent).not.toMatch(/~\d+ left/)
  })

  it('opens each sheet with a STEP n OF m header and walks PROCURE to a queued tile', () => {
    render(gameAt(2), 'brief')
    for (const [label, id, steps] of [
      ['PROCURE', 'procure', PROCURE_STEPS],
      ['HARDEN', 'harden', HARDEN_STEPS],
      ['INTEL', 'intel', INTEL_STEPS],
    ] as const) {
      click(byText(new RegExp(`^${label}`))!)
      expect(stepHeader(id), `${label} has no step header`).toEqual([1, steps])
    }
    // SURGE opens only when there is something to surge on; the bar says
    // why otherwise.
    const surge = byText(/^SURGE/)!
    if (surge.disabled) expect(surge.textContent).toMatch(/no tokens|no conditions/)
    else {
      click(surge)
      expect(stepHeader('surge')).toEqual([1, SURGE_STEPS])
    }
    // PROCURE: kind, tier, confirm, and the confirm carries the price.
    click(byText(/^PROCURE/)!)
    expect(stepHeader('procure')).toEqual([1, 3])
    click(container.querySelector('[data-procure-kind="drone"]')!)
    expect(stepHeader('procure')).toEqual([2, 3])
    click(container.querySelector('[data-procure-tier="B"]')!)
    expect(stepHeader('procure')).toEqual([3, 3])
    const confirm = container.querySelector('[data-procure-buy]')!
    expect(confirm.textContent).toMatch(/BUY · \d+ CR/)
    click(confirm)
    // The sheet closes and the queued tile is on AIR, with its call sign.
    expect(sheet('procure')).toBeNull()
    const queued = container.querySelector('[aria-labelledby="layer-AIR"] button[aria-label^="Remove KESTREL-3"]')
    expect(queued, 'the buy did not become a queued tile on AIR').not.toBeNull()
    expect(byText(/^PROCURE/)!.textContent).toContain('1 queued')
    click(queued!)
    expect(container.querySelector('button[aria-label^="Remove"]'), 'the queued tile did not leave').toBeNull()
  })

  it('keeps the RESOLVE control a hold control with its accessible name, and the bar five wide', () => {
    render(gameAt(2), 'brief')
    const bar = container.querySelector('nav[aria-label="Actions"]')!
    const labels = [...bar.querySelectorAll('button [data-label]')].map((b) => (b.textContent ?? '').trim())
    expect(labels).toEqual(ACTIONS.map((a) => a.label))
    const resolve = bar.querySelectorAll('button')[ACTIONS.findIndex((a) => a.sheet === null)]
    expect(resolve.className).toMatch(/dc-hold/)
    expect(resolve.textContent).toMatch(/Hold to resolve turn \d+/)
  })

  it('carries no developer parenthetical on any screen state a player reaches', () => {
    for (const phase of ['brief', 'procure', 'harden', 'aftermath'] as const) {
      render(gameAt(3), phase)
      expect(container.textContent, `"in this build" at ${phase}`).not.toMatch(/in this build/i)
    }
    render(gameAt(3), 'brief')
    click(byText(/^INTEL/)!)
    expect(container.textContent).not.toMatch(/in this build/i)
  })
})
