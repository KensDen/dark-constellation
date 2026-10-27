// Cue coverage battery (brief v0.5 section 8). Every event and condition
// id in the content data, and every moment the night plays, must resolve
// to a cue entry. Round 3 tightens the gate: a visual placeholder now
// fails, so the round's closing condition ("every row of section 6 has its
// visual") is checked against the code rather than asserted in a report.
// The registry is hand-keyed on purpose, so a new deck entry fails here
// until someone decides what it looks and sounds like. The reverse check
// catches stale keys.
//
// Since v1.3 Round 3 the registry is src/cues.ts, keyed by the night's
// moments (brief 5.5) instead of the retired director's beat kinds, and
// its treatments live in two stylesheets: src/index.css, and the night's
// own src/ui/night/night.css in the night's chunk. Every stylesheet check
// below reads both. What each moment actually shows and sounds like in a
// real night is driven in jsdom in tests/sound.dom.spec.tsx.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONDITION_CUES,
  EVENT_CUES,
  MOMENTS,
  MOMENT_CUES,
  SECTION_6_ROWS,
  VISUAL_CLASS,
  VISUAL_MS,
  resolveCue,
  type Cue,
  type VisualCue,
} from '../src/cues'
import { STRIKE_MS } from '../src/ui/board/strike'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
// The two stylesheets a treatment can live in, each read on its own where
// the structure of the file matters (its reduced-motion guard), and
// together where only the declaration does.
const SHEETS: [string, string][] = [
  ['index.css', readFileSync(join(SRC, 'index.css'), 'utf8')],
  ['ui/night/night.css', readFileSync(join(SRC, 'ui', 'night', 'night.css'), 'utf8')],
]
const CSS = SHEETS.map(([, css]) => css).join('\n')
const ALL_CUES: [string, Record<string, Cue>][] = [
  ['moment', MOMENT_CUES as Record<string, Cue>],
  ['event', EVENT_CUES],
  ['condition', CONDITION_CUES],
]

const events = DEFAULT_SCENARIO.events
// Every event that leaves a condition: ThreatEvent.condition since v1.3
// Round 0, which replaced the rolled duration with a fixed clock.
const conditionEvents = events.filter((e) => e.condition)

const complete = (cue: { visual: string; sound: string; label: string } | undefined) =>
  !!cue && cue.label.length > 0 && cue.visual.length > 0 && cue.sound.length > 0

// The cue layer's own reduced-motion guard in one stylesheet, bounded by
// brace matching. Slicing from the first no-preference query of
// index.css would start at the unrelated CRT flicker near the top, and
// every rule below it would count as guarded whether or not it is; so the
// guard taken is the LAST one in each file (night.css has only the one).
function guardOf(css: string): { open: number; end: number; body: string } {
  const open = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)')
  let depth = 0
  let end = -1
  if (open < 0) return { open, end, body: '' }
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  return { open, end, body: css.slice(open, end) }
}

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

  // RETIRED in v1.3 Round 3: "every countermeasure id resolves to a cue".
  // COUNTER_CUES left with the director's deploy-arrived beat, the one
  // thing that played them; a defense now holds its state on its PROCURE
  // line and has no moment of its own in the night.

  it('every moment the night plays resolves to a cue', () => {
    for (const moment of MOMENTS) {
      expect(complete(MOMENT_CUES[moment]), `moment ${moment} has no cue`).toBe(true)
      expect(resolveCue(`moment:${moment}`), moment).toBeTruthy()
    }
  })

  it('carries no stale keys for ids the deck no longer has', () => {
    const eventIds = new Set(events.map((e) => e.id))
    const conditionIds = new Set(conditionEvents.map((e) => e.id))
    for (const key of Object.keys(EVENT_CUES)) expect(eventIds.has(key), `stale event cue ${key}`).toBe(true)
    for (const key of Object.keys(CONDITION_CUES)) expect(conditionIds.has(key), `stale condition cue ${key}`).toBe(true)
    for (const key of Object.keys(MOMENT_CUES)) expect((MOMENTS as string[]).includes(key), `stale moment cue ${key}`).toBe(true)
  })

  it('counts derive from data: the registry sizes equal the deck sizes', () => {
    expect(Object.keys(EVENT_CUES).length).toBe(events.length)
    expect(Object.keys(CONDITION_CUES).length).toBe(conditionEvents.length)
    expect(Object.keys(MOMENT_CUES).length).toBe(MOMENTS.length)
    // The list is the walk every check here takes, so a moment named twice
    // would be checked twice and a moment left out not at all.
    expect(new Set(MOMENTS).size, 'MOMENTS names a moment twice').toBe(MOMENTS.length)
  })

  it('rejects malformed or unknown cue keys', () => {
    expect(resolveCue('nonsense')).toBeUndefined()
    expect(resolveCue('event:not-a-real-event')).toBeUndefined()
    expect(resolveCue('sound:pnt-jamming')).toBeUndefined()
    // The retired director's namespaces resolve to nothing, so a caller
    // still asking for a beat or a countermeasure cue is caught rather
    // than answered.
    expect(resolveCue('beat:threat')).toBeUndefined()
    expect(resolveCue('counter:antiJam')).toBeUndefined()
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

  it('backs every visual with a class that exists in a stylesheet', () => {
    const missing: string[] = []
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      if (!new RegExp(`\\.${className}\\s*[{,]`).test(CSS)) missing.push(`${visual} -> .${className}`)
    }
    expect(missing.join(', ')).toBe('')
  })

  it('keeps every animation behind the reduced-motion guard', () => {
    let guarded = ''
    for (const [file, css] of SHEETS) {
      const guard = guardOf(css)
      expect(guard.open, `${file} has no reduced-motion guard`).toBeGreaterThan(-1)
      expect(guard.end, `${file}: reduced-motion guard block is unterminated`).toBeGreaterThan(guard.open)
      // The block really is bounded: the keyframes that follow it must fall
      // outside the slice, or the assertions below prove nothing.
      expect(guard.body, `${file}: the guard slice runs into the keyframes`).not.toContain('@keyframes')
      guarded += guard.body
    }
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
      // dc-hold-fill stood here until v1.3 Round 0, when EXECUTE became a
      // tap and the hold ring left the stylesheet with its control.
      'dc-manifest-in',
      // dc-phase-dim and Round 5's six scene classes (dc-scene-blackout,
      // -commendation, -victory, -defeat, -die, -wash) stood here until
      // v1.3 Round 3, when the director that applied them retired. Their
      // place is taken by the night's own component-applied motion: the
      // overlay's spinner, the strike's reticle, a tile that got through,
      // and the dossier bar on the intel card.
      'dc-spin i',
      'dc-reticle',
      'dc-tile-hit',
      'dc-bar-fill',
    ]) {
      expect(guarded, `${selector} must be declared inside the reduced-motion guard`).toContain(`.${selector} {`)
    }
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
    // Every row is carried by a component since v1.3 Round 3: the night
    // applies its treatments by name in its own files, where the director
    // resolved them through the registry. So the proof for every row is
    // the one the component rows always had: the file the row names
    // applies the class. A row that names moments must also agree with
    // the registry about what those moments look like, or the table and
    // the registry would describe two different nights.
    const unwired: string[] = []
    for (const row of SECTION_6_ROWS) {
      for (const moment of row.moments ?? []) {
        if (MOMENT_CUES[moment].visual !== row.visual) {
          unwired.push(`${row.beat}: the row shows ${row.visual}, the registry's ${moment} shows ${MOMENT_CUES[moment].visual}`)
        }
      }
      const className = VISUAL_CLASS[row.visual]
      if (!className) continue
      const source = readFileSync(join(SRC, row.where.split(' ')[0]), 'utf8')
      if (!source.includes(className)) unwired.push(`${row.beat}: ${row.where} never names .${className}`)
    }
    expect(unwired.join('\n')).toBe('')
    expect(
      SECTION_6_ROWS.filter((r) => r.moments?.length).length,
      'no row names a moment, so the agreement above proves nothing',
    ).toBeGreaterThan(8)
  })

  // RETIRED in v1.3 Round 3, with the rows and the director they read:
  //   - "keeps the arrival row deferred while the frame it needs is off
  //     screen": the Deployment arrives row and its deploy-arrived beat
  //     left the table; the night has no arrival moment.
  //   - "gives every cinematic row a scene" and "backs every scene with an
  //     entrance": Scene.tsx and the dc-scene-* entrances were deleted, and
  //     rows carry no scene or cinematicInRound5.
  //   - "pins CARD_SAFE_VISUALS": the set decided what DirectorView ran on
  //     its one card. Each night card names its own classes, which the
  //     wiring test above checks file by file and tests/sound.dom.spec.tsx
  //     sees on screen.

  it('records what each deferred row still owes', () => {
    // A row that ships only part of its brief treatment says so, so the
    // battery cannot report an unfinished row as done.
    for (const row of SECTION_6_ROWS) {
      if (row.deferred) expect(row.deferred.length).toBeGreaterThan(8)
    }
    expect(SECTION_6_ROWS.filter((r) => r.deferred).length).toBeGreaterThan(0)
  })

  it('uses every declared visual treatment at least once', () => {
    const used = new Set<string>(SECTION_6_ROWS.map((r) => r.visual))
    for (const [, map] of ALL_CUES) for (const entry of Object.values(map)) used.add(entry.visual)
    const declared = Object.keys(VISUAL_CLASS).filter((v) => v !== 'placeholder')
    for (const visual of declared) {
      expect(used.has(visual), `visual ${visual} is declared but never used`).toBe(true)
    }
  })

  it('resolves a visual for a moment, event or condition key, and nothing for an unknown one', () => {
    // visualClass(cueKey, kind) retired with the director; the night
    // applies classes by name. What is left to resolve is the registry
    // entry, through the one function every namespace goes through.
    expect(resolveCue('moment:strike-hit')?.visual).toBe('strike')
    expect(resolveCue('moment:strike-block')?.visual).toBe('shield')
    expect(VISUAL_CLASS[resolveCue('moment:strike-block')!.visual]).toBe('dc-shield-tile')
    expect(resolveCue('condition:pnt-jamming')?.visual).toBe('chip-in')
    expect(resolveCue('event:blackout-chain')?.visual).toBe('strike')
    expect(resolveCue('event:not-real')).toBeUndefined()
  })

  // RETIRED in v1.3 Round 3: "lets the beat kind own the visual where the
  // subject cue would say the wrong thing" (KIND_OWNS_TREATMENT and
  // visualFor left with the beats), and "plays the visual each beat kind
  // claims, over real play". The second one's purpose survives and moved
  // to tests/sound.dom.spec.tsx, which drives real nights through Game and
  // checks each moment's treatment on the element that shows it.

  it('leaves no declared visual unreachable', () => {
    // Every treatment is carried by a component that a section 6 row
    // names, now that no beat plays one. A visual reachable from no row is
    // dead code dressed as coverage.
    const fromRows = new Set(SECTION_6_ROWS.map((r) => r.visual))
    const unreachable = (Object.keys(VISUAL_CLASS) as VisualCue[]).filter((v) => v !== 'placeholder' && !fromRows.has(v))
    expect(unreachable.join(', ')).toBe('')
  })
})

describe('cue timing and card safety', () => {
  // The rule for a class in whichever stylesheet declares it, bounded to
  // the class itself so .dc-tile-in cannot pick up .dc-tile-in-x.
  const ruleFor = (className: string): string | undefined => {
    for (const [, css] of SHEETS) {
      const rule = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css)
      if (rule && /animation:/.test(rule[1])) return rule[1]
    }
    return undefined
  }
  // A duration as the stylesheets write it: a plain time, the strike's
  // length (var(--dc-beat, 1200ms)), or a share of it (calc(var(...) * k)).
  // The fallback is what a treatment runs for when nothing sets the
  // variable, and Game sets it to STRIKE_MS, so the two are checked equal
  // below rather than assumed.
  const BEAT = /var\(--dc-beat,\s*([0-9.]+)(m?s)\)/
  const toMs = (n: string, unit: string) => (unit === 's' ? Number(n) * 1000 : Number(n))
  const declared = (className: string): { ms: number; loops: boolean; name: string; beat?: number } | undefined => {
    const body = ruleFor(className)
    if (!body) return undefined
    const anim = /animation:\s*([\w-]+)\s+(calc\(var\([^)]*\)[^)]*\)|var\([^)]*\)|[0-9.]+m?s)([^;]*)/.exec(body)
    if (!anim) return undefined
    const [, name, time, rest] = anim
    const loops = /\binfinite\b/.test(rest)
    const beat = BEAT.exec(time)
    if (!beat) {
      const plain = /^([0-9.]+)(m?s)$/.exec(time)
      return plain ? { ms: toMs(plain[1], plain[2]), loops, name } : undefined
    }
    const fallback = toMs(beat[1], beat[2])
    const share = /\*\s*([0-9.]+)\s*\)$/.exec(time)
    return { ms: Math.round(fallback * (share ? Number(share[1]) : 1)), loops, name, beat: fallback }
  }

  it('records the stylesheet duration for every animated visual', () => {
    // The helper strips a cue class when its animation is over. A recorded
    // duration shorter than the stylesheet's would cut the animation off
    // mid-frame; longer would leave the class on the element. Both numbers
    // are read from the same stylesheets the browser uses.
    const wrong: string[] = []
    let shares = 0
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      const css = declared(className)
      expect(css, `${className} declares no animation duration`).toBeDefined()
      const recorded = VISUAL_MS[visual as keyof typeof VISUAL_MS]
      // A treatment that loops (the strobe until the state clears, the
      // COLLECT glow until the tap) has no one-shot life, and records none.
      if (css!.loops) {
        if (recorded !== 0) wrong.push(`${visual}: loops in the stylesheet but records ${recorded}ms`)
        continue
      }
      if (css!.beat !== undefined) {
        shares += 1
        if (css!.beat !== STRIKE_MS) wrong.push(`${visual}: the stylesheet's strike falls back to ${css!.beat}ms, STRIKE_MS is ${STRIKE_MS}`)
      }
      if (recorded !== css!.ms) wrong.push(`${visual}: recorded ${recorded}ms, stylesheet ${css!.ms}ms`)
    }
    expect(wrong.join('\n')).toBe('')
    // The strike's share was read at least once, or the calc branch above
    // was never exercised and a wrong share would pass.
    expect(shares, 'no treatment takes the strike length, so its parse is untested').toBeGreaterThan(1)
  })

  it('gives every visual a duration entry, and none to the ones that do not animate', () => {
    for (const visual of Object.keys(VISUAL_CLASS) as (keyof typeof VISUAL_MS)[]) {
      expect(VISUAL_MS[visual], `${visual} has no duration`).toBeTypeOf('number')
      if (!VISUAL_CLASS[visual]) expect(VISUAL_MS[visual], `${visual} has no class but a duration`).toBe(0)
    }
  })

  it('never lets a treatment that ends hidden rest on a card', () => {
    // The successor of the card-safe set. A treatment whose keyframes end
    // below full opacity takes its element away with it; on a card that
    // waits for a tap, that is the card itself vanishing under the
    // player's thumb. The strike's banner is the known case and is meant
    // to go: it leaves with the strike. So the cards' treatments, the
    // visuals of every row whose treatment lives on a night card, must all
    // end visible. The keyframes are found through each class's own
    // animation name, since several (the overlay's dc-fade-in, the
    // shield's dc-shield) are not named after their class.
    const keyframeBlock = (name: string): string => {
      for (const [, css] of SHEETS) {
        const at = css.indexOf(`@keyframes ${name} {`)
        if (at < 0) continue
        let depth = 0
        for (let i = css.indexOf('{', at); i < css.length; i += 1) {
          if (css[i] === '{') depth += 1
          else if (css[i] === '}') {
            depth -= 1
            if (depth === 0) return css.slice(at, i + 1)
          }
        }
      }
      return ''
    }
    const endsHidden: string[] = []
    let parsed = 0
    for (const [visual, className] of Object.entries(VISUAL_CLASS)) {
      if (!className) continue
      const name = declared(className)?.name
      expect(name, `${className} names no keyframes`).toBeTruthy()
      const block = keyframeBlock(name!)
      expect(block, `${className} animates @keyframes ${name}, which no stylesheet declares`).not.toBe('')
      const last = /100%\s*\{([^}]*)\}/.exec(block)?.[1] ?? ''
      const opacity = /opacity:\s*([0-9.]+)/.exec(last)?.[1]
      if (opacity !== undefined) parsed += 1
      if (opacity !== undefined && Number(opacity) < 1) endsHidden.push(visual)
    }
    const onCards = new Set(SECTION_6_ROWS.filter((r) => /^ui\/night\/(cards|closeCards)\.tsx/.test(r.where)).map((r) => r.visual))
    expect(onCards.size, 'no row lives on a night card, so this asserts nothing').toBeGreaterThan(3)
    for (const visual of endsHidden) {
      expect(onCards.has(visual as VisualCue), `${visual} ends at reduced opacity and must not rest on a card`).toBe(false)
    }
    // The check is only meaningful if it found the known case.
    // The check is only meaningful if it read the keyframes' ends. Until
    // v1.6 R3 the strike's banner was the known case that ended hidden; it
    // now stands until its card comes up (Ken's playtest item 2: a strike
    // holds about 2.5 s), so none ends hidden, and the banner's end is one
    // the parse must read.
    expect(parsed, 'no keyframes end was read, so this asserts nothing').toBeGreaterThan(3)
    expect(endsHidden).toEqual([])
  })

  it('declares no animation for a cue class outside the reduced-motion guard', () => {
    // The containment test proves each class appears inside the guard; this
    // proves none of them also animates outside it, which is the shape of
    // the rule that was moved under the guard.
    const leaked: string[] = []
    for (const [file, css] of SHEETS) {
      const guard = guardOf(css)
      const outside = css.slice(0, guard.open) + css.slice(guard.end + 1)
      for (const className of new Set(Object.values(VISUAL_CLASS).filter(Boolean))) {
        const rule = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(outside)
        if (rule && /animation:|transform/.test(rule[1])) leaked.push(`${file}: ${className}`)
      }
    }
    expect(leaked.join(', ')).toBe('')
  })
})
