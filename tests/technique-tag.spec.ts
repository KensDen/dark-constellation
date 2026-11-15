// The join between a technique's tag and its GLOSSARY entry (Round 6e).
//
// PRINCIPLE 17, in the product rather than in a guard. Before this round
// the expression `${framework} ${id}` was written out FIVE times across
// four files: the pixel board's brief built the tag with it, reportCard.ts
// used it three times as a map key, the board rendered it inline, and
// reference.ts kept a private helper of the same name. Five structures
// computing one key, each free to drift, and nothing joining them.
//
// It became load-bearing when the tag started opening the entry. Two
// independent copies would make that a string coincidence that happens to
// hold today. One exported function makes it true by construction, and
// this file asserts the construction rather than the coincidence: every
// tag the game can show resolves to exactly one entry, and that entry
// still carries the citation.
//
// v2.0 R3: the pixel board and its intel brief are retired. The 3D game
// tags a threat with its techniques on its Dossier card and on a night's
// result card (src/ui/three/rooms3d.tsx and cards3d.tsx), every threat's
// and every technique it cites, so the tags a player can be shown are the
// deck's own, read here from the deck.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { techniqueRefSchema } from '../src/content/schemas'
import { newGame } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import type { GameState } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { frameworkLabels, techniqueLabel } from '../src/ui/labels'
import * as copy from '../src/ui/night/nightCopy'
import { nightOf } from '../src/ui/night/nightModel'
import { glossaryEntries } from '../src/ui/reference'
import { shareText } from '../src/ui/reportCard'
import { ResultCard } from '../src/ui/three/cards3d'
import { prepared, sensible } from './policies'

const THREATS = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')

// Every tag the game can put in front of a player: each technique of each
// threat, as its Dossier card lists them.
function tagsTheGameShows(): { tag: string; threat: string }[] {
  return THREATS.flatMap((ev) => ev.techniqueRefs.map((ref) => ({ tag: techniqueLabel(ref), threat: ev.id })))
}

describe('the technique tag resolves to a glossary entry', () => {
  const entries = glossaryEntries()
  const tags = tagsTheGameShows()

  it('finds tags at all, on every threat', () => {
    // The emptiness control. Every assertion below walks this list, so a
    // list of nothing would make all of them vacuous.
    expect(tags.length, 'no threat carries a technique tag, so nothing below asserts anything').toBeGreaterThan(0)
    for (const ev of THREATS) expect(tags.some((t) => t.threat === ev.id), `${ev.id} has no technique to tag`).toBe(true)
  })

  it('resolves every tag to exactly one entry', () => {
    for (const { tag, threat } of tags) {
      const matched = entries.filter((e) => e.key === tag)
      expect(matched, `${threat}: the tag "${tag}" resolves to ${matched.length} entries`).toHaveLength(1)
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
    // The positive control for the whole file. If a card and reference.ts
    // each computed the label their own way, the tests above would still
    // pass for as long as the two expressions agreed, which is exactly the
    // drift principle 17 is about. This asserts they agree BECAUSE they
    // are one function: change techniqueLabel and both move.
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
// the enum: the GLOSSARY term, body and link labels, the night's result
// card (its Dossier card, new and filed), and the share text. The Dossier
// room renders techniqueLabel, which the GLOSSARY term already exercises,
// and is not swept here.
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

  it('never shows the enum on the GLOSSARY', () => {
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
  })

  it('never shows the enum on the night\'s cards or in the share text', () => {
    // The prepared line (tests/policies.ts), answering in the night, over
    // seeds until one is won and an ATT&CK technique has been met. The
    // night shows each threat's technique in one place, the Dossier card
    // on the move's result card, which holds it closed: NEW DOSSIER CARD on
    // a first meeting and IN YOUR DOSSIER once filed. Both forms are
    // rendered open here for every threat the line meets, as the night
    // builds them from its own model.
    const read = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replaceAll('&amp;', '&').replace(/\s+/g, ' ')
    const techniqueRow = (markup: string) => read(/TECHNIQUE<\/dt><dd[^>]*>(.*?)<\/dd>/.exec(markup)?.[1] ?? '').trim()
    const tags: string[] = []
    let cards = 0
    let won: GameState | null = null
    for (let seed = 1; seed <= 200 && !(won && tags.some((t) => t.startsWith('ATT&CK '))); seed += 1) {
      let state: GameState = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = playNight(state, prepared(state), sensible)
        const night = nightOf(state, after)
        for (const step of night.steps) {
          if (step.kind !== 'threat') continue
          const ref = step.def.techniqueRefs[0]
          const signs = callSigns(step.before)
          const card = (fresh: boolean) =>
            renderToStaticMarkup(
              createElement(ResultCard, {
                step,
                sign: signs.get(step.ev.targetAssetId ?? '') ?? '',
                signs,
                assist: false,
                fresh,
                filed: null,
                open: true,
                onOpen: () => {},
                last: false,
                first: { current: null },
                could: undefined,
                onContinue: () => {},
              }),
            )
          // Swept where the card names the technique, not the whole card.
          for (const [where, markup, heading] of [
            ['filed card', card(false), copy.IN_DOSSIER],
            ['new card', card(true), copy.NEW_DOSSIER],
          ] as const) {
            const row = techniqueRow(markup)
            expect(row, `${step.def.id}: the ${where} names no technique`).toBe(`${techniqueLabel(ref)} ${ref.name}`)
            expect(row, `${step.def.id}: the ${where}`).not.toMatch(RAW)
            tags.push(techniqueLabel(ref))
            // The Dossier card's head names the framework.
            const head = new RegExp(`${heading} · (\\S+)`).exec(read(markup))?.[1] ?? ''
            expect(head, `${step.def.id}: the ${where}'s head names no framework`).toBe(frameworkLabels[ref.framework].split(' ')[0])
            expect(head).not.toMatch(RAW)
          }
          cards += 1
        }
        state = after
      }
      if (state.status === 'won' && !won) won = state
    }
    expect(won, 'no seed of the line was won, so no share text of a win was read').not.toBeNull()
    expect(cards, 'the line met no threat, so no card was read').toBeGreaterThan(0)
    expect(tags.some((t) => t.startsWith('ATT&CK ')), 'no card on this line carried an ATT&CK technique').toBe(true)
    // Each tag is a label techniqueLabel gives some ref, so the card cannot
    // keep a spelling of its own.
    const labels = new Set(DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs).map(techniqueLabel))
    for (const t of tags) expect(labels.has(t), `a night card names "${t}", which techniqueLabel never produces`).toBe(true)
    // The share text listed techniques until v1.3 R4, when free play took
    // the Daily Op's four lines (M37): it names none now, so no enum can
    // reach it either.
    const text = shareText(won!)
    expect(text.split('\n'), 'the share text is not four lines').toHaveLength(4)
    expect(text).not.toContain('ATT&CK')
    expect(text).not.toMatch(RAW)
  })
})
