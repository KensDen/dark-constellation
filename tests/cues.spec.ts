// Cue coverage battery (brief v0.5 section 8). Every event, condition and
// countermeasure id in the content data, and every beat kind the director
// can emit, must resolve to a cue entry. Round 3 tightens the gate: a
// visual placeholder now fails, so the round's closing condition ("every
// row of section 6 has its visual") is checked against the code rather
// than asserted in a report. Sound slots stay placeholder until Round 4.
// The registry is hand-keyed on purpose, so a new deck entry fails here
// until someone decides what it looks and sounds like. The reverse check
// catches stale keys.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BEAT_CUES,
  BEAT_KINDS,
  CONDITION_CUES,
  COUNTER_CUES,
  EVENT_CUES,
  SECTION_6_ROWS,
  CARD_SAFE_VISUALS,
  VISUAL_CLASS,
  VISUAL_MS,
  deriveBeats,
  resolveCue,
  visualClass,
  visualFor,
  type Cue,
  type VisualCue,
} from '../src/director'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

function* playTurns(seed: number, script: Record<number, TurnActions>) {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing') {
    const next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    yield { before: state, after: next } as { before: GameState; after: GameState }
    state = next
  }
}

// A line that spends surge authority whenever it can, so the surge beat is
// exercised alongside everything else.
const surgeLine = (state: GameState): TurnActions => {
  const base = WIN_SCRIPT[state.turn] ?? NO_OP
  return state.surgeTokens > 0 && state.conditions.length > 0
    ? { ...base, spendSurgeOn: state.conditions[0].instanceId }
    : base
}

function* playSurge(seed: number) {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing') {
    const next = resolveTurn(state, surgeLine(state), turnRng(state.seed, state.turn))
    yield { before: state, after: next } as { before: GameState; after: GameState }
    state = next
  }
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const ALL_CUES: [string, Record<string, Cue>][] = [
  ['beat', BEAT_CUES as Record<string, Cue>],
  ['event', EVENT_CUES],
  ['condition', CONDITION_CUES],
  ['counter', COUNTER_CUES],
]

const events = DEFAULT_SCENARIO.events
const conditionEvents = events.filter((e) => e.duration)
const counters = DEFAULT_SCENARIO.countermeasures

const complete = (cue: { visual: string; sound: string; label: string } | undefined) =>
  !!cue && cue.label.length > 0 && cue.visual.length > 0 && cue.sound.length > 0

describe('cue coverage', () => {
  it('every event id resolves to a cue', () => {
    for (const ev of events) {
      expect(complete(EVENT_CUES[ev.id]), `event ${ev.id} has no cue`).toBe(true)
      expect(resolveCue(`event:${ev.id}`), ev.id).toBeTruthy()
    }
  })

  it('every condition-bearing event id resolves to a condition cue', () => {
    expect(conditionEvents.length).toBeGreaterThan(0)
    for (const ev of conditionEvents) {
      expect(complete(CONDITION_CUES[ev.id]), `condition ${ev.id} has no cue`).toBe(true)
      expect(resolveCue(`condition:${ev.id}`), ev.id).toBeTruthy()
    }
  })

  it('every countermeasure id resolves to a cue', () => {
    for (const cm of counters) {
      expect(complete(COUNTER_CUES[cm.id]), `countermeasure ${cm.id} has no cue`).toBe(true)
      expect(resolveCue(`counter:${cm.id}`), cm.id).toBeTruthy()
    }
  })

  it('every beat kind resolves to a cue', () => {
    for (const kind of BEAT_KINDS) {
      expect(complete(BEAT_CUES[kind]), `beat kind ${kind} has no cue`).toBe(true)
      expect(resolveCue(`beat:${kind}`), kind).toBeTruthy()
    }
  })

  it('carries no stale keys for ids the deck no longer has', () => {
    const eventIds = new Set(events.map((e) => e.id))
    const conditionIds = new Set(conditionEvents.map((e) => e.id))
    const counterIds = new Set(counters.map((c) => c.id))
    for (const key of Object.keys(EVENT_CUES)) expect(eventIds.has(key), `stale event cue ${key}`).toBe(true)
    for (const key of Object.keys(CONDITION_CUES)) expect(conditionIds.has(key), `stale condition cue ${key}`).toBe(true)
    for (const key of Object.keys(COUNTER_CUES)) expect(counterIds.has(key), `stale countermeasure cue ${key}`).toBe(true)
    for (const key of Object.keys(BEAT_CUES)) expect((BEAT_KINDS as string[]).includes(key), `stale beat cue ${key}`).toBe(true)
  })

  it('counts derive from data: the registry sizes equal the deck sizes', () => {
    expect(Object.keys(EVENT_CUES).length).toBe(events.length)
    expect(Object.keys(CONDITION_CUES).length).toBe(conditionEvents.length)
    expect(Object.keys(COUNTER_CUES).length).toBe(counters.length)
    expect(Object.keys(BEAT_CUES).length).toBe(BEAT_KINDS.length)
  })

  it('rejects malformed or unknown cue keys', () => {
    expect(resolveCue('nonsense')).toBeUndefined()
    expect(resolveCue('event:not-a-real-event')).toBeUndefined()
    expect(resolveCue('sound:pnt-jamming')).toBeUndefined()
  })
})

describe('visual cue vocabulary (Round 3)', () => {
  it('leaves no visual placeholder anywhere in the registry', () => {
    const unfinished: string[] = []
    for (const [ns, map] of ALL_CUES) {
      for (const [id, entry] of Object.entries(map)) {
        if (entry.visual === 'placeholder') unfinished.push(`${ns}:${id}`)
      }
    }
    expect(unfinished.join(', ')).toBe('')
  })

  it('backs every visual with a class that exists in the stylesheet', () => {
    const missing: string[] = []
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      if (!new RegExp(`\\.${className}\\s*[{,]`).test(CSS)) missing.push(`${visual} -> .${className}`)
    }
    expect(missing.join(', ')).toBe('')
  })

  it('keeps every animation behind the reduced-motion guard', () => {
    // Bound the slice to the cue layer's own guard block by brace
    // matching. Slicing from the first no-preference query would start at
    // the unrelated CRT flicker near the top of the stylesheet, and every
    // rule below it would count as guarded whether or not it is.
    const open = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference)')
    expect(open).toBeGreaterThan(-1)
    let depth = 0
    let end = -1
    for (let i = CSS.indexOf('{', open); i < CSS.length; i += 1) {
      if (CSS[i] === '{') depth += 1
      else if (CSS[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    expect(end, 'reduced-motion guard block is unterminated').toBeGreaterThan(open)
    const guarded = CSS.slice(open, end)
    // The block really is bounded: the keyframes that follow it must fall
    // outside the slice, or the assertions below prove nothing.
    expect(guarded).not.toContain('@keyframes')
    const animated = [...new Set(Object.values(VISUAL_CLASS).filter(Boolean))]
    for (const className of animated) {
      expect(guarded, `${className} must be declared inside the reduced-motion guard`).toContain(`.${className} {`)
    }
    // Applied by components rather than through the registry, so walked
    // explicitly: the layer-badge pulses, the meter flashes the readouts
    // paint on every value change, the badge transform transition and the
    // tile press. The flashes are the ones a reader would miss, because
    // their colour is declared outside the guard on purpose and only the
    // animation belongs inside it.
    for (const selector of [
      'dc-pulse-hostile',
      'dc-pulse-friendly',
      'dc-flash-good',
      'dc-flash-bad',
      'dc-badge',
      'dc-tile:active',
    ]) {
      expect(guarded, `${selector} must be declared inside the reduced-motion guard`).toContain(`.${selector} {`)
    }
  })

  it('keys the layer badges to the beat, so a repeated layer pulses again', () => {
    // The badge pulse is a class the JSX writes directly rather than a cue
    // routed through useCueClass, because a hook call inside the layer map
    // would make the hook count vary with the number of layers. What makes
    // it replay is therefore element identity: the wrapper has to be keyed
    // by something that changes per beat, or two consecutive beats on the
    // same layer at the same tone reuse a node whose animation has already
    // finished and the pulse is silent. There is no DOM in this suite, so
    // the structure is read from the source; the regression it pins
    // shipped as `key={layer}`.
    const source = readFileSync(join(SRC, 'director', 'DirectorView.tsx'), 'utf8')
    const map = /beat\.layers\.map\(\(layer\) => \(([\s\S]*?)\)\)/.exec(source)
    expect(map, 'the layer badge row is not where this guard expects it').not.toBeNull()
    const key = /key=\{([^}]*)\}/.exec(map![1])
    expect(key, 'the layer badge wrapper carries no key').not.toBeNull()
    expect(key![1], 'the layer badge key must change from beat to beat').toContain('beat.id')
  })

  it('has a real visual for every row of section 6, in a file that exists', () => {
    expect(SECTION_6_ROWS.length).toBeGreaterThan(0)
    for (const row of SECTION_6_ROWS) {
      expect(row.visual, `${row.beat} is still a placeholder`).not.toBe('placeholder')
      expect(Object.keys(VISUAL_CLASS), `${row.beat} uses an unknown visual`).toContain(row.visual)
      const file = join(SRC, row.where.split(' ')[0])
      expect(existsSync(file), `${row.beat} points at ${row.where}, which does not exist`).toBe(true)
    }
  })

  it('wires every row with a class to code that applies it', () => {
    // Two different proofs, because the rows are carried two ways. A
    // component row must name the class itself. A director row is resolved
    // through the registry, so the proof is that a real beat of that kind
    // actually produces the row's visual; naming the helper is not enough.
    const beatVisuals = new Set<string>()
    const kindsSeen = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const { before, after } of playSurge(seed)) {
        for (const beat of deriveBeats(before, after)) {
          kindsSeen.add(beat.kind)
          const visual = visualFor(beat.cueKey, beat.kind)
          if (visual) beatVisuals.add(visual)
        }
      }
    }
    const unwired: string[] = []
    for (const row of SECTION_6_ROWS) {
      const className = VISUAL_CLASS[row.visual]
      if (!className) continue
      if (row.where.startsWith('director/')) {
        if (!beatVisuals.has(row.visual)) unwired.push(`${row.beat}: no beat ever plays ${row.visual}`)
        continue
      }
      const source = readFileSync(join(SRC, row.where.split(' ')[0]), 'utf8')
      if (!source.includes(className)) unwired.push(`${row.beat}: ${row.where} never names .${className}`)
    }
    expect(unwired.join('\n')).toBe('')
    expect(kindsSeen.size, 'the sweep produced too few beat kinds to prove anything').toBeGreaterThan(8)
  })

  it('records what each deferred row still owes', () => {
    // A row that ships only part of its brief treatment says so, so the
    // battery cannot report an unfinished row as done.
    for (const row of SECTION_6_ROWS) {
      if (row.deferred) expect(row.deferred.length).toBeGreaterThan(8)
      if (row.cinematicInRound5) expect(row.visual).not.toBe('placeholder')
    }
    expect(SECTION_6_ROWS.filter((r) => r.deferred || r.cinematicInRound5).length).toBeGreaterThan(0)
  })

  it('uses every declared visual treatment at least once', () => {
    const used = new Set<string>(SECTION_6_ROWS.map((r) => r.visual))
    for (const [, map] of ALL_CUES) for (const entry of Object.values(map)) used.add(entry.visual)
    const declared = Object.keys(VISUAL_CLASS).filter((v) => v !== 'placeholder')
    for (const visual of declared) {
      expect(used.has(visual), `visual ${visual} is declared but never used`).toBe(true)
    }
  })

  it('resolves a class for a beat cue key, and nothing for an unknown one', () => {
    expect(visualClass('beat:threat')).toBe(VISUAL_CLASS['card-hostile'])
    expect(visualClass('condition:pnt-jamming')).toBe(VISUAL_CLASS['badge-attach'])
    expect(visualClass('event:not-real')).toBe('')
  })

  it('lets the beat kind own the visual where the subject cue would say the wrong thing', () => {
    // These four carry a deck-keyed cue so the label and the later sound
    // stay specific to the subject, but their visual belongs to what is
    // happening. Without this the surge burn, the clear sweep and the
    // persistence tick all played the hostile attach glow.
    expect(visualClass('condition:pnt-jamming', 'surge-spent')).toBe(VISUAL_CLASS['token-burn'])
    expect(visualClass('condition:pnt-jamming', 'condition-cleared')).toBe(VISUAL_CLASS['badge-clear'])
    expect(visualClass('condition:pnt-jamming', 'condition-pressure')).toBe(VISUAL_CLASS['badge-tick'])
    // deploy-arrived is deliberately NOT in the override set: the beat cue
    // and every countermeasure cue already use asset-light, so overriding
    // would only shadow a future per-countermeasure visual.
    expect(visualClass('counter:sensorFusion', 'deploy-arrived')).toBe(VISUAL_CLASS['asset-light'])
    // And the exclusion is deliberate: the signature move keeps the deck's
    // own treatment rather than the generic hostile card.
    expect(visualClass('event:blackout-chain', 'threat')).toBe(VISUAL_CLASS.blackout)
    expect(visualClass('event:pnt-jamming', 'threat')).toBe(VISUAL_CLASS['card-hostile'])
  })

  it('plays the visual each beat kind claims, over real play rather than hand-built keys', () => {
    // The registry can agree with itself and still be wrong about what a
    // player sees. This derives real beats and asks what visual each one
    // would actually play.
    const expected: Partial<Record<string, VisualCue>> = {
      'turn-start': 'transmission',
      quiet: 'transmission',
      'deploy-arrived': 'asset-light',
      'surge-spent': 'token-burn',
      'condition-pressure': 'badge-tick',
      'condition-cleared': 'badge-clear',
      'condition-applied': 'badge-attach',
      'condition-renewed': 'badge-attach',
      commendation: 'ribbon',
      'chain-armed': 'blackout',
      outcome: 'outcome-sweep',
      procurement: 'silent',
      'end-of-turn-tick': 'silent',
    }
    const seenVisuals = new Set<VisualCue>()
    const seenKinds = new Set<string>()
    const wrong: string[] = []
    const runs = [
      ...[1, 2, 3, 4].map((seed) => playTurns(seed, WIN_SCRIPT)),
      ...[1, 2].map((seed) => playTurns(seed, LOSS_SCRIPT)),
      ...[1, 2, 3].map((seed) => playSurge(seed)),
    ]
    for (const run of runs) {
      for (const { before, after } of run) {
        for (const beat of deriveBeats(before, after)) {
          const visual = visualFor(beat.cueKey, beat.kind)
          expect(visual, `${beat.id} resolves no visual`).toBeTruthy()
          seenVisuals.add(visual!)
          seenKinds.add(beat.kind)
          const want = expected[beat.kind]
          if (want && visual !== want) wrong.push(`${beat.kind} played ${visual}, expected ${want}`)
        }
      }
    }
    expect([...new Set(wrong)].join('\n')).toBe('')
    // The three kinds the shadowing hit must actually have occurred, or
    // the assertions above passed vacuously.
    for (const kind of ['surge-spent', 'condition-cleared', 'condition-pressure', 'deploy-arrived']) {
      expect(seenKinds.has(kind), `${kind} never occurred in the sweep`).toBe(true)
    }
  })

  it('leaves no declared visual unreachable', () => {
    // Every treatment is either played by a beat or carried by a component
    // that a section 6 row names. A visual reachable from neither is dead
    // code dressed as coverage.
    const fromBeats = new Set<VisualCue>()
    // Enough seeds that the rare draws occur: an opportunity is a one in
    // five roll on five turns, so a handful of campaigns can miss it and
    // the assertion would then pass for the wrong reason.
    for (const seed of Array.from({ length: 16 }, (_, i) => i + 1)) {
      for (const { before, after } of playSurge(seed)) {
        for (const beat of deriveBeats(before, after)) {
          const visual = visualFor(beat.cueKey, beat.kind)
          if (visual) fromBeats.add(visual)
        }
      }
    }
    const fromComponents = new Set(SECTION_6_ROWS.filter((r) => !r.where.startsWith('director/')).map((r) => r.visual))
    const unreachable = (Object.keys(VISUAL_CLASS) as VisualCue[]).filter(
      (v) => v !== 'placeholder' && !fromBeats.has(v) && !fromComponents.has(v),
    )
    expect(unreachable.join(', ')).toBe('')
  })
})

describe('cue timing and card safety', () => {
  // The helper strips a cue class when its animation is over. A recorded
  // duration shorter than the stylesheet's would cut the animation off
  // mid-frame; longer would leave the class on the element. Both numbers
  // are read from the same stylesheet the browser uses.
  const declaredMs = (className: string): number | undefined => {
    const rule = new RegExp(`\\.${className}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([0-9.]+)(m?s)`).exec(CSS)
    if (!rule) return undefined
    return rule[2] === 's' ? Number(rule[1]) * 1000 : Number(rule[1])
  }

  it('records the stylesheet duration for every animated visual', () => {
    const wrong: string[] = []
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      const css = declaredMs(className)
      expect(css, `${className} declares no animation duration`).toBeDefined()
      // The strobe loops until the state clears, so it has no one-shot life.
      if (visual === 'strobe') continue
      const recorded = VISUAL_MS[visual as keyof typeof VISUAL_MS]
      if (recorded !== css) wrong.push(`${visual}: recorded ${recorded}ms, stylesheet ${css}ms`)
    }
    expect(wrong.join('\n')).toBe('')
  })

  it('gives every visual a duration entry, and none to the ones that do not animate', () => {
    for (const visual of Object.keys(VISUAL_CLASS) as (keyof typeof VISUAL_MS)[]) {
      expect(VISUAL_MS[visual], `${visual} has no duration`).toBeTypeOf('number')
      if (!VISUAL_CLASS[visual]) expect(VISUAL_MS[visual], `${visual} has no class but a duration`).toBe(0)
    }
  })

  it('never lets a treatment that ends hidden run on the whole card', () => {
    // badge-clear finishes at opacity 0 and token-burn at 0.25. Handing
    // either to the card would animate the card itself away, which is what
    // the card-safe set exists to prevent.
    const keyframeBlock = (name: string): string => {
      const at = CSS.indexOf(`@keyframes ${name} {`)
      if (at < 0) return ''
      let depth = 0
      for (let i = CSS.indexOf('{', at); i < CSS.length; i += 1) {
        if (CSS[i] === '{') depth += 1
        else if (CSS[i] === '}') {
          depth -= 1
          if (depth === 0) return CSS.slice(at, i + 1)
        }
      }
      return ''
    }
    const endsHidden: string[] = []
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      const block = keyframeBlock(className)
      const last = /100%\s*\{([^}]*)\}/.exec(block)?.[1] ?? ''
      const opacity = /opacity:\s*([0-9.]+)/.exec(last)?.[1]
      if (opacity !== undefined && Number(opacity) < 1) endsHidden.push(visual)
    }
    for (const visual of endsHidden) {
      expect(
        CARD_SAFE_VISUALS.has(visual as never),
        `${visual} ends at reduced opacity and must not be card-safe`,
      ).toBe(false)
    }
    // The check is only meaningful if it found the two known cases.
    expect(endsHidden).toContain('badge-clear')
    expect(endsHidden).toContain('token-burn')
  })

  it('declares no animation for a cue class outside the reduced-motion guard', () => {
    // The containment test proves each class appears inside the guard; this
    // proves none of them also animates outside it, which is the shape of
    // the rule that was moved under the guard.
    const open = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference)')
    let depth = 0
    let end = -1
    for (let i = CSS.indexOf('{', open); i < CSS.length; i += 1) {
      if (CSS[i] === '{') depth += 1
      else if (CSS[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const outside = CSS.slice(0, open) + CSS.slice(end + 1)
    const leaked: string[] = []
    for (const className of new Set(Object.values(VISUAL_CLASS).filter(Boolean))) {
      const rule = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(outside)
      if (rule && /animation:|transform/.test(rule[1])) leaked.push(className)
    }
    expect(leaked.join(', ')).toBe('')
  })
})
