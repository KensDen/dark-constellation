// Main menu (R3.5): NEW OPERATION / HOW TO PLAY / FIELD MANUAL / GLOSSARY,
// styled with [F1] to [F4] keys and wired to the real function keys on
// desktop. On touch, the keys are just labels.

import { useEffect } from 'react'
import Wordmark from './Wordmark'

export type MenuTarget = 'game' | 'howto' | 'manual' | 'glossary'

const ITEMS: { key: string; code: string; label: string; target: MenuTarget }[] = [
  { key: 'F1', code: 'F1', label: 'NEW OPERATION', target: 'game' },
  { key: 'F2', code: 'F2', label: 'HOW TO PLAY', target: 'howto' },
  { key: 'F3', code: 'F3', label: 'FIELD MANUAL', target: 'manual' },
  { key: 'F4', code: 'F4', label: 'GLOSSARY', target: 'glossary' },
]

export default function MainMenu({ onSelect }: { onSelect: (t: MenuTarget) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const item = ITEMS.find((i) => i.code === e.key)
      if (item) {
        e.preventDefault()
        onSelect(item.target)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect])

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto flex flex-col justify-center">
      <div className="text-center">
        <Wordmark size="clamp(0.9rem, 4.4vw, 2.2rem)" />
        <p className="mt-3 font-mono text-sm text-ink-dim">
          A turn-based space and drone cybersecurity strategy sim.
        </p>
      </div>
      <nav className="mt-8 space-y-2 max-w-md w-full mx-auto">
        {ITEMS.map((item) => (
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
        <span className="hidden sm:inline">Press [F1] to [F4], or select an option to continue.</span>
        <span className="sm:hidden">Tap an option to continue.</span>
      </p>
    </main>
  )
}
