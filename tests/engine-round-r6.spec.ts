// THE ENGINE ROUND OF v1.3 R6 (the R6b prompt, part 2): the parked items
// from brief 11 and the R3 report, each held over real play.
//   - G-028: the docking dazzle strikes the RPO sat when one is held.
//   - G-103: a condition's turns left mean one thing, the nights it will
//     still press after the one being played, so a night's chips and its
//     END OF TURN agree (brief 6.5).
//   - The per-event score: the engine records the score each event found
//     and left, and the night's figures are the engine's.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { maiScore } from '../src/engine/scoring'
import type { GameState, TurnActions } from '../src/engine/types'
import { turnsLeft } from '../src/ui/board/boardModel'
import { nightOf } from '../src/ui/night/nightModel'
import { POLICIES } from './policies'

// Every turn of every policy over a few dozen seeds, both difficulties.
function turns(seeds: number): { before: GameState; after: GameState }[] {
  const out: { before: GameState; after: GameState }[] = []
  for (const { policy } of POLICIES)
    for (const difficulty of ['standard', 'easy'] as const)
      for (let seed = 1; seed <= seeds; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const actions: TurnActions = policy(state)
          const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
          out.push({ before: state, after })
          state = after
        }
      }
  return out
}

describe('the engine round of v1.3 R6', () => {
  const all = turns(40)

  it('G-028: strikes the RPO sat with the docking dazzle while one is held, and another orbit tile only when none is', () => {
    let rpo = 0
    let other = 0
    for (const { before, after } of all) {
      for (const ev of after.history[after.history.length - 1].events) {
        if (ev.eventId !== 'lidar-dazzle' || !ev.targetAssetId) continue
        const target = before.assets.find((a) => a.id === ev.targetAssetId)!
        const rpoHeld = before.assets.some((a) => a.kind === 'rpoSat' && a.integrity > 0)
        if (rpoHeld) {
          expect(target.kind, `seed ${before.seed}, turn ${before.turn}`).toBe('rpoSat')
          rpo += 1
        } else other += 1
      }
    }
    expect(rpo, 'no swept dazzle was aimed while an RPO sat was held').toBeGreaterThan(0)
    // The starting fleet holds an RPO sat; a sweep may never lose it before
    // turn 4, so the fallback is allowed to go unseen.
    expect(rpo + other).toBeGreaterThan(0)
  })

  it('the per-event score: each event records the score it found and left, chained, and the night reads the same figures', () => {
    for (const { before, after } of all) {
      const record = after.history[after.history.length - 1]
      for (let i = 1; i < record.events.length; i += 1) {
        expect(record.events[i].scoreBefore, `seed ${before.seed}, turn ${before.turn}, event ${i}`).toBe(record.events[i - 1].scoreAfter)
      }
      const night = nightOf(before, after)
      night.steps.forEach((step, i) => {
        // The figure is the engine's, and the board the night rebuilds from
        // the record shows the same score.
        expect(step.scoreBefore).toBe(record.events[i].scoreBefore)
        expect(step.scoreAfter).toBe(record.events[i].scoreAfter)
        expect(maiScore(step.after), `seed ${before.seed}, turn ${before.turn}, step ${i}: the rebuilt board`).toBe(record.events[i].scoreAfter)
      })
    }
  })

  it("G-103: a condition's turns left during a night are what END OF TURN shows for it, landed tonight or earlier", () => {
    let seen = 0
    let renewed = 0
    for (const { before, after } of all) {
      const night = nightOf(before, after)
      const last = night.steps.length ? night.steps[night.steps.length - 1].after : night.opening
      for (const step of night.steps) {
        for (const c of step.after.conditions) {
          const closed = after.conditions.find((x) => x.instanceId === c.instanceId)
          const atEnd = closed ? turnsLeft(closed, false) : 0
          // A later move the same night can renew it (a second ransomware
          // hit); then the chip rises with it, and the night's last view is
          // the one END OF TURN must match.
          const final = last.conditions.find((x) => x.instanceId === c.instanceId)!
          if (final.remainingTurns !== c.remainingTurns) {
            renewed += 1
            continue
          }
          expect(turnsLeft(c, true), `seed ${before.seed}, turn ${before.turn}, ${c.name}`).toBe(atEnd)
          seen += 1
        }
      }
      for (const c of last.conditions) {
        const closed = after.conditions.find((x) => x.instanceId === c.instanceId)
        expect(turnsLeft(c, true), `seed ${before.seed}, turn ${before.turn}, ${c.name}, the night's last view`).toBe(closed ? turnsLeft(closed, false) : 0)
      }
    }
    expect(seen, 'no condition was live during a swept night').toBeGreaterThan(0)
    expect(renewed, 'no swept night renewed a condition, so the renewal case went unchecked').toBeGreaterThan(0)
  })
})
