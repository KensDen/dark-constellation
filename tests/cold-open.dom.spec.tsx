// @vitest-environment jsdom
//
// The cold open (v1.2 R4, brief 6). The round's guards, every one walked
// over SLIDES rather than over a count written here (principle 17):
//   (a) under reduced motion no dissolve or loop runs, and every line is
//       whole on the first paint of its slide (the central guard);
//   (b) a tap mid-line finishes it and the next tap moves on; SKIP,
//       Escape and BEGIN on the last slide set dc-intro-seen, and a
//       BRIEFING replay from the menu leaves it as it was;
//   (c) every slide has a scene, with one loop, and at least one line.
// And the music starts on the first gesture and never before, builds as
// the slides go, and goes back to the menu's bed on the way out.
//
// For (a), jsdom runs the real cascade over the real stylesheets (the
// board's idle life in src/index.css, the cold open's own in
// src/ui/coldOpen.css) but evaluates no media feature, so the two
// reduced-motion conditions are stated by rewriting them, as
// tests/sprites.dom.spec.tsx does and says why at length.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import IntroSequence from '../src/ui/IntroSequence'
import ColdOpenScene from '../src/ui/ColdOpenScene'
import { CLICK_EVERY, CROSSFADE_MS, DISSOLVE_MS, MS_PER_CHAR, SLIDES } from '../src/ui/coldOpenSlides'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { MENU_MUSIC_STATE, MUSIC_LAYERS, coldOpenMusicState, getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext, type FakeGain } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const STYLESHEETS = [join(SRC, 'index.css'), join(SRC, 'ui', 'coldOpen.css')].map((f) => readFileSync(f, 'utf8'))

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let done: number

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
  installFakeAudioContext()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  unlisten = installGestureUnlock()
  done = 0
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderIntro(replay = false) {
  act(() => {
    root.render(<IntroSequence replay={replay} onDone={() => (done += 1)} />)
  })
}
const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
// Time passing as the browser passes it: a timer at a time, with React
// flushing between them. One act over the whole span would batch every
// render to its end, and the typing, which schedules each character from
// the render of the last, would stop at the first.
const pass = (ms: number) => {
  for (let t = 0; t < ms; t += MS_PER_CHAR) step(Math.min(MS_PER_CHAR, ms - t))
}
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const press = (key: string) => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}
const textOf = (i: number) => SLIDES[i].lines.join(' ')
const line = () => container.querySelector('[data-cold-open-line]')!.textContent
const slideShown = () => Number(container.querySelector('[data-cold-open-slide]')!.getAttribute('data-cold-open-slide'))
const tap = () => click(container.querySelector('[data-cold-open-slide]')!)
const button = (name: string) => {
  // The menu's buttons carry their function key beside the label.
  const found = [...container.querySelectorAll('button')].find(
    (b) => b.textContent!.trim() === name || [...b.querySelectorAll('span')].some((s) => s.textContent!.trim() === name),
  )
  if (!found) throw new Error(`no ${name} button`)
  return found
}
// The scene on screen, not the one crossfading away over it.
const currentScene = () => container.querySelector('[data-cold-open-stage] > [data-scene]:not([data-leaving])')!
const currentLoop = () => currentScene().querySelector('[data-loop]')!
const leavingScene = () => container.querySelector('[data-cold-open-stage] > [data-scene][data-leaving]')

// Everything the DOM went through, not only where it ended. act() flushes
// every effect before it returns, so the DOM a test reads afterwards is
// the settled one: a slide painted empty and filled by an effect a moment
// later reads as whole. The mutation history keeps what was painted and
// taken away again, so "whole on the first paint" is a claim about every
// paint.
function history(): () => MutationRecord[] {
  const observer = new MutationObserver(() => {})
  observer.observe(container, { subtree: true, childList: true, characterData: true, characterDataOldValue: true })
  const seen: MutationRecord[] = []
  return () => {
    seen.push(...observer.takeRecords())
    return seen
  }
}
// Any node matching `selector` that was ever put on the page or taken off
// it, found in the node itself or in what it carried.
function everPainted(records: MutationRecord[], selector: string): boolean {
  const hit = (n: Node) => n instanceof Element && (n.matches(selector) || n.querySelector(selector) !== null)
  return records.some((r) => [...r.addedNodes, ...r.removedNodes].some(hit))
}

function applyCss(reduced: boolean) {
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  const noPreference = '(prefers-reduced-motion: no-preference)'
  const reduce = '(prefers-reduced-motion: reduce)'
  const css = STYLESHEETS.join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]*;/g, '')
    .replaceAll(noPreference, reduced ? 'not all' : 'all')
    .replaceAll(reduce, reduced ? 'all' : 'not all')
  expect(css.includes('prefers-reduced-motion'), 'a form of the reduced-motion query this test does not state').toBe(false)
  const style = document.createElement('style')
  style.setAttribute('data-test-css', '')
  style.textContent = css
  document.head.appendChild(style)
  return style.sheet!
}
const keyframeNames = (sheet: CSSStyleSheet) =>
  new Set([...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule).map((r) => r.name))
function running(scope: Element, names: Set<string>): { el: Element; name: string }[] {
  const out: { el: Element; name: string }[] = []
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    const cs = getComputedStyle(el)
    let name = cs.getPropertyValue('animation-name').trim()
    if (!name || name === 'none') name = cs.getPropertyValue('animation').split(/[\s,]+/).find((t) => names.has(t)) ?? 'none'
    if (name !== 'none' && !cs.getPropertyValue('animation-play-state').includes('paused')) out.push({ el, name })
  }
  return out
}

describe('GUARD R4 (a): under reduced motion no dissolve or loop runs and every line is whole on first paint', () => {
  it('shows every slide whole the moment it appears, crossfades between them, and loops nothing', () => {
    setReducedMotion(true)
    const painted = history()
    renderIntro()
    const names = keyframeNames(applyCss(true))
    // The first picture fades in; nothing else moves.
    expect(running(currentScene(), names).map((r) => r.name), 'the first slide does not fade in').toContain('dc-fade-in')
    for (let i = 0; i < SLIDES.length; i += 1) {
      expect(slideShown()).toBe(i)
      expect(currentScene().getAttribute('data-scene'), `slide ${i + 1} draws another slide's scene`).toBe(SLIDES[i].scene)
      expect(line(), `slide ${i + 1} is not whole`).toBe(textOf(i))
      expect(running(currentLoop(), names).map((r) => r.name), `slide ${i + 1}'s loop runs under reduced motion`).toEqual([])
      // Whatever does move on the stage is a fade, on a whole picture: the
      // incoming first one, or the outgoing one over the next.
      const stage = container.querySelector('[data-cold-open-stage]')!
      for (const { el, name } of running(stage, names)) {
        expect(['dc-fade-in', 'dc-fade-out'], `${name} runs on the stage under reduced motion`).toContain(name)
        expect(el.hasAttribute('data-scene'), `${name} runs inside a scene rather than on it`).toBe(true)
      }
      if (i > 0) {
        const out = leavingScene()
        expect(out, 'no crossfade in place of the dissolve').not.toBeNull()
        expect(out!.getAttribute('data-scene')).toBe(SLIDES[i - 1].scene)
        expect(running(out!, names).map((r) => r.name), 'the outgoing picture is there but does not fade').toContain('dc-fade-out')
      }
      if (i < SLIDES.length - 1) click(button('NEXT'))
    }
    // Every paint, not only the last: no dissolve was ever put up, and no
    // line was ever shown part-typed (the cursor only exists mid-line).
    expect(everPainted(painted(), '[data-dissolve]'), 'a dissolve was painted under reduced motion').toBe(false)
    expect(everPainted(painted(), '[data-cursor]'), 'a line was painted part-typed under reduced motion').toBe(false)
  })

  it('restarts the fade for a second NEXT inside the first, and fades out to the menu', () => {
    setReducedMotion(true)
    renderIntro()
    const names = keyframeNames(applyCss(true))
    click(button('NEXT'))
    const first = leavingScene()
    step(CROSSFADE_MS / 3)
    click(button('NEXT'))
    const second = leavingScene()
    expect(second, 'the second fade reused the first one, part-faded').not.toBe(first)
    expect(second!.getAttribute('data-scene')).toBe(SLIDES[1].scene)
    expect(running(second!, names).map((r) => r.name)).toContain('dc-fade-out')
    for (let i = 2; i < SLIDES.length - 1; i += 1) click(button('NEXT'))
    step(CROSSFADE_MS)
    click(button('BEGIN'))
    expect(done, 'BEGIN cut to the menu without fading').toBe(0)
    expect(running(currentScene(), names).map((r) => r.name), 'the last picture does not fade out').toContain('dc-fade-out')
    step(CROSSFADE_MS)
    expect(done).toBe(1)
  })

  it('dissolves, types and loops with no preference (the positive control)', () => {
    const painted = history()
    renderIntro()
    const names = keyframeNames(applyCss(false))
    for (let i = 0; i < SLIDES.length; i += 1) {
      expect(currentScene().getAttribute('data-scene'), `slide ${i + 1} draws another slide's scene`).toBe(SLIDES[i].scene)
      const dissolve = container.querySelector('[data-dissolve="in"]')
      expect(dissolve, `slide ${i + 1} did not dissolve in`).not.toBeNull()
      expect(running(dissolve!, names).length, 'the dissolve is on the page but not running').toBeGreaterThan(0)
      expect(line(), `slide ${i + 1} was whole before it typed`).not.toBe(textOf(i))
      pass(DISSOLVE_MS + MS_PER_CHAR * 4)
      expect(line()!.length, `slide ${i + 1} is not typing`).toBeGreaterThan(1)
      expect(running(currentLoop(), names).length, `slide ${i + 1}'s loop does not run`).toBeGreaterThan(0)
      if (i < SLIDES.length - 1) {
        tap()
        tap()
        expect(container.querySelector('[data-dissolve="out"]'), 'the slide did not dissolve out').not.toBeNull()
        step(DISSOLVE_MS)
      }
    }
    // The history sees what the reduced-motion test says never happens.
    expect(everPainted(painted(), '[data-dissolve]')).toBe(true)
    expect(everPainted(painted(), '[data-cursor]')).toBe(true)
  })

  it('pauses the loops while the tab is hidden', () => {
    renderIntro()
    const names = keyframeNames(applyCss(false))
    step(DISSOLVE_MS)
    expect(running(currentLoop(), names).length, 'nothing to pause (the positive control)').toBeGreaterThan(0)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    try {
      expect(running(currentLoop(), names).map((r) => r.name)).toEqual([])
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
  })
})

describe('GUARD R4 (b): a tap finishes the line, the next moves on, and only a first viewing sets the seen-flag', () => {
  it('finishes a line mid-type on the first tap and moves on at the second, by tap, by NEXT and by Enter', () => {
    renderIntro()
    pass(DISSOLVE_MS + MS_PER_CHAR * 5)
    expect(line()!.length, 'the line had not started typing').toBeGreaterThan(1)
    expect(line(), 'the line typed out before the tap').not.toBe(textOf(0))
    tap()
    expect(line(), 'the first tap did not finish the line').toBe(textOf(0))
    // Moving on starts with the dissolve out, and the slide index only
    // changes once that has run: so the first tap is judged by both.
    expect(container.querySelector('[data-dissolve="out"]'), 'the first tap started moving on').toBeNull()
    step(DISSOLVE_MS)
    expect(slideShown(), 'the first tap moved on').toBe(0)
    tap()
    expect(container.querySelector('[data-dissolve="out"]'), 'the second tap did not move on').not.toBeNull()
    step(DISSOLVE_MS)
    expect(slideShown(), 'the second tap did not move on').toBe(1)

    pass(DISSOLVE_MS + MS_PER_CHAR * 5)
    click(button('NEXT'))
    expect(line()).toBe(textOf(1))
    expect(container.querySelector('[data-dissolve="out"]'), 'NEXT finished the line and moved on at once').toBeNull()
    click(button('NEXT'))
    step(DISSOLVE_MS)
    expect(slideShown()).toBe(2)

    pass(DISSOLVE_MS + MS_PER_CHAR * 5)
    press('Enter')
    expect(line()).toBe(textOf(2))
    expect(slideShown()).toBe(2)
    press(' ')
    step(DISSOLVE_MS)
    expect(slideShown()).toBe(3)
  })

  it('does not move on while a slide is still dissolving in, however fast the taps', () => {
    renderIntro()
    step(DISSOLVE_MS / 2)
    tap()
    tap()
    tap()
    expect(container.querySelector('[data-dissolve="out"]'), 'a tap mid-dissolve started the dissolve out').toBeNull()
    expect(line(), 'the taps did not finish the line').toBe(textOf(0))
    step(DISSOLVE_MS)
    expect(slideShown()).toBe(0)
    tap()
    expect(container.querySelector('[data-dissolve="out"]'), 'once in, the next tap does move on').not.toBeNull()
  })

  it('refuses a held key on its own buttons, which would click them on every repeat', () => {
    renderIntro()
    for (const name of ['NEXT', 'SKIP']) {
      const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
      act(() => {
        button(name).dispatchEvent(held)
      })
      expect(held.defaultPrevented, `a held Enter on ${name} would click it again`).toBe(true)
      const pressed = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      act(() => {
        button(name).dispatchEvent(pressed)
      })
      expect(pressed.defaultPrevented, `a single Enter on ${name} was refused (the positive control)`).toBe(false)
    }
    expect(done).toBe(0)
  })

  function toTheEnd() {
    for (let i = 0; i < SLIDES.length; i += 1) {
      step(DISSOLVE_MS)
      tap()
      expect(done, 'the cold open ended early').toBe(0)
      if (i < SLIDES.length - 1) {
        expect(button('NEXT')).toBeTruthy()
        tap()
        step(DISSOLVE_MS)
      }
    }
    expect(button('BEGIN'), 'the last slide does not say BEGIN').toBeTruthy()
    tap()
    step(DISSOLVE_MS)
    expect(done, 'BEGIN did not leave').toBe(1)
  }

  it('sets dc-intro-seen at BEGIN on the last slide, and not before', () => {
    renderIntro()
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the flag was set on arrival').toBeNull()
    for (let i = 0; i < SLIDES.length - 1; i += 1) {
      step(DISSOLVE_MS)
      tap()
      tap()
      expect(localStorage.getItem(INTRO_SEEN_KEY), `the flag was set on slide ${i + 1}`).toBeNull()
      step(DISSOLVE_MS)
    }
    step(DISSOLVE_MS)
    tap()
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the flag was set before BEGIN').toBeNull()
    tap()
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
  })

  it('sets dc-intro-seen on SKIP, and on Escape', () => {
    renderIntro()
    pass(DISSOLVE_MS + MS_PER_CHAR * 5)
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the flag was set before SKIP').toBeNull()
    click(button('SKIP'))
    expect(done).toBe(1)
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')

    localStorage.removeItem(INTRO_SEEN_KEY)
    act(() => root.unmount())
    root = createRoot(container)
    renderIntro()
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the flag was set before Escape').toBeNull()
    press('Escape')
    expect(done).toBe(2)
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
  })

  it('leaves dc-intro-seen exactly as it was on a replay, set or not, however it ends', () => {
    // Both ways round: from absent, a replay that wrote the flag fails;
    // from '1', a replay that cleared it fails. And by all three exits.
    const exits: [string, () => void][] = [
      ['BEGIN', toTheEnd],
      ['SKIP', () => click(button('SKIP'))],
      ['Escape', () => press('Escape')],
    ]
    for (const before of [null, '1']) {
      for (const [how, leave] of exits) {
        if (before === null) localStorage.removeItem(INTRO_SEEN_KEY)
        else localStorage.setItem(INTRO_SEEN_KEY, before)
        act(() => root.unmount())
        root = createRoot(container)
        done = 0
        renderIntro(true)
        leave()
        expect(done, `the replay did not end by ${how}`).toBe(1)
        expect(localStorage.getItem(INTRO_SEEN_KEY), `a replay ended by ${how} changed the flag from ${before}`).toBe(before)
      }
    }
  })

  it('opens a first visit on the cold open and records it as seen when the player leaves', async () => {
    act(() => {
      root.render(<App />)
    })
    await settle()
    expect(container.querySelector('[data-cold-open-slide]'), 'a first visit did not open on the cold open').not.toBeNull()
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeNull()
    click(button('SKIP'))
    expect(localStorage.getItem(INTRO_SEEN_KEY), "App's first visit did not record the cold open as seen").toBe('1')
    expect(button('BRIEFING'), 'leaving the cold open did not reach the menu').toBeTruthy()
  })

  it("replays from the menu's BRIEFING without touching the flag, and returns to the menu", async () => {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    act(() => {
      root.render(<App />)
    })
    click(button('BRIEFING'))
    await settle()
    expect(container.querySelector('[data-cold-open-slide]'), 'BRIEFING did not open the cold open').not.toBeNull()
    // Take the flag away under the replay: if the replay set it, it would
    // be back after SKIP.
    localStorage.removeItem(INTRO_SEEN_KEY)
    click(button('SKIP'))
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the replay set the seen-flag').toBeNull()
    expect(button('BRIEFING'), 'the replay did not return to the menu').toBeTruthy()
  })
})

describe('GUARD R4 (c): every slide has a scene and at least one line', () => {
  it('draws a picture with exactly one loop for every slide, and gives every slide a line', () => {
    expect(SLIDES.length, 'no slides').toBeGreaterThan(0)
    for (const [i, slide] of SLIDES.entries()) {
      expect(slide.lines.length, `slide ${i + 1} has no line`).toBeGreaterThanOrEqual(1)
      for (const l of slide.lines) expect(l.trim(), `slide ${i + 1} has an empty line`).not.toBe('')
      act(() => {
        root.render(<ColdOpenScene key={i} scene={slide.scene} />)
      })
      const scene = container.querySelector(`[data-scene="${slide.scene}"]`)
      expect(scene, `slide ${i + 1} draws no scene`).not.toBeNull()
      expect(scene!.querySelectorAll('svg rect').length, `slide ${i + 1}'s scene is empty`).toBeGreaterThan(0)
      const loops = scene!.querySelectorAll('[data-loop]')
      expect(loops.length, `slide ${i + 1} has ${loops.length} loops, not one`).toBe(1)
      expect(loops[0].querySelector('svg'), `slide ${i + 1}'s loop has no sprite`).not.toBeNull()
    }
  })

  it('moves nothing on a slide but its one loop, which does move', () => {
    renderIntro()
    const names = keyframeNames(applyCss(false))
    for (let i = 0; i < SLIDES.length; i += 1) {
      step(DISSOLVE_MS)
      const scene = currentScene()
      const loop = currentLoop()
      const moving = running(scene, names)
      expect(moving.filter((r) => loop.contains(r.el)).length, `slide ${i + 1}'s loop does not move`).toBeGreaterThan(0)
      const elsewhere = moving.filter((r) => !loop.contains(r.el)).map((r) => r.name)
      expect(elsewhere, `slide ${i + 1} moves more than its one loop`).toEqual([])
      if (i < SLIDES.length - 1) {
        tap()
        tap()
        step(DISSOLVE_MS)
      }
    }
  })

  it('counts its slides from SLIDES, and only the last one says BEGIN', () => {
    setReducedMotion(true)
    renderIntro()
    for (let i = 0; i < SLIDES.length; i += 1) {
      expect(container.querySelector('[data-cold-open-text]')!.textContent).toContain(`${i + 1} / ${SLIDES.length}`)
      const last = i === SLIDES.length - 1
      expect(button(last ? 'BEGIN' : 'NEXT')).toBeTruthy()
      if (!last) click(button('NEXT'))
    }
    step(CROSSFADE_MS)
    expect(container.querySelector('.dc-crossfade-out'), 'the crossfade outlives its fade').toBeNull()
  })
})

describe('the cold open sounds: a soft key click as it types, and the bed building under it', () => {
  function layerTargets(): number[] {
    const bed = getAudioEngine().music
    if (!bed) throw new Error('no music bed')
    return MUSIC_LAYERS.map((l) => {
      const gain = bed.layerGain(l.name) as unknown as FakeGain | undefined
      const events = gain?.gain.events.filter((e) => e.kind !== 'cancel') ?? []
      return events[events.length - 1]?.value ?? 0
    })
  }
  const targetsFor = (state: Parameters<(typeof MUSIC_LAYERS)[number]['active']>[0]) =>
    MUSIC_LAYERS.map((l) => (l.active(state) ? l.level : 0))
  const gesture = () =>
    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })

  it('starts no music before the first gesture, and starts it on the slide it is on', () => {
    renderIntro()
    pass(DISSOLVE_MS + MS_PER_CHAR * textOf(0).length)
    expect(getAudioEngine().music, 'music before any gesture').toBeNull()
    gesture()
    expect(getAudioEngine().music, 'the first gesture did not start the bed').not.toBeNull()
    expect(layerTargets()).toEqual(targetsFor(coldOpenMusicState(0)))
  })

  it('builds the bed slide by slide and hands it to the menu when the cold open ends', () => {
    renderIntro()
    gesture()
    for (let i = 1; i < SLIDES.length; i += 1) {
      step(DISSOLVE_MS)
      tap()
      tap()
      step(DISSOLVE_MS)
      expect(slideShown()).toBe(i)
      expect(layerTargets(), `the bed on slide ${i + 1}`).toEqual(targetsFor(coldOpenMusicState(i)))
    }
    expect(layerTargets(), 'the bed never built').not.toEqual(targetsFor(MENU_MUSIC_STATE))
    click(button('SKIP'))
    act(() => root.unmount())
    root = createRoot(container)
    expect(layerTargets(), 'leaving the cold open left its bed playing').toEqual(targetsFor(MENU_MUSIC_STATE))
  })

  it('types at CHARS_PER_SECOND, whatever the steps it is watched in', () => {
    renderIntro()
    step(DISSOLVE_MS)
    // Small steps, several to a character, so a faster timer would show.
    const watched = 600
    for (let t = 0; t < watched; t += 5) step(5)
    const expected = Math.floor(watched / MS_PER_CHAR)
    const typed = line()!.replace('_', '').length
    expect(typed, `typed ${typed} characters in ${watched}ms`).toBeGreaterThanOrEqual(expected - 1)
    expect(typed).toBeLessThanOrEqual(expected + 1)
  })

  it('clicks on every CLICK_EVERYth typed character that is not a space', () => {
    renderIntro()
    gesture()
    const play = vi.spyOn(getAudioEngine(), 'play')
    pass(DISSOLVE_MS + MS_PER_CHAR * (textOf(0).length + 2))
    expect(line()).toBe(textOf(0))
    const expected = [...textOf(0)].filter((c, k) => (k + 1) % CLICK_EVERY === 0 && c !== ' ').length
    expect(expected, 'a line too short to click').toBeGreaterThan(0)
    expect(play.mock.calls.filter(([cue]) => cue === 'soft-tick').length).toBe(expected)
  })
})
