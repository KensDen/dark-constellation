// Save codec (R4). Serializes a game to a compact, versioned, portable
// form and back. The static scenario (events, countermeasures, campaign)
// is NOT serialized: only its id travels, and the full scenario is
// rehydrated from the content module on load, so save codes stay small and
// can never ship stale content. All of this is UI-side; nothing here feeds
// the deterministic engine, so a restored game resolves identically.

import { SCENARIOS } from '../content'
import type { GameState } from '../engine/types'

// Bump when the persisted shape changes. Anything but the current version
// is rejected with a message rather than corrupt-loaded (R4 item 6); the
// migrations v1.2 carried left with v4, below.
//
// v4 (v1.3 Round 0, brief 6.10): the loop pass. Six turns, the reacting
// adversary, the intel brief for intel levels, no tiers and no surge, and
// the learning state on the game (the defense streak, points saved, what
// the player can now say). A v1.2 save cannot resume under those rules,
// so v1 to v3 are REFUSED, never migrated: a load says "This save is from
// an earlier version and cannot be resumed" (StaleSaveError, so the shell
// can offer PLAY beside it), and the history below is the record of what
// those versions were.
//
// v1 (R4): no difficulty field, all campaigns were the Standard tuning.
// v2 (R5): adds difficulty. v1 saves migrate forward as Standard.
// v3 (v1.2 R5a): the shape is unchanged, but the engine now draws each
// turn's events from a deck stream of its own (src/engine/rng.ts). Saves
// from before this change load as they are and resume under the new deck
// stream: the turns already played keep their history, and every turn
// after the save draws its events the new way. So a v2 save resumes with
// different threats ahead than it would have met on the build that wrote
// it.
// Still v3 (v1.2 R5): a record may carry `daily`, the Daily Op identity,
// beside the state and never inside it. The field is optional and at the
// top level, and restoreGame has always ignored top-level fields it does
// not know (a slot's `name` rides the same way), so a build that predates
// it loads a Daily Op as free play, which is also the safe reading. A
// bump would buy nothing and make every older build refuse the new codes.
export const SAVE_VERSION = 4

// HARDEN merged into PROCURE in v1.3 Round 0, so 'harden' is not a phase.
export type SavePhase = 'brief' | 'procure' | 'aftermath'

// WHICH DAILY OP A CAMPAIGN IS (v1.2 R5, brief 7.1): the local date it
// started on and its number. It lives in the persisted record, not in the
// engine's state, so the determinism snapshot does not move, and it rides
// every copy this device keeps (the autosave and the slots), which is what
// keeps a resumed Daily Op official.
//
// `pasted` marks one that arrived as a pasted save code. A code is plain
// text that anyone can decode and edit, so a Daily Op from a code is
// PRACTICE, always: decodeSaveCode sets the mark whatever the code says,
// and every later copy carries it, so a refresh or a slot cannot launder
// a pasted code into an official run.
export interface DailyOp {
  dateKey: string
  n: number
  pasted?: true
}

export interface PersistedGame {
  version: number
  savedAt: string // ISO timestamp, presentation only
  phase: SavePhase
  scenarioId: string
  state: Omit<GameState, 'scenario'>
  // Absent for free play, so a free-play record is byte for byte what it was.
  daily?: DailyOp
}

export interface RestoredRecord {
  state: GameState
  phase: SavePhase
  daily?: DailyOp
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveError'
  }
}

// A save from an earlier version (brief 6.10): read and refused, so the
// shell can say so and offer PLAY rather than drop it silently.
export const STALE_SAVE_MESSAGE = 'This save is from an earlier version and cannot be resumed'
export class StaleSaveError extends SaveError {
  constructor() {
    super(STALE_SAVE_MESSAGE)
    this.name = 'StaleSaveError'
  }
}

// Build the persisted record from a live game. savedAt is injected by the
// caller so this stays pure and testable.
export function captureGame(state: GameState, phase: SavePhase, savedAt: string, daily?: DailyOp): PersistedGame {
  const { scenario, ...rest } = state
  const p: PersistedGame = { version: SAVE_VERSION, savedAt, phase, scenarioId: scenario.id, state: rest }
  if (daily) p.daily = daily
  return p
}

// A Daily Op identity as it was written, or nothing. Anything malformed is
// dropped rather than rejected: the campaign still loads, as free play,
// and free play is never official.
function readDaily(d: unknown): DailyOp | undefined {
  if (!d || typeof d !== 'object') return undefined
  const { dateKey, n, pasted } = d as Record<string, unknown>
  if (typeof dateKey !== 'string' || !/^\d{8}$/.test(dateKey)) return undefined
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return undefined
  return pasted === true ? { dateKey, n, pasted: true } : { dateKey, n }
}

// Validate every dynamic GameState field the engine reads. A partial but
// JSON-parseable payload must be rejected here, not loaded and then crashed
// on the next resolveTurn (which dereferences pipeline, counters,
// conditions and the three meter keys directly).
function isPlainState(s: unknown): s is Omit<GameState, 'scenario'> {
  if (!s || typeof s !== 'object') return false
  const st = s as Record<string, unknown>
  const isObj = (v: unknown) => typeof v === 'object' && v !== null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const m = st.meters as Record<string, unknown> | undefined
  return (
    (st.status === 'playing' || st.status === 'won' || st.status === 'lost') &&
    (st.difficulty === 'easy' || st.difficulty === 'standard') &&
    num(st.seed) &&
    num(st.turn) &&
    num(st.credits) &&
    num(st.briefFreeThrough) &&
    num(st.streak) &&
    num(st.bestStreak) &&
    num(st.saved) &&
    Array.isArray(st.learned) &&
    Array.isArray(st.assets) &&
    Array.isArray(st.counters) &&
    Array.isArray(st.history) &&
    // A campaign ends only by playing a turn, so a finished one with no
    // turns is corrupt, and the score screen has nothing to grade.
    (st.status === 'playing' || (st.history as unknown[]).length > 0) &&
    Array.isArray(st.conditions) &&
    Array.isArray(st.pipeline) &&
    isObj(m) &&
    num(m!.linkAvailability) &&
    num(m!.dataIntegrity) &&
    num(m!.sensorIntegrity)
  )
}

// Rehydrate a live game (with its scenario reattached) from a persisted
// record. Throws SaveError with a human-readable reason on any mismatch.
export function restoreGame(p: unknown): RestoredRecord {
  if (!p || typeof p !== 'object') throw new SaveError('This is not a valid save.')
  const rec = p as Partial<PersistedGame>
  if (typeof rec.version !== 'number') throw new SaveError('This save is missing its version.')
  if (rec.version < SAVE_VERSION) throw new StaleSaveError()
  if (rec.version > SAVE_VERSION) {
    throw new SaveError(`This save is version ${rec.version}, but this build reads version ${SAVE_VERSION}. It cannot be loaded.`)
  }
  const scenario = SCENARIOS.find((s) => s.id === rec.scenarioId)
  if (!scenario) throw new SaveError(`This save references an unknown scenario (${String(rec.scenarioId)}).`)
  const raw = rec.state as Record<string, unknown> | undefined
  if (!isPlainState(raw)) throw new SaveError('This save is corrupt or incomplete.')
  const phase: SavePhase = rec.phase === 'procure' || rec.phase === 'aftermath' ? rec.phase : 'brief'
  const state = { ...(raw as Omit<GameState, 'scenario'>), scenario } as GameState
  const daily = readDaily(rec.daily)
  return daily ? { state, phase, daily } : { state, phase }
}

// UTF-8-safe base64, so save codes survive copy-paste through any channel.
// The byte-to-string conversion is chunked so it never spreads a huge array
// onto the call stack (which throws RangeError for large states).
function toBase64(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(code: string): string {
  const bytes = Uint8Array.from(atob(code), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const CODE_PREFIX = 'DC1-'

export function encodeSaveCode(p: PersistedGame): string {
  return CODE_PREFIX + toBase64(JSON.stringify(p))
}

export function decodeSaveCode(code: string): RestoredRecord {
  const trimmed = code.trim()
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new SaveError('This does not look like a DARK CONSTELLATION save code.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64(trimmed.slice(CODE_PREFIX.length)))
  } catch {
    throw new SaveError('This save code is damaged and could not be read.')
  }
  const restored = restoreGame(parsed)
  // A PASTED DAILY OP IS PRACTICE (brief 7.1: save codes never count). Set
  // here, whatever the code carries, because this is the one place a code
  // becomes a game; tests/daily-op.dom.spec.tsx fails if it counts.
  if (restored.daily) restored.daily = { ...restored.daily, pasted: true }
  return restored
}
