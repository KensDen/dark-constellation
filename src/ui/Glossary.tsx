// GLOSSARY (R3.5): every entry derived from content data, grouped by
// category, filterable. No hand-maintained text lives here. LIBRARY's
// second tab since v1.3 R4 (brief 5.1: the Glossary becomes a tab inside
// LIBRARY), and what a technique tag opens over the board.

import { useMemo, useState } from 'react'
import { DC_BTN } from './buttons'
import { glossaryEntries, glossaryMatches, type GlossaryEntry } from './reference'
import './rooms.css'

// A framework's own page, an outbound source: a chip in the ink with the
// Library's ↗, not link-blue underlined text (v1.6 R3's sweep). The
// game's glass chip since v2.0 R4, in a 44px target (./rooms.css).
const SOURCE_CHIP = 'rm-chip'

const CATEGORIES: GlossaryEntry['category'][] = ['Technique', 'Advisory', 'Countermeasure', 'Threat event', 'Opportunity']

// `focus` is a GlossaryEntry key, not a search string. The intel brief's
// technique tag hands over exactly the key techniqueLabel produced, so the
// entry is found by identity rather than by whether the display term
// happens to contain the tag's characters.
// The acronyms a first-time player meets in the first minute.
const ACRONYMS: readonly (readonly [string, string])[] = [
  ['EOC', 'emergency operations center'],
  ['GNSS', 'satellite navigation: GPS and its peers'],
  ['ISR', 'intelligence, surveillance and reconnaissance'],
  ['PNT', 'position, navigation and timing'],
  ['RPO', 'rendezvous and proximity operations'],
  ['SSA', 'space situational awareness'],
]

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
    <Root data-glossary className={bare ? undefined : 'rm'}>
      {!bare && (
        <div className="rm-head">
          <button type="button" data-back className={DC_BTN} onClick={onBack}>
            {backLabel.toUpperCase()}
          </button>
        </div>
      )}
      <div className="rm-body">
      {!bare && <Heading className="rm-h">GLOSSARY</Heading>}
      <p className="tt-note">
        {all.length} entries: framework techniques, an NSA advisory, countermeasures with their SPARTA controls and tiers,
        and each threat and opportunity event.
      </p>
      {/* The short words the briefing and the board use before anything
          explains them (R6 question 10; R4 question 11 sent it here). */}
      <p data-glossary-acronyms className="tt-note">
        {ACRONYMS.map(([short, long], i) => (
          <span key={short}>
            {i > 0 && '; '}
            <b>{short}</b>, {long}
          </span>
        ))}
        .
      </p>
      <input
        className="tt-field"
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
        <section className="rm-sec" data-glossary-focus={focused.key}>
          <Sub className="tt-label tt-go uppercase">From the intel brief</Sub>
          <div className="rm-card rm-go">
            <p className="rm-name">{focused.term}</p>
            <p>{focused.body}</p>
            {focused.refs.length > 0 && (
              <p>
                {focused.refs.map((r, i) => (
                  <span key={r.url}>
                    {i > 0 ? ' ' : ''}
                    <a className={SOURCE_CHIP} href={r.url} target="_blank" rel="noreferrer">
                      {r.label}
                      <span aria-hidden="true">{'\u00a0'}↗</span>
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
          <section key={cat} className="rm-sec">
            <Sub className="tt-label tt-go uppercase">
              {cat} ({entries.length})
            </Sub>
            <dl className="rm-grid">
              {entries.map((e) => (
                <div key={e.term} className="rm-card">
                  <dt>{e.term}</dt>
                  <dd>{e.body}</dd>
                  {e.refs.length > 0 && (
                    <dd>
                      {e.refs.map((r, i) => (
                        <span key={r.url}>
                          {i > 0 ? ' ' : ''}
                          <a className={SOURCE_CHIP} href={r.url} target="_blank" rel="noreferrer">
                            {r.label}
                            <span aria-hidden="true">{'\u00a0'}↗</span>
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
      {shown.length === 0 && <p className="tt-note">No entries match that filter.</p>}
      </div>
    </Root>
  )
}
