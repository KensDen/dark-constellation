// WHAT THE 3D GAME KEEPS ON THE DEVICE (v2.0 R1), beside the game's own
// saves (src/persistence) and in the same store: the unlocks finished
// games earn, the player's settings for this presentation, where each
// threat has hit this device (the Dossier's "where it hit you"), and the
// night in progress, so a reload in the night lands on its dawn and not
// back before it with tonight's moves known. Best effort, like every
// store here: a refused write changes nothing else. Nothing is sold, and
// nothing here reaches a network.

import type { GameState } from '../../engine/types'
import type { NightInputs, Orders } from './gameModel'
import type { SkinId } from './world'

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : ({ ...fallback, ...(JSON.parse(raw) as object) } as T)
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Best effort.
  }
}

// ------------------------------------------------------------- unlocks

export interface Progress {
  finished: number
  wins: number
  standardWins: number
}
export type PostureId = 'standard' | 'dark'
export type OpeningId = 'standard' | 'polar'
export interface Prefs {
  skin: SkinId
  posture: PostureId
  opening: OpeningId
  assist: boolean
  lowPower: boolean
  guideSeen: boolean
}

const PROGRESS_KEY = 'dc-3d-progress'
const PREFS_KEY = 'dc-3d-prefs'
const NO_PROGRESS: Progress = { finished: 0, wins: 0, standardWins: 0 }
const DEFAULT_PREFS: Prefs = { skin: 'standard', posture: 'standard', opening: 'standard', assist: false, lowPower: false, guideSeen: false }

export const progress = (): Progress => read(PROGRESS_KEY, NO_PROGRESS)
export const prefs = (): Prefs => read(PREFS_KEY, DEFAULT_PREFS)
export const setPrefs = (next: Partial<Prefs>): Prefs => {
  const merged = { ...prefs(), ...next }
  write(PREFS_KEY, merged)
  return merged
}

// What a finished game unlocks, as rules over the device's own record.
export interface Unlocks {
  skins: Record<SkinId, boolean>
  postures: Record<PostureId, boolean>
  openings: Record<OpeningId, boolean>
}
export function unlocksFor(p: Progress, filed: number): Unlocks {
  return {
    skins: { standard: true, foil: p.finished >= 1, nightwatch: p.wins >= 1, signal: filed >= 9 },
    postures: { standard: true, dark: p.standardWins >= 1 },
    openings: { standard: true, polar: p.finished >= 2 },
  }
}

// A game finished here: count it, and say what it newly unlocked.
export function recordFinish(state: GameState, filed: number): string[] {
  const before = progress()
  const won = state.status === 'won'
  const after: Progress = { finished: before.finished + 1, wins: before.wins + (won ? 1 : 0), standardWins: before.standardWins + (won && state.difficulty === 'standard' ? 1 : 0) }
  write(PROGRESS_KEY, after)
  const was = unlocksFor(before, filed)
  const now = unlocksFor(after, filed)
  const earned: string[] = []
  for (const k of Object.keys(now.skins) as SkinId[]) if (now.skins[k] && !was.skins[k]) earned.push(`skin:${k}`)
  for (const k of Object.keys(now.postures) as PostureId[]) if (now.postures[k] && !was.postures[k]) earned.push(`posture:${k}`)
  for (const k of Object.keys(now.openings) as OpeningId[]) if (now.openings[k] && !was.openings[k]) earned.push(`opening:${k}`)
  return earned
}

// --------------------------------------------------- where it hit you

export interface HitLog {
  hits: number
  blocks: number
  // The call sign it last landed on.
  last: string
}
const HITS_KEY = 'dc-3d-hits'
export const hitLog = (): Record<string, HitLog> => read<Record<string, HitLog>>(HITS_KEY, {})
export function logNight(events: readonly { eventId: string; landed: boolean; sign: string }[]): void {
  const log = hitLog()
  for (const e of events) {
    const row = log[e.eventId] ?? { hits: 0, blocks: 0, last: '' }
    log[e.eventId] = e.landed ? { hits: row.hits + 1, blocks: row.blocks, last: e.sign || row.last } : { ...row, blocks: row.blocks + 1 }
  }
  write(HITS_KEY, log)
}

// ------------------------------------------------ the night in progress

export interface NightMark {
  run: string
  turn: number
  orders: Orders
  inputs: NightInputs
}
const NIGHT_KEY = 'dc-3d-night'
export const markNight = (mark: NightMark): void => write(NIGHT_KEY, mark)
export const clearNight = (): void => {
  try {
    localStorage.removeItem(NIGHT_KEY)
  } catch {
    // Nothing to clear.
  }
}
export function nightMark(run: string, turn: number): NightMark | null {
  try {
    const m = JSON.parse(localStorage.getItem(NIGHT_KEY) ?? 'null') as NightMark | null
    return m && m.run === run && m.turn === turn && m.orders && m.inputs ? m : null
  } catch {
    return null
  }
}

// How many holds this device has called (v2.0 R2): the first one a device
// meets has no clock, so the tie-break is learned before it is timed.
const HOLDS_KEY = 'dc-3d-holds'
export const holdsSeen = (): number => read<{ n: number }>(HOLDS_KEY, { n: 0 }).n
export const sawHold = (): void => write(HOLDS_KEY, { n: holdsSeen() + 1 })

// NAME THAT SIGNATURE (v2.0 R2): the best round on this device.
const QUIZ_KEY = 'dc-3d-quiz'
export const quizBest = (): number => read<{ best: number }>(QUIZ_KEY, { best: 0 }).best
export const setQuizBest = (n: number): void => {
  if (n > quizBest()) write(QUIZ_KEY, { best: n })
}
