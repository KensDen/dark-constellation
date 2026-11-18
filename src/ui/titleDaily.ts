// The Daily Op's finished line with its grade (v1.3 R1, M32), fetched by the
// title with a dynamic import: it reads the grading module, which belongs
// to the debrief's chunk and not to the first download.

import { dailyKey } from '../engine/daily'
import { gradeFor } from '../engine/grade'
import { LocalDailyLedger, fromPixelGame } from '../persistence'
import { DAILY_OPEN_LINE, dailyStreak } from './titleStatus'

export function dailyLine(now: Date, ledger = new LocalDailyLedger()): string {
  const today = ledger.official(dailyKey(now))
  if (!today) return DAILY_OPEN_LINE
  // A result from the pixel board keeps its score and is not graded on the
  // 3D game's bands (v2.0 R5: src/persistence/ScoreSink.ts).
  if (fromPixelGame(today)) return `DONE · DAY STREAK ${dailyStreak(now, ledger)}`
  const grade = gradeFor({
    status: today.outcome,
    lossReason: today.lossReason,
    finalMai: today.mai,
    bonus: today.bonus,
  })
  return `DONE · ${grade} · DAY STREAK ${dailyStreak(now, ledger)}`
}
