// Save storage (R4). A small interface plus a localStorage implementation:
// named slots, plus a dedicated autosave slot written at the end of every
// turn for refresh-safe resume. The v2 backend seam (a remote store) can
// implement the same interface with zero engine or UI changes; nothing
// remote is imported here.

import { captureGame, restoreGame, type PersistedGame, type SavePhase } from './codec'
import type { GameState } from '../engine/types'

export interface SaveMeta {
  id: string
  name: string
  savedAt: string
  turn: number
  scenarioId: string
}

export interface RestoredGame {
  state: GameState
  phase: SavePhase
}

export interface SaveStore {
  list(): SaveMeta[]
  load(id: string): RestoredGame | null
  save(state: GameState, phase: SavePhase, name: string): SaveMeta
  remove(id: string): void
  autosave(state: GameState, phase: SavePhase): void
  loadAutosave(): RestoredGame | null
  clearAutosave(): void
}

const NAMED_PREFIX = 'dc-save:'
const AUTOSAVE_KEY = 'dc-autosave'

function meta(id: string, name: string, p: PersistedGame): SaveMeta {
  return { id, name, savedAt: p.savedAt, turn: p.state.turn, scenarioId: p.scenarioId }
}

export class LocalStorageStore implements SaveStore {
  // A monotonic-ish id without Date.now (which is fine here, but keeping it
  // simple and collision-resistant via a counter fallback).
  private nextId(): string {
    let n = 0
    try {
      n = Number.parseInt(localStorage.getItem('dc-save-seq') ?? '0', 10) || 0
      localStorage.setItem('dc-save-seq', String(n + 1))
    } catch {
      // no storage: ids collide only within a session, acceptable
    }
    return `s${n + 1}`
  }

  list(): SaveMeta[] {
    const out: SaveMeta[] = []
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(NAMED_PREFIX)) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const p = JSON.parse(raw) as PersistedGame
          out.push(meta(key.slice(NAMED_PREFIX.length), (p as { name?: string }).name ?? 'Save', p))
        } catch {
          // skip unreadable entry
        }
      }
    } catch {
      return []
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  load(id: string): RestoredGame | null {
    try {
      const raw = localStorage.getItem(NAMED_PREFIX + id)
      if (!raw) return null
      return restoreGame(JSON.parse(raw))
    } catch {
      return null
    }
  }

  save(state: GameState, phase: SavePhase, name: string): SaveMeta {
    const id = this.nextId()
    const p = captureGame(state, phase, nowIso())
    const withName = { ...p, name }
    try {
      localStorage.setItem(NAMED_PREFIX + id, JSON.stringify(withName))
    } catch {
      // storage full or unavailable: return meta so the UI can still report
    }
    return meta(id, name, p)
  }

  remove(id: string): void {
    try {
      localStorage.removeItem(NAMED_PREFIX + id)
    } catch {
      // nothing to do
    }
  }

  autosave(state: GameState, phase: SavePhase): void {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(captureGame(state, phase, nowIso())))
    } catch {
      // autosave is best-effort; a failure just means no resume this session
    }
  }

  loadAutosave(): RestoredGame | null {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY)
      if (!raw) return null
      return restoreGame(JSON.parse(raw))
    } catch {
      return null
    }
  }

  clearAutosave(): void {
    try {
      localStorage.removeItem(AUTOSAVE_KEY)
    } catch {
      // nothing to do
    }
  }
}

// Timestamps are presentation metadata only (never fed to the engine), so
// the wall clock is fine here, exactly as the terminal chrome uses it.
function nowIso(): string {
  return new Date().toISOString()
}
