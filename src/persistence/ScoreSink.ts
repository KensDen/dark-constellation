// Scoreboard (R4). Since v1.3 R4 it holds free play only: a Daily Op's
// official run is the daily ledger's, and the scoreboard shows the two
// apart (M38). A ScoreSink interface behind a local top-10
// implementation. The remote seam (a shared leaderboard) is v2 and stays an
// interface only: no remote SDK is imported, and a remote sink would drop
// in against this same contract with zero engine or UI changes.

import type { Difficulty, GameState } from '../engine/types'

export interface ScoreEntry {
  outcome: 'won' | 'lost'
  // How a lost run ended, which tells a D from an F (v1.3 R4: the
  // scoreboard shows the grade, M38); absent before R4.
  lossReason?: GameState['lossReason']
  mai: number
  seed: number
  turnsSurvived: number
  totalTurns: number
  scenarioId: string
  // Absent on entries recorded before R5; those runs were all Standard.
  // 'expert' survives only on entries recorded before v1.3 retired it.
  difficulty?: Difficulty | 'expert'
  // The defense bonus (v1.3 brief 6.8); absent before v1.3 Round 0.
  bonus?: number
  recordedAt: string // ISO, presentation only
}

export interface ScoreSink {
  record(entry: ScoreEntry): void
  top(n: number): ScoreEntry[]
  clear(): void
}

const KEY = 'dc-scores'
const KEEP = 10

export class LocalScoreSink implements ScoreSink {
  private read(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as ScoreEntry[]) : []
    } catch {
      return []
    }
  }

  // Ranked: wins above losses, then higher MAI, then more turns survived.
  private rank(entries: ScoreEntry[]): ScoreEntry[] {
    return [...entries].sort((a, b) => {
      if (a.outcome !== b.outcome) return a.outcome === 'won' ? -1 : 1
      if (b.mai !== a.mai) return b.mai - a.mai
      return b.turnsSurvived - a.turnsSurvived
    })
  }

  record(entry: ScoreEntry): void {
    const kept = this.rank([...this.read(), entry]).slice(0, KEEP)
    try {
      localStorage.setItem(KEY, JSON.stringify(kept))
    } catch {
      // best-effort; a full or disabled store just means no scoreboard
    }
  }

  top(n: number): ScoreEntry[] {
    return this.rank(this.read()).slice(0, n)
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // nothing to do
    }
  }
}
