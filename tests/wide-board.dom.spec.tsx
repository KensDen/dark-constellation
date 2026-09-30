// @vitest-environment jsdom
//
// The wide board (v1.2 R6, brief 4.6): the three-column layout on a screen
// 1024 wide and up and its F1 to F5 keys. GUARD R6 (a), that none of it
// reaches a phone, is tests/wide-board-load.dom.spec.tsx; the keys'
// derivation from the array's numbers is tests/wide-keys-renumbered.dom
// .spec.tsx; a chunk that fails to load is tests/wide-fallback.dom.spec.tsx.
//
// jsdom lays nothing out, so the geometry (the beam across columns, the
// panel's place, ORBIT legibility at 1024) is checked in a browser and
// recorded in the round's report (principle 13). What this file holds is
// the markup, the keys, the data each column reads, and a stylesheet whose
// rules are applied here by hand and read back through computed style.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import IntelCard from '../src/ui/board/IntelCard'
import ActionBar from '../src/ui/board/ActionBar'
import SurgeSheet from '../src/ui/board/SurgeSheet'
import { ACTIONS, fKeyOf, type BoardAction } from '../src/ui/board/actions'
import { briefCopy } from '../src/ui/brief'
import { WIDE_QUERY } from '../src/ui/cues/motion'
import { OPS_LOG_TURNS, opsLogCopy, opsLogRows } from '../src/ui/board/wide'
import { kindLabels } from '../src/ui/labels'
import { verdictFor } from '../src/ui/verdict'
import { DEFAULT_SCENARIO } from '../src/content'
import { effectiveIntel, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { LIMB, PX } from '../src/ui/sprites/scenery'
import { NO_OP, TOP_INTEL_SCRIPT } from './scripts'
import {
  bar,
  beatText,
  chips,
  click,
  conditionFixture,
  container,
  gameAt,
  hold,
  installWideBoardHarness,
  press,
  render,
  resolveNow,
  root,
  setWide,
  settle,
  sheetOpen,
  step,
} from './wideHarness'

installWideBoardHarness()

const WIDE_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'board', 'wide.css')
const CSS = readFileSync(WIDE_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// The stylesheet, applied by hand: its one width query rewritten to hold
// (or not), since jsdom evaluates no media query.
function applyCss(wide: boolean) {
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  const css = CSS.replaceAll(`@media ${WIDE_QUERY}`, wide ? '@media all' : '@media not all')
  expect(css.includes('min-width'), 'a form of the width query this test does not state').toBe(false)
  const style = document.createElement('style')
  style.setAttribute('data-test-css', '')
  style.textContent = css
  document.head.appendChild(style)
  return style.sheet!
}
const tileOf = (id: string) => container.querySelector(`button[data-asset-id="${id}"]`) as HTMLButtonElement
const inspector = () => container.querySelector('[data-inspector]')!

describe('GUARD R6 (b): no new global keydown listener', () => {
  // Every keydown listener live on window and document, added minus removed,
  // each wrapped so the test knows which one took a key. Game registers
  // its board handler afresh on each render, so "the same handler" is the
  // same code, not the same function object.
  function trackKeydown() {
    const live: { t: EventTarget; fn: unknown; capture: boolean }[] = []
    const takers: string[] = []
    const wrappers = new Map<unknown, EventListener>()
    const wrap = (fn: EventListener) => {
      if (!wrappers.has(fn)) {
        wrappers.set(fn, function (this: unknown, e: Event) {
          const was = e.defaultPrevented
          fn.call(this, e)
          if (!was && e.defaultPrevented) takers.push(String(fn))
        })
      }
      return wrappers.get(fn)!
    }
    for (const t of [window, document] as EventTarget[]) {
      const add = t.addEventListener.bind(t)
      const remove = t.removeEventListener.bind(t)
      vi.spyOn(t, 'addEventListener').mockImplementation((type: string, fn: never, opts?: boolean | AddEventListenerOptions) => {
        const capture = typeof opts === 'boolean' ? opts : !!opts?.capture
        if (type !== 'keydown' || typeof fn !== 'function') return add(type, fn, opts)
        if (!live.some((l) => l.t === t && l.fn === fn && l.capture === capture)) live.push({ t, fn, capture })
        add(type, wrap(fn), opts)
      })
      vi.spyOn(t, 'removeEventListener').mockImplementation((type: string, fn: never, opts?: boolean | EventListenerOptions) => {
        const capture = typeof opts === 'boolean' ? opts : !!opts?.capture
        if (type !== 'keydown' || typeof fn !== 'function') return remove(type, fn, opts)
        const i = live.findIndex((l) => l.t === t && l.fn === fn && l.capture === capture)
        if (i >= 0) live.splice(i, 1)
        remove(type, wrappers.get(fn) ?? fn, opts)
      })
    }
    return { live, takers }
  }

  it('the wide board listens with exactly the listeners the phone board has, and one of them takes the F keys', async () => {
    const { live, takers } = trackKeydown()
    render(gameAt(2))
    await settle()
    step(10_000)
    const phone = live.length
    expect(phone, 'the tracker saw no listener at all, so it proves nothing').toBeGreaterThan(0)
    const first = ACTIONS.find((a) => a.sheet)!
    expect(press(first.hotkey)).toBe(true)
    press(first.hotkey)
    const digitTaker = takers.at(-1)
    expect(digitTaker, 'the tracker did not see the digit taken').toBeDefined()
    setWide(true)
    await settle()
    step(10_000)
    expect(container.querySelector('[data-inspector]'), 'the wide board is not up').not.toBeNull()
    expect(live.length, 'the wide board added a keydown listener').toBe(phone)
    // The F key is taken by the handler that takes the digits, whatever
    // else is listening: a second handler registered at every width keeps
    // the count equal and fails here.
    expect(press(fKeyOf(first))).toBe(true)
    press(fKeyOf(first))
    expect(takers.at(-1), 'the F key was taken by another listener').toBe(digitTaker)
    // The positive control: the playback's own listener is seen.
    resolveNow()
    step(100)
    expect(beatText(), 'not in playback').not.toBeNull()
    expect(live.length, 'the tracker missed the playback listener').toBe(phone + 1)
  })
})

describe('GUARD R6 (c): F1 to F5 drive the five actions through the one array', () => {
  it('on a wide screen each F key does what its digit does, the digits still work, and a key past the array does nothing', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    for (const key of [fKeyOf, (a: BoardAction) => a.hotkey]) {
      for (const a of ACTIONS) {
        if (a.sheet) {
          expect(press(key(a)), `${key(a)} was not taken`).toBe(true)
          expect(sheetOpen(a.sheet), `${key(a)} did not open ${a.sheet}`).toBe(true)
          expect(press(key(a))).toBe(true)
          expect(sheetOpen(a.sheet), `${key(a)} again did not close ${a.sheet}`).toBe(false)
        } else {
          // RESOLVE's key focuses the hold and never commits: a keypress
          // cannot hold, and a turn should not end on a stray key.
          ;(document.activeElement as HTMLElement | null)?.blur()
          expect(press(key(a))).toBe(true)
          expect(document.activeElement, `${key(a)} did not focus the hold`).toBe(hold())
          expect(beatText(), `${key(a)} committed the turn`).toBeNull()
        }
      }
    }
    const past = `F${Math.max(...ACTIONS.map((a) => a.number)) + 1}`
    expect(press(past), `${past} is bound to nothing and was taken`).toBe(false)
  })

  it('a held F key acts once, and its repeats are still taken, so a held F5 cannot reload the page', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    const first = ACTIONS.find((a) => a.sheet)!
    expect(press(fKeyOf(first))).toBe(true)
    expect(press(fKeyOf(first), { repeat: true }), 'a repeat went to the browser').toBe(true)
    expect(sheetOpen(first.sheet!), 'a repeat toggled the sheet shut').toBe(true)
    press(fKeyOf(first))
    const commit = ACTIONS.find((a) => !a.sheet)!
    expect(press(fKeyOf(commit))).toBe(true)
    expect(press(fKeyOf(commit), { repeat: true }), 'a held F5 went to the browser').toBe(true)
    expect(beatText(), 'a held key committed the turn').toBeNull()
    // The digits' repeats are left alone, as they always were.
    expect(press(first.hotkey, { repeat: true })).toBe(false)
  })

  it("on a phone the F keys stay the browser's, while the digits still work", async () => {
    render(gameAt(2))
    await settle()
    for (const a of ACTIONS) {
      expect(press(fKeyOf(a)), `${fKeyOf(a)} was taken on a phone`).toBe(false)
      expect(press(fKeyOf(a), { repeat: true }), `${fKeyOf(a)} repeat was taken on a phone`).toBe(false)
      expect(container.querySelector('[data-sheet]')).toBeNull()
    }
    const first = ACTIONS.find((a) => a.sheet)!
    expect(press(first.hotkey), 'the digit positive control').toBe(true)
    expect(sheetOpen(first.sheet!)).toBe(true)
  })

  it('pins the vocabulary as brief 4.6 writes it', () => {
    expect(ACTIONS.map(fKeyOf)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    expect(WIDE_QUERY).toBe('(min-width: 1024px)')
  })
})

describe('GUARD R6 (d): the keys stand down when they must, and the chips with them', () => {
  // Whether each F key is live right now, pressed and undone.
  function liveKeys(): boolean[] {
    return ACTIONS.map((a) => {
      const taken = press(fKeyOf(a))
      if (taken && a.sheet && sheetOpen(a.sheet)) press(fKeyOf(a))
      return taken
    })
  }
  const chipsShown = () => ACTIONS.map((a) => chips().includes(fKeyOf(a)))
  const all = ACTIONS.map(() => true)
  const none = ACTIONS.map(() => false)

  it('live while deciding, with the chips showing and announced (the positive control)', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    expect(chipsShown()).toEqual(all)
    expect(liveKeys()).toEqual(all)
    for (const a of ACTIONS) {
      const control = a.sheet ? bar().querySelector(`button[data-action="${a.id}"]`) : hold()
      expect(control!.getAttribute('aria-keyshortcuts'), a.id).toBe(`${fKeyOf(a)} ${a.hotkey}`)
    }
  })

  it('down during playback and the aftermath, and the chips are gone', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    resolveNow()
    step(100)
    expect(beatText(), 'not in playback').not.toBeNull()
    expect(chipsShown()).toEqual(none)
    expect(liveKeys()).toEqual(none)
    step(120_000)
    expect(beatText(), 'still in playback').toBeNull()
    expect(bar().textContent).toMatch(/NEXT TURN/)
    expect(chipsShown()).toEqual(none)
    expect(liveKeys()).toEqual(none)
  })

  it('down with a modifier, so Shift+F5 still reloads', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    for (const a of ACTIONS) {
      for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
        expect(press(fKeyOf(a), init), `${fKeyOf(a)} ${JSON.stringify(init)}`).toBe(false)
      }
    }
  })

  it('down with the intel card or the Glossary open, chips and all', async () => {
    // A turn whose banner carries a technique tag, the Glossary's way in:
    // the tag shows at the intel only the top-intel line buys.
    const at = (t: number) => gameAt(t, 20260712, TOP_INTEL_SCRIPT)
    let turn = 1
    while (turn <= DEFAULT_SCENARIO.totalTurns && !briefCopy(at(turn)).tag) turn += 1
    expect(turn, 'no turn of the top-intel line shows a technique tag').toBeLessThanOrEqual(DEFAULT_SCENARIO.totalTurns)
    setWide(true)
    render(at(turn))
    await settle()
    expect(liveKeys(), 'the control: live before any dialog').toEqual(all)
    click(container.querySelector('button[aria-label="Threat intel"]')!)
    await settle()
    expect(container.querySelector('section[data-intel-card]')).not.toBeNull()
    expect(liveKeys()).toEqual(none)
    expect(chipsShown()).toEqual(none)
    press('Escape')
    expect(container.querySelector('section[data-intel-card]')).toBeNull()
    click(container.querySelector('[data-technique-tag]')!)
    await settle()
    expect(container.querySelector('[data-glossary-overlay]'), 'the Glossary did not open').not.toBeNull()
    expect(liveKeys()).toEqual(none)
    expect(chipsShown()).toEqual(none)
  })

  it('down on the score screen, which is not the board', async () => {
    setWide(true)
    render(gameAt(Infinity), 'brief')
    await settle()
    expect(container.querySelector('main[data-board]'), 'the fixture is on the board').toBeNull()
    // The F keys hold here by construction (no inspector, so not laid
    // out); the digit is the guard for the status check, since before R6
    // it reached for sheets that were not there.
    expect(liveKeys()).toEqual(none)
    expect(press(ACTIONS[0].hotkey)).toBe(false)
  })

  it('down in a text field; an F key is taken from a checkbox a sheet left focused, a digit is not', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    const text = document.createElement('input')
    text.type = 'text'
    container.appendChild(text)
    const box = document.createElement('input')
    box.type = 'checkbox'
    container.appendChild(box)
    const first = ACTIONS.find((a) => a.sheet)!
    expect(press(fKeyOf(first), {}, text), 'a key typed into a text field was taken').toBe(false)
    expect(press(fKeyOf(first), {}, box), 'a checkbox with focus swallowed the F key').toBe(true)
    press(fKeyOf(first))
    // The control: a digit from the checkbox is left alone, as it always was.
    expect(press(first.hotkey, {}, box), 'the digit from a checkbox changed with R6').toBe(false)
  })

  it('the chips move with their actions when the array is reordered', () => {
    // Rotated AND renumbered, so a chip spelled by position or by id in
    // the bar, rather than read from the action, is a chip that is wrong.
    const rotated: BoardAction[] = [...ACTIONS.slice(1), ACTIONS[0]].map((a, i) => ({ ...a, number: 11 + i }))
    act(() => {
      root.render(
        <ActionBar
          actions={rotated}
          phase="deciding"
          openSheet={null}
          done={new Set()}
          objective={{ tag: 'T', sentence: 'S', step: null }}
          onToggle={() => {}}
          disabledFor={() => false}
          captionFor={() => ''}
          resolve={() => <button type="button">R</button>}
          nextLabel="NEXT TURN"
          onNext={() => {}}
          pulseNext={false}
          keyChips
        />,
      )
    })
    const slots = [...container.querySelectorAll('[data-action]')]
    expect(slots.length).toBe(rotated.length)
    for (const slot of slots) {
      const a = rotated.find((x) => x.id === slot.getAttribute('data-action'))!
      expect(slot.querySelector('[data-step]')!.textContent).toBe(fKeyOf(a))
      // The digit is untouched: the chip replaces the badge, not the key.
      expect(slot.getAttribute('data-hotkey')).toBe(a.hotkey)
    }
  })
})

describe('GUARD R6 (e): the inspector says what the tile card says, and leaves the board live', () => {
  // A condition line as each surface prints it.
  const lines = (root: Element, sel: string) =>
    [...root.querySelectorAll(sel)].map((li) => li.querySelector('p')!.textContent!.replace(/\s+/g, ' ').trim()).sort()

  for (const intel of [0, 3] as const) {
    it(`at intel ${intel}: title, integrity and each condition line match the card's, on a damaged tile`, async () => {
      const { base, asset } = conditionFixture()
      // Damaged, so a constant 100% or a missing state word cannot pass.
      const state = { ...base, intelLevel: intel, assets: base.assets.map((a) => (a.id === asset.id ? { ...a, integrity: 40 } : a)) }
      setWide(true)
      render(state)
      await settle()
      click(tileOf(asset.id))
      // The card, rendered alone from the same state.
      const cardHost = document.createElement('div')
      document.body.appendChild(cardHost)
      const cardRoot = createRoot(cardHost)
      act(() => cardRoot.render(<IntelCard subject={{ kind: 'tile', assetId: asset.id }} state={state} turn={state.turn} onClose={() => {}} />))
      const card = cardHost.querySelector('section[data-intel-card="tile"]')!
      const cardLines = lines(card, 'li[data-intel-condition]')
      expect(cardLines.length, 'the fixture has no condition on the tile layer').toBeGreaterThan(0)
      expect(lines(inspector(), 'li[data-inspector-condition]')).toEqual(cardLines)
      expect(inspector().querySelector('[data-inspector-title]')!.textContent).toBe(card.querySelector('#intel-title')!.textContent)
      // Exactly what the tile itself says of its integrity.
      const said = tileOf(asset.id).getAttribute('aria-label')!.match(/integrity (\d+%.*)$/)![1]
      expect(said).toMatch(/^40%, \w/)
      expect(inspector().querySelector('[data-inspector-integrity]')!.textContent).toBe(`INTEGRITY ${said}`)
      const estimate = /~\d+ left/.test(inspector().textContent ?? '')
      expect(estimate, 'the estimate follows effective intel').toBe(effectiveIntel(state) >= 3)
      act(() => cardRoot.unmount())
      cardHost.remove()
    })
  }

  it('selecting a tile leaves the board live: no dialog, no inert, the keys still on, and says where it went', async () => {
    const { base, asset } = conditionFixture()
    setWide(true)
    render(base)
    await settle()
    const tile = tileOf(asset.id)
    expect(tile.getAttribute('aria-haspopup'), 'a wide tile still promises a dialog').toBeNull()
    expect(tile.getAttribute('aria-controls')).toBe(inspector().id)
    click(tile)
    await settle()
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    expect(inspector().querySelector('[aria-live="polite"]')!.textContent).toBe(inspector().querySelector('[data-inspector-title]')!.textContent)
    expect(container.querySelector('section[data-intel-card]'), 'a tap on a wide screen opened the modal card').toBeNull()
    expect(container.querySelector('main')!.hasAttribute('inert')).toBe(false)
    const first = ACTIONS.find((a) => a.sheet)!
    expect(press(fKeyOf(first)), 'the keys went down with a tile selected').toBe(true)
    // A second tap lets it go.
    press(fKeyOf(first))
    click(tile)
    expect(tile.getAttribute('aria-pressed')).toBe('false')
  })

  it('marks nothing as targeted before RESOLVE, and draws the selection in the go colour', async () => {
    const { base, asset } = conditionFixture()
    setWide(true)
    render(base)
    await settle()
    click(tileOf(asset.id))
    expect(container.querySelector('[data-struck], [data-sprite="lock-on"], [data-strobe]')).toBeNull()
    const selected = tileOf(asset.id)
    expect(selected.className).not.toMatch(/hostile|magenta/)
    expect(inspector().innerHTML).not.toMatch(/hostile|magenta|lock-on/)
    applyCss(true)
    const drawn = getComputedStyle(selected).boxShadow
    expect(drawn, 'the stylesheet does not draw the selection').toContain('--dc-go')
    expect(drawn).not.toMatch(/hostile/)
    // Nothing in the columns that the beam or the dialog opener look up by
    // first match, so neither can land on a column instead of the board.
    for (const aside of container.querySelectorAll('[data-ops-log], [data-inspector]')) {
      expect(aside.querySelector('[data-asset-id], svg[data-sprite="coldveil"], [data-beat-card], section[aria-labelledby^="layer-"], #intel-title')).toBeNull()
    }
  })

  it('PROCURE lands at the tier step for its kind, SURGE at the confirm for its condition, each taking focus and giving it back', async () => {
    const { base, asset } = conditionFixture()
    const state = { ...base, surgeTokens: Math.max(1, base.surgeTokens) }
    setWide(true)
    render(state)
    await settle()
    click(tileOf(asset.id))
    const procure = inspector().querySelector('[data-inspector-procure]') as HTMLButtonElement
    expect(procure.getAttribute('aria-label')).toBe(`PROCURE ${kindLabels[asset.kind]}`)
    procure.focus()
    click(procure)
    const sheet = () => container.querySelector('[data-sheet]')!
    expect(sheet().getAttribute('aria-label')).toMatch(/PROCURE, step 2 of 3/)
    expect(sheet().textContent).toContain(kindLabels[asset.kind])
    expect(sheet().querySelector('[data-procure-tier]'), 'step 2 offers no tier').not.toBeNull()
    expect(sheet().contains(document.activeElement), 'focus stayed under the panel').toBe(true)
    press('Escape')
    expect(document.activeElement, 'focus did not come back to PROCURE').toBe(procure)
    const surge = inspector().querySelector('[data-inspector-surge]') as HTMLButtonElement
    const name = state.conditions.find((c) => c.instanceId === surge.getAttribute('data-inspector-surge'))!.name
    surge.focus()
    click(surge)
    expect(sheet().getAttribute('aria-label')).toMatch(/SURGE, step 2 of 2/)
    expect(sheet().querySelector('[data-surge-confirm]'), 'step 2 has no confirm').not.toBeNull()
    expect(sheet().textContent).toContain(name)
    expect(sheet().contains(document.activeElement)).toBe(true)
    // Confirmed, the condition is queued, and the inspector says so; a
    // second tap opens the step where UNDO is.
    click(sheet().querySelector('[data-surge-confirm]')!)
    const queued = inspector().querySelector('[data-inspector-surge]') as HTMLButtonElement
    expect(queued.textContent).toBe('SURGE QUEUED')
    expect(queued.getAttribute('aria-label')).toBe(`SURGE ${name}, queued`)
    click(queued)
    expect(sheet().getAttribute('aria-label')).toMatch(/SURGE, step 1 of 2/)
    expect(sheet().querySelector('[data-surge-undo]'), 'a queued condition did not open at UNDO').not.toBeNull()
  })

  it('INTEL CARD opens the inspected tile\'s card, and closing it gives focus back to INTEL CARD', async () => {
    const { base, assets } = conditionFixture()
    // Not the first asset, so a card opened for the wrong tile shows.
    const pick = assets.at(-1)!
    setWide(true)
    render(base)
    await settle()
    click(tileOf(pick.id))
    const open = inspector().querySelector('[data-inspector-intel]') as HTMLButtonElement
    open.focus()
    click(open)
    await settle()
    const card = container.querySelector('section[data-intel-card="tile"]')
    expect(card, 'INTEL CARD opened nothing').not.toBeNull()
    expect(card!.querySelector('#intel-title')!.textContent).toBe(inspector().querySelector('[data-inspector-title]')!.textContent)
    press('Escape')
    expect(container.querySelector('section[data-intel-card]')).toBeNull()
    expect(document.activeElement, 'focus went to the tile, where Enter lets the selection go').toBe(open)
  })

  it("its SURGE is disabled exactly where the sheet's is", async () => {
    const { base, asset } = conditionFixture()
    for (const tokens of [0, 1]) {
      const state = { ...base, surgeTokens: tokens }
      setWide(true)
      render(state)
      await settle()
      click(tileOf(asset.id))
      const inspected = [...container.querySelectorAll('[data-inspector-surge]')].map((b) => [b.getAttribute('data-inspector-surge'), (b as HTMLButtonElement).disabled] as const)
      expect(inspected.length).toBeGreaterThan(0)
      // The sheet, rendered alone for the same conditions and tokens.
      const host = document.createElement('div')
      document.body.appendChild(host)
      const sheetRoot = createRoot(host)
      act(() =>
        sheetRoot.render(
          <SurgeSheet
            options={state.conditions.map((c) => ({ condition: c, layers: [], elapsed: 0 }))}
            tokens={tokens}
            step={1}
            onPick={() => {}}
            onConfirm={() => {}}
            onUndo={() => {}}
            onBack={() => {}}
            onClose={() => {}}
          />,
        ),
      )
      const sheet = new Map([...host.querySelectorAll('[data-surge-condition]')].map((b) => [b.getAttribute('data-surge-condition'), (b as HTMLButtonElement).disabled]))
      for (const [id, disabled] of inspected) expect(disabled, `tokens ${tokens}, ${id}`).toBe(sheet.get(id!))
      act(() => sheetRoot.unmount())
      host.remove()
    }
  })

  it('narrowing past the breakpoint with focus in the inspector hands focus to the tile it showed', async () => {
    const { base, asset } = conditionFixture()
    setWide(true)
    render(base)
    await settle()
    click(tileOf(asset.id))
    ;(inspector().querySelector('[data-inspector-procure]') as HTMLButtonElement).focus()
    setWide(false)
    expect(container.querySelector('[data-inspector]')).toBeNull()
    expect(document.activeElement, 'focus fell to the page').toBe(tileOf(asset.id))
  })
})

describe('GUARD R6 (f): the ops log reads the history the board shows', () => {
  it('holds back the turn that is playing out, and shows it once played, each row as the record has it', async () => {
    const state = gameAt(4)
    setWide(true)
    render(state)
    await settle()
    const rows = () => [...container.querySelectorAll('[data-ops-row]')].map((r) => Number(r.getAttribute('data-ops-row')))
    const expected = (s: GameState) => s.history.slice(-OPS_LOG_TURNS).reverse().map((r) => r.turn)
    expect(rows()).toEqual(expected(state))
    expect(rows().length, 'the fixture has no history').toBeGreaterThan(0)
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    resolveNow()
    step(100)
    expect(beatText(), 'not in playback').not.toBeNull()
    expect(rows(), 'the log gave the turn away before it played').toEqual(expected(state))
    step(120_000)
    expect(rows()).toEqual(expected(after))
    // Each row's line and verdict, spelled here from the record itself.
    for (const r of after.history.slice(-OPS_LOG_TURNS)) {
      const row = container.querySelector(`[data-ops-row="${r.turn}"]`)!
      expect(row.querySelector('[data-ops-line]')!.textContent).toBe(`T${r.turn} MAI ${r.maiScore}`)
      expect(row.textContent).toContain(verdictFor(r, DEFAULT_SCENARIO))
    }
    // And the screen is the copy the reading diet counts, line for line.
    const onScreen = [...container.querySelectorAll('[data-ops-log] h2, [data-ops-log] p')].map((p) => p.textContent)
    expect(onScreen).toEqual(opsLogCopy(after))
    expect(opsLogRows(after).length).toBe(Math.min(after.history.length, OPS_LOG_TURNS))
  })
})

describe('GUARD R6 (e), during playback: the inspector shows the board the player sees, and offers nothing to do', () => {
  it('while a hit locks on the inspected tile, the inspector reads the integrity the tile shows, and its actions wait', async () => {
    // The first turn of the prepared line whose empty-cart resolution
    // damages an asset, found from the engine's own record.
    let turn = 1
    let target: string | undefined
    for (; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
      const s = gameAt(turn)
      const after = resolveTurn(s, NO_OP, turnRng(s.seed, s.turn))
      target = after.history[after.history.length - 1].events.find((e) => e.targetAssetId && e.effectiveSeverity > 0)?.targetAssetId
      if (target) break
    }
    expect(target, 'no turn of the prepared line lands a hit').toBeDefined()
    const state = gameAt(turn)
    setWide(true)
    render(state)
    await settle()
    click(tileOf(target!))
    const waiting = () =>
      [...inspector().querySelectorAll('[data-inspector-procure], [data-inspector-surge]')].map((b) => (b as HTMLButtonElement).disabled)
    expect(waiting().every((d) => !d), 'the control: live before RESOLVE').toBe(true)
    resolveNow()
    let locked = false
    for (let i = 0; i < 400 && !locked; i += 1) {
      step(25)
      locked = container.querySelector(`button[data-asset-id="${target}"][data-struck="lock"]`) !== null
    }
    expect(locked, 'the lock-on never came').toBe(true)
    const shownIntegrity = tileOf(target!).getAttribute('aria-label')!.match(/integrity (\d+)%/)![1]
    expect(inspector().querySelector('[data-inspector-integrity]')!.textContent).toContain(`${shownIntegrity}%`)
    const engine = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)).assets.find((a) => a.id === target)!.integrity
    expect(Number(shownIntegrity), 'the hit did not change the integrity, so this proves nothing').not.toBe(engine)
    expect(waiting().every((d) => d), 'an inspector action is live during playback').toBe(true)
    expect((inspector().querySelector('[data-inspector-intel]') as HTMLButtonElement).disabled, 'the card is always open to read').toBe(false)
    step(120_000)
    expect(bar().textContent).toMatch(/NEXT TURN/)
    expect(waiting().every((d) => d), 'an inspector action is live in the aftermath').toBe(true)
  })
})

describe('GUARD R6 (g): crossing the breakpoint remounts nothing', () => {
  it('a playback carries on at the same beat, on the same nodes, when the screen turns wide and back', async () => {
    render(gameAt(4))
    await settle()
    resolveNow()
    step(1500)
    const at = beatText()
    expect(at, 'not in playback').not.toBeNull()
    const main = container.querySelector('main[data-board]')!
    const nodes = () => [
      main.querySelector(':scope > div'),
      main.querySelector('section[aria-label="Threat forecast"]'),
      ...main.querySelectorAll('section[aria-labelledby^="layer-"]'),
      bar(),
    ]
    const before = nodes()
    expect(before.every(Boolean)).toBe(true)
    setWide(true)
    await settle()
    expect(main.hasAttribute('data-wide')).toBe(true)
    expect(beatText(), 'the playback restarted').toBe(at)
    nodes().forEach((n, i) => expect(n, `node ${i} was remounted`).toBe(before[i]))
    setWide(false)
    nodes().forEach((n, i) => expect(n, `node ${i} was remounted on the way back`).toBe(before[i]))
    expect(beatText()).toBe(at)
  })
})

describe('GUARD R6 (h): the stylesheet is the wide board and nothing else', () => {
  // Every style rule's selector list, at any depth, keyframes excepted.
  function selectors(rules: CSSRuleList): string[] {
    return [...rules].flatMap((r) =>
      r instanceof CSSStyleRule ? r.selectorText.split(',').map((s) => s.trim()) : r instanceof CSSMediaRule ? selectors(r.cssRules) : [],
    )
  }

  it('puts every rule inside the one width query, and scopes every selector to the wide board', () => {
    const sheet = applyCss(true)
    const stray = [...sheet.cssRules].filter((r) => !(r instanceof CSSMediaRule && r.media.mediaText === 'all'))
    expect(stray.map((r) => r.cssText.slice(0, 60))).toEqual([])
    const all = selectors(sheet.cssRules)
    expect(all.length, 'no selectors read, so this proves nothing').toBeGreaterThan(10)
    expect(all.filter((s) => !s.startsWith('main[data-board][data-wide]'))).toEqual([])
  })

  it('names nothing the rendered board lacks, so a rename cannot quietly unstyle it', async () => {
    // A board with history, a condition on the picked tile's layer and a
    // sheet open, so every part the sheet styles is on screen.
    const { base, asset } = conditionFixture()
    setWide(true)
    render(base)
    await settle()
    click(tileOf(asset.id))
    press(fKeyOf(ACTIONS[0]))
    expect(container.querySelector('[data-sheet]'), 'the fixture opened no sheet').not.toBeNull()
    const dead = selectors(applyCss(true).cssRules).filter((s) => document.querySelector(s) === null)
    expect(dead).toEqual([])
    // The negative control: the check can see a selector match nothing.
    expect(document.querySelector('main[data-board][data-wide] section[aria-labelledby="layer-NOWHERE"]')).toBeNull()
  })

  it('lays the board out in three columns, ORBIT four across and the sheets at the side, only when wide', async () => {
    setWide(true)
    render(gameAt(2))
    await settle()
    const main = container.querySelector('main[data-board]')!
    const body = main.querySelector(':scope > div')!
    const orbit = container.querySelector('section[aria-labelledby="layer-ORBIT"] > .grid')!
    press(fKeyOf(ACTIONS[0]))
    const sheet = container.querySelector('[data-sheet]')!
    applyCss(true)
    const cols = getComputedStyle(body).gridTemplateColumns.split(' ')
    expect(cols[0]).toBe('300px')
    expect(cols[cols.length - 1]).toBe('300px')
    expect(getComputedStyle(orbit).gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
    expect(getComputedStyle(sheet).width).toBe('375px')
    const maxWidth = Number.parseFloat(getComputedStyle(main).maxWidth)
    expect(maxWidth - 600, 'the centre is wider than the ORBIT limb').toBeLessThanOrEqual(LIMB.cols * PX)
    for (const [el, col] of [
      [main.querySelector('section[aria-label="Threat forecast"]')!, '1'],
      [main.querySelector('[data-ops-log]')!, '1'],
      [body.querySelector(':scope > div')!, '2'],
      [main.querySelector('[data-inspector]')!, '3'],
    ] as const) {
      expect(getComputedStyle(el).gridColumn, `${el.tagName} ${el.getAttribute('aria-label') ?? ''}`).toBe(col)
    }
    applyCss(false)
    expect(getComputedStyle(body).display).not.toBe('grid')
    expect(getComputedStyle(orbit).gridTemplateColumns).not.toBe('repeat(4, minmax(0, 1fr))')
    expect(getComputedStyle(sheet).width).not.toBe('375px')
  })
})
