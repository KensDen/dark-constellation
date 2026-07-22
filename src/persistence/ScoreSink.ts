// Scoreboard (R4). A ScoreSink interface behind a local top-10
// implementation. The remote seam (a shared leaderboard) is v2 and stays an
// interface only: no remote SDK is imported, and a remote sink would drop
// in against this same contract with zero engine or UI changes.

export interface ScoreEntry {
  outcome: 'won' | 'lost'
  mai: number
  seed: number
  turnsSurvived: number
  totalTurns: number
  scenarioId: string
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
