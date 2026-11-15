// The debrief's reading of a finished game (v1.3 R4, brief 5.6), held to
// the engine's own record of real games.
//
// GUARD R4 (b): THE GRADE AND THE STATS AGREE WITH THE ENGINE. Every
// number is recounted here straight from the history the engine wrote
// (each event's effective severity and outcome, each turn's record), not
// through the helpers the debrief calls, over wins and losses on both
// difficulties. The 3D game's debrief reads this model
// (src/ui/three/rooms3d.tsx); what only the pixel debrief showed (FILED
// THIS GAME, the turn a loss turned on, what the player can now say, the
// decisions and the grade ladder) was retired with it in v2.0 R3.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf } from '../src/engine/grade'
import { newGame } from '../src/engine/reducer'
import { playNight, type Responder } from '../src/engine/responses'
import type { GameState, TurnActions } from '../src/engine/types'
import { clock, debriefStats, gradeBlock, movesBlocked, nextTime, ordersOf, replay } from '../src/ui/debriefModel'
import { WATCH, ride } from './policies'
import { LOSS_SCRIPT, WIN_SCRIPT, randomPolicy, scripted } from './scripts'

// A line: its orders each night, and how it answers a move that would land.
type Line = { policy: (state: GameState) => TurnActions; respond: Responder }
function play(from: GameState, line: Line): GameState {
  let state = from
  while (state.status === 'playing') state = playNight(state, line.policy(state), line.respond)
  return state
}

// Real games: four lines a seed, twelve seeds, both difficulties. The two
// written scripts as lines the engine takes and the random line ride every
// move out; the sweep's Prepared line (tests/policies.ts) sets its
// defenses down, calls its holds and answers in the night, as a player of
// the 3D game does.
const PREPARED = WATCH.find((l) => l.name === 'prepared')!
const GAMES: GameState[] = []
for (const difficulty of ['standard', 'easy'] as const)
  for (let seed = 1; seed <= 12; seed += 1)
    for (const line of [{ policy: scripted(WIN_SCRIPT), respond: ride }, { policy: scripted(LOSS_SCRIPT), respond: ride }, { policy: randomPolicy(seed), respond: ride }, PREPARED] as Line[])
      GAMES.push(play(newGame(DEFAULT_SCENARIO, seed, difficulty), line))

describe('GUARD R4 (b): the grade and the stats agree with the engine', () => {
  it('walks wins and losses, early and late, with answers taken and holds called', () => {
    expect(GAMES.some((g) => g.status === 'won')).toBe(true)
    expect(GAMES.some((g) => g.history.some((r) => r.events.some((e) => e.response))), 'no game took an answer').toBe(true)
    expect(GAMES.some((g) => g.history.some((r) => r.hold && r.hold.call !== 'none')), 'no game called a hold').toBe(true)
    expect(GAMES.some((g) => g.status === 'lost' && g.lossReason === 'belowThreshold')).toBe(true)
    expect(GAMES.some((g) => g.status === 'lost' && g.lossReason !== 'belowThreshold'), 'no game ended early').toBe(true)
  })

  it('grades each game as the engine does, with MISSION HELD on a win and MISSION LOST on a loss', () => {
    for (const g of GAMES) {
      const block = gradeBlock(g)
      const last = g.history[g.history.length - 1]
      expect(block.grade).toBe(gradeOf(g))
      expect(block.head).toBe(g.status === 'won' ? 'MISSION HELD' : 'MISSION LOST')
      expect(block.final).toBe(last.maiScore)
      expect(block.needed).toBe(DEFAULT_SCENARIO.winThreshold)
      // The bonus shows on a win only, and the graded score is the sum.
      if (block.bonus) {
        expect(g.status).toBe('won')
        expect(block.bonus.graded).toBe(Math.round((last.maiScore + block.bonus.bonus) * 10) / 10)
      }
      expect(block.reason).toMatch(new RegExp(`turn ${g.history.length}\\b`, 'i'))
    }
  })

  it('counts the six stats from the history the engine wrote', () => {
    for (const g of GAMES) {
      const events = g.history.flatMap((r) => r.events)
      const last = g.history[g.history.length - 1]
      const got = Object.fromEntries(debriefStats(g).map((s) => [s.label, s.value]))
      expect(got).toEqual({
        'HITS TAKEN': events.filter((e) => e.effectiveSeverity > 0).length,
        // COLDVEIL's moves only: a debris miss is luck, not a block (R6 Q7).
        'MOVES BLOCKED': events.filter((e) => e.outcome === 'held' && e.eventId !== 'debris-conjunction' && DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind !== 'opportunity').length,
        'BEST STREAK': last.bestStreak,
        'BUDGET LEFT': last.creditsAfter,
        'DEFENSES KEPT': g.counters.length,
        'POINTS SAVED': Math.round(last.saved * 10) / 10,
      })
    }
    // The positive controls: these games held moves, saved points and kept
    // defenses, so equal numbers are not zeros agreeing.
    expect(GAMES.some((g) => movesBlocked(g) > 0)).toBe(true)
    expect(GAMES.some((g) => g.saved > 0)).toBe(true)
    expect(GAMES.some((g) => g.counters.length > 0)).toBe(true)
  })
})

describe('the rest of the debrief reads the record too', () => {
  it('rebuilds every turn\'s orders from the record, so the same game plays again exactly (v1.5 R1)', () => {
    // The instrument NEXT TIME measures with: a game played again from its
    // seed with the orders the record holds ends on the record's scores.
    for (const g of GAMES) {
      const again = replay(g, ordersOf(g))!
      expect(again, `seed ${g.seed} ${g.difficulty}: the record's own orders were refused`).not.toBeNull()
      expect(again.history.map((r) => r.maiScore), `seed ${g.seed} ${g.difficulty}`).toEqual(g.history.map((r) => r.maiScore))
      expect(again.status).toBe(g.status)
    }
  })

  it('names a missed defense ordered earlier, and the score the same game ends on with that one change (NEXT TIME, M14)', () => {
    // v1.5 R1 (R6b's fresh eyes, item 2, and the round's re-review): a
    // block is not a pure gain, since COLDVEIL takes the move left open,
    // so NEXT TIME plays the game again with the change and says the
    // score. Each figure is held to a replay built here, apart from it.
    let earlier = 0
    let none = 0
    let moved = 0
    for (const g of GAMES) {
      const missed = g.learned.some((l) => l.how === 'missed')
      const next = nextTime(g)
      // v1.7 R1: NEXT TIME may name a response instead, a move answered
      // in the night with every order the same, when that ends the game
      // higher than any defense ordered earlier (tests/responses.spec.ts
      // holds its rules).
      if (!missed) {
        expect(next === null || next.kind === 'answer').toBe(true)
        continue
      }
      expect(next).not.toBeNull()
      if (next!.kind === 'none') {
        none += 1
        continue
      }
      if (next!.kind === 'answer') {
        expect(next!.final, 'NEXT TIME names an answer that ends no higher').toBeGreaterThan(next!.was)
        continue
      }
      earlier += 1
      const cm = DEFAULT_SCENARIO.countermeasures.find((c) => c.name === next!.defense)!
      expect(g.learned.some((l) => l.how === 'missed' && l.counter === cm.id), 'NEXT TIME names a defense the game did not miss').toBe(true)
      expect(next!.price).toBe(cm.cost)
      expect(next!.was).toBe(g.history.at(-1)!.maiScore)
      expect(next!.final, 'NEXT TIME names a change that ends no higher').toBeGreaterThan(next!.was)
      // The change, built here: the defense moves to its turn, the one it
      // displaces to the turn named.
      const orders = ordersOf(g).map((o) => ({ ...o, buyCounters: o.buyCounters.filter((c) => c !== cm.id) }))
      const ahead = next!.ahead ? DEFAULT_SCENARIO.countermeasures.find((c) => c.name === next!.ahead)!.id : null
      expect(ordersOf(g)[next!.orderOn - 1].buyCounters.filter((c) => c !== cm.id)).toEqual(ahead ? [ahead] : [])
      orders[next!.orderOn - 1] = { ...orders[next!.orderOn - 1], buyCounters: [cm.id] }
      if (ahead && next!.aheadTo !== null) {
        moved += 1
        expect(orders[next!.aheadTo - 1].buyCounters, 'the displaced defense moved onto a turn that had one').toEqual([])
        orders[next!.aheadTo - 1] = { ...orders[next!.aheadTo - 1], buyCounters: [ahead] }
      }
      const again = replay(g, orders)!
      expect(again.history.at(-1)!.maiScore).toBe(next!.final)
      expect(again.status === 'won').toBe(next!.won)
    }
    // Every branch is reached.
    expect(earlier, 'NEXT TIME never named a better order').toBeGreaterThan(0)
    expect(moved, 'NEXT TIME never moved a displaced defense').toBeGreaterThan(0)
    expect(none + earlier).toBeGreaterThan(0)
  })

  it('writes the time on the clock as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(61_400)).toBe('1:01')
    expect(clock(4 * 60_000 + 59_600)).toBe('5:00')
  })
})
