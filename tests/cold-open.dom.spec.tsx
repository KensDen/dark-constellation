// @vitest-environment jsdom
//
// The briefing (v1.2 R4 as the cold open; rebuilt in v1.3 R1, brief 5.2).
// Every guard is walked over BEATS rather than over a count written here
// (principle 17):
//   (a) under reduced motion each scene is drawn once, still, and every
//       line is whole on the first paint of its beat;
//   (b) tapping the text finishes the line; tapping the picture finishes
//       it and a second tap moves on; CONTINUE always moves on; Enter and
//       Space do what the picture does; Escape and SKIP leave;
//   (c) leaving a first viewing by SKIP, Escape or BEGIN TURN 1 sets
//       dc-intro-seen, and a replay from the title leaves it as it was,
//       and says BACK TO TITLE where a first viewing says BEGIN TURN 1;
//   (d) every beat has a scene the canvas draws, two captions and a line.
// And the typing runs at forty characters a second with the soft click,
// and the music builds beat by beat and hands back to the title's bed.
//
// jsdom has no canvas, so a stand-in 2D context records the frames drawn:
// the scene code runs for real and draws into nothing.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IntroSequence from '../src/ui/IntroSequence'
import { BEATS, CHARS_PER_SECOND, CLICK_EVERY, MS_PER_CHAR } from '../src/ui/coldOpenSlides'
import { SCENES } from '../src/ui/briefingScenes'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { MENU_MUSIC_STATE, coldOpenMusicState, getAudioEngine, installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let done: number
let frames: number
let rafCalls: number

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

// A 2D context that accepts every call and draws nothing; setTransform
// marks a frame, since the scene runner sets it once per frame.
function fakeContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {}
  return new Proxy(target, {
    get: (t, k) => {
      if (k === 'setTransform') return () => void (frames += 1)
      if (k in t) return t[k as string]
      return () => undefined
    },
    set: (t, k, v) => {
      t[k as string] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  setReducedMotion(false)
  frames = 0
  rafCalls = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCalls += 1
    return setTimeout(() => cb(performance.now()), 16) as unknown as number
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
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
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
// Time passing a timer at a time, with React flushing between them: the
// typing schedules each character from the render of the last.
const pass = (ms: number) => {
  for (let t = 0; t < ms; t += MS_PER_CHAR) step(Math.min(MS_PER_CHAR, ms - t))
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const press = (key: string, repeat = false) => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, repeat }))
  })
}
const line = () => container.querySelector('[data-briefing-line]')!.textContent!.replace(/_$/, '')
const beatShown = () => Number(container.querySelector('[data-briefing]')!.getAttribute('data-briefing'))
const picture = () => container.querySelector('[data-briefing-scene]')!
const textBlock = () => container.querySelector('[data-briefing-text]')!
const next = () => container.querySelector('[data-briefing-next]') as HTMLButtonElement
const skip = () => [...container.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'SKIP')!

describe('GUARD R1 briefing (a): reduced motion draws each scene once and shows every line whole', () => {
  it('paints every beat whole, with no cursor, and runs no animation loop', () => {
    setReducedMotion(true)
    renderIntro()
    for (let i = 0; i < BEATS.length; i += 1) {
      expect(beatShown()).toBe(i)
      expect(line(), `beat ${i + 1} was not whole on its first paint`).toBe(BEATS[i].text)
      expect(container.querySelector('[data-cursor]'), `beat ${i + 1} shows a typing cursor under reduced motion`).toBeNull()
      if (i < BEATS.length - 1) click(next())
    }
    step(2000)
    expect(rafCalls, 'an animation loop ran under reduced motion').toBe(0)
    expect(frames, 'not one still frame a beat').toBe(BEATS.length)
  })

  it('types and animates with no preference (the positive control)', () => {
    renderIntro()
    expect(line(), 'the line was whole at once with no preference').toBe('')
    pass(MS_PER_CHAR * 10)
    expect(line()).toBe(BEATS[0].text.slice(0, 10))
    expect(rafCalls, 'no animation loop with no preference').toBeGreaterThan(0)
    expect(frames).toBeGreaterThan(1)
  })
})

describe('GUARD R1 briefing (b): taps, CONTINUE and keys', () => {
  it('finishes the line on a tap of the text, and does not move on', () => {
    renderIntro()
    pass(MS_PER_CHAR * 5)
    click(textBlock())
    expect(line()).toBe(BEATS[0].text)
    click(textBlock())
    expect(beatShown(), 'a tap on the text moved on').toBe(0)
  })

  it('finishes the line on a tap of the picture, and moves on at the second', () => {
    renderIntro()
    pass(MS_PER_CHAR * 5)
    click(picture())
    expect(line()).toBe(BEATS[0].text)
    expect(beatShown()).toBe(0)
    click(picture())
    expect(beatShown()).toBe(1)
  })

  it('moves on at CONTINUE whether or not the line has finished', () => {
    renderIntro()
    pass(MS_PER_CHAR * 3)
    expect(line().length).toBeLessThan(BEATS[0].text.length)
    click(next())
    expect(beatShown(), 'CONTINUE waited for the line').toBe(1)
  })

  it('does with Enter and Space what the picture does, and leaves on Escape', () => {
    renderIntro()
    pass(MS_PER_CHAR * 3)
    press('Enter')
    expect(line()).toBe(BEATS[0].text)
    press(' ')
    expect(beatShown()).toBe(1)
    press('Escape')
    expect(done).toBe(1)
  })

  it('refuses a held key, which would race the player through', () => {
    renderIntro()
    press('Enter', true)
    expect(line()).toBe('')
    expect(beatShown()).toBe(0)
  })
})

describe('GUARD R1 briefing (c): the seen-flag and the last button', () => {
  const toLast = () => {
    for (let i = 0; i < BEATS.length - 1; i += 1) click(next())
  }

  it('says BEGIN TURN 1 on the last beat of a first viewing, and sets dc-intro-seen there and not before', () => {
    renderIntro()
    toLast()
    expect(next().textContent!.trim()).toBe('BEGIN TURN 1')
    expect(localStorage.getItem(INTRO_SEEN_KEY), 'the flag was set before the briefing ended').toBeNull()
    click(next())
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    expect(done).toBe(1)
  })

  it('says CONTINUE on every beat but the last', () => {
    renderIntro()
    for (let i = 0; i < BEATS.length - 1; i += 1) {
      expect(next().textContent!.trim()).toBe('CONTINUE')
      click(next())
    }
  })

  it('sets dc-intro-seen on SKIP and on Escape', () => {
    renderIntro()
    click(skip())
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    localStorage.removeItem(INTRO_SEEN_KEY)
    act(() => root.unmount())
    root = createRoot(container)
    renderIntro()
    press('Escape')
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')
    expect(done).toBe(2)
  })

  it('leaves the flag as it was on a replay, set or not, and says BACK TO TITLE', () => {
    for (const before of [null, '1']) {
      if (before) localStorage.setItem(INTRO_SEEN_KEY, before)
      else localStorage.removeItem(INTRO_SEEN_KEY)
      act(() => root.unmount())
      root = createRoot(container)
      renderIntro(true)
      toLast()
      expect(next().textContent!.trim()).toBe('BACK TO TITLE')
      click(next())
      expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe(before)
    }
  })
})

describe('GUARD R1 briefing (d): every beat is drawn, captioned and told', () => {
  it('has a scene the canvas draws, two captions and a line, and one bar segment a beat', () => {
    expect(BEATS.length).toBeGreaterThan(0)
    for (const beat of BEATS) {
      expect(typeof SCENES[beat.scene], `no scene draws ${beat.scene}`).toBe('function')
      expect(beat.caption.every((c) => c.trim().length > 0)).toBe(true)
      expect(beat.text.trim().length).toBeGreaterThan(0)
    }
    renderIntro()
    expect(container.querySelectorAll('[data-briefing-bar] i').length).toBe(BEATS.length)
  })
})

describe('the briefing sounds: a soft key click as it types, and the bed building under it', () => {
  it('types at CHARS_PER_SECOND', () => {
    renderIntro()
    pass(1000)
    expect(line().length).toBe(CHARS_PER_SECOND)
  })

  it('builds the bed beat by beat and hands it to the title when the briefing ends', () => {
    const set = vi.spyOn(getAudioEngine(), 'setMusicState')
    renderIntro()
    expect(set).toHaveBeenLastCalledWith(coldOpenMusicState(0))
    for (let i = 1; i < BEATS.length; i += 1) {
      click(next())
      expect(set).toHaveBeenLastCalledWith(coldOpenMusicState(i))
    }
    act(() => root.unmount())
    root = createRoot(container)
    expect(set).toHaveBeenLastCalledWith(MENU_MUSIC_STATE)
  })

  it('clicks on every CLICK_EVERYth typed character that is not a space', () => {
    const play = vi.fn()
    vi.spyOn(getAudioEngine(), 'play').mockImplementation(play as never)
    renderIntro()
    const n = 30
    pass(MS_PER_CHAR * n)
    const typed = BEATS[0].text.slice(0, n)
    let expected = 0
    for (let i = 0; i < typed.length; i += 1) if (typed[i] !== ' ' && (i + 1) % CLICK_EVERY === 0) expected += 1
    expect(play.mock.calls.filter((c) => c[0] === 'soft-tick').length).toBe(expected)
  })
})

// The v1.3 R1 fixes (Ken, iPhone, 21 October 2026, items 12 and 13).
describe('the R1 fixes: the dialogue box, and COLDVEIL with menace', () => {
  // A context that records every filled rectangle with its colour.
  function recorder() {
    const rects: { style: string; w: number; h: number }[] = []
    let style = ''
    const target: Record<string, unknown> = {}
    const ctx = new Proxy(target, {
      get: (t, k) => {
        if (k === 'fillRect') return (_x: number, _y: number, w: number, h: number) => void rects.push({ style, w, h })
        if (k in t) return t[k as string]
        return () => undefined
      },
      set: (t, k, v) => {
        if (k === 'fillStyle') style = String(v)
        t[k as string] = v
        return true
      },
    }) as unknown as CanvasRenderingContext2D
    return { ctx, rects }
  }
  const FRIENDLY = 'rgba(90,169,255,'
  const HOSTILE = 'rgba(255,79,163,'

  it('sets every line in a bordered box beside the watch officer portrait, in mono type', () => {
    setReducedMotion(true)
    renderIntro()
    for (let i = 0; i < BEATS.length; i += 1) {
      const box = textBlock()
      expect(box.querySelector('[data-sprite="watch-officer-portrait"]'), `beat ${i + 1} has no portrait`).not.toBeNull()
      expect(box.className).toContain('border-2')
      expect(box.querySelector('[data-briefing-line]')!.parentElement!.className).toContain('font-mono')
      if (i < BEATS.length - 1) click(next())
    }
  })

  it('blinks the cursor while the line types, and drops it once the line is whole', () => {
    renderIntro()
    pass(MS_PER_CHAR * 4)
    const shown = () => (container.querySelector('[data-cursor]') as HTMLElement | null)?.style.visibility
    const seen = new Set<string | undefined>()
    for (let k = 0; k < 6; k += 1) {
      pass(200)
      seen.add(shown())
    }
    expect([...seen].sort(), 'the cursor did not blink while typing').toEqual(['hidden', 'visible'])
    click(textBlock())
    expect(container.querySelector('[data-cursor]')).toBeNull()
  })

  it('draws the COLDVEIL beat with no friendly blue trails, its trails hostile, and a hit flash on the thin station', () => {
    let friendly = 0
    let hostile = 0
    for (let t = 0; t < 6.4; t += 0.1) {
      const { ctx, rects } = recorder()
      SCENES.coldveil(ctx, 390, 380, t)
      // The stations' own lamps are friendly sprite pixels, drawn opaque;
      // the trails and packets that were blue were the translucent blue
      // and the bare token.
      friendly += rects.filter((r) => {
        const st = r.style.replace(/\s/g, '')
        return (st.startsWith(FRIENDLY) && !st.endsWith(',1)')) || st.toUpperCase() === '#5AA9FF'
      }).length
      hostile += rects.filter((r) => r.style.replace(/\s/g, '').startsWith(HOSTILE) || r.style.toUpperCase() === '#FF4FA3').length
    }
    expect(friendly, 'friendly blue trails are still drawn on the COLDVEIL beat').toBe(0)
    expect(hostile).toBeGreaterThan(0)
    // The probe lands 2.2 seconds in; the flash covers the station.
    const { ctx, rects } = recorder()
    SCENES.coldveil(ctx, 390, 380, 2.25)
    expect(
      rects.some((r) => r.style.replace(/\s/g, '').startsWith('rgba(230,237,243,') && r.w >= 48 && r.h >= 48),
      'no hit flash where the probe lands',
    ).toBe(true)
  })

  it('draws every scene as a pure function of time, so the reduced-motion still has no drift', () => {
    for (const name of Object.keys(SCENES) as (keyof typeof SCENES)[]) {
      const a = recorder()
      const b = recorder()
      SCENES[name](a.ctx, 390, 380, 2)
      SCENES[name](b.ctx, 390, 380, 2)
      expect(a.rects, `${name} drew differently at the same moment`).toEqual(b.rects)
      const c = recorder()
      SCENES[name](c.ctx, 390, 380, 4)
      expect(c.rects, `${name} does not move over time`).not.toEqual(a.rects)
    }
  })
})
