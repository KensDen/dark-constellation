// A new operation, as the title starts one (v1.3 R1, brief 5.1 and 3 R2).
//
// PLAY starts FIRST LIGHT on a fresh random seed (M30); the seed field
// moved behind SYSTEM as "Replay a seed". The difficulty is the device's:
// EASY until this device has won a campaign, STANDARD after, unless the
// player picked one in SYSTEM, which is then kept. The Daily Op is always
// STANDARD and does not come through here.
//
// A first WIN since v1.5 R1 (R7's fresh eyes, item 9; ruling R2 said a
// first finished campaign, which moved a player to STANDARD after a lost
// first Daily), and the title says it once when it happens.

import { DEFAULT_SCENARIO } from '../content'
import { newGame } from '../engine/reducer'
import type { Difficulty } from '../engine/types'
import { LocalDailyLedger, LocalScoreSink, type RestoredGame } from '../persistence'

export const DIFFICULTY_PREF_KEY = 'dc-difficulty'

// Whether this device has won a campaign: a won score (the board keeps
// wins above losses), or a won official Daily Op.
export function wonACampaign(): boolean {
  try {
    return new LocalScoreSink().top(10).some((e) => e.outcome === 'won') || new LocalDailyLedger().all().some((d) => d.result.outcome === 'won')
  } catch {
    return false
  }
}

// The title's one word when PLAY has moved to STANDARD on a first win, and
// the key that keeps it to once.
export const MOVED_TO_STANDARD = 'First win on EASY: PLAY now starts on STANDARD. Change it in SYSTEM, at the foot of this screen.'
const MOVED_TOLD_KEY = 'dc-standard-told'
export function movedToStandard(): boolean {
  try {
    return chosenDifficulty() === null && wonACampaign() && localStorage.getItem(MOVED_TOLD_KEY) === null
  } catch {
    return false
  }
}
export function toldMovedToStandard(): void {
  try {
    localStorage.setItem(MOVED_TOLD_KEY, '1')
  } catch {
    // Said again next time, which is the safe side.
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
  return chosenDifficulty() ?? (wonACampaign() ? 'standard' : 'easy')
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
