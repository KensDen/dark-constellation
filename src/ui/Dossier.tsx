// THE COLDVEIL DOSSIER (v1.3 brief 5.7, Round 4): every move COLDVEIL can
// make, as a card, two to a row. A filed card shows its vector and layer,
// its name and its hook, and opens to the blurb, STOPPED BY, TECHNIQUE,
// SOURCE and LEARN MORE; an unfiled one reads "Unfiled" over "Face this
// move in play to file it." The title's DOSSIER and GOAL 2 open it as a
// screen, and the debrief opens it over itself.
//
// Cards are filed on the intel card's FILE IT (Round 3), on this device
// (src/persistence/dossier.ts), and read here as they stand when the
// Dossier opens. A filed card is never locked from reading, and the Field
// Library stays fully readable whatever is filed (v1.2 section 7.3, kept):
// LEARN MORE opens it at the card's threat, over the Dossier.
//
// A chunk of its own. Status never looks like a control (section 4 rule
// 2): an unfiled card is a flat panel with no border; a filed card opens,
// so it carries the border, the press shadow and "details ›".

import { Suspense, lazy, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import type { ThreatEvent } from '../engine/types'
import { dossier } from '../persistence'
import { shortName, stoppedByLine } from './board/boardModel'
import { DC_BTN } from './buttons'
import { techniqueLabel } from './labels'
import { HOOK, SOURCE, TECHNIQUE, vectorWord } from './night/nightCopy'
import { dossierCount } from './titleStatus'

const LibraryUnavailable = ({ onBack }: { onBack?: () => void }) => (
  <button type="button" onClick={onBack} className={`${DC_BTN} m-4`}>
    BACK TO DOSSIER
  </button>
)
const FieldLibrary = lazy(() => import('./FieldLibrary').catch(() => ({ default: LibraryUnavailable })))

const DOSSIER_PURPOSE = 'Every move COLDVEIL makes against you is a card: how it travels and what it hits, what stops it, and who documented it.'

const MONO = 'font-mono text-[10px] tracking-wider'
// The card's place in the deck, 01 to 18.
const num = (i: number) => String(i + 1).padStart(2, '0')

function FiledCard({ def, index, onLearnMore }: { def: ThreatEvent; index: number; onLearnMore: (id: string, from: HTMLElement) => void }) {
  const ref = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  const stoppedBy = stoppedByLine(def, DEFAULT_SCENARIO)
  return (
    <details
      data-dossier-card={def.id}
      data-filed
      // An opened card spans the row, as the prototype's does, and is kept
      // in view under the bar (fresh-eyes review).
      onToggle={(e) => {
        const el = e.currentTarget
        if (el.open) el.scrollIntoView?.({ block: 'nearest' })
      }}
      className="group min-w-0 scroll-mt-16 scroll-mb-4 border-2 border-dc-friendly/70 bg-dc-friendly/10 shadow-press open:col-span-2"
    >
      <summary className="flex h-full min-h-11 cursor-pointer list-none flex-col gap-1 p-2.5 group-open:h-auto [&::-webkit-details-marker]:hidden">
        <span className={`${MONO} text-dc-friendly`}>
          {vectorWord(def.vector)}
          {'\u00a0'}→ {def.layers.join('\u00a0·\u00a0')}
        </span>
        <b className="text-[13.5px] leading-tight">{shortName(def)}</b>
        <span className="text-[12px] leading-snug text-dc-muted">{HOOK[def.id]}</span>
        {/* The card's number and its cue share the foot (fresh-eyes
            review: the number crowded the tag). */}
        <span className="mt-auto flex items-baseline justify-between pt-1 font-mono text-[11px]">
          <span className="text-dc-muted">{num(index)}</span>
          <span className="text-dc-ink">
            <span className="group-open:hidden">details ›</span>
            <span className="hidden group-open:inline">close</span>
          </span>
        </span>
      </summary>
      <div className="border-t border-dc-line px-2.5 pb-2.5 pt-2 text-sm">
        <p className="leading-relaxed">{def.blurb}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 font-mono text-[11px] text-dc-muted">
          <dt>{stoppedBy.label}</dt>
          <dd className="text-dc-ink">{stoppedBy.text}</dd>
          {ref && (
            <>
              <dt>{TECHNIQUE}</dt>
              <dd className="text-dc-ink">
                {techniqueLabel(ref)} {ref.name}
              </dd>
            </>
          )}
          {source && (
            <>
              <dt>{SOURCE}</dt>
              <dd className="text-dc-ink">{source.title}</dd>
            </>
          )}
        </dl>
        <button
          type="button"
          data-learn-more={def.id}
          aria-haspopup="dialog"
          onClick={(e) => onLearnMore(def.id, e.currentTarget)}
          className="mt-2.5 min-h-11 w-full border-2 border-dc-go bg-dc-go/10 font-display text-[11px] text-dc-go shadow-press"
        >
          LEARN MORE<span className="sr-only"> in the Field Library: {shortName(def)}</span>
        </button>
      </div>
    </details>
  )
}

function UnfiledCard({ id, index }: { id: string; index: number }) {
  return (
    <div data-dossier-card={id} data-unfiled className="flex min-w-0 flex-col gap-1 bg-dc-chrome p-2.5">
      <b className="text-[13.5px] leading-tight text-dc-muted">Unfiled</b>
      <span className="text-[12px] leading-snug text-dc-muted">Face this move in play to file it.</span>
      <span aria-hidden="true" className="pt-1 font-mono text-[11px] text-dc-muted">
        {num(index)}
      </span>
    </div>
  )
}

export default function Dossier({
  onBack,
  backLabel = 'BACK TO TITLE',
  embedded = false,
}: {
  onBack: () => void
  backLabel?: string
  // Rendered inside the debrief's overlay rather than as a screen: a
  // section with an h2, never a second main and h1.
  embedded?: boolean
}) {
  const Root = embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  // Read once per opening: the cards as this device has filed them.
  const [filed] = useState(dossier)
  const count = dossierCount()
  const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
  // LEARN MORE: the Field Library at one threat, over the Dossier, with
  // focus back on the button that opened it.
  const [library, setLibrary] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const closeLibrary = () => {
    setLibrary(null)
    window.setTimeout(() => opener.current?.focus(), 0)
  }

  return (
    <>
      <Root data-dossier className="mx-auto w-full max-w-[520px] pb-10 text-dc-ink" {...(library ? { inert: true, 'aria-hidden': true } : {})}>
        <div className="sticky top-0 z-10 border-b-2 border-dc-line bg-dc-panel px-4 pt-safe">
          <div className="py-2">
            <button type="button" data-back onClick={onBack} className={DC_BTN}>
              {backLabel}
            </button>
          </div>
        </div>
        <div className="px-4 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <Heading className="font-display text-[13px] leading-tight text-dc-ink">COLDVEIL DOSSIER</Heading>
            <p data-dossier-count className="font-display text-[15px] text-dc-go">
              {count.filed} / {count.total}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden bg-dc-line" aria-hidden="true">
            <i className="block h-full bg-dc-go" style={{ width: `${(count.filed / Math.max(1, count.total)) * 100}%` }} />
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-dc-muted">{DOSSIER_PURPOSE}</p>
          <div data-dossier-grid className="mt-3 grid grid-cols-2 gap-2">
            {threats.map((def, i) =>
              filed.has(def.id) ? (
                <FiledCard
                  key={def.id}
                  def={def}
                  index={i}
                  onLearnMore={(id, from) => {
                    opener.current = from
                    setLibrary(id)
                  }}
                />
              ) : (
                <UnfiledCard key={def.id} id={def.id} index={i} />
              ),
            )}
          </div>
        </div>
      </Root>
      {library && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-dc-ground" role="dialog" aria-modal="true" aria-label="Field Library" data-library-overlay>
          <Suspense fallback={<p className="p-4 font-mono text-xs text-dc-muted">Opening the Field Library.</p>}>
            <FieldLibrary embedded focus={library} backLabel="BACK TO DOSSIER" onBack={closeLibrary} />
          </Suspense>
        </div>
      )}
    </>
  )
}
