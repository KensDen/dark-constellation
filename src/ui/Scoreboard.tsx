// Scoreboard screen (R4): the local top-10, reachable from the menu. Reads
// through the ScoreSink interface, so a remote leaderboard would drop in
// unchanged.

import { useMemo, useState } from 'react'
import { LocalScoreSink } from '../persistence'
import { DIFFICULTIES } from '../engine/reducer'

const sink = new LocalScoreSink()

// A stored entry could carry an unrecognized difficulty (hand-edited or
// written by a future build). Fall back rather than dereference undefined.
const modeLabel = (d: unknown): string =>
  typeof d === 'string' && d in DIFFICULTIES ? DIFFICULTIES[d as keyof typeof DIFFICULTIES].label : 'STANDARD'

export default function Scoreboard({ onBack }: { onBack: () => void }) {
  const [nonce, setNonce] = useState(0)
  const entries = useMemo(() => sink.top(10), [nonce])

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">SCOREBOARD</h1>
        <button className={btn} onClick={onBack}>
          Back to menu
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        Local top {entries.length === 0 ? '10' : entries.length}, this browser only. Ranked by outcome, then Mission
        Assurance Index, then turns survived.
      </p>
      {entries.length === 0 ? (
        <p className="mt-6 text-ink-dim">No runs recorded yet. Finish an operation to post a score.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full font-mono text-xs sm:text-sm border border-phosphor/30">
          <thead>
            <tr className="text-phosphor text-xs uppercase tracking-widest">
              <th className="text-left p-1.5">#</th>
              <th className="text-left p-1.5">Outcome</th>
              <th className="text-left p-1.5">Mode</th>
              <th className="text-right p-1.5">MAI</th>
              <th className="text-right p-1.5">Turns</th>
              <th className="text-right p-1.5 hidden sm:table-cell">Seed</th>
              <th className="text-right p-1.5 hidden sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.recordedAt}-${i}`} className="border-t border-phosphor/15">
                <td className="p-1.5 text-ink-dim">{i + 1}</td>
                <td className={`p-1.5 ${e.outcome === 'won' ? 'text-hero-blue' : 'text-hero-magenta'}`}>
                  {e.outcome === 'won' ? 'ASSURED' : 'FAILED'}
                </td>
                <td className="p-1.5 text-ink-dim">{modeLabel(e.difficulty)}</td>
                <td className="p-1.5 text-right">{e.mai}</td>
                <td className="p-1.5 text-right">
                  {e.turnsSurvived}/{e.totalTurns}
                </td>
                <td className="p-1.5 text-right text-ink-dim hidden sm:table-cell">{e.seed}</td>
                <td className="p-1.5 text-right text-ink-dim hidden sm:table-cell">{e.recordedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
      {entries.length > 0 && (
        <button
          className={`${btn} mt-4`}
          onClick={() => {
            sink.clear()
            setNonce((n) => n + 1)
          }}
        >
          Clear scoreboard
        </button>
      )}
    </main>
  )
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
