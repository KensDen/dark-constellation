// Engine battery (spec Section 11.2): determinism, purity, and win/loss
// reachability by real play. The determinism hash must match the
// committed snapshot; regenerate deliberately with UPDATE_SNAPSHOTS=1
// after an intentional engine or content change.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { DEFAULT_SCENARIO } from '../src/content'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SNAPSHOT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'determinism.snap.json')

// With the R3.25 dynamics, prepared play no longer wins on every seed
// (target ~75 to 85 percent). WIN_SEED is a confirmed win for the prepared
// line; LOSS_SEED a confirmed loss for the do-nothing line. Both anchor the
// determinism snapshot.
const WIN_SEED = 20260712
const LOSS_SEED = 4041

// Standard difficulty is pinned here (R5): its multipliers are exactly 1 on
// every axis, so the snapshot must stay byte-identical to the pre-R5 hash.
function playGame(seed: number, script: Record<number, TurnActions>): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') {
    const actions = script[state.turn] ?? NO_OP
    state = resolveTurn(state, actions, turnRng(state.seed, state.turn))
  }
  return state
}

function gameLogHash(state: GameState): string {
  const log = {
    seed: state.seed,
    status: state.status,
    lossReason: state.lossReason ?? null,
    history: state.history,
  }
  return createHash('sha256').update(JSON.stringify(log)).digest('hex')
}

describe('determinism', () => {
  it('same seed and actions produce the identical log hash', () => {
    const first = playGame(WIN_SEED, WIN_SCRIPT)
    const second = playGame(WIN_SEED, WIN_SCRIPT)
    expect(gameLogHash(first)).toBe(gameLogHash(second))
  })

  it('fixed-seed full-game replays match the committed snapshot', () => {
    const actual = {
      win: gameLogHash(playGame(WIN_SEED, WIN_SCRIPT)),
      loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT)),
    }
    if (process.env.UPDATE_SNAPSHOTS) {
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + '\n')
    }
    const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    expect(actual).toEqual(committed)
  })

  it('resolveTurn does not mutate its input state', () => {
    const state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = JSON.stringify(state)
    resolveTurn(state, WIN_SCRIPT[1], turnRng(state.seed, state.turn))
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('reachability by real play', () => {
  it('the prepared-architect line wins', () => {
    const end = playGame(WIN_SEED, WIN_SCRIPT)
    expect(end.status).toBe('won')
    expect(end.history).toHaveLength(DEFAULT_SCENARIO.totalTurns)
  })

  it('the do-nothing line loses', () => {
    const end = playGame(LOSS_SEED, LOSS_SCRIPT)
    expect(end.status).toBe('lost')
    expect(end.lossReason).toBeTruthy()
  })

  it('the supply-chain implant never damages Tier A assets (spec Sections 5 and 8)', () => {
    // A Tier A drone deploys in one turn, so it is reliably on station well
    // before the scripted turn-5 implant.
    const buyTierA: TurnActions = { ...NO_OP, buyAssets: [{ kind: 'drone', tier: 'A' }] }
    for (let seed = 1; seed <= 50; seed += 1) {
      let state = newGame(DEFAULT_SCENARIO, seed)
      state = resolveTurn(state, buyTierA, turnRng(state.seed, state.turn))
      while (state.status === 'playing' && state.turn <= 4) {
        state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      }
      if (state.status !== 'playing') continue
      const tierABefore = state.assets.filter((a) => a.tier === 'A').map((a) => a.integrity)
      expect(tierABefore.length).toBeGreaterThan(0)
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)) // turn 5: scripted implant
      const implant = state.history.find((h) => h.turn === 5)?.events.find((e) => e.eventId === 'supply-chain-implant')
      expect(implant).toBeTruthy()
      const tierAAfter = state.assets.filter((a) => a.tier === 'A').map((a) => a.integrity)
      expect(tierAAfter).toEqual(tierABefore)
    }
  })

  it('a jam becomes an active condition that holds LiDAR fallback, then expires', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)) // turn 6: fixed pnt-jamming
    }
    const jam = state.conditions.find((c) => c.eventId === 'pnt-jamming')
    expect(jam, 'pnt-jamming should be an active condition after turn 6').toBeTruthy()
    expect(jam!.remainingTurns).toBeGreaterThanOrEqual(1)
    expect(state.flags.lidarFallback).toBe(true)
    // Play out with no new jams and confirm the condition eventually lifts.
    let sawExpiry = false
    for (let i = 0; i < 4 && state.status === 'playing'; i += 1) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      if (!state.conditions.some((c) => c.instanceId === jam!.instanceId)) sawExpiry = true
    }
    expect(sawExpiry).toBe(true)
  })

  it('deployments arrive after their ETA, not instantly', () => {
    let state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = state.assets.length
    state = resolveTurn(state, { ...NO_OP, buyAssets: [{ kind: 'sat', tier: 'B' }] }, turnRng(state.seed, state.turn))
    expect(state.assets.length, 'sat should not be operational the turn it is bought').toBe(before)
    expect(state.pipeline.length).toBe(1)
    expect(state.pipeline[0].etaTurns).toBeGreaterThanOrEqual(1)
    let arrived = false
    for (let i = 0; i < 4 && state.status === 'playing'; i += 1) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      if (state.assets.length > before) arrived = true
    }
    expect(arrived, 'sat should reach orbit within a few turns').toBe(true)
  })

  it('a surge token clears one active condition and is consumed', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    const cond = state.conditions[0]
    expect(cond).toBeTruthy()
    const tokensBefore = state.surgeTokens
    expect(tokensBefore).toBeGreaterThan(0)
    state = resolveTurn(state, { ...NO_OP, spendSurgeOn: cond.instanceId }, turnRng(state.seed, state.turn))
    expect(state.conditions.some((c) => c.instanceId === cond.instanceId)).toBe(false)
    expect(state.surgeTokens).toBe(tokensBefore - 1)
  })

  it('the BLACKOUT CHAIN lands at full potency against a single-sensor posture', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 7) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    const chainTurn = state.history.find((h) => h.turn === 7)
    const chainEvent = chainTurn?.events.find((e) => e.eventId === 'blackout-chain')
    expect(chainEvent?.chainBonus).toBe(2)
  })
})
