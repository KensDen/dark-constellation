// The score screen's grade, stats and turn strip (v1.2 Rounds 5a and 5,
// brief 7.2; the six-turn game and the defense bonus since v1.3 Round 0).
// Every threshold is read from the constants in src/engine/grade.ts and
// none is written here (principle 17), so moving one cannot leave a test
// asserting the old number.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { GRADE_BANDS, TOP_GRADE, TURN_STRIP, gradeFor, nextGrade, gradeOf, hitsTaken, knockoutsByTurn, stripColour, turnStrip, type Grade } from '../src/engine/grade'
import { defenseBonus } from '../src/engine/learning'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { playNight, type Responder } from '../src/engine/responses'
import { ASSET_DAMAGE_PER_SEVERITY } from '../src/engine/rules'
import { maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions } from '../src/engine/types'
import { POLICIES, ride, sensible } from './policies'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, WIN_SCRIPT, randomPolicy, scripted } from './scripts'

// The smallest step the MAI takes: it is shown to one decimal place.
const STEP = 0.1

const DIFFICULTIES = ['standard', 'easy'] as const

describe('the grade', () => {
  it('grades a won campaign by its graded score at its difficulty, each threshold inclusive', () => {
    for (const difficulty of DIFFICULTIES) {
      const bands = GRADE_BANDS[difficulty]
      const won = (finalMai: number) => gradeFor({ status: 'won', finalMai, difficulty })
      expect(won(bands.S)).toBe(TOP_GRADE[difficulty])
      expect(won(bands.S - STEP)).toBe('A')
      expect(won(bands.A)).toBe('A')
      expect(won(bands.A - STEP)).toBe('B')
      expect(won(bands.B)).toBe('B')
      expect(won(bands.B - STEP)).toBe('C')
      expect(won(DEFAULT_SCENARIO.winThreshold)).toBe('C')
    }
    // STANDARD when the difficulty is not said: the Daily Op's, and an old record's.
    expect(gradeFor({ status: 'won', finalMai: GRADE_BANDS.standard.S })).toBe('S')
  })

  it('orders its thresholds above the win line, so every grade can be earned, and asks more of EASY', () => {
    for (const difficulty of DIFFICULTIES) {
      const bands = GRADE_BANDS[difficulty]
      expect(bands.S).toBeGreaterThan(bands.A)
      expect(bands.A).toBeGreaterThan(bands.B)
      expect(bands.B, 'no won campaign could be graded C').toBeGreaterThan(DEFAULT_SCENARIO.winThreshold)
      expect(bands.S, 'S is out of reach').toBeLessThan(100)
    }
    // Hits do less on EASY, so the same play ends higher there.
    for (const g of ['S', 'A', 'B'] as const) expect(GRADE_BANDS.easy[g]).toBeGreaterThan(GRADE_BANDS.standard[g])
    // A graded score that is an S on STANDARD is an A on EASY.
    expect(gradeFor({ status: 'won', finalMai: GRADE_BANDS.standard.S, difficulty: 'easy' })).toBe('A')
  })

  it('never gives S on EASY, whatever the score, and says what the next grade takes (Ken, 15 November 2026: a careful first game on EASY should not earn an S)', () => {
    expect(TOP_GRADE).toEqual({ standard: 'S', easy: 'A' })
    for (const finalMai of [GRADE_BANDS.easy.S, 95, 100]) for (const bonus of [0, 5]) expect(gradeFor({ status: 'won', finalMai, bonus, difficulty: 'easy' })).toBe('A')
    expect(gradeFor({ status: 'won', finalMai: 100, bonus: 5, difficulty: 'standard' })).toBe('S')
    // The round's desktop reviewer: 89.1 on EASY with a bonus of 4.0.
    expect(gradeFor({ status: 'won', finalMai: 89.1, bonus: 4, difficulty: 'easy' })).toBe('A')
    expect(nextGrade('C', 'easy')).toEqual({ grade: 'B', from: GRADE_BANDS.easy.B })
    expect(nextGrade('B', 'standard')).toEqual({ grade: 'A', from: GRADE_BANDS.standard.A })
    expect(nextGrade('A', 'standard')).toEqual({ grade: 'S', from: GRADE_BANDS.standard.S })
    expect(nextGrade('A', 'easy'), 'EASY has a grade above A').toBeNull()
    for (const g of ['S', 'D', 'F'] as const) expect(nextGrade(g, 'standard')).toBeNull()
  })

  it('gives D to a campaign that survived every turn under the line, and F to one that ended early', () => {
    // A lost grade does not look at the MAI, so the highest one is used.
    const finalMai = GRADE_BANDS.easy.S
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
    // The prepared line answers in the night (v1.7 R1): with every move
    // ridden out no line wins on STANDARD, and the won case went missing.
    // The other lines ride every move out, as they always played.
    type Ending = 'won' | 'belowThreshold' | 'insolvency' | 'maiCollapse'
    const lines: [(seed: number) => (s: GameState) => TurnActions, Responder][] = [
      [() => scripted(WIN_SCRIPT), sensible],
      [() => scripted(MIXED_SCRIPT), ride],
      [() => scripted(LOSS_SCRIPT), ride],
      [(seed) => randomPolicy(seed), ride],
    ]
    const cases: [GameState, Ending][] = []
    for (let seed = 1; seed <= 200 && cases.length < 3; seed += 1) {
      for (const [line, respond] of lines) {
        const end = play(seed, line(seed), respond)
        const how: Ending = end.status === 'won' ? 'won' : end.lossReason!
        const finalMai = end.history[end.history.length - 1].maiScore
        const bonusMoves = gradeFor({ status: end.status, finalMai, difficulty: end.difficulty }) !== gradeFor({ status: end.status, finalMai, bonus: defenseBonus(end.bestStreak, end.saved), difficulty: end.difficulty })
        if (how === 'won' && !bonusMoves) continue
        if (how !== 'maiCollapse' && !cases.some((c) => c[1] === how)) cases.push([end, how])
      }
    }
    // A collapse: through v1.6 no script, sweep policy or seed reached one
    // in six turns. Since v1.7 R1 (9 meter damage a point) a line that
    // orders nothing and rides every move out can, on its last turn
    // (tests/share-text.spec.ts pins one). The case here is still built by
    // hand, so that it is a collapse on an early turn: the trust meters
    // worn down before turn 1, then a real turn played on them.
    const worn: GameState = { ...newGame(DEFAULT_SCENARIO, 1, 'standard'), meters: { linkAvailability: 20, dataIntegrity: 20, sensorIntegrity: 20 } }
    const collapsed = resolveTurn(worn, { buyAssets: [], buyCounters: [] }, turnRng(worn.seed, worn.turn))
    expect(collapsed.lossReason, 'the hand-built campaign did not collapse').toBe('maiCollapse')
    cases.push([collapsed, 'maiCollapse'])

    expect(cases.map((c) => c[1]).sort()).toEqual(['belowThreshold', 'insolvency', 'maiCollapse', 'won'])
    for (const [end] of cases) {
      const finalMai = end.history[end.history.length - 1].maiScore
      const bonus = defenseBonus(end.bestStreak, end.saved)
      expect(gradeOf(end)).toBe(gradeFor({ status: end.status, lossReason: end.lossReason, finalMai, bonus, difficulty: end.difficulty }))
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
  // The sweep the bands were set from (src/engine/grade.ts): every gated
  // line of the sweep (tests/policies.ts POLICIES), 500 seeds each, driven
  // as tests/sweep.spec.ts drives them, and every win graded on its final
  // score plus its defense bonus, at each difficulty with its own bands.
  // S should be roughly the top 5 percent of wins and A roughly the next
  // 20. Measured when the bands were set (v2.0 R4): on STANDARD 739 wins,
  // S 6.0 percent and A 22.6; on EASY 1,018 wins, A the top 26.8.
  //
  // Why the sweep's lines, and not scripts: the lines are the model of
  // players (prepared, a beginner, buy everything, random legal, nothing),
  // each choosing its orders from the state a player sees, where a script
  // is one hand-picked order replayed on every seed (v1.3 measured that
  // population at S 39.9 percent of wins). What is kept from v1.2 R5a is
  // the method.
  for (const difficulty of DIFFICULTIES) {
    it(
      `holds the top grades to their shares of the wins on ${difficulty.toUpperCase()}`,
      () => {
        const grades: Grade[] = []
        for (const { policy, respond } of POLICIES) {
          for (let seed = 1; seed <= 500; seed += 1) {
            let end = newGame(DEFAULT_SCENARIO, seed, difficulty)
            while (end.status === 'playing') end = playNight(end, policy(end), respond)
            if (end.status === 'won') grades.push(gradeOf(end))
          }
        }
        expect(grades.length, 'too few wins to calibrate against').toBeGreaterThanOrEqual(100)
        const share = (g: Grade) => grades.filter((x) => x === g).length / grades.length
        if (TOP_GRADE[difficulty] === 'S') {
          expect(share('S'), 'S is not roughly the top 5 percent of wins').toBeGreaterThanOrEqual(0.03)
          expect(share('S')).toBeLessThanOrEqual(0.07)
          expect(share('A'), 'A is not roughly the next 20 percent of wins').toBeGreaterThanOrEqual(0.17)
          expect(share('A')).toBeLessThanOrEqual(0.23)
        } else {
          // EASY's top grade is A: the top quarter or so of its wins.
          expect(share('S'), 'S was earned on EASY').toBe(0)
          expect(share('A'), 'A is not roughly the top quarter of wins').toBeGreaterThanOrEqual(0.2)
          expect(share('A')).toBeLessThanOrEqual(0.3)
        }
        // C is a win that scraped the line: the lowest quarter or so.
        expect(share('C'), 'C').toBeGreaterThanOrEqual(0.15)
        expect(share('C')).toBeLessThanOrEqual(0.3)
      },
      60_000,
    )
  }
})

describe("a run's knockouts, hits and strip, derived from its history (v1.2 Round 5)", () => {
  // Every campaign the engine plays, turn by turn, with the state each turn
  // resolved from and the state it produced: the engine's own record,
  // which the derivations below are held against.
  function* turns(): Generator<{ label: string; before: GameState; after: GameState; end: () => GameState }> {
    const lines: [string, (seed: number) => (s: GameState) => TurnActions][] = [
      ['WIN_SCRIPT', () => scripted(WIN_SCRIPT)],
      ['LOSS_SCRIPT', () => scripted(LOSS_SCRIPT)],
      ['MIXED_SCRIPT', () => scripted(MIXED_SCRIPT)],
      ['LAZY_SCRIPT', () => scripted(LAZY_SCRIPT)],
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
        insolvent: after.lossReason === 'insolvency',
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
      const end = play(seed, scripted(MIXED_SCRIPT))
      const fired = end.history.reduce((n, rec) => n + rec.events.filter((ev) => ev.firedTechniqueRefs.length > 0).length, 0)
      expect(hitsTaken(end), `seed ${seed}`).toBe(fired)
      held += end.history.reduce((n, rec) => n + rec.events.length, 0) - fired
    }
    // Events that did not land exist in the sweep, so a count of every
    // event would fail here.
    expect(held, 'every event landed, so hits taken was never tested against one that did not').toBeGreaterThan(0)
    expect(hitsTaken(play(1, scripted(MIXED_SCRIPT))), 'a campaign with no hits proves nothing').toBeGreaterThan(0)
  })
})

// A line of orders with a responder making the night's choices (v1.7 R1):
// every move is ridden out unless a test names another responder.
function play(seed: number, policy: (s: GameState) => TurnActions, respond: Responder = ride): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') state = playNight(state, policy(state), respond)
  return state
}
