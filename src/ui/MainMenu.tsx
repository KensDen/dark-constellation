// Main menu (R3.5, extended R4): the entries are wired to [F1]..[Fn] keys
// on desktop and taps on touch. A RESUME entry appears first when a game is
// in progress (an autosave exists).

import { useEffect } from 'react'
import Wordmark from './Wordmark'

export type MenuTarget = 'resume' | 'game' | 'scoreboard' | 'howto' | 'manual' | 'glossary' | 'credits'

const BASE_ITEMS: { label: string; target: MenuTarget }[] = [
  { label: 'NEW OPERATION', target: 'game' },
  { label: 'SCOREBOARD', target: 'scoreboard' },
  { label: 'HOW TO PLAY', target: 'howto' },
  { label: 'FIELD MANUAL', target: 'manual' },
  { label: 'GLOSSARY', target: 'glossary' },
  { label: 'CREDITS', target: 'credits' },
]

export default function MainMenu({
  onSelect,
  resumeAvailable,
}: {
  onSelect: (t: MenuTarget) => void
  resumeAvailable: boolean
}) {
  const items = (resumeAvailable ? [{ label: 'RESUME OPERATION', target: 'resume' as MenuTarget }] : []).concat(
    BASE_ITEMS,
  )
  // Function keys follow position: item i is bound to F(i+1).
  const withKeys = items.map((item, i) => ({ ...item, key: `F${i + 1}` }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const item = withKeys.find((i) => i.key === e.key)
      if (item) {
        e.preventDefault()
        onSelect(item.target)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, withKeys])

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
          <button
            key={item.target}
            onClick={() => onSelect(item.target)}
            className="w-full flex items-center gap-3 border border-phosphor/40 bg-panel hover:bg-phosphor/10 px-3 py-2 text-left"
          >
            <span className="font-mono text-xs text-alert-amber border border-alert-amber/50 px-1.5 py-0.5">
              {item.key}
            </span>
            <span className="font-display text-sm text-phosphor">{item.label}</span>
          </button>
        ))}
      </nav>
      <p className="mt-8 text-center font-mono text-xs text-ink-dim">
        <span className="hidden sm:inline">Press [F1] to [F{withKeys.length}], or select an option to continue.</span>
        <span className="sm:hidden">Tap an option to continue.</span>
      </p>
    </main>
  )
}
