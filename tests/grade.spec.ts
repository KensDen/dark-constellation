// The score screen's grade, stats and turn strip (v1.2 Rounds 5a and 5,
// brief 7.2; the six-turn game and the defense bonus since v1.3 Round 0).
// Every threshold is read from the constants in src/engine/grade.ts and
// none is written here (principle 17), so moving one cannot leave a test
// asserting the old number.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { GRADE_THRESHOLDS, TURN_STRIP, gradeFor, gradeOf, hitsTaken, knockoutsByTurn, stripColour, turnStrip, type Grade } from '../src/engine/grade'
import { defenseBonus } from '../src/engine/learning'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { ASSET_DAMAGE_PER_SEVERITY } from '../src/engine/rules'
import { maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions } from '../src/engine/types'
import { POLICIES } from './policies'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT, randomPolicy } from './scripts'

// The smallest step the MAI takes: it is shown to one decimal place.
const STEP = 0.1

describe('the grade', () => {
  it('grades a won campaign by final MAI, each threshold inclusive', () => {
    const won = (finalMai: number) => gradeFor({ status: 'won', finalMai })
    expect(won(GRADE_THRESHOLDS.S)).toBe('S')
    expect(won(GRADE_THRESHOLDS.S - STEP)).toBe('A')
    expect(won(GRADE_THRESHOLDS.A)).toBe('A')
    expect(won(GRADE_THRESHOLDS.A - STEP)).toBe('B')
    expect(won(GRADE_THRESHOLDS.B)).toBe('B')
    expect(won(GRADE_THRESHOLDS.B - STEP)).toBe('C')
    expect(won(DEFAULT_SCENARIO.winThreshold)).toBe('C')
  })

  it('orders its thresholds above the win line, so every grade can be earned', () => {
    expect(GRADE_THRESHOLDS.S).toBeGreaterThan(GRADE_THRESHOLDS.A)
    expect(GRADE_THRESHOLDS.A).toBeGreaterThan(GRADE_THRESHOLDS.B)
    expect(GRADE_THRESHOLDS.B, 'no won campaign could be graded C').toBeGreaterThan(DEFAULT_SCENARIO.winThreshold)
  })

  it('gives D to a campaign that survived every turn under the line, and F to one that ended early', () => {
    // A lost grade does not look at the MAI, so the highest one is used.
    const finalMai = GRADE_THRESHOLDS.S
    expect(gradeFor({ status: 'lost', lossReason: 'belowThreshold', finalMai })).toBe('D')
    expect(gradeFor({ status: 'lost', lossReason: 'maiCollapse', finalMai })).toBe('F')
    expect(gradeFor({ status: 'lost', lossReason: 'insolvency', finalMai })).toBe('F')
    expect(() => gradeFor({ status: 'playing', finalMai })).toThrow()
  })

  it('reads a finished game the same way, from its last turn, with its defense bonus', () => {
    // Real campaigns, one of each ending real play reaches: a win, a loss
    // at the line, and insolvency (v1.3: repairs and upkeep can now break
    // the budget). The win is one whose defense bonus moves its grade, so a
    // reading that dropped the bonus (brief 6.8) would fail here.
    type Ending = 'won' | 'belowThreshold' | 'insolvency' | 'maiCollapse'
    const lines: ((seed: number) => (s: GameState) => TurnActions)[] = [
      () => (s) => WIN_SCRIPT[s.turn] ?? NO_OP,
      () => (s) => MIXED_SCRIPT[s.turn] ?? NO_OP,
      () => (s) => LOSS_SCRIPT[s.turn] ?? NO_OP,
      (seed) => randomPolicy(seed),
    ]
    const cases: [GameState, Ending][] = []
    for (let seed = 1; seed <= 40 && cases.length < 3; seed += 1) {
      for (const line of lines) {
        const end = play(seed, line(seed))
        const how: Ending = end.status === 'won' ? 'won' : end.lossReason!
        const finalMai = end.history[end.history.length - 1].maiScore
        const bonusMoves = gradeFor({ status: end.status, finalMai }) !== gradeFor({ status: end.status, finalMai, bonus: defenseBonus(end.bestStreak, end.saved) })
        if (how === 'won' && !bonusMoves) continue
        if (how !== 'maiCollapse' && !cases.some((c) => c[1] === how)) cases.push([end, how])
      }
    }
    // A collapse: no script, sweep policy or seed reaches one in six turns
    // (from 87.4 the score cannot fall under 35 that fast in real play), so
    // the campaign is built by hand: the trust meters worn down before
    // turn 1, then a real turn played on them.
    const worn: GameState = { ...newGame(DEFAULT_SCENARIO, 1, 'standard'), meters: { linkAvailability: 20, dataIntegrity: 20, sensorIntegrity: 20 } }
    const collapsed = resolveTurn(worn, NO_OP, turnRng(worn.seed, worn.turn))
    expect(collapsed.lossReason, 'the hand-built campaign did not collapse').toBe('maiCollapse')
    cases.push([collapsed, 'maiCollapse'])

    expect(cases.map((c) => c[1]).sort()).toEqual(['belowThreshold', 'insolvency', 'maiCollapse', 'won'])
    for (const [end] of cases) {
      const finalMai = end.history[end.history.length - 1].maiScore
      const bonus = defenseBonus(end.bestStreak, end.saved)
      expect(gradeOf(end)).toBe(gradeFor({ status: end.status, lossReason: end.lossReason, finalMai, bonus }))
    }
  })
})

describe('the turn strip', () => {
  it('is green when MAI did not drop, amber for a small drop, magenta for a large one or a knockout', () => {
    const at = (drop: number, knockedOut = false) => stripColour({ maiBefore: 80, maiAfter: 80 - drop, knockedOut })
    expect(at(-STEP)).toBe('green')
    expect(at(0)).toBe('green')
    expect(at(STEP)).toBe('amber')
    expect(at(TURN_STRIP.magentaDrop - STEP)).toBe('amber')
    expect(at(TURN_STRIP.magentaDrop)).toBe('magenta')
    // A knockout is magenta whatever the MAI did.
    expect(at(-STEP, true)).toBe('magenta')
    expect(at(0, true)).toBe('magenta')
  })

  it('reads a drop of exactly the boundary as magenta from every MAI the engine can show', () => {
    // The MAI moves in tenths, and some pairs of tenths subtract to a hair
    // under the boundary in floating point (65.6 - 62.6 among them). Every
    // one-decimal MAI from 0 to 100 is tried, the drop at the boundary and
    // a tenth under it.
    const tenths = Math.round(TURN_STRIP.magentaDrop * 10)
    const wrong: string[] = []
    for (let before = tenths; before <= 1000; before += 1) {
      const at = (dropTenths: number) => stripColour({ maiBefore: before / 10, maiAfter: (before - dropTenths) / 10, knockedOut: false })
      if (at(tenths) !== 'magenta') wrong.push(`${before / 10} - ${(before - tenths) / 10} read ${at(tenths)}`)
      if (at(tenths - 1) !== 'amber') wrong.push(`${before / 10} - ${(before - tenths + 1) / 10} read ${at(tenths - 1)}`)
    }
    expect(wrong.join('\n')).toBe('')
  })
})

describe('the grade is calibrated (brief 7.2)', () => {
  // The sweep the thresholds were set from (src/engine/grade.ts, brief
  // 6.8): every policy of the sweep gate (tests/policies.ts), 500 seeds
  // each on Standard, driven as tests/sweep.spec.ts drives them, and every
  // win graded on its final score plus its defense bonus. S should be
  // roughly the top 5 percent of wins and A roughly the next 20. Measured
  // when the thresholds were set: 664 wins (Prepared 394, Novice 270; the
  // other three policies win none on Standard), S 4.5 percent, A 18.7.
  //
  // Why the policies, and not the lines v1.2 calibrated on. Brief 6.8 asks
  // for the thresholds to be recalibrated "the way R5a did (S about the top
  // 5 percent of wins, A the next 20), with the bonus included", and R5a's
  // population was every scripted line of tests/scripts.ts plus the seeded
  // random line. Measured on v1.3 (Standard, 500 seeds a line, these
  // thresholds), that population gives 1706 wins with S 39.9 percent and A
  // 26.3, far outside both bands. The reason is that the scripts are
  // hand-picked lines, fixed orders written against this deck, and in six
  // turns the three planned ones win almost every seed: WIN_SCRIPT 500 of
  // 500, every one an S; MIXED_SCRIPT and TOP_INTEL_SCRIPT 485 each
  // (LAZY_SCRIPT wins 188, LOSS_SCRIPT none). So 1658 of the 1706 wins are
  // scripts replayed 500 times, 1470 of them from those three, and the
  // random line adds only 48: the shares describe those lines, not
  // players. The policies are the brief's section 7 model of players (buy
  // everything, prepared, novice, random legal, nothing), each choosing its
  // orders from the state a player sees, so they are the population, and
  // what is kept from R5a is the method: S the top 5 percent of wins and A
  // the next 20, bonus included.
  it(
    'gives S to about the top 5 percent of wins and A to about the next 20',
    () => {
      const grades: Grade[] = []
      for (const { policy } of POLICIES) {
        for (let seed = 1; seed <= 500; seed += 1) {
          const end = play(seed, policy)
          if (end.status === 'won') grades.push(gradeOf(end))
        }
      }
      expect(grades.length, 'too few wins to calibrate against').toBeGreaterThanOrEqual(100)
      const share = (g: Grade) => grades.filter((x) => x === g).length / grades.length
      expect(share('S'), 'S is not roughly the top 5 percent of wins').toBeGreaterThanOrEqual(0.03)
      expect(share('S')).toBeLessThanOrEqual(0.07)
      expect(share('A'), 'A is not roughly the next 20 percent of wins').toBeGreaterThanOrEqual(0.17)
      expect(share('A')).toBeLessThanOrEqual(0.23)
    },
    // 2500 six-turn campaigns: about a second on a laptop.
    60_000,
  )
})

describe("a run's knockouts, hits and strip, derived from its history (v1.2 Round 5)", () => {
  // Every campaign the engine plays, turn by turn, with the state each turn
  // resolved from and the state it produced: the engine's own record,
  // which the derivations below are held against.
  function* turns(): Generator<{ label: string; before: GameState; after: GameState; end: () => GameState }> {
    const lines: [string, (seed: number) => (s: GameState) => TurnActions][] = [
      ['WIN_SCRIPT', () => (s) => WIN_SCRIPT[s.turn] ?? NO_OP],
      ['LOSS_SCRIPT', () => (s) => LOSS_SCRIPT[s.turn] ?? NO_OP],
      ['MIXED_SCRIPT', () => (s) => MIXED_SCRIPT[s.turn] ?? NO_OP],
      ['LAZY_SCRIPT', () => (s) => LAZY_SCRIPT[s.turn] ?? NO_OP],
      ['random', (seed) => randomPolicy(seed)],
    ]
    // Expert was retired in v1.3, so the sweep plays the two difficulties
    // left over 100 seeds rather than three over 60: about 5700 turns, so
    // the bounds below hold as they were set.
    for (const difficulty of ['easy', 'standard'] as Difficulty[]) {
      for (const [name, line] of lines) {
        for (let seed = 1; seed <= 100; seed += 1) {
          const policy = line(seed)
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const before = state
            state = resolveTurn(state, policy(state), turnRng(state.seed, state.turn))
            const after = state
            yield { label: `${difficulty} ${name} seed ${seed} turn ${before.turn}`, before, after, end: () => after }
          }
        }
      }
    }
  }
  // The engine's own count: assets live before the turn (or arriving in
  // it, at 100) that are at 0 after it.
  const engineKnockouts = (before: GameState, after: GameState) =>
    after.assets.filter((a) => a.integrity === 0 && (before.assets.find((b) => b.id === a.id)?.integrity ?? 100) > 0).length

  // THE v1.2 DERIVATION, as src/engine/grade.ts had it before v1.3: replay
  // every hit an event named from 100, a debris strike to 0 and any other
  // hit effectiveSeverity * ASSET_DAMAGE_PER_SEVERITY off, floored at 0,
  // and count a knockout wherever a replayed asset reaches 0 from above.
  function v12Knockouts(state: GameState): number[] {
    const integrity = new Map<string, number>()
    return state.history.map((rec) => {
      let knocked = 0
      for (const ev of rec.events) {
        const id = ev.targetAssetId
        if (id === undefined) continue
        const before = integrity.get(id) ?? 100
        const def = state.scenario.events.find((e) => e.id === ev.eventId)
        const after = def?.effect.special === 'debrisStrike' ? 0 : Math.max(0, before - ev.effectiveSeverity * ASSET_DAMAGE_PER_SEVERITY)
        integrity.set(id, after)
        if (before > 0 && after === 0) knocked += 1
      }
      return knocked
    })
  }
  // The same replay from 100, fed instead the damage each hit really did
  // (its recorded integrity either side). It sees every hit exactly, so
  // the one thing it misses is integrity that changed between hits:
  // healing at a solvent close.
  function replayedKnockouts(state: GameState): number[] {
    const integrity = new Map<string, number>()
    return state.history.map((rec) => {
      let knocked = 0
      for (const ev of rec.events) {
        if (ev.targetAssetId === undefined || ev.integrityBefore === undefined || ev.integrityAfter === undefined) continue
        const before = integrity.get(ev.targetAssetId) ?? 100
        const after = Math.max(0, before - (ev.integrityBefore - ev.integrityAfter))
        integrity.set(ev.targetAssetId, after)
        if (before > 0 && after === 0) knocked += 1
      }
      return knocked
    })
  }

  it("counts every turn's knockouts exactly as the engine's own assets show them", () => {
    let turnsSeen = 0
    let knockoutTurns = 0
    let v12Wrong = 0
    let healingWrong = 0
    for (const { label, before, after } of turns()) {
      const derived = knockoutsByTurn(after)
      const engine = engineKnockouts(before, after)
      expect(derived[derived.length - 1], label).toBe(engine)
      turnsSeen += 1
      if (engine > 0) knockoutTurns += 1
      if (v12Knockouts(after).at(-1) !== engine) v12Wrong += 1
      if (replayedKnockouts(after).at(-1) !== engine) healingWrong += 1
    }
    // The positive controls: the sweep is large, knockouts happen in it,
    // and it holds turns where a replay from 100 gets the count wrong, so
    // the assertion above would catch the v1.2 derivation coming back.
    // Measured on this sweep (5728 turns, 277 with a knockout): the v1.2
    // derivation disagrees with the engine on 741 turns. Most of those come
    // from what the v1.3 record names rather than from healing (a debris
    // burn or a near miss names its satellite, which the v1.2 rule zeroes;
    // an event names the tile it was aimed at even when it did that tile no
    // damage; Easy scales the damage), but 15 come from healing alone: the
    // replay fed each hit's recorded damage still disagrees on 15 turns,
    // every one a turn where an asset that had healed survived a hit the
    // replay says knocked it out. In v1.2 the case a replay got wrong was
    // an asset that arrived and was knocked out in the same turn; arrivals
    // now land at the close, after the night's events, so that cannot
    // happen.
    expect(turnsSeen).toBeGreaterThan(5000)
    expect(knockoutTurns, 'no turn knocked anything out, so the sweep proves nothing').toBeGreaterThan(200)
    expect(v12Wrong, 'the v1.2 derivation agrees with the engine on every turn, so the sweep cannot tell it from this one').toBeGreaterThan(0)
    expect(healingWrong, 'no turn where healing makes a replay of the recorded hits disagree with the engine').toBeGreaterThan(0)
  }, 60_000)

  it("colours each turn from the MAI the engine's states show before and after it", () => {
    // The first turn's "before" is the state it resolved from, which the
    // history does not hold; turnStrip rebuilds it, and this holds the
    // rebuild to the state the engine actually started from.
    let magenta = 0
    let amber = 0
    for (const { label, before, after } of turns()) {
      const strip = turnStrip(after)
      const expected = stripColour({
        maiBefore: maiScore(before),
        maiAfter: after.history[after.history.length - 1].maiScore,
        knockedOut: engineKnockouts(before, after) > 0,
      })
      expect(strip[strip.length - 1], label).toBe(expected)
      if (expected === 'magenta') magenta += 1
      if (expected === 'amber') amber += 1
    }
    expect(magenta, 'no magenta turn in the sweep').toBeGreaterThan(0)
    expect(amber, 'no amber turn in the sweep').toBeGreaterThan(0)
  }, 60_000)

  it('counts a hit wherever the engine fired a technique', () => {
    // Two structures: the severity the engine resolved, and the technique
    // references it fired, which it sets only when a threat lands. Every
    // threat carries at least one reference, so the two counts agree.
    expect(DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat').every((e) => e.techniqueRefs.length > 0)).toBe(true)
    let held = 0
    for (let seed = 1; seed <= 40; seed += 1) {
      const end = play(seed, (s) => MIXED_SCRIPT[s.turn] ?? NO_OP)
      const fired = end.history.reduce((n, rec) => n + rec.events.filter((ev) => ev.firedTechniqueRefs.length > 0).length, 0)
      expect(hitsTaken(end), `seed ${seed}`).toBe(fired)
      held += end.history.reduce((n, rec) => n + rec.events.length, 0) - fired
    }
    // Events that did not land exist in the sweep, so a count of every
    // event would fail here.
    expect(held, 'every event landed, so hits taken was never tested against one that did not').toBeGreaterThan(0)
    expect(hitsTaken(play(1, (s) => MIXED_SCRIPT[s.turn] ?? NO_OP)), 'a campaign with no hits proves nothing').toBeGreaterThan(0)
  })
})

function play(seed: number, policy: (s: GameState) => TurnActions): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') state = resolveTurn(state, policy(state), turnRng(state.seed, state.turn))
  return state
}
