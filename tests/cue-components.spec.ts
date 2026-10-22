// Behavioural coverage for the cue components (Round 3). The hooks
// themselves need a DOM, which this suite deliberately does not add, but
// their pure decisions and their contract with the stylesheet are
// node-testable and are exactly where a silent regression would live: a
// tone that maps the wrong way, or a phase whose class was renamed out of
// the CSS and now animates nothing.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { BAR_TONE, FLASH_CLASS, TONE_TEXT, toneForDelta, unchosenDelta } from '../src/ui/cues/Meter'
import { audioSuspended, countUpMode } from '../src/ui/cues/visibility'
import { PHASE_CLASS, PHASE_MS, nextPhases, settlesFor, type BadgePhase } from '../src/ui/cues/ConditionBadge'
import { kindLabels, vectorLabels } from '../src/ui/labels'
import { DEFAULT_SCENARIO } from '../src/content'
import type { ActiveCondition, AssetKind, Vector } from '../src/engine/types'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const declares = (className: string) => new RegExp(`\\.${className}\\s*[{,]`).test(CSS)

describe('meter tone', () => {
  it('maps the sign of a change, with no change reading as neutral', () => {
    expect(toneForDelta(1)).toBe('good')
    expect(toneForDelta(42)).toBe('good')
    expect(toneForDelta(-1)).toBe('bad')
    expect(toneForDelta(-42)).toBe('bad')
    expect(toneForDelta(0)).toBe('neutral')
    expect(toneForDelta(-0)).toBe('neutral')
  })

  it('backs each non-neutral tone with a class the stylesheet declares', () => {
    expect(FLASH_CLASS.neutral).toBe('')
    for (const tone of ['good', 'bad'] as const) {
      expect(FLASH_CLASS[tone], `${tone} has no class`).not.toBe('')
      expect(declares(FLASH_CLASS[tone]), `${FLASH_CLASS[tone]} is not in the stylesheet`).toBe(true)
    }
    expect(FLASH_CLASS.good).not.toBe(FLASH_CLASS.bad)
  })

  it('paints a gain with the friendly token and a drop with the hostile one', () => {
    // Distinctness is not direction: swapping the two maps satisfied every
    // assertion above, and a player watching Link recover would have seen
    // hostile magenta. The colour is proved through the token each class
    // resolves to rather than through the class name, so renaming the pair
    // in both files stays green and inverting either one fails.
    const resolvesToken = (className: string): string | undefined => {
      const rule = new RegExp(`\\.${className}\\s*\\{[^}]*color:\\s*var\\((--[\\w-]+)\\)`).exec(CSS)
      return rule ? rule[1] : undefined
    }
    expect(resolvesToken(FLASH_CLASS.good), 'the gain flash resolves no colour token').toBe('--color-hero-blue')
    expect(resolvesToken(FLASH_CLASS.bad), 'the drop flash resolves no colour token').toBe('--color-hero-magenta')
    // The digits and the bar carry the same meaning through Tailwind
    // utilities, which name the same tokens.
    expect(TONE_TEXT.good).toContain('hero-blue')
    expect(TONE_TEXT.bad).toContain('hero-magenta')
    expect(BAR_TONE.good).toContain('hero-blue')
    expect(BAR_TONE.bad).toContain('hero-magenta')
    expect(TONE_TEXT.neutral).not.toContain('hero-')
    expect(BAR_TONE.neutral).not.toContain('hero-')
  })

  it('leaves the easing of the bar to the count-up, and drops its colour fade under reduce', () => {
    // The bar used to transition its width as well, on top of a value that
    // was already eased frame by frame, so it arrived about 400ms after
    // its own digits. Only the tone colour transitions now.
    //
    // Every rule for the selector is collected, not just the first, and
    // the assertion is on the transition's property names rather than on
    // the text of the declaration: a second rule appended later, or the
    // logical alias inline-size, would otherwise bring the lag back with
    // this test still green.
    const rulesFor = (className: string, css: string): string[] => {
      // Every rule whose selector list TARGETS the class, not only the ones
      // written as the bare class. A grouped selector (.dc-meter-fill,
      // .dc-bar-x) and a compound one in either order (.dc-meter-fill.live
      // and .live.dc-meter-fill) all style the element. The first version
      // of this helper matched only the literal ".dc-meter-fill {"; the
      // second still missed the compound form with the class written
      // second, because it required a non-word character before the dot,
      // which is exactly what a preceding class does not leave.
      //
      // The lookahead is what keeps .dc-meter-fill-inner from matching.
      // Comments are stripped first, so a comment that names the class
      // cannot attach the rule that follows it; and a selector that
      // excludes the class does not target it.
      const targets = new RegExp(`\\.${className}(?![-\\w])`)
      const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
      const out: string[] = []
      for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = rule[1].split(',').map((selector) => selector.replace(/:not\([^)]*\)/g, ''))
        if (selectors.some((selector) => targets.test(selector))) out.push(rule[2])
      }
      return out
    }
    const transitionProps = (body: string): string[] => {
      // Every declaration in the rule, not the first: a second transition
      // later in the same block wins in CSS and would otherwise be
      // invisible here. transition-property counts too, for the same
      // reason the logical alias does.
      const out: string[] = []
      for (const m of body.matchAll(/transition(?:-property)?:\s*([^;]*)/g)) {
        for (const part of m[1].split(',')) {
          const prop = part.trim().split(/\s+/)[0]
          if (prop) out.push(prop)
        }
      }
      return out
    }
    const sized = ['width', 'inline-size', 'block-size', 'height', 'all']

    // Split the stylesheet at the reduce block so the two halves are
    // asserted for different things.
    const open = CSS.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(open, 'there is no reduced-motion override block').toBeGreaterThan(-1)
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
    expect(end, 'the reduced-motion override block is unterminated').toBeGreaterThan(open)
    const reduceBlock = CSS.slice(open, end)
    const elsewhere = CSS.slice(0, open) + CSS.slice(end)

    const defaults = rulesFor('dc-meter-fill', elsewhere)
    expect(defaults.length, '.dc-meter-fill is not in the stylesheet').toBeGreaterThan(0)
    for (const body of defaults) {
      const props = transitionProps(body)
      for (const prop of props) {
        expect(sized, `.dc-meter-fill must not transition ${prop}; the count-up drives the width`).not.toContain(prop)
      }
    }
    expect(defaults.some((body) => transitionProps(body).includes('background-color'))).toBe(true)

    // The override is behaviour, not decoration: without it the colour
    // would still fade for a player who asked for no motion. Bound to the
    // selector, so a transition:none belonging to some other rule in the
    // block cannot stand in for it.
    const reduced = rulesFor('dc-meter-fill', reduceBlock)
    expect(reduced.length, '.dc-meter-fill has no reduced-motion override').toBeGreaterThan(0)
    expect(reduced.some((body) => /transition:\s*none/.test(body))).toBe(true)
  })

  // RETIRED in Round 4e. This pinned the declaration chain with four
  // regular expressions over two source files, because there was no DOM to
  // render into; it was the highest-risk of the eight guards the 4c audit
  // classified as unverified, since a text pin proves a spelling is
  // present and not that the program behaves.
  //
  // tests/game.dom.spec.tsx now renders the real campaign screen, buys,
  // resolves the turn and watches the credits readout across every beat of
  // playback, asserting the tone against the numbers the screen actually
  // showed. All three links are defeated by behaviour mutations there:
  // chosenDelta={0} at the readout, setChosenSpend(0) in the handler, and
  // onPresented(snap.presented, 0) in the view.
  //
  // The fixture also searches for a turn whose fold carries the purchase
  // and nothing else, and fails if it finds none, because on most turns a
  // repair bill lands in the same beat and the tone reads as damage
  // whether or not the declaration ever arrived.
  it('drops the valence of a change the player chose, and keeps what is left', () => {
    // Spending credits is a decision, not damage, and the decision is made
    // when the change is recorded: masking the tone at render time leaves
    // it latched, and useCueClass treats the class it is handed changing
    // from empty to a real one as a trigger, so the cue fires late instead
    // of not at all.
    expect(unchosenDelta(-30, true, 0)).toBe(0)
    expect(toneForDelta(unchosenDelta(-30, true, 0))).toBe('neutral')
    // The night folds the turn's orders into the first board it shows, so
    // only part of that board's credits change is the player's.
    expect(unchosenDelta(-63, false, 63)).toBe(0)
    expect(toneForDelta(unchosenDelta(-63, false, 63))).toBe('neutral')
    // A board that carries a purchase and a repair bill still flashes for
    // the repair.
    expect(unchosenDelta(-70, false, 63)).toBe(-7)
    expect(toneForDelta(unchosenDelta(-70, false, 63))).toBe('bad')
    // Income arriving on the same board is still a gain.
    expect(unchosenDelta(-43, false, 63)).toBe(20)
    expect(toneForDelta(unchosenDelta(-43, false, 63))).toBe('good')
    // Nothing chosen, nothing changed: an ordinary hit reads as one.
    expect(unchosenDelta(-12, false, 0)).toBe(-12)
    expect(toneForDelta(unchosenDelta(-12, false, 0))).toBe('bad')
  })
})

describe('condition badge phases', () => {
  it('gives every phase but the resting one a class the stylesheet declares', () => {
    const phases: BadgePhase[] = ['attached', 'applying', 'ticking', 'clearing']
    expect(Object.keys(PHASE_CLASS).sort()).toEqual([...phases].sort())
    expect(PHASE_CLASS.attached).toBe('')
    for (const phase of ['applying', 'ticking', 'clearing'] as const) {
      expect(PHASE_CLASS[phase], `${phase} has no class`).not.toBe('')
      expect(declares(PHASE_CLASS[phase]), `${PHASE_CLASS[phase]} is not in the stylesheet`).toBe(true)
    }
    // Three distinct cues, not one class wearing three names.
    expect(new Set(['applying', 'ticking', 'clearing'].map((p) => PHASE_CLASS[p as BadgePhase])).size).toBe(3)
  })

  it('runs each phase for as long as its own animation', () => {
    // One shared constant truncated the tick, which is the longest of the
    // three. The durations are read back out of the stylesheet so the
    // timer and the animation cannot drift apart again.
    const declaredMs = (className: string): number | undefined => {
      const rule = new RegExp(`\\.${className}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([0-9.]+)(m?s)`).exec(CSS)
      if (!rule) return undefined
      return rule[2] === 's' ? Number(rule[1]) * 1000 : Number(rule[1])
    }
    for (const phase of ['applying', 'ticking'] as const) {
      const css = declaredMs(PHASE_CLASS[phase])
      expect(css, `${PHASE_CLASS[phase]} declares no duration`).toBeDefined()
      expect(PHASE_MS[phase], `${phase} would cut its animation short`).toBe(css)
    }
    // A badge on its way out holds its end state: the keyframes finish at
    // opacity zero and it is about to leave the DOM, so clearing the class
    // would flash it back into view first.
    expect(PHASE_MS.clearing).toBe(0)
    expect(PHASE_MS.attached).toBe(0)
  })

  it('decides the phases a turn produces, including the tick nothing emitted before', () => {
    // The decision is pure, so it is called rather than grepped for: the
    // earlier version of this test counted a string literal in the source
    // and would have passed against a renamed or commented-out producer.
    const cond = (id: string, startedTurn: number): ActiveCondition => ({
      instanceId: id,
      eventId: 'pnt-jamming',
      name: 'PNT jamming',
      startedTurn,
      remainingTurns: 2,
      baseSeverity: 2,
    })
    const a = cond('a', 6)
    const b = cond('b', 7)

    // A condition that lands is applying.
    expect(nextPhases({ prev: [], next: [a], sameTurn: true, reduced: false })).toEqual({ a: 'applying' })
    // One that survives into a new turn ticks.
    expect(nextPhases({ prev: [a], next: [a], sameTurn: false, reduced: false })).toEqual({ a: 'ticking' })
    // The same list inside one turn is not a cue at all.
    expect(nextPhases({ prev: [a], next: [a], sameTurn: true, reduced: false })).toEqual({})
    // One that goes is clearing, and a new one alongside it still attaches.
    expect(nextPhases({ prev: [a], next: [b], sameTurn: false, reduced: false })).toEqual({
      b: 'applying',
      a: 'clearing',
    })
    // Reduced motion records the resting state instead of a cue, so no
    // phase can latch and replay when the preference is turned off.
    expect(nextPhases({ prev: [], next: [a], sameTurn: false, reduced: true })).toEqual({ a: 'attached' })
    expect(nextPhases({ prev: [a], next: [], sameTurn: false, reduced: true })).toEqual({})
    // A condition carried into a new turn under reduced motion records the
    // resting state too. A tick here would never settle, because no settle
    // timer runs under reduced motion, and the preference is read live: it
    // would replay the moment the player turned motion back on.
    expect(nextPhases({ prev: [a], next: [a], sameTurn: false, reduced: true })).toEqual({ a: 'attached' })
    // The mixed shape, so a change that splits only one of the two lists
    // is caught as well.
    expect(nextPhases({ prev: [a], next: [a, b], sameTurn: false, reduced: true })).toEqual({
      a: 'attached',
      b: 'attached',
    })
  })

  it('does not tick a condition that landed during the night just watched', () => {
    // The turn only flips when the night hands the board back to the
    // engine's after-state, so at that instant every condition applied
    // during the night is already in the previous list. Without the startedTurn
    // test each one fires the "persists into a new turn" tick a second
    // after its own attach cue.
    const cond = (id: string, startedTurn: number): ActiveCondition => ({
      instanceId: id,
      eventId: 'pnt-jamming',
      name: 'PNT jamming',
      startedTurn,
      remainingTurns: 2,
      baseSeverity: 2,
    })
    const landedThisTurn = cond('fresh', 7)
    const standingSince = cond('old', 5)
    // Turn 7 has just been played and the badges now show turn 8.
    expect(
      nextPhases({
        prev: [landedThisTurn, standingSince],
        next: [landedThisTurn, standingSince],
        sameTurn: false,
        reduced: false,
        prevTurn: 7,
      }),
    ).toEqual({ old: 'ticking' })
    // A turn later it is no longer fresh, and it ticks like any survivor.
    expect(
      nextPhases({ prev: [landedThisTurn], next: [landedThisTurn], sameTurn: false, reduced: false, prevTurn: 8 }),
    ).toEqual({ fresh: 'ticking' })
  })

  it('settles each badge on its own phase, so a later cue cannot be cut short', () => {
    // One batch used to settle every id it touched after a single fixed
    // delay, guarded only against overwriting a clear, so a stale timer
    // from an earlier batch ended a later tick early. The phase now
    // travels with the settle.
    expect(settlesFor({ a: 'applying', b: 'ticking' })).toEqual([
      { id: 'a', phase: 'applying', ms: PHASE_MS.applying },
      { id: 'b', phase: 'ticking', ms: PHASE_MS.ticking },
    ])
    // Each runs for its own length, not for the longest of the two.
    expect(PHASE_MS.applying).not.toBe(PHASE_MS.ticking)
    // Nothing to settle out of: a clearing badge leaves the DOM and a
    // resting one is already resting.
    expect(settlesFor({ a: 'clearing', b: 'attached' })).toEqual([])
    expect(settlesFor({})).toEqual([])
  })
})

describe('the hidden-page policy', () => {
  it('states one policy the channels answer to', () => {
    // The policy is a decision, so it is asserted rather than inferred:
    // hidden means paused, and every channel lands on the truth of the
    // beat being shown. Playback has had nothing to pause since v1.3 Round
    // 0, because every beat waits for a tap, so the decision that used to
    // stand here for it is gone; sound still has one, and it is the same
    // decision.
    expect(audioSuspended(false)).toBe(true)
    expect(audioSuspended(true)).toBe(false)
    // A hidden page and a reduced-motion preference mean the same thing to
    // a number: show it, do not animate it.
    expect(countUpMode(true, false)).toBe('ease')
    expect(countUpMode(false, false)).toBe('snap')
    expect(countUpMode(true, true)).toBe('snap')
    expect(countUpMode(false, true)).toBe('snap')
  })

  it('keeps the hidden-page decision in one place', () => {
    // The point of the policy is that the channels stop guessing
    // separately. A second module reading document.hidden is that
    // guessing coming back, so the DOM surface stays inside the policy.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue
        if (full.endsWith(join('cues', 'visibility.ts'))) continue
        const source = readFileSync(full, 'utf8')
        if (/document\.(hidden|visibilityState)|'visibilitychange'|"visibilitychange"/.test(source)) {
          offenders.push(full.slice(SRC.length + 1))
        }
      }
    }
    walk(SRC)
    expect(offenders.join(', '), 'these read the page state directly instead of the policy').toBe('')
  })
})

// The two tests that stood first in this block retired in v1.3 Round 0
// with the hold control itself: the gesture reducer that kept an ordinary
// click or tap from committing the turn, and the pin that kept the
// stylesheet from declaring a ring duration of its own. EXECUTE is a tap
// now, and the ring and its class are gone.
describe('the prelude controls', () => {
  it('wires the prelude cues to the controls they belong to', () => {
    // Same idiom and the same limitation as the declaration chain: no DOM
    // here, so the wiring is read from the source with comments stripped.
    const game = readFileSync(join(SRC, 'ui', 'Game.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n')
    // The resolve control is EXECUTE, a plain button since v1.3 Round 0
    // (the hold went with brief 4: "EXECUTE ends the turn"). Since v1.3 R2
    // the button lives in the dock (src/ui/board/Dock.tsx) and calls the
    // onExecute prop Game.tsx hands it. That handler sweeps and then
    // resolves, in that order and in the one handler, so a mouse click, a
    // tap and a keyboard activation all reach both. Since v1.3 Round 3 the
    // resolving function is `execute`, which resolves the turn in the
    // engine and opens the night (brief 5.5). Each element is bounded at
    // its own end, so a sweep or a resolve belonging to some neighbouring
    // control cannot satisfy this.
    const dockTag = /<Dock\b[\s\S]*?\/>/.exec(game)
    expect(dockTag, 'the resolve control must be the dock\'s EXECUTE').not.toBeNull()
    expect(dockTag![0], 'EXECUTE must sweep and then resolve on its click').toMatch(
      /onExecute=\{\s*\(\)\s*=>\s*\{[^}]*?\bplay\(\s*'execute-sweep'\s*\)[^}]*?\bexecute\(\s*\)/,
    )
    const dock = readFileSync(join(SRC, 'ui', 'board', 'Dock.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n')
    const execute = /<button\b(?:(?!<\/button>)[\s\S])*?\bdata-execute\b[\s\S]*?<\/button>/.exec(dock)
    expect(execute, 'the dock must render the EXECUTE button').not.toBeNull()
    expect(execute![0], 'EXECUTE\'s click must reach the handler').toMatch(/onClick=\{p\.onExecute\}/)
    // The dock hands the handler to EXECUTE and to nothing else.
    expect([...dock.matchAll(/\bp\.onExecute\b/g)].length, 'the dock calls onExecute from a second place').toBe(1)
    // And it is the only control that resolves, however the handler is
    // spelled: an arrow, a bare reference handed to some other prop, or a
    // keyboard path of its own. Every use of the identifier is counted
    // except its declaration, and the one that remains must be EXECUTE's.
    // String literals are blanked to the same length first, so the error
    // copy ("Turn could not resolve") is not mistaken for a call and every
    // index still points into the source above.
    const code = game.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, (literal) => ' '.repeat(literal.length))
    const uses = [...code.matchAll(/(?<![\w.])\bexecute\b(?!\w|\s*=(?!=))/g)]
    expect(uses.length, 'a second control resolves the turn beside EXECUTE').toBe(1)
    const at = uses[0].index!
    expect(at > dockTag!.index && at < dockTag!.index + dockTag![0].length, 'the one resolve is not inside EXECUTE').toBe(
      true,
    )
    // And the engine resolves the turn nowhere else in the file: every
    // call to resolveTurn sits inside execute's own body (two of them on a
    // night with the debris call, one per answer to it). A resolveTurn
    // reached from some other handler would be a second way to end the
    // turn that never sweeps, however the count above reads.
    const declared = /\bconst execute = \(\) => \{/.exec(code)
    expect(declared, 'Game.tsx no longer declares execute where this guard expects it').not.toBeNull()
    let depth = 0
    let end = -1
    for (let i = code.indexOf('{', declared!.index + declared![0].length - 1); i < code.length; i += 1) {
      if (code[i] === '{') depth += 1
      else if (code[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const calls = [...code.matchAll(/\bresolveTurn\(/g)].map((m) => m.index!)
    expect(calls.length, 'Game.tsx never resolves the turn, so the bound below proves nothing').toBeGreaterThan(0)
    for (const call of calls) {
      expect(call > declared!.index && call < end, 'the engine resolves the turn outside EXECUTE\'s handler').toBe(true)
    }
    // The playback dim that stood here (dc-phase-dim, keyed to the turn
    // being played) retired with the director in v1.3 Round 3. The night
    // enters through COLDVEIL IS MOVING instead, and that is proved by
    // behaviour rather than by a pin: tests/night-r3.dom.spec.tsx (a) has
    // EXECUTE open it, and tests/sound.dom.spec.tsx sees it open on every
    // night of an operation.
  })

  it('keys the manifest entrance to the order that was just queued', () => {
    // Split out in v1.3 R2 so the EXECUTE wiring above is not hostage to
    // it. The entrance was applied in Game.tsx to the queued tile of the
    // asset just ordered; the R2 strip (src/ui/board/AssetStrip.tsx)
    // renders the queued tile with no entrance, and the brief for R2 does
    // not list the cue as retired, so this stays red until it is wired
    // again or retired on the record.
    const game = readFileSync(join(SRC, 'ui', 'Game.tsx'), 'utf8')
    const strip = readFileSync(join(SRC, 'ui', 'board', 'AssetStrip.tsx'), 'utf8')
    expect(game + strip, 'the manifest cue must be keyed to the entry that was added').toMatch(
      /arrived\?\.index === i \? manifestCue : undefined/,
    )
  })
})

describe('player-facing labels', () => {
  it('covers every asset kind and vector the deck uses', () => {
    const kinds = new Set<AssetKind>(DEFAULT_SCENARIO.starterAssets.map((a) => a.kind))
    for (const k of ['sat', 'rpoSat', 'drone', 'groundStation'] as AssetKind[]) kinds.add(k)
    for (const kind of kinds) {
      expect(kindLabels[kind], `${kind} has no label`).toBeTruthy()
    }
    const vectors = new Set<Vector>(DEFAULT_SCENARIO.events.map((e) => e.vector))
    for (const vector of vectors) {
      expect(vectorLabels[vector], `${vector} has no label`).toBeTruthy()
    }
  })

  it('never lets a camelCase identifier through as a label', () => {
    for (const label of [...Object.values(kindLabels), ...Object.values(vectorLabels)]) {
      expect(label, `${label} reads as an identifier`).not.toMatch(/[a-z][A-Z]/)
      expect(label).not.toContain('_')
    }
  })

  it('keeps the label maps free of the engine keys they translate', () => {
    // A label that is just its own key would pass the camelCase check and
    // still leak an enum value to the player.
    for (const [key, label] of Object.entries(vectorLabels)) {
      if (key === 'optical' || key === 'cyber' || key === 'human' || key === 'environmental') continue
      expect(label).not.toBe(key)
    }
    for (const [key, label] of Object.entries(kindLabels)) expect(label).not.toBe(key)
  })
})
