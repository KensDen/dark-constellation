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
import {
  HOLD_IDLE,
  holdReducer,
  isSyntheticActivation,
  type HoldEvent,
  type HoldState,
} from '../src/ui/cues/HoldButton'
import { countUpMode, playbackPaused } from '../src/ui/cues/visibility'
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

  it('pins every link of the declaration chain by value, not by spelling', () => {
    // The chain runs Director -> DirectorView -> Game -> Readout -> the
    // pure rule, and the opening pass proved four of those links could be
    // reverted one line at a time with the whole suite, typecheck and lint
    // green. This suite has no DOM, so the links are read from the source.
    //
    // Every assertion below pins the VALUE the link must carry rather than
    // forbidding one spelling of one bug. The previous version of this
    // test forbade `chosenDelta={phase === 'playback'` and was defeated by
    // the same expression in double quotes, by the same condition written
    // the other way round, and by `chosenDelta={0}`. A positive assertion
    // fails on all three.
    //
    // A rendering test replaces all of this in Round 5, when the DOM
    // environment lands; until then these are spelling-pinned and will
    // fail on an innocent refactor, which is the cost of having no DOM.
    // Comments are stripped first. A file-scoped pin is otherwise satisfied
    // by a comment: revert the line, leave the old one commented above it,
    // and every assertion below still finds its text. Block comments and
    // whole-line comments are removed; a trailing comment after code is
    // left alone, which is the honest limit of doing this without a parser.
    const code = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n')
    const view = code(readFileSync(join(SRC, 'director', 'DirectorView.tsx'), 'utf8'))
    const game = code(readFileSync(join(SRC, 'ui', 'Game.tsx'), 'utf8'))
    const meter = code(readFileSync(join(SRC, 'ui', 'cues', 'Meter.tsx'), 'utf8'))

    // Link 0: the view is actually wired to the handler that stores the
    // declaration. Pinning what the view passes and what the handler does
    // proves nothing if the two are not connected.
    expect(game, 'the playback view must be wired to the handler that stores the declaration').toMatch(
      /<DirectorView[\s\S]*?onPresented=\{\s*showPresented\s*\}/,
    )
    expect(game, 'the handler must be the one that sets the declaration').toMatch(
      /const showPresented = useCallback\(\s*\(\s*s\s*:\s*GameState\s*,\s*chosenCredits\s*:\s*number\s*\)/,
    )

    // Link 1: the view forwards both halves of the snapshot, not a literal.
    expect(view, 'DirectorView must forward the declaration the director computed').toMatch(
      /onPresented\(\s*snap\.presented\s*,\s*snap\.chosenCredits\s*\)/,
    )
    // Link 2: the HUD stores it unchanged.
    expect(game, 'Game must store the declaration unchanged').toMatch(/setChosenSpend\(\s*chosenCredits\s*\)/)
    // Link 3: the readout receives it unchanged and ungated. Gating it on
    // the playback phase is the bug, not the fix: skipping ends playback in
    // the same commit that applies the spend, so the gate is already false
    // by the render that needs it.
    const readout = /<Readout\s+label=\{hud\.credits\}[\s\S]*?\/>/.exec(game)
    expect(readout, 'the credits readout is not where this guard expects it').not.toBeNull()
    expect(readout![0], 'the declaration must reach the readout ungated').toMatch(
      /chosenDelta=\{\s*chosenSpend\s*\}/,
    )
    // Link 3b: the two props that decide whether a change has a valence at
    // all. Dropping `chosen` repaints every purchase in the decision
    // phases hostile, which is the complaint this wiring exists to answer;
    // dropping `basis` brings back the phantom flash from Round 3.
    expect(readout![0], 'the readout must know when the player is driving the number').toMatch(
      /chosen=\{\s*phase === 'procure' \|\| phase === 'harden'\s*\}/,
    )
    expect(readout![0], 'the readout must know which quantity it is showing').toMatch(
      /basis=\{\s*phase === 'procure' \|\| phase === 'harden' \? 'cart' : 'balance'\s*\}/,
    )
    // Link 4: the rule is composed with the declaration, not with a zero,
    // and it is composed at the call site that records the change. Pinning
    // the expression alone would pass if it sat in a helper nothing calls
    // while setChange recorded something else, which is how the first
    // version of this fix failed.
    expect(meter, 'the recorded tone must be composed from the declaration').toMatch(
      /setChange\(\s*\(c\)\s*=>\s*\(\{\s*tone:\s*toneForDelta\(\s*unchosenDelta\(\s*delta\s*,\s*chosen\s*,\s*chosenDelta\s*\)\s*\)/,
    )
  })

  it('drops the valence of a change the player chose, and keeps what is left', () => {
    // Spending credits is a decision, not damage, and the decision is made
    // when the change is recorded: masking the tone at render time leaves
    // it latched, and useCueClass treats the class it is handed changing
    // from empty to a real one as a trigger, so the cue fires late instead
    // of not at all.
    expect(unchosenDelta(-30, true, 0)).toBe(0)
    expect(toneForDelta(unchosenDelta(-30, true, 0))).toBe('neutral')
    // Playback folds the turn's purchase into the next visible beat, so
    // only part of that beat's credits change is the player's.
    expect(unchosenDelta(-63, false, 63)).toBe(0)
    expect(toneForDelta(unchosenDelta(-63, false, 63))).toBe('neutral')
    // A beat that carries a purchase and a repair bill still flashes for
    // the repair.
    expect(unchosenDelta(-70, false, 63)).toBe(-7)
    expect(toneForDelta(unchosenDelta(-70, false, 63))).toBe('bad')
    // Income arriving on the same beat is still a gain.
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

  it('does not tick a condition that landed during the playback just watched', () => {
    // The turn only flips when playback hands over to the engine's
    // after-state, so at that instant every condition applied during the
    // playback is already in the previous list. Without the startedTurn
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
  it('states one policy the three channels answer to', () => {
    // The policy is a decision, so it is asserted rather than inferred:
    // hidden means paused, and every channel lands on the truth of the
    // beat being shown.
    expect(playbackPaused(false)).toBe(true)
    expect(playbackPaused(true)).toBe(false)
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

describe('the prelude controls', () => {
  it('does not commit the turn on an ordinary click or tap', () => {
    // The defect this replaced: the control kept a flag saying a pointer
    // gesture was in flight and cleared it on pointerup, which the browser
    // dispatches BEFORE the click it synthesises from the same gesture. So
    // every real mouse click and every real tap arrived at the click
    // handler with the flag already false and committed the turn at once.
    // Script-dispatched pointer events produce no click, which is why
    // driving the page from script did not show it.
    //
    // The sequence below is exactly what a browser sends for one click.
    const play = (events: HoldEvent[], disabled = false) => {
      let state: HoldState = HOLD_IDLE
      const effects: string[] = []
      for (const event of events) {
        const step = holdReducer(state, event, { disabled })
        state = step.state
        effects.push(step.effect)
      }
      return { state, effects }
    }

    const tap = play([
      { type: 'pointerdown', pointerId: 1, primary: true },
      { type: 'pointerup', pointerId: 1 },
      { type: 'click', detail: 1 },
    ])
    expect(tap.effects, 'a quick tap must start the hold, cancel it, and commit nothing').toEqual([
      'start',
      'cancel',
      'none',
    ])

    // Held to the end: one confirm, and the trailing click adds nothing.
    const held = play([
      { type: 'pointerdown', pointerId: 1, primary: true },
      { type: 'elapsed' },
      { type: 'pointerup', pointerId: 1 },
      { type: 'click', detail: 1 },
    ])
    expect(held.effects).toEqual(['start', 'confirm', 'none', 'none'])

    // A click with no pointer behind it is a keyboard or assistive
    // activation, and those do not hold.
    expect(play([{ type: 'click', detail: 0 }]).effects).toEqual(['confirm'])
    expect(isSyntheticActivation(0)).toBe(true)
    expect(isSyntheticActivation(1)).toBe(false)
    expect(isSyntheticActivation(2)).toBe(false)

    // Keyboard fires at once, and the click the browser may follow with is
    // swallowed rather than committing a second time.
    expect(
      play([
        { type: 'keydown', key: 'Enter', repeat: false },
        { type: 'click', detail: 0 },
      ]).effects,
    ).toEqual(['confirm', 'none'])
    expect(play([{ type: 'keydown', key: 'a', repeat: false }]).effects).toEqual(['none'])
    expect(play([{ type: 'keydown', key: ' ', repeat: true }]).effects).toEqual(['none'])

    // A stale timer cannot confirm a gesture that is already over, and no
    // gesture confirms twice.
    expect(
      play([
        { type: 'pointerdown', pointerId: 1, primary: true },
        { type: 'elapsed' },
        { type: 'elapsed' },
      ]).effects,
    ).toEqual(['start', 'confirm', 'none'])
    expect(play([{ type: 'elapsed' }]).effects).toEqual(['none'])

    // Secondary buttons open menus; they do not commit turns.
    expect(play([{ type: 'pointerdown', pointerId: 1, primary: false }]).effects).toEqual(['none'])

    // A second finger neither restarts the hold nor cancels it by lifting.
    expect(
      play([
        { type: 'pointerdown', pointerId: 1, primary: true },
        { type: 'pointerdown', pointerId: 2, primary: true },
        { type: 'pointerup', pointerId: 2 },
        { type: 'elapsed' },
      ]).effects,
    ).toEqual(['start', 'none', 'none', 'confirm'])

    // Dragging off the control cancels, as releasing early does.
    expect(
      play([
        { type: 'pointerdown', pointerId: 1, primary: true },
        { type: 'pointerlost', pointerId: 1 },
        { type: 'elapsed' },
      ]).effects,
    ).toEqual(['start', 'cancel', 'none'])

    // A disabled control commits nothing on any path.
    for (const event of [
      { type: 'pointerdown', pointerId: 1, primary: true },
      { type: 'click', detail: 0 },
      { type: 'keydown', key: 'Enter', repeat: false },
      { type: 'elapsed' },
    ] as HoldEvent[]) {
      expect(play([event], true).effects, `${event.type} committed while disabled`).toEqual(['none'])
    }
  })

  it('leaves the duration of the ring to the control, so the stylesheet cannot drift from it', () => {
    // The DOM suite asserts the rendered inline duration end to end. What
    // no render can show is the other half of the contract: that the
    // stylesheet declares no duration of its own to drift from the timer.
    // This assertion was lost for part of Round 4c when the source-pinned
    // half of its test was retired with too blunt an edit, and the audit
    // caught it as a mutation that had started surviving.
    const rule = /\.dc-hold-fill\s*\{([^}]*)\}/.exec(CSS)
    expect(rule, '.dc-hold-fill is not in the stylesheet').not.toBeNull()
    expect(rule![1], 'the stylesheet must not declare its own hold duration').not.toMatch(/\d+m?s/)
  })

  it('wires the prelude cues to the controls they belong to', () => {
    // Same idiom and the same limitation as the declaration chain: no DOM
    // here, so the wiring is read from the source with comments stripped.
    const game = readFileSync(join(SRC, 'ui', 'Game.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n')
    // The resolve control is the hold control, not a plain button.
    expect(game, 'the resolve control must be the hold control').toMatch(
      /<HoldButton[\s\S]*?onConfirm=\{\s*resolve\s*\}/,
    )
    // Any plain control that resolves, however the handler is spelled:
    // wrapping it in an arrow defeated the earlier form of this check.
    expect(game, 'a plain resolve button must not sit beside it').not.toMatch(
      /<button[\s\S]{0,240}?onClick=\{[^}]*\bresolve\b/,
    )
    // The manifest entrance is applied to the entry that was just added.
    expect(game, 'the manifest cue must be keyed to the entry that was added').toMatch(
      /arrived\?\.index === i \? manifestCue : undefined/,
    )
    // The adversary phase enters through the dim, and the dim is keyed to
    // the turn being played. Pinning the wrapper alone left the key free
    // to be neutralised, which renders the class once and never again.
    expect(game, 'the playback section must enter through the dim').toMatch(
      /<div className=\{phaseDim\}>[\s\S]{0,200}?<DirectorView/,
    )
    expect(game, 'the dim must be keyed to the turn it plays').toMatch(
      /useCueClass\(\s*phase === 'playback' \? `dim-\$\{state\?\.turn \?\? 0\}` : null\s*,\s*'dc-phase-dim'/,
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
