// Persistence battery (R4). Proves the acceptance guarantee: a game saved
// mid-run and reloaded (through the real save-code path) resolves
// identically to the original, per the deterministic engine. Also covers
// codec round-trips, version rejection, and bad-code handling.

import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { DEFAULT_SCENARIO } from '../src/content'
import {
  LocalDailyLedger,
  LocalStorageStore,
  SAVE_VERSION,
  SaveError,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  restoreGame,
  type DailyOp,
  type DailyResult,
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

  it('loads a v2 save as it is, and resumes it under the deck stream (v1.2 R5a)', () => {
    // v3 changed no field, only how the engine draws each turn's events, so
    // a v2 save is a v3 save with an older number: it loads unchanged, keeps
    // the turns it has played, and plays on from there.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(3)
    const mid = playTo(SEED, 5, WIN_SCRIPT)
    const p = captureGame(mid, 'procure', '2026-09-27T00:00:00.000Z')
    const restored = restoreGame({ ...p, version: 2 })
    const { scenario: _a, ...midRest } = mid
    const { scenario: _b, ...restoredRest } = restored.state
    expect(restoredRest).toEqual(midRest)
    expect(() => resolveTurn(restored.state, NO_OP, turnRng(restored.state.seed, restored.state.turn))).not.toThrow()
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

describe('the Daily Op identity rides beside the state (v1.2 R5, brief 7.1)', () => {
  const AT = '2026-09-27T20:00:00.000Z'
  const OP: DailyOp = { dateKey: '20260927', n: 1 }

  function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
      get length() {
        return map.size
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(String(k), String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as Storage
  }
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves a free-play record exactly as it was, with no daily field at all', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const record = captureGame(mid, 'brief', AT)
    expect('daily' in record).toBe(false)
    expect(JSON.stringify(record)).not.toContain('daily')
    expect('daily' in restoreGame(JSON.parse(JSON.stringify(record)))).toBe(false)
  })

  it('carries a Daily Op identity through a record and back, outside the state', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const record = JSON.parse(JSON.stringify(captureGame(mid, 'brief', AT, OP)))
    expect(record.daily).toEqual(OP)
    expect('daily' in record.state, 'the identity leaked into the engine state').toBe(false)
    expect(restoreGame(record).daily).toEqual(OP)
  })

  it('marks every Daily Op that arrives as a PASTED code, whatever the code says', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const plain = encodeSaveCode(captureGame(mid, 'brief', AT, OP))
    expect(decodeSaveCode(plain).daily).toEqual({ ...OP, pasted: true })
    // A hand-edited code cannot clear the mark: a false or missing one is
    // marked all the same.
    const edited = encodeSaveCode({ ...captureGame(mid, 'brief', AT), daily: { ...OP, pasted: false } as unknown as DailyOp })
    expect(decodeSaveCode(edited).daily).toEqual({ ...OP, pasted: true })
    // Free play is not made a Daily Op by the mark.
    expect('daily' in decodeSaveCode(encodeSaveCode(captureGame(mid, 'brief', AT)))).toBe(false)
  })

  it('refuses a finished campaign with no turns, which no campaign can be', () => {
    // A campaign ends only by playing a turn. A hand-made code claiming a
    // finish with none would reach the score screen with nothing to grade.
    const fresh = captureGame(newGame(DEFAULT_SCENARIO, SEED), 'brief', AT)
    expect(() => restoreGame({ ...fresh, state: { ...fresh.state, status: 'won' } })).toThrow(SaveError)
    expect(() => decodeSaveCode(encodeSaveCode({ ...fresh, state: { ...fresh.state, status: 'lost' } }))).toThrow(SaveError)
    // The positive control: the same record, still playing, loads.
    expect(restoreGame(fresh).state.status).toBe('playing')
  })

  it('drops a malformed identity and loads the campaign as free play', () => {
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    const base = captureGame(mid, 'brief', AT)
    for (const daily of [{ dateKey: '2026-09-27', n: 1 }, { dateKey: '20260927', n: 0 }, { dateKey: '20260927', n: 1.5 }, { n: 1 }, 'daily', null]) {
      const restored = restoreGame({ ...base, daily })
      expect('daily' in restored, JSON.stringify(daily)).toBe(false)
      expect(restored.state.seed).toBe(mid.seed)
    }
  })

  it('keeps the identity, the pasted mark with it, through the autosave and the slots', () => {
    const store = new LocalStorageStore()
    const mid = playTo(SEED, 3, WIN_SCRIPT)
    store.autosave(mid, 'brief', OP)
    expect(store.loadAutosave()?.daily).toEqual(OP)
    const pasted: DailyOp = { ...OP, pasted: true }
    store.autosave(mid, 'brief', pasted)
    expect(store.loadAutosave()?.daily, 'a refresh laundered a pasted Daily Op').toEqual(pasted)
    const slot = store.save(mid, 'brief', 'Turn 4 save', pasted)
    expect(store.load(slot.id)?.daily, 'a slot laundered a pasted Daily Op').toEqual(pasted)
    const free = store.save(mid, 'brief', 'Turn 4 save')
    expect(store.load(free.id) && 'daily' in store.load(free.id)!).toBe(false)
  })

  it('records the first finish of a date as official and every later one as practice', () => {
    const ledger = new LocalDailyLedger()
    const result = (turns: number): DailyResult => ({ n: 1, seed: 289227389, outcome: 'lost', lossReason: 'belowThreshold', mai: 66, turns, recordedAt: AT })
    expect(ledger.official(OP.dateKey)).toBeNull()
    expect(ledger.claim({ ...OP, pasted: true }, result(12)), 'a pasted Daily Op claimed the date').toBe('practice')
    expect(ledger.official(OP.dateKey), 'a pasted Daily Op was recorded').toBeNull()
    expect(ledger.claim(OP, result(12))).toBe('official')
    expect(ledger.claim(OP, result(8))).toBe('practice')
    expect(ledger.official(OP.dateKey)?.turns, 'a later finish replaced the official one').toBe(12)
    // Another date is its own.
    expect(ledger.claim({ dateKey: '20260928', n: 2 }, { ...result(10), n: 2 })).toBe('official')
  })

  it('does not call a finish official when it cannot be recorded', () => {
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    const ledger = new LocalDailyLedger()
    expect(ledger.claim(OP, { n: 1, seed: 1, outcome: 'won', mai: 80, turns: 12, recordedAt: AT })).toBe('practice')
  })
})
