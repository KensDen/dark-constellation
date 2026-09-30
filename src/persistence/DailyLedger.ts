// The Daily Op's official results (v1.2 R5, brief 7.1): one a date, kept
// on this device. The first Daily Op of a date to finish here claims the
// date and is recorded as its official result; every later finish of the
// same date is PRACTICE. A Daily Op that arrived as a pasted save code is
// practice before anything is read, because a code is text anyone can
// edit (brief 7.1: save codes never count).
//
// A run belongs to the date it STARTED, which is the dateKey its identity
// carries from the moment it began (src/persistence/codec.ts). Nothing
// here reads the clock to decide a date, so a run started at 23:50 and
// finished after midnight claims the day it started on.

import type { GameState } from '../engine/types'
import type { DailyOp } from './codec'

// What an official run was. The grade is not stored: it is derived from
// the outcome, the loss reason and the MAI (src/engine/grade.ts), and a
// stored copy would be a second structure free to disagree with it.
export interface DailyResult {
  n: number
  seed: number
  outcome: 'won' | 'lost'
  lossReason?: GameState['lossReason']
  mai: number
  turns: number
  recordedAt: string // ISO, presentation only
}

export type DailyStanding = 'official' | 'practice'

export interface DailyLedger {
  official(dateKey: string): DailyResult | null
  // Whether any date has an official run, which is one record that this
  // device has finished a campaign (the Field Library reads it, v1.2 R5b).
  any(): boolean
  // Record a finished Daily Op if it is the date's first eligible finish,
  // and say which it was.
  claim(op: DailyOp, result: DailyResult): DailyStanding
}

const KEY = 'dc-daily'

export class LocalDailyLedger implements DailyLedger {
  private read(): Record<string, DailyResult> {
    try {
      const raw = localStorage.getItem(KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, DailyResult>) : {}
    } catch {
      return {}
    }
  }

  official(dateKey: string): DailyResult | null {
    return this.read()[dateKey] ?? null
  }

  any(): boolean {
    return Object.keys(this.read()).length > 0
  }

  claim(op: DailyOp, result: DailyResult): DailyStanding {
    if (op.pasted) return 'practice'
    const all = this.read()
    if (all[op.dateKey]) return 'practice'
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...all, [op.dateKey]: result }))
    } catch {
      // Official means recorded on the device. A run that could not be
      // recorded is not the date's official run, or a device without
      // storage would make every finish official.
      return 'practice'
    }
    return 'official'
  }
}
