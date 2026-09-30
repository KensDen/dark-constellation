// The REAL WORLD line on an event card (v1.2 R3, brief 4.8): the technique
// ID and the source's short name on one line, and one tap opens the
// learn-more card with its sources and the technique's own page. Built by
// realWorldFor from the event's content, so it cannot say anything the
// content does not.
//
// Beside it, since v1.2 R5b, "learn more": the Field Library opened at this
// threat's entries, wherever the game provides the way there (./learnMore.ts).
// Every threat has entries (src/content/librarySchema.ts insists), so the
// link needs no knowledge of them here, and none ships in the first
// download. Its target is 44px tall and pulled into the line's own height.

import { useContext } from 'react'
import { LearnMore } from './learnMore'
import type { RealWorldLine } from './realWorldLine'

export default function RealWorld({ line }: { line: RealWorldLine }) {
  const learnMore = useContext(LearnMore)
  const details = (
    <details data-real-world className={learnMore && line.eventId ? 'min-w-0 flex-1 font-mono text-xs' : 'mt-2 font-mono text-xs'}>
      <summary className="min-h-6 cursor-pointer">
        <span className="font-display text-[9px] text-dc-go">REAL WORLD</span>{' '}
        <span data-real-world-line>
          {line.technique} · {line.source}
        </span>
      </summary>
      <div className="mt-1 border-l-2 border-dc-line pl-2">
        <p className="font-bold">{line.card.title}</p>
        <p className="mt-1">{line.card.body}</p>
        <ul className="mt-1">
          {line.card.sources.map((src) => (
            <li key={src.url}>
              <a className="underline" href={src.url} target="_blank" rel="noopener noreferrer">
                {src.title}
              </a>{' '}
              <span className="text-dc-muted">[{src.type}]</span>
            </li>
          ))}
          <li>
            <a className="underline" href={line.ref.url} target="_blank" rel="noopener noreferrer">
              {line.technique}, {line.ref.name}
            </a>
          </li>
        </ul>
      </div>
    </details>
  )
  if (!learnMore || !line.eventId) return details
  const id = line.eventId
  return (
    <div className="mt-2 flex items-start gap-2">
      {details}
      <button
        type="button"
        data-learn-more={id}
        aria-haspopup="dialog"
        onClick={(e) => learnMore(id, e.currentTarget)}
        className="-my-2.5 flex-none min-h-11 px-1 font-mono text-[10px] text-dc-go underline"
      >
        learn more<span className="sr-only"> in the Field Library: {line.technique}</span>
      </button>
    </div>
  )
}
