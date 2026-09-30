// The join between the intel brief's technique tag and the GLOSSARY entry
// it opens (Round 6e).
//
// PRINCIPLE 17, in the product rather than in a guard. Before this round
// the expression `${framework} ${id}` was written out FIVE times across
// four files: brief.ts built the tag with it, reportCard.ts used it three
// times as a map key, Game.tsx rendered it inline, and reference.ts kept a
// private helper of the same name. Five structures computing one key, each
// free to drift, and nothing joining them.
//
// It became load-bearing when the tag started opening the entry. Two
// independent copies would make that a string coincidence that happens to
// hold today. One exported function makes it true by construction, and
// this file asserts the construction rather than the coincidence: every
// tag the brief can actually produce, across real play, resolves to
// exactly one entry, and that entry still carries the citation.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { techniqueRefSchema } from '../src/content/schemas'
import { deriveBeats } from '../src/director'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { briefCopy } from '../src/ui/brief'
import { frameworkLabels, techniqueLabel } from '../src/ui/labels'
import { realWorldFor } from '../src/ui/realWorldLine'
import { glossaryEntries } from '../src/ui/reference'
import { shareText } from '../src/ui/reportCard'
import { NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT } from './scripts'

const DIFFICULTIES = ['easy', 'standard', 'expert'] as const
const SEEDS = [1, 11, 41, 104, 238, 277, 20260712]

// Every tag the game can actually put in front of a player, gathered from
// real play rather than from the deck directly: a tag only exists at intel
// level 3 on a turn with a fixed slot, so walking techniqueRefs would test
// a set the player never sees.
function tagsFromRealPlay(): { tag: string; seed: number; turn: number }[] {
  const found: { tag: string; seed: number; turn: number }[] = []
  for (const seed of SEEDS) {
    for (const difficulty of DIFFICULTIES) {
      let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
      for (let i = 0; i < DEFAULT_SCENARIO.totalTurns && state.status === 'playing'; i += 1) {
        const tag = briefCopy(state, difficulty).tag
        if (tag) found.push({ tag, seed, turn: state.turn })
        const script = i % 2 === 0 ? TOP_INTEL_SCRIPT : WIN_SCRIPT
        let next
        try {
          next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        } catch {
          // Some scripted carts are unaffordable on expert at some seeds,
          // which is recorded in tests/scripts.ts. A refused cart is not a
          // failure of this test; it just ends that line early.
          break
        }
        state = next
      }
    }
  }
  return found
}

describe('the technique tag resolves to a glossary entry', () => {
  const entries = glossaryEntries()
  const tags = tagsFromRealPlay()

  it('finds tags in real play at all', () => {
    // The emptiness control. Every assertion below walks this list, so a
    // list of nothing would make all of them vacuous, and the tag is rare
    // enough (intel 3, fixed slot) that finding none is a real hazard.
    expect(tags.length, 'no line of play produced a technique tag, so nothing below asserts anything').toBeGreaterThan(0)
  })

  it('resolves every tag to exactly one entry', () => {
    for (const { tag, seed, turn } of tags) {
      const matched = entries.filter((e) => e.key === tag)
      expect(matched, `seed ${seed} turn ${turn}: the tag "${tag}" resolves to ${matched.length} entries`).toHaveLength(1)
    }
  })

  it('keeps the citation on every entry a tag can reach', () => {
    // Both halves of the ruling. Keeping the player in the game is worth
    // nothing if the live-verified framework reference is lost on the way.
    for (const { tag } of tags) {
      const entry = entries.find((e) => e.key === tag)!
      expect(entry.refs.length, `the entry for "${tag}" carries no citation`).toBeGreaterThan(0)
      for (const ref of entry.refs) {
        expect(ref.url, `a citation on "${tag}" has no URL`).toMatch(/^https?:\/\//)
      }
    }
  })

  it('builds the tag and the key with the same function, not the same spelling', () => {
    // The positive control for the whole file. If brief.ts and
    // reference.ts each computed the label their own way, the tests above
    // would still pass for as long as the two expressions agreed, which is
    // exactly the drift principle 17 is about. This asserts they agree
    // BECAUSE they are one function: change techniqueLabel and both move.
    const ref = DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs)[0]
    expect(ref, 'the deck carries no technique refs').toBeDefined()
    const label = techniqueLabel(ref)
    const entry = entries.find((e) => e.key === label)
    expect(entry, `techniqueLabel produced "${label}", which no glossary entry is keyed by`).toBeDefined()
    // And a deliberately different spelling does NOT resolve, so the match
    // above is about the key rather than about any string that looks like
    // a technique name.
    expect(entries.some((e) => e.key === `${ref.framework}-${ref.id}`)).toBe(false)
  })

  it('keys every entry uniquely', () => {
    const keys = entries.map((e) => e.key)
    expect(new Set(keys).size, 'two glossary entries share a key, so a tag could open the wrong one').toBe(keys.length)
  })
})

// MITRE spells its framework ATT&CK. The enum is not renamed (the engine
// writes it into history, which the determinism snapshot hashes), so the
// spelling is a display mapping, and this block sweeps these surfaces for
// the enum: the GLOSSARY term, body and link labels, the REAL WORLD line,
// the playback card, and the share text. The intel brief's tag, the
// debrief and the aftermath card render techniqueLabel, which the GLOSSARY
// term already exercises, and are not swept here.
describe('the frameworks are spelled as their owners spell them', () => {
  const RAW = /\bATTACK(_ICS)?\b/
  const attackRefs = DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs).filter((r) => r.framework === 'ATTACK')

  it('labels every framework the schema allows, ATT&CK and ATT&CK for ICS as MITRE writes them', () => {
    // Read from the schema. frameworkLabels is keyed by the TechniqueRef
    // union, which the type checker holds to a label, but nothing joins that
    // union to the schema, so a framework added to the schema alone fails
    // only here.
    for (const framework of techniqueRefSchema.shape.framework.options) {
      expect(frameworkLabels[framework], `${framework} has no display label`).toBeTruthy()
      expect(frameworkLabels[framework], `${framework} reaches the player as an identifier`).not.toMatch(/_/)
    }
    expect(frameworkLabels.ATTACK).toBe('ATT&CK')
    expect(frameworkLabels.ATTACK_ICS).toBe('ATT&CK for ICS')
  })

  it('never shows the enum on the GLOSSARY or the REAL WORLD line', () => {
    // The positive control: the deck cites ATT&CK, so each surface below
    // has something to get wrong.
    expect(attackRefs.length, 'the deck cites no ATT&CK technique, so nothing below asserts anything').toBeGreaterThan(0)
    const techniques = glossaryEntries().filter((e) => e.category === 'Technique')
    for (const ref of attackRefs) {
      const entry = techniques.find((e) => e.key === techniqueLabel(ref))!
      expect(entry.term.startsWith(`ATT&CK ${ref.id}: `), entry.term).toBe(true)
      expect(entry.body.startsWith('ATT&CK framework technique. '), entry.body).toBe(true)
    }
    // Every entry's words and its link labels: a threat event's entry links
    // each technique it cites by name.
    const entries = glossaryEntries()
    expect(
      entries.some((e) => e.category !== 'Technique' && e.refs.some((r) => r.label.startsWith('ATT&CK '))),
      'no GLOSSARY entry links an ATT&CK technique, so the link labels below assert nothing',
    ).toBe(true)
    for (const e of entries) {
      expect([e.term, e.body, ...e.refs.map((r) => r.label)].join(' '), `the GLOSSARY entry ${e.key}`).not.toMatch(RAW)
    }
    const lines = DEFAULT_SCENARIO.events.map((ev) => realWorldFor(ev)).filter((l) => l !== null)
    expect(lines.some((l) => l.technique.startsWith('ATT&CK ')), 'no REAL WORLD line leads with an ATT&CK technique').toBe(true)
    for (const l of lines) expect(l.technique, `the REAL WORLD line for ${l.eventId}`).not.toMatch(RAW)
  })

  it('never shows the enum on the playback card or in the share text', () => {
    // The prepared line on the snapshot's win seed, where two ATT&CK
    // techniques land and one is resisted (tests/share-text.spec.ts).
    let state: GameState = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    const tags: string[] = []
    while (state.status === 'playing') {
      const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      for (const beat of deriveBeats(state, after)) tags.push(...(beat.techniques ?? []).map((t) => t.tag))
      state = after
    }
    expect(tags.some((t) => t.startsWith('ATT&CK ')), 'no beat on this line carried an ATT&CK technique').toBe(true)
    // Each tag is a label techniqueLabel gives some ref, so the card cannot
    // keep a spelling of its own.
    const labels = new Set(DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs).map(techniqueLabel))
    for (const t of tags) expect(labels.has(t), `the playback card names "${t}", which techniqueLabel never produces`).toBe(true)
    const text = shareText(state)
    expect(text).toContain('ATT&CK ')
    expect(text).not.toMatch(RAW)
  })
})
