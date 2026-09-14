// Cue coverage battery (game-feel brief section 8, Round 2). Every event,
// condition and countermeasure id in the content data, and every beat
// kind the director can emit, must resolve to a cue entry; a placeholder
// counts until Rounds 3 and 4 fill the slots. The registry is hand-keyed
// on purpose, so a new deck entry fails here until someone decides what it
// looks and sounds like. The reverse check catches stale keys.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { BEAT_CUES, BEAT_KINDS, CONDITION_CUES, COUNTER_CUES, EVENT_CUES, resolveCue } from '../src/director'

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
