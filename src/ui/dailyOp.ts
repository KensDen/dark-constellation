// Starting a Daily Op (v1.2 R5). App calls this when the menu's DAILY OP
// is chosen, with the moment it was chosen.

import { DEFAULT_SCENARIO } from '../content'
import { dailyKey, dailyNumber, dailySeed } from '../engine/daily'
import { newGame } from '../engine/reducer'
import type { RestoredGame } from '../persistence'

// A new Daily Op (brief 7.1): always FIRST LIGHT on Standard, seeded from
// the local date, and carrying the date it STARTED on and its number, so a
// run that crosses midnight still belongs to its first day. The identity
// comes only from here and from the records that copy it; a seed typed on
// the start screen never makes a Daily Op, whatever it matches.
export function startDailyOp(now: Date): RestoredGame {
  return {
    state: newGame(DEFAULT_SCENARIO, dailySeed(now), 'standard'),
    phase: 'brief',
    daily: { dateKey: dailyKey(now), n: dailyNumber(now) },
  }
}
