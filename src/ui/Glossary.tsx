// GLOSSARY (R3.5): every entry derived from content data, grouped by
// category, filterable. No hand-maintained text lives here. LIBRARY's
// second tab since v1.3 R4 (brief 5.1: the Glossary becomes a tab inside
// LIBRARY), and what a technique tag opens over the board.

import { useMemo, useState } from 'react'
import { DC_BTN } from './buttons'
import { glossaryEntries, glossaryMatches, type GlossaryEntry } from './reference'

const CATEGORIES: GlossaryEntry['category'][] = ['Technique', 'Countermeasure', 'Threat event', 'Opportunity']

// `focus` is a GlossaryEntry key, not a search string. The intel brief's
// technique tag hands over exactly the key techniqueLabel produced, so the
// entry is found by identity rather than by whether the display term
// happens to contain the tag's characters.
export default function Glossary({
  onBack,
  focus,
  backLabel = 'BACK TO TITLE',
  embedded = false,
  bare = false,
}: {
  onBack?: () => void
  focus?: string
  backLabel?: string
  // Rendered inside another screen's overlay rather than as a screen of
  // its own. A second <main> on the page is invalid HTML and a second
  // visible <h1> breaks landmark and heading navigation, so the embedded
  // form is a <section> with an <h2>.
  embedded?: boolean
  // Rendered as LIBRARY's tab, which carries the title and the way back.
  bare?: boolean
}) {
  const Root = bare ? 'div' : embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  const Sub = embedded ? 'h3' : 'h2'
  const all = useMemo(() => glossaryEntries(), [])
  const focused = focus ? all.find((e) => e.key === focus) : undefined
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? all.filter((e) => glossaryMatches(e, q)) : all

  return (
    <Root data-glossary className="mx-auto w-full max-w-[520px] pb-10 text-dc-ink">
      {!bare && (
        <>
          <div className="sticky top-0 z-10 border-b-2 border-dc-line bg-dc-panel px-4 pt-safe">
            <div className="py-2">
              <button type="button" data-back className={DC_BTN} onClick={onBack}>
                {backLabel.toUpperCase()}
              </button>
            </div>
          </div>
          <Heading className="px-4 pt-4 font-display text-[13px] leading-tight text-dc-ink">GLOSSARY</Heading>
        </>
      )}
      <div className="px-4">
      <p className="mt-3 text-[13px] leading-snug text-dc-muted">
        {all.length} entries: framework techniques, countermeasures with their SPARTA controls and tiers, and each threat
        and opportunity event.
      </p>
      <input
        className="mt-3 min-h-11 w-full border-2 border-dc-line bg-dc-chrome px-2 py-1 font-mono text-[16px] text-dc-ink placeholder:text-dc-muted"
        placeholder="Type to filter the entries"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="filter glossary"
      />
      {/* The entry the player came here for, lifted to the top with its
          framework citation intact. Arriving at a 60 entry list scrolled to
          the top is not "opens the GLOSSARY entry"; it is opening the
          GLOSSARY and leaving them to look. The full list still follows,
          because the tag is a way in rather than a replacement for it. */}
      {focused && (
        <section className="mt-4" data-glossary-focus={focused.key}>
          <Sub className="font-mono text-[11px] uppercase tracking-widest text-dc-go">From the intel brief</Sub>
          <div className="mt-2 border-l-4 border-dc-go bg-dc-go/10 px-3 py-2">
            <p className="text-sm font-bold">{focused.term}</p>
            <p className="text-sm mt-1">{focused.body}</p>
            {focused.refs.length > 0 && (
              <p className="text-xs mt-1 font-mono">
                {focused.refs.map((r, i) => (
                  <span key={r.url}>
                    {i > 0 ? ' | ' : ''}
                    <a className="text-dc-friendly underline underline-offset-2" href={r.url} target="_blank" rel="noreferrer">
                      {r.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>
      )}
      {CATEGORIES.map((cat) => {
        const entries = shown.filter((e) => e.category === cat)
        if (entries.length === 0) return null
        return (
          <section key={cat} className="mt-5">
            <Sub className="font-mono text-[11px] uppercase tracking-widest text-dc-go">
              {cat} ({entries.length})
            </Sub>
            <dl className="mt-2">
              {entries.map((e) => (
                <div key={e.term} className="mt-2 bg-dc-panel px-3 py-2">
                  <dt className="text-sm font-bold">{e.term}</dt>
                  <dd className="text-sm mt-1">{e.body}</dd>
                  {e.refs.length > 0 && (
                    <dd className="text-xs mt-1 font-mono">
                      {e.refs.map((r, i) => (
                        <span key={r.url}>
                          {i > 0 ? ' | ' : ''}
                          <a className="text-dc-friendly underline underline-offset-2" href={r.url} target="_blank" rel="noreferrer">
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
      {shown.length === 0 && <p className="mt-4 text-[13px] text-dc-muted">No entries match that filter.</p>}
      </div>
    </Root>
  )
}
