// What the title says about the Daily Op and the Dossier (v1.3 R1, brief
// 5.1, M32): today's board until today's official run, then
// "DONE · B · DAY STREAK 3" (the grade from ./titleDaily.ts), and GOAL 2's
// count of filed intel cards.

import { DEFAULT_SCENARIO } from '../content'
import { dailyKey } from '../engine/daily'
import { LocalDailyLedger, LocalScoreSink, dossier } from '../persistence'

// The tagline the README, the page description and the GitHub About share.
export const TITLE_TAGLINE = 'A turn-based space and drone cybersecurity strategy sim.'

// The Daily Op's line before the grade arrives: today's board, or DONE
// with the streak. The grade comes from ./titleDaily.ts, fetched by dynamic
// import so the grading module stays with the debrief and out of the
// first download (tests/lazy-screens.spec.ts).
export const DAILY_OPEN_LINE = 'SAME BOARD FOR EVERYONE TODAY · STANDARD'

export function dailyLineNow(now: Date, ledger = new LocalDailyLedger()): string {
  return ledger.official(dailyKey(now)) ? `DONE · DAY STREAK ${dailyStreak(now, ledger)}` : DAILY_OPEN_LINE
}

// Consecutive dates with an official run, ending today.
export function dailyStreak(now: Date, ledger = new LocalDailyLedger()): number {
  let n = 0
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  while (ledger.official(dailyKey(day))) {
    n += 1
    day.setDate(day.getDate() - 1)
  }
  return n
}

// GOAL 1 (v1.3 R5, Ken's ruling on R4's question 10): whether this device
// has ever held the mission, and the best final score it has finished on,
// over practice runs and official Daily Ops alike. Null before any run.
export function goalOne(ledger = new LocalDailyLedger(), sink = new LocalScoreSink()): { held: boolean; best: number } | null {
  const runs = [...sink.top(10).map((e) => ({ won: e.outcome === 'won', mai: e.mai })), ...ledger.all().map(({ result }) => ({ won: result.outcome === 'won', mai: result.mai }))]
  if (runs.length === 0) return null
  return { held: runs.some((r) => r.won), best: Math.max(...runs.map((r) => r.mai)) }
}

// GOAL 2: intel cards filed on this device, of the threats in the deck.
export function dossierCount(): { filed: number; total: number } {
  const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat').map((e) => e.id)
  const filed = dossier()
  return { filed: threats.filter((id) => filed.has(id)).length, total: threats.length }
}
