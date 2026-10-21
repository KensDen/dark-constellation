// The Daily Op's finished line with its grade (v1.3 R1, M32), fetched by the
// title with a dynamic import: it reads the grading module, which belongs
// to the score screen's chunk and not to the first download.

import { dailyKey } from '../engine/daily'
import { gradeFor } from '../engine/grade'
import { LocalDailyLedger } from '../persistence'
import { DAILY_OPEN_LINE, dailyStreak } from './titleStatus'

export function dailyLine(now: Date, ledger = new LocalDailyLedger()): string {
  const today = ledger.official(dailyKey(now))
  if (!today) return DAILY_OPEN_LINE
  const grade = gradeFor({
    status: today.outcome,
    lossReason: today.lossReason,
    finalMai: today.mai,
    bonus: today.bonus,
  })
  return `DONE · ${grade} · STREAK ${dailyStreak(now, ledger)}`
}
