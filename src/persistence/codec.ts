// Save codec (R4). Serializes a game to a compact, versioned, portable
// form and back. The static scenario (events, countermeasures, campaign)
// is NOT serialized: only its id travels, and the full scenario is
// rehydrated from the content module on load, so save codes stay small and
// can never ship stale content. All of this is UI-side; nothing here feeds
// the deterministic engine, so a restored game resolves identically.

import { SCENARIOS } from '../content'
import type { GameState } from '../engine/types'

// Bump when the persisted shape changes. Versions we know how to migrate
// are upgraded on load; anything else is rejected with a message rather
// than corrupt-loaded (R4 item 6).
//
// v1 (R4): no difficulty field, all campaigns were the Standard tuning.
// v2 (R5): adds difficulty. v1 saves migrate forward as Standard.
export const SAVE_VERSION = 2
const OLDEST_MIGRATABLE = 1

export type SavePhase = 'brief' | 'procure' | 'harden' | 'aftermath'

export interface PersistedGame {
  version: number
  savedAt: string // ISO timestamp, presentation only
  phase: SavePhase
  scenarioId: string
  state: Omit<GameState, 'scenario'>
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveError'
  }
}

// Build the persisted record from a live game. savedAt is injected by the
// caller so this stays pure and testable.
export function captureGame(state: GameState, phase: SavePhase, savedAt: string): PersistedGame {
  const { scenario, ...rest } = state
  return { version: SAVE_VERSION, savedAt, phase, scenarioId: scenario.id, state: rest }
}

// Validate every dynamic GameState field the engine reads. A partial but
// JSON-parseable payload must be rejected here, not loaded and then crashed
// on the next resolveTurn (which dereferences pipeline, counters, flags, and
// the three meter keys directly).
function isPlainState(s: unknown): s is Omit<GameState, 'scenario'> {
  if (!s || typeof s !== 'object') return false
  const st = s as Record<string, unknown>
  const isObj = (v: unknown) => typeof v === 'object' && v !== null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const m = st.meters as Record<string, unknown> | undefined
  return (
    (st.status === 'playing' || st.status === 'won' || st.status === 'lost') &&
    (st.difficulty === 'easy' || st.difficulty === 'standard' || st.difficulty === 'expert') &&
    num(st.seed) &&
    num(st.turn) &&
    num(st.credits) &&
    num(st.intelLevel) &&
    num(st.surgeTokens) &&
    num(st.intelBoostTurns) &&
    typeof st.irRetainer === 'boolean' &&
    Array.isArray(st.assets) &&
    Array.isArray(st.counters) &&
    Array.isArray(st.history) &&
    Array.isArray(st.conditions) &&
    Array.isArray(st.pipeline) &&
    Array.isArray(st.pendingCounters) &&
    isObj(st.flags) &&
    isObj(st.forecast) &&
    isObj(m) &&
    num(m!.linkAvailability) &&
    num(m!.dataIntegrity) &&
    num(m!.sensorIntegrity)
  )
}

// Rehydrate a live game (with its scenario reattached) from a persisted
// record. Throws SaveError with a human-readable reason on any mismatch.
export function restoreGame(p: unknown): { state: GameState; phase: SavePhase } {
  if (!p || typeof p !== 'object') throw new SaveError('This is not a valid save.')
  const rec = p as Partial<PersistedGame>
  if (typeof rec.version !== 'number') throw new SaveError('This save is missing its version.')
  if (rec.version > SAVE_VERSION || rec.version < OLDEST_MIGRATABLE) {
    throw new SaveError(
      `This save is version ${rec.version}, but this build reads versions ${OLDEST_MIGRATABLE} to ${SAVE_VERSION}. It cannot be loaded.`,
    )
  }
  const scenario = SCENARIOS.find((s) => s.id === rec.scenarioId)
  if (!scenario) throw new SaveError(`This save references an unknown scenario (${String(rec.scenarioId)}).`)
  // Migrate forward. v1 predates difficulty, so those campaigns were played
  // on the Standard tuning and load as Standard; they are never rejected.
  const raw = rec.state as Record<string, unknown> | undefined
  const migrated =
    rec.version < 2 && raw && typeof raw === 'object' ? { ...raw, difficulty: 'standard' } : raw
  if (!isPlainState(migrated)) throw new SaveError('This save is corrupt or incomplete.')
  const phase: SavePhase =
    rec.phase === 'procure' || rec.phase === 'harden' || rec.phase === 'aftermath' ? rec.phase : 'brief'
  return { state: { ...(migrated as Omit<GameState, 'scenario'>), scenario } as GameState, phase }
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

export function decodeSaveCode(code: string): { state: GameState; phase: SavePhase } {
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
  return restoreGame(parsed)
}
