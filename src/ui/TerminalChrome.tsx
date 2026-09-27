// Diegetic terminal header (R3.5). A fictional department line, terminal
// ID, a status word, and a live clock. The clock is presentation-only: it
// runs on the wall clock and never touches the engine, whose determinism
// depends on the seeded RNG alone.

import { useEffect, useState } from 'react'
import { DEPARTMENT, TERMINAL_ID } from '../config'

function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function TerminalChrome({ status }: { status: string }) {
  const clock = useClock()
  return (
    <header className="border-b border-phosphor/30 bg-panel/60 font-mono text-phosphor">
      <div className="max-w-3xl mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] sm:text-xs">
        <span className="font-bold tracking-wider">{DEPARTMENT}</span>
        <span className="text-ink-dim">TERM {TERMINAL_ID}</span>
        <span className="text-ink-dim">
          STATUS: <span className="text-phosphor">{status}</span>
        </span>
        <span className="ml-auto text-ink-dim tabular-nums" aria-label="terminal clock">
          {clock}
        </span>
      </div>
    </header>
  )
}
