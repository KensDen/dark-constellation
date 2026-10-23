// FIELD LIBRARY (v1.2 R5b, brief 4.8 and 7.3): the public reading behind
// the threats, shelf by shelf in the draft's order, from content data
// (src/content/fieldLibrary.ts). A chunk of its own: LIBRARY's first tab
// since v1.3 R4, and, filtered to one threat, what LEARN MORE opens over
// the board, the night's intel card and the Dossier.
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

const LABEL = 'font-mono text-[10px] tracking-widest text-dc-muted'

function Entry({ entry, filed, note }: { entry: LibraryEntry; filed: boolean; note?: string }) {
  return (
    <li data-library-entry={entry.title} className="relative border-t-2 border-dc-line pt-2 mt-3">
      {filed && (
        <span data-filed className="dc-filed font-mono text-[10px] tracking-widest text-dc-go">
          FILED
        </span>
      )}
      <a className="text-sm font-bold text-dc-ink underline decoration-dc-line underline-offset-2" href={entry.url} target="_blank" rel="noopener noreferrer">
        {entry.title}
        {/\.pdf$/i.test(entry.url) && <span className="font-normal text-dc-muted">{'\u00a0'}(PDF)</span>}
        {/* The marker stays on the title's last line (fresh-eyes review). */}
        <span aria-hidden="true">{'\u00a0'}↗</span>
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

const HANDS_ON = 'Hands-on'

export default function FieldLibrary({
  onBack,
  focus,
  backLabel = 'BACK TO TITLE',
  embedded = false,
  bare = false,
}: {
  onBack?: () => void
  // An event id: the library opens filtered to that threat's entries.
  focus?: string
  backLabel?: string
  // Rendered inside another screen's overlay rather than as a screen, like
  // the Glossary: a section with an h2, never a second main and h1.
  embedded?: boolean
  // Rendered as LIBRARY's first tab (v1.3 R4), which carries the title and
  // the way back: no bar and no heading of its own.
  bare?: boolean
}) {
  const Root = bare ? 'div' : embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  const Sub = embedded ? 'h3' : 'h2'
  // Read once per opening: the stamps are this device's record as it
  // stands when the library is opened.
  const progress = useMemo(libraryProgress, [])
  const [filter, setFilter] = useState(focus ?? null)
  // SHOW ALL SHELVES takes itself away, so it hands focus to the title
  // first (the counter, in a tab): focus left on nothing would fall to the
  // page, outside the dialog this screen may be in.
  const title = useRef<HTMLHeadingElement | null>(null)
  const counter = useRef<HTMLParagraphElement | null>(null)
  const threat = filter ? DEFAULT_SCENARIO.events.find((e) => e.id === filter) : undefined
  const shelves = FIELD_LIBRARY.map((shelf, i) => ({
    ...shelf,
    n: i + 1,
    entries: threat ? shelf.entries.filter((e) => pairedEvents(e).includes(threat.id)) : shelf.entries,
  })).filter((shelf) => shelf.entries.length > 0)

  return (
    <Root data-field-library className="mx-auto w-full max-w-[520px] pb-10 text-dc-ink">
      {!bare && (
        <>
          <div className="sticky top-0 z-10 border-b-2 border-dc-line bg-dc-panel px-4 pt-safe">
            <div className="py-2">
              <button type="button" data-back className={DC_BTN} onClick={onBack}>
                {backLabel.toUpperCase()}
              </button>
            </div>
          </div>
          <Heading ref={title} tabIndex={-1} className="px-4 pt-4 font-display text-[13px] leading-tight text-dc-ink outline-none">
            FIELD LIBRARY
          </Heading>
        </>
      )}
      <div className="px-4">
      <p ref={counter} tabIndex={-1} data-filed-counter className="mt-3 font-mono text-[11px] tracking-widest text-dc-go outline-none">
        FILED {progress.count} / {progress.total}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-dc-muted">
        The public reading behind every threat in this game, each entry checked against the live page. Everything here
        is open to read. An entry is stamped FILED once you meet a threat it covers; the general reading is stamped once
        you finish a game.
      </p>
      {/* The legal caution for the whole list, not one shelf (R6 question 5):
          a hands-on interception walkthrough sits on the third shelf too. UI
          text, so the approved entries and their hashes are not touched. */}
      <p data-library-caution className="mt-2 text-xs text-alert-amber">
        Practice only on equipment you own or are authorized to test. Listening to other people&apos;s satellite traffic
        can be illegal where you live.
      </p>
      {threat && (
        <div data-library-filter={threat.id} className="mt-4 border-l-4 border-dc-go bg-dc-go/10 px-3 py-2">
          <p className={LABEL}>LEARN MORE</p>
          <p className="mt-1 text-sm font-bold text-dc-ink">{threat.name}</p>
          <button
            type="button"
            className={`${DC_BTN} mt-2`}
            onClick={() => {
              ;(title.current ?? counter.current)?.focus()
              setFilter(null)
            }}
          >
            SHOW ALL SHELVES
          </button>
        </div>
      )}
      {shelves.map((shelf) => (
        <section key={shelf.name} data-shelf={shelf.name} className="mt-4 bg-dc-panel px-3 py-2.5">
          <Sub className="font-mono text-[11px] tracking-widest text-dc-go">
            {shelf.n}. {shelf.name.toUpperCase()}
          </Sub>
          {/* Shelf note, UI text rather than entry data, so the approved list
              and its hashes stand (QC gauntlet Q27). */}
          {shelf.name === HANDS_ON && (
            <p data-shelf-note className="mt-2 text-xs text-alert-amber">
              Practice only on equipment you own or are authorized to test. Listening to other people&apos;s satellite
              traffic can be illegal where you live.
            </p>
          )}
          {/* role="list": Safari drops list semantics from an unstyled list. */}
          <ul role="list">
            {shelf.entries.map((entry) => (
              <Entry key={entry.url} entry={entry} filed={progress.filed(entry)} note={threat ? pairNote(entry, threat.id) : undefined} />
            ))}
          </ul>
        </section>
      ))}
      </div>
    </Root>
  )
}
