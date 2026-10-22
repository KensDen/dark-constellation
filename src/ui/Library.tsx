// LIBRARY (v1.3 brief 5.1, Round 4): the title's LIBRARY opens it. The
// Field Library, with the Glossary as its second tab (the Glossary left
// the retired menu for here). Each tab is its own chunk, fetched when the
// tab is first shown; the Field Library stays fully readable whatever is
// filed (v1.2 section 7.3, kept).

import { Suspense, lazy, useState, type KeyboardEvent } from 'react'
import { DC_BTN } from './buttons'

const TabUnavailable = () => <p className="px-4 pt-4 font-mono text-[12px] text-dc-warn">This tab could not load. Try again in a moment.</p>
const FieldLibrary = lazy(() => import('./FieldLibrary').catch(() => ({ default: TabUnavailable })))
const Glossary = lazy(() => import('./Glossary').catch(() => ({ default: TabUnavailable })))

const TABS = [
  { id: 'library', label: 'FIELD LIBRARY' },
  { id: 'glossary', label: 'GLOSSARY' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function Library({ onBack, tab: initial = 'library' }: { onBack: () => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial)
  // Arrow keys move between the tabs, as a tab list does.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length].id
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }
  return (
    <main data-library className="mx-auto w-full max-w-[520px] text-dc-ink">
      <div className="sticky top-0 z-10 border-b-2 border-dc-line bg-dc-panel px-4 pb-0 pt-safe">
        <div className="flex items-center justify-between gap-2 py-2">
          <button type="button" data-back onClick={onBack} className={DC_BTN}>
            BACK TO TITLE
          </button>
          <h1 className="font-display text-[13px] text-dc-ink">LIBRARY</h1>
        </div>
        <div role="tablist" aria-label="Library" className="-mb-0.5 grid grid-cols-2" onKeyDown={onKey}>
          {TABS.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                data-tab={t.id}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`min-h-11 border-b-4 font-display text-[10px] ${on ? 'border-dc-go text-dc-go' : 'border-transparent text-dc-muted'}`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <Suspense fallback={<p className="px-4 pt-4 font-mono text-[12px] text-dc-muted">Opening the {tab === 'library' ? 'Field Library' : 'Glossary'}.</p>}>
          {tab === 'library' ? <FieldLibrary bare /> : <Glossary bare />}
        </Suspense>
      </div>
    </main>
  )
}
