// A new operation, as the title starts one (v1.3 R1, brief 5.1 and 3 R2).
//
// PLAY starts FIRST LIGHT on a fresh random seed (M30); the seed field
// moved behind SYSTEM as "Replay a seed". The difficulty is the device's:
// EASY until this device has finished a campaign (ruling R2), STANDARD
// after, unless the player picked one in SYSTEM, which is then kept. The
// Daily Op is always STANDARD and does not come through here.

import { DEFAULT_SCENARIO } from '../content'
import { newGame } from '../engine/reducer'
import type { Difficulty } from '../engine/types'
import { LocalDailyLedger, LocalScoreSink, type RestoredGame } from '../persistence'

export const DIFFICULTY_PREF_KEY = 'dc-difficulty'

// Whether this device has finished a campaign: a score was posted, or a
// Daily Op was recorded.
export function finishedACampaign(): boolean {
  try {
    return new LocalScoreSink().top(1).length > 0 || new LocalDailyLedger().any()
  } catch {
    return false
  }
}

export function chosenDifficulty(): Difficulty | null {
  try {
    const v = localStorage.getItem(DIFFICULTY_PREF_KEY)
    return v === 'easy' || v === 'standard' ? v : null
  } catch {
    return null
  }
}

export function deviceDifficulty(): Difficulty {
  return chosenDifficulty() ?? (finishedACampaign() ? 'standard' : 'easy')
}

export function chooseDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_PREF_KEY, d)
  } catch {
    // The choice still applies to the operation it starts.
  }
}

// A seed for PLAY. The engine is deterministic given a seed; where the
// seed comes from is the shell's business, so the UI may draw it at random.
export function randomSeed(): number {
  const buf = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
  else buf[0] = Math.floor(Math.random() * 0xffffffff)
  // 1 to 999,999,999: short enough to read aloud and type back.
  return (buf[0] % 999_999_999) + 1
}

export function newOperation(difficulty: Difficulty = deviceDifficulty(), seed: number = randomSeed()): RestoredGame {
  return { state: newGame(DEFAULT_SCENARIO, seed, difficulty), phase: 'brief' }
}

// A typed seed, or null when it is not one.
export function parseSeed(text: string): number | null {
  const t = text.trim()
  if (!/^\d{1,9}$/.test(t)) return null
  const n = Number.parseInt(t, 10)
  return n > 0 ? n : null
}
