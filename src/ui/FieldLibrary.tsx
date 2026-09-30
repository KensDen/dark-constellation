// FIELD LIBRARY (v1.2 R5b, brief 4.8 and 7.3): the public reading behind
// the threats, shelf by shelf in the draft's order, from content data
// (src/content/fieldLibrary.ts). A chunk of its own, from the menu's INTEL
// ARCHIVE and, filtered to one threat, from that threat's event card.
//
// Each entry shows its title, its source and year, the why line, when it
// was checked, and an external-link marker; every link opens in a new tab
// with noopener and noreferrer. An entry is stamped FILED once this device
// has met a threat it pairs with (./libraryProgress.ts). Nothing is locked:
// an entry without its stamp reads exactly as one with it.

import { useMemo, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import { FIELD_LIBRARY } from '../content/fieldLibrary'
import { pairNote, pairedEvents, type LibraryEntry } from '../content/librarySchema'
import { DC_BTN } from './buttons'
import { libraryProgress } from './libraryProgress'
import './library.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// 2026-09-26 as 26 Sep 2026, the same in every locale.
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const LABEL = 'font-display text-[9px] leading-none text-dc-muted'

function Entry({ entry, filed, note }: { entry: LibraryEntry; filed: boolean; note?: string }) {
  return (
    <li data-library-entry={entry.title} className="relative border-t-2 border-dc-line pt-2 mt-3">
      {filed && (
        <span data-filed className="dc-filed font-display text-[9px] text-dc-go">
          FILED
        </span>
      )}
      <a className="font-mono text-sm font-bold text-dc-ink underline" href={entry.url} target="_blank" rel="noopener noreferrer">
        {entry.title}
        <span aria-hidden="true"> ↗</span>
        <span className="dc-offscreen"> (opens in a new tab)</span>
      </a>
      <p className="mt-1 font-mono text-[10px] text-dc-muted">
        {entry.source}
        {entry.year ? `, ${entry.year}` : ''} · {entry.type}
        {note ? ` (${note})` : ''}
      </p>
      <p className="mt-1 text-sm text-dc-ink">
        <span className="text-dc-muted">Why:</span> {entry.why}
      </p>
      <p className="mt-1 font-mono text-[10px] text-dc-muted">
        Checked {day(entry.checked)}
        {entry.urlNote ? ` · ${entry.urlNote}` : ''}
      </p>
    </li>
  )
}

export default function FieldLibrary({
  onBack,
  focus,
  backLabel = 'Back to menu',
  embedded = false,
}: {
  onBack: () => void
  // An event id: the library opens filtered to that threat's entries.
  focus?: string
  backLabel?: string
  // Rendered inside the game's overlay rather than as a screen, like the
  // Glossary: a section with an h2, never a second main and h1.
  embedded?: boolean
}) {
  const Root = embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  const Sub = embedded ? 'h3' : 'h2'
  // Read once per opening: the stamps are this device's record as it
  // stands when the library is opened.
  const progress = useMemo(libraryProgress, [])
  const [filter, setFilter] = useState(focus ?? null)
  // SHOW ALL SHELVES takes itself away, so it hands focus to the title
  // first: focus left on nothing would fall to the page, outside the
  // dialog this screen may be in.
  const title = useRef<HTMLHeadingElement | null>(null)
  const threat = filter ? DEFAULT_SCENARIO.events.find((e) => e.id === filter) : undefined
  const shelves = FIELD_LIBRARY.map((shelf, i) => ({
    ...shelf,
    n: i + 1,
    entries: threat ? shelf.entries.filter((e) => pairedEvents(e).includes(threat.id)) : shelf.entries,
  })).filter((shelf) => shelf.entries.length > 0)

  return (
    <Root data-field-library className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      {/* The back control wraps under the title on a phone rather than
          breaking the title, which display type never does (brief 3). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading ref={title} tabIndex={-1} className="font-display text-lg sm:text-xl text-phosphor whitespace-nowrap outline-none">
          FIELD LIBRARY
        </Heading>
        <button className={DC_BTN} onClick={onBack}>
          {backLabel.toUpperCase()}
        </button>
      </div>
      <p data-filed-counter className="mt-3 font-display text-[10px] text-dc-go">
        FILED {progress.count} / {progress.total}
      </p>
      <p className="mt-2 text-sm text-dc-muted">
        Public reading behind the threats in this game, each one checked against the live page. An entry is stamped
        FILED once you have met a threat it covers, and general reading once you have finished a campaign; every entry
        is open to read either way.
      </p>
      {threat && (
        <div data-library-filter={threat.id} className="mt-4 border-2 border-dc-go/60 bg-dc-go/10 p-2">
          <p className={LABEL}>LEARN MORE</p>
          <p className="mt-1 font-mono text-sm font-bold text-dc-ink">{threat.name}</p>
          <button
            className={`${DC_BTN} mt-2`}
            onClick={() => {
              title.current?.focus()
              setFilter(null)
            }}
          >
            SHOW ALL SHELVES
          </button>
        </div>
      )}
      {shelves.map((shelf) => (
        <section key={shelf.name} data-shelf={shelf.name} className="mt-6 border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
          <Sub className="font-display text-[10px] leading-none text-dc-go">
            {shelf.n}. {shelf.name.toUpperCase()}
          </Sub>
          {/* role="list": Safari drops list semantics from an unstyled list. */}
          <ul role="list">
            {shelf.entries.map((entry) => (
              <Entry key={entry.url} entry={entry} filed={progress.filed(entry)} note={threat ? pairNote(entry, threat.id) : undefined} />
            ))}
          </ul>
        </section>
      ))}
    </Root>
  )
}
