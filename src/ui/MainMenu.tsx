// Main menu (R3.5, extended R4): the entries are wired to [F1]..[Fn] keys
// on desktop and taps on touch. A RESUME entry appears first when a game is
// in progress (an autosave exists). DAILY OP #n follows NEW OPERATION since
// v1.2 R5, from the first day there is one.
//
// THE INTEL ARCHIVE (v1.2 R5b, brief 4.8): the FIELD LIBRARY, the FIELD
// MANUAL and the GLOSSARY grouped under one label after the entries that
// play, with the library's FILED counter beside it. The three stay
// entries in their own right, each with its function key, so the existing
// screens keep a key of their own rather than one behind a fold. The
// counter arrives with the library's chunk, fetched when the menu shows,
// so the first download carries none of the library.
//
// Function keys run F1 to F9 at most, as they always have: F10 and F11
// belong to the browser or the system on some machines, so a tenth entry
// (RESUME and DAILY OP both showing) goes without one and is a tap.

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { dailyNumber, msUntilNextDaily } from '../engine/daily'
import PixelHash from './PixelHash'
import Wordmark from './Wordmark'

export type MenuTarget =
  | 'resume'
  | 'game'
  | 'daily'
  | 'library'
  | 'scoreboard'
  | 'howto'
  | 'manual'
  | 'glossary'
  | 'briefing'
  | 'credits'

type Item = { label: ReactNode; target: MenuTarget }

const ARCHIVE: Item[] = [
  { label: 'FIELD LIBRARY', target: 'library' },
  { label: 'FIELD MANUAL', target: 'manual' },
  { label: 'GLOSSARY', target: 'glossary' },
]

const inArchive = (t: MenuTarget) => ARCHIVE.some((a) => a.target === t)

const BASE_ITEMS: Item[] = [
  { label: 'NEW OPERATION', target: 'game' },
  ...ARCHIVE,
  { label: 'SCOREBOARD', target: 'scoreboard' },
  { label: 'HOW TO PLAY', target: 'howto' },
  // The cold open again (v1.2 R4). A replay, so it leaves the seen-flag
  // as it found it.
  { label: 'BRIEFING', target: 'briefing' },
  { label: 'CREDITS', target: 'credits' },
]

export default function MainMenu({
  onSelect,
  resumeAvailable,
}: {
  onSelect: (t: MenuTarget) => void
  resumeAvailable: boolean
}) {
  // The Daily Op's number, read from the clock and read again at the next
  // local midnight, so a menu left open overnight offers the new day's
  // number. Starting one reads the clock again (App), so the run is that
  // moment's Daily Op.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setTimeout(() => setNow(new Date()), msUntilNextDaily(now) + 50)
    return () => window.clearTimeout(id)
  }, [now])
  const n = dailyNumber(now)
  // A Daily Op starts at once, so with an operation in progress it asks
  // first: the new campaign takes the autosave, and the one behind RESUME
  // (perhaps yesterday's Daily Op, still official for its own date) would
  // be gone. NEW OPERATION has its start screen for that pause.
  const [confirmDaily, setConfirmDaily] = useState(false)
  const choose = (t: MenuTarget) => {
    if (t === 'daily' && resumeAvailable && !confirmDaily) setConfirmDaily(true)
    else onSelect(t)
  }
  // FILED n / total, once the library's chunk is here.
  const [filed, setFiled] = useState('')
  useEffect(() => {
    let live = true
    import('./libraryProgress')
      .then(({ libraryProgress }) => {
        const p = libraryProgress()
        if (live) setFiled(`FILED ${p.count} / ${p.total}`)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  const daily: Item[] =
    n >= 1
      ? [
          {
            label: (
              <>
                DAILY OP <PixelHash />
                {n}
              </>
            ),
            target: 'daily',
          },
        ]
      : []
  const items: Item[] = [
    ...(resumeAvailable ? [{ label: 'RESUME OPERATION', target: 'resume' } as Item] : []),
    BASE_ITEMS[0],
    ...daily,
    ...BASE_ITEMS.slice(1),
  ]
  // Function keys follow position: item i is bound to F(i+1), up to F9.
  const withKeys = items.map((item, i) => ({ ...item, key: i < 9 ? `F${i + 1}` : '' }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const item = withKeys.find((i) => i.key && i.key === e.key)
      if (item) {
        e.preventDefault()
        choose(item.target)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto flex flex-col justify-center">
      <div className="text-center">
        <Wordmark size="clamp(0.9rem, 4.4vw, 2.2rem)" />
        <p className="mt-3 font-mono text-sm text-ink-dim">
          A turn-based space and drone cybersecurity strategy sim.
        </p>
      </div>
      <nav className="mt-8 space-y-2 max-w-md w-full mx-auto">
        {withKeys.map((item) => (
          <Fragment key={item.target}>
            {item.target === 'library' && (
              <p id="intel-archive" data-intel-archive className="flex items-baseline justify-between gap-3 pt-2">
                <span className="font-display text-[10px] text-phosphor">INTEL ARCHIVE</span>
                <span data-filed-counter className="font-mono text-[10px] text-ink-dim">
                  {filed}
                </span>
              </p>
            )}
            <div className={inArchive(item.target) ? 'ml-5' : undefined}>
              <button
                onClick={() => choose(item.target)}
                aria-describedby={inArchive(item.target) ? 'intel-archive' : undefined}
                className="flex w-full items-center gap-3 border border-phosphor/40 bg-panel hover:bg-phosphor/10 px-3 py-2 text-left"
              >
                {item.key && (
                  <span className="font-mono text-xs text-alert-amber border border-alert-amber/50 px-1.5 py-0.5">{item.key}</span>
                )}
                <span className="font-display text-sm text-phosphor">{item.label}</span>
              </button>
            </div>
            {item.target === 'daily' && confirmDaily && (
              <div role="group" aria-label="Replace the operation in progress" data-confirm-daily className="border border-alert-amber/50 bg-panel p-3">
                <p className="font-mono text-sm text-alert-amber">The Daily Op replaces the operation in progress.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => onSelect('daily')} className="min-h-11 border border-alert-amber px-3 font-display text-[10px] text-alert-amber">
                    START DAILY OP
                  </button>
                  <button onClick={() => setConfirmDaily(false)} className="min-h-11 border border-phosphor/40 px-3 font-display text-[10px] text-phosphor">
                    KEEP IT
                  </button>
                </div>
              </div>
            )}
          </Fragment>
        ))}
      </nav>
      <p className="mt-8 text-center font-mono text-xs text-ink-dim">
        <span className="hidden sm:inline">Press [F1] to [F{Math.min(withKeys.length, 9)}], or select an option to continue.</span>
        <span className="sm:hidden">Tap an option to continue.</span>
      </p>
    </main>
  )
}
