// Persistence battery (R4). Proves the acceptance guarantee: a game saved
// mid-run and reloaded (through the real save-code path) resolves
// identically to the original, per the deterministic engine. Also covers
// codec round-trips, version rejection, and bad-code handling.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { DEFAULT_SCENARIO } from '../src/content'
import {
  SAVE_VERSION,
  SaveError,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  restoreGame,
} from '../src/persistence'
import { NO_OP, WIN_SCRIPT } from './scripts'

const SEED = 20260712

function playTo(seed: number, upToTurn: number, script: Record<number, TurnActions>): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing' && state.turn <= upToTurn) {
    state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

function playOut(from: GameState, script: Record<number, TurnActions>): GameState {
  let state = from
  while (state.status === 'playing') {
    state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

function logHash(state: GameState): string {
  return createHash('sha256')
    .update(JSON.stringify({ status: state.status, lossReason: state.lossReason ?? null, history: state.history }))
    .digest('hex')
}

describe('save code determinism', () => {
  it('a game saved mid-run and reloaded resolves identically', () => {
    const mid = playTo(SEED, 6, WIN_SCRIPT)
    expect(mid.status).toBe('playing')

    const code = encodeSaveCode(captureGame(mid, 'brief', '2026-07-22T00:00:00.000Z'))
    const restored = decodeSaveCode(code).state

    // The rehydrated state must carry the full scenario back.
    expect(restored.scenario.id).toBe(mid.scenario.id)
    expect(restored.scenario.events.length).toBe(mid.scenario.events.length)

    const endOriginal = playOut(mid, WIN_SCRIPT)
    const endRestored = playOut(restored, WIN_SCRIPT)
    expect(logHash(endRestored)).toBe(logHash(endOriginal))
  })

  it('the codec round-trips the exact dynamic state', () => {
    const mid = playTo(SEED, 4, WIN_SCRIPT)
    const back = decodeSaveCode(encodeSaveCode(captureGame(mid, 'harden', '2026-07-22T00:00:00.000Z')))
    expect(back.phase).toBe('harden')
    const { scenario: _a, ...midRest } = mid
    const { scenario: _b, ...backRest } = back.state
    expect(backRest).toEqual(midRest)
  })
})

describe('save robustness', () => {
  it('rejects a save from a future schema version with a message', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const p = captureGame(mid, 'brief', '2026-07-22T00:00:00.000Z')
    expect(() => restoreGame({ ...p, version: SAVE_VERSION + 99 })).toThrow(SaveError)
  })

  it('migrates a v1 save forward as Standard rather than rejecting it', () => {
    // A v1 save is exactly a v2 save minus the difficulty field.
    const mid = playTo(SEED, 5, WIN_SCRIPT)
    const p = captureGame(mid, 'harden', '2026-07-22T00:00:00.000Z')
    const legacyState = { ...p.state } as Record<string, unknown>
    delete legacyState.difficulty
    const legacy = { ...p, version: 1, state: legacyState }

    const restored = restoreGame(legacy)
    expect(restored.state.difficulty).toBe('standard')
    expect(restored.phase).toBe('harden')
    // And it still resolves: a migrated save is a playable save.
    expect(() =>
      resolveTurn(restored.state, NO_OP, turnRng(restored.state.seed, restored.state.turn)),
    ).not.toThrow()
  })

  it('rejects garbage and non-prefixed codes without throwing raw errors', () => {
    expect(() => decodeSaveCode('not a code')).toThrow(SaveError)
    expect(() => decodeSaveCode('DC1-@@@not-base64@@@')).toThrow(SaveError)
    expect(() => restoreGame({ version: SAVE_VERSION, scenarioId: 'nope', phase: 'brief', state: {}, savedAt: '' })).toThrow(
      SaveError,
    )
  })

  it('rejects partial-but-parseable saves instead of loading a state the engine would crash on', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const good = captureGame(mid, 'brief', '2026-07-22T00:00:00.000Z')
    // Each of these fields is dereferenced by resolveTurn; dropping any one
    // must be caught at load time, not at the next turn.
    for (const drop of ['pipeline', 'pendingCounters', 'counters', 'flags', 'forecast'] as const) {
      const broken = { ...good, state: { ...good.state } as Record<string, unknown> }
      delete broken.state[drop]
      expect(() => restoreGame(broken), `dropping ${drop}`).toThrow(SaveError)
    }
    // Empty meters (no numeric keys) would produce NaN scores; reject it.
    const badMeters = { ...good, state: { ...good.state, meters: {} } }
    expect(() => restoreGame(badMeters)).toThrow(SaveError)
    // The full save still restores and resolves without error.
    const restored = restoreGame(good).state
    expect(() => resolveTurn(restored, NO_OP, turnRng(restored.seed, restored.turn))).not.toThrow()
  })
})
