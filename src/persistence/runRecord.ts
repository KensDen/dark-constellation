// THE RUN'S OWN RECORD (v1.3 R4, brief 5.6): what the debrief shows that
// the engine does not keep, because neither belongs in a deterministic
// state. FILED THIS GAME is the cards filed since the run began, read as
// the Dossier now less the Dossier as it stood at turn 1; the time is the
// time on the clock, counted only while the board was on screen and the
// tab was visible, so a game left overnight does not read as hours.
//
// One record, for the run in progress, keyed by the run's identity. A run
// that arrives from a pasted code has no record of its own here, so its
// debrief says neither (a card list it cannot know, a time it never ran).

const KEY = 'dc-run'

export interface RunRecord {
  // The run's identity: its seed, difficulty and Daily date.
  game: string
  // The Dossier at turn 1.
  before: string[]
  // Time on the clock, in milliseconds.
  ms: number
}

export const runKey = (seed: number, difficulty: string, dateKey?: string): string => `${seed}:${difficulty}:${dateKey ?? ''}`

export function readRun(game: string): RunRecord | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Partial<RunRecord>
    if (r.game !== game || !Array.isArray(r.before) || typeof r.ms !== 'number') return null
    return { game, before: r.before.filter((id): id is string => typeof id === 'string'), ms: r.ms }
  } catch {
    return null
  }
}

function write(record: RunRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Best effort: a refused write costs the debrief its time and its list.
  }
}

// A run at turn 1 starts its record afresh, with the Dossier as it stands.
// Called again for the same run before its first EXECUTE (a reload), it
// starts afresh again, which loses nothing: no card is filed before the
// first night.
export function beginRun(game: string, filed: Iterable<string>): void {
  write({ game, before: [...filed].sort(), ms: 0 })
}

export function addRunTime(game: string, ms: number): void {
  const record = readRun(game)
  if (!record || !(ms > 0)) return
  write({ ...record, ms: record.ms + ms })
}
