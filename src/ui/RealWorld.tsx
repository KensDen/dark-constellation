// The REAL WORLD line on an event card (v1.2 R3, brief 4.8): the technique
// ID and the source's short name on one line, and one tap opens the
// learn-more card with its sources and the technique's own page. Built by
// realWorldFor from the event's content, so it cannot say anything the
// content does not.

import type { RealWorldLine } from './realWorldLine'

export default function RealWorld({ line }: { line: RealWorldLine }) {
  return (
    <details data-real-world className="mt-2 font-mono text-xs">
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
}
