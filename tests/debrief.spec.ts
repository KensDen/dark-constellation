// The debrief's reading of a finished game (v1.3 R4, brief 5.6), held to
// the engine's own record of real games.
//
// GUARD R4 (b): THE GRADE, THE STATS AND THE FILED LIST AGREE WITH THE
// ENGINE. Every number is recounted here straight from the history the
// engine wrote (each event's effective severity and outcome, each turn's
// record), not through the helpers the debrief calls, over wins and
// losses on both difficulties. FILED THIS GAME is the threats the game met
// whose cards were filed since turn 1, in the order the game met them,
// and nothing the game did not meet.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { GRADE_THRESHOLDS, gradeOf } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { maiScore } from '../src/engine/scoring'
import type { GameState, TurnActions } from '../src/engine/types'
import {
  FILED_SHOWN,
  clock,
  debriefStats,
  decisions,
  filedThisGame,
  gradeBlock,
  movesBlocked,
  lossLead,
  canSay,
  missedLead,
  ordersOf,
  replay,
  sayVerb,
  nextTime,
  toNextGrade,
  turnDrops,
} from '../src/ui/debriefModel'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, randomPolicy } from './scripts'

type Line = Record<number, TurnActions> | ((state: GameState) => TurnActions)
function play(from: GameState, line: Line): GameState {
  const orders = typeof line === 'function' ? line : (s: GameState) => line[s.turn] ?? NO_OP
  let state = from
  while (state.status === 'playing') state = resolveTurn(state, orders(state), turnRng(state.seed, state.turn))
  return state
}

const isThreat = (id: string) => (DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat'

// Real games: three lines a seed, twelve seeds, both difficulties.
const GAMES: GameState[] = []
for (const difficulty of ['standard', 'easy'] as const)
  for (let seed = 1; seed <= 12; seed += 1)
    for (const line of [WIN_SCRIPT, LOSS_SCRIPT, randomPolicy(seed)] as Line[]) GAMES.push(play(newGame(DEFAULT_SCENARIO, seed, difficulty), line))

describe('GUARD R4 (b): the grade, the stats and the filed list agree with the engine', () => {
  it('walks wins and losses, early and late', () => {
    expect(GAMES.some((g) => g.status === 'won')).toBe(true)
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

  it('files only threats the game met, in the order it met them, since turn 1', () => {
    let listed = 0
    for (const g of GAMES) {
      const met: string[] = []
      for (const rec of g.history) for (const ev of rec.events) if (isThreat(ev.eventId) && !met.includes(ev.eventId)) met.push(ev.eventId)
      // A device that filed every card it met, from an empty Dossier.
      const now = new Set([...met, 'not-a-threat-this-game'])
      expect(filedThisGame(g, new Set(), now)).toEqual(met)
      // Cards filed before turn 1 are not this game's.
      const before = new Set(met.slice(0, 1))
      expect(filedThisGame(g, before, now)).toEqual(met.slice(1))
      // A card the game met but did not file is not listed.
      expect(filedThisGame(g, new Set(), new Set(met.slice(1)))).toEqual(met.slice(1))
      // A run whose turn 1 is unknown (a pasted code) lists nothing.
      expect(filedThisGame(g, null, now)).toBeNull()
      listed += met.length
    }
    expect(listed, 'no game met a threat').toBeGreaterThan(0)
    expect(Math.max(...GAMES.map((g) => filedThisGame(g, new Set(), new Set(DEFAULT_SCENARIO.events.map((e) => e.id)))!.length)), 'no game files more than the first screen lists').toBeGreaterThan(FILED_SHOWN)
  })
})

describe('the rest of the debrief reads the record too', () => {
  it('leads a loss with the turn of its largest drop and the move that cost most that turn (M14)', () => {
    let leads = 0
    for (const g of GAMES) {
      const lead = lossLead(g)
      if (g.status === 'won') {
        expect(lead).toBeNull()
        continue
      }
      let before = maiScore(newGame(g.scenario, g.seed, g.difficulty))
      const drops = g.history.map((r) => {
        const d = Math.round((before - r.maiScore) * 10) / 10
        before = r.maiScore
        return d
      })
      expect(turnDrops(g)).toEqual(drops)
      const max = Math.max(...drops)
      if (max <= 0) {
        expect(lead).toBeNull()
        continue
      }
      leads += 1
      expect(lead!.turn).toBe(g.history[drops.indexOf(max)].turn)
      expect(lead!.drop).toBe(max)
      const worst = [...g.history[drops.indexOf(max)].events].filter((e) => e.effectiveSeverity > 0).sort((a, b) => b.effectiveSeverity - a.effectiveSeverity)[0]
      if (worst) expect(lead!.line.startsWith(DEFAULT_SCENARIO.events.find((e) => e.id === worst.eventId)!.name.split(' (')[0])).toBe(true)
    }
    expect(leads, 'no loss had a drop to lead with').toBeGreaterThan(0)
  })

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
      if (!missed) {
        expect(next).toBeNull()
        continue
      }
      expect(next).not.toBeNull()
      if (next!.kind === 'none') {
        none += 1
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

  it('says a defense not owned once, whatever its verbs, and says a blunt "blunted" (v1.5 R1)', () => {
    // v1.4's fresh eyes, finding 13: the same defense on two lines read as
    // two orders; R6b's, item 7: "partly blocked" beside "would have
    // blunted".
    expect(sayVerb('reduced', 'blunts')).toBe('blunted')
    let merged = 0
    for (const g of GAMES) {
      const missed = canSay(g).filter((s) => s.how === 'missed')
      expect(new Set(missed.map((s) => s.defense)).size, 'a defense not owned is said twice').toBe(missed.length)
      for (const s of missed) {
        if (s.more?.length) merged += 1
        for (const m of s.more ?? []) expect(m.verb, 'a further verb kept its "would have"').not.toMatch(/would have/)
      }
      for (const s of canSay(g)) expect(s.verb).not.toBe('partly blocked')
    }
    expect(merged, 'no defense not owned had two verbs, so the merge went untested').toBeGreaterThan(0)
    expect(missedLead(GAMES[0])).toContain(`${GAMES[0].scenario.totalTurns} is the most a run can order`)
  })

  it('writes one decision a turn, with what was ordered and spent', () => {
    for (const g of GAMES) {
      const d = decisions(g)
      expect(d.map((x) => x.turn)).toEqual(g.history.map((r) => r.turn))
      d.forEach((x, i) => {
        expect(x.spent).toBe(g.history[i].ledger.ordered)
        expect(x.orders).toHaveLength(g.history[i].purchases.length)
        for (const o of x.orders) expect(o, 'an order kept its price note').not.toMatch(/\(-/)
      })
    }
  })

  it('says how far the next grade is, from the thresholds the engine grades by', () => {
    for (const g of GAMES) {
      const line = toNextGrade(g)
      const block = gradeBlock(g)
      const graded = Math.round((block.final + (block.bonus?.bonus ?? 0)) * 10) / 10
      const up: Record<string, [number, string] | undefined> = { A: [GRADE_THRESHOLDS.S, 'S'], B: [GRADE_THRESHOLDS.A, 'A'], C: [GRADE_THRESHOLDS.B, 'B'] }
      const next = up[block.grade]
      if (next) expect(line).toBe(`${(Math.round((next[0] - graded) * 10) / 10).toFixed(1)} more on the grade score for ${next[1]}.`)
      if (block.grade === 'D') expect(line).toBe(`${(Math.round((70 - block.final) * 10) / 10).toFixed(1)} more mission assurance at the end for C.`)
      if (block.grade === 'F') expect(line).toBe('Reach the end of turn 6 for D.')
    }
  })

  it('writes the time on the clock as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(61_400)).toBe('1:01')
    expect(clock(4 * 60_000 + 59_600)).toBe('5:00')
  })
})
