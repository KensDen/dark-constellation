// GLOSSARY screen (R3.5): every entry derived from content data, grouped by
// category, filterable. No hand-maintained text lives here.

import { useMemo, useState } from 'react'
import { glossaryEntries, type GlossaryEntry } from './reference'

const CATEGORIES: GlossaryEntry['category'][] = ['Technique', 'Countermeasure', 'Threat event', 'Opportunity']

export default function Glossary({ onBack }: { onBack: () => void }) {
  const all = useMemo(() => glossaryEntries(), [])
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? all.filter((e) => e.term.toLowerCase().includes(q) || e.body.toLowerCase().includes(q)) : all

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">GLOSSARY</h1>
        <button className={btn} onClick={onBack}>
          Back to menu
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        {all.length} entries, every one derived from the content deck: framework techniques, countermeasures with
        their SPARTA controls and tiers, and each threat and opportunity event.
      </p>
      <input
        className="mt-3 w-full border border-phosphor/40 bg-panel text-ink px-2 py-1 font-mono text-sm"
        placeholder="Filter..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="filter glossary"
      />
      {CATEGORIES.map((cat) => {
        const entries = shown.filter((e) => e.category === cat)
        if (entries.length === 0) return null
        return (
          <section key={cat} className="mt-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
              {cat} ({entries.length})
            </h2>
            <dl className="mt-2">
              {entries.map((e) => (
                <div key={e.term} className="mt-3 border border-phosphor/20 bg-panel p-2">
                  <dt className="font-mono text-sm text-phosphor">{e.term}</dt>
                  <dd className="text-sm mt-1">{e.body}</dd>
                  {e.refs.length > 0 && (
                    <dd className="text-xs mt-1 font-mono">
                      {e.refs.map((r, i) => (
                        <span key={r.url}>
                          {i > 0 ? ' | ' : ''}
                          <a className="underline text-hero-blue" href={r.url} target="_blank" rel="noreferrer">
                            {r.label}
                          </a>
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        )
      })}
      {shown.length === 0 && <p className="mt-4 text-ink-dim">No entries match that filter.</p>}
    </main>
  )
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
