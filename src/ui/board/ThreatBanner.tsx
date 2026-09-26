// The threat banner (v1.2 R1, brief 4.1): the adversary's emblem beside
// the current forecast, obeying today's intel rules exactly because the
// copy is briefCopy's and nothing else. At intel 0 the headline says the
// forecast is dark; nothing is revealed that src/ui/brief.ts would not.
//
// The full brief stays one tap away under 'Expand full brief', which is
// the disclosure the reading diet budgets, with the turn-1 job framing
// first and then the forecast lines, in that order, because the
// disclosure budget test reads them back in that order.

import { ADVERSARY } from '../../config'
import { CHAIN_BONUS } from '../../engine/reducer'
import type { GameState } from '../../engine/types'
import { CHAIN_ARMED_LINE, JOB_FRAMING_HEADING, briefCopy } from '../brief'
import Teletype, { TransmissionBar } from '../cues/Teletype'

export interface ThreatBannerProps {
  shown: GameState
  // Restarts the teletype; the engine's turn, so it runs once per turn.
  cueKey: number
  onTag: (tag: string) => void
}

export default function ThreatBanner({ shown, cueKey, onTag }: ThreatBannerProps) {
  const brief = briefCopy(shown)
  return (
    <section aria-label="Threat forecast" className="flex-none px-3 py-2 border-b-2 border-dc-line bg-dc-ground">
      <div className="flex gap-2">
        {/* The COLDVEIL emblem is R2's; a hostile-coloured square holds
            its place. */}
        <div
          aria-hidden="true"
          className="mt-1 flex-none h-8 w-8 border-2 border-dc-hostile bg-dc-hostile/10 font-display text-[10px] text-dc-hostile flex items-center justify-center"
        >
          {ADVERSARY.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <TransmissionBar cueKey={cueKey}>
            <p className="mt-0.5 font-mono text-sm text-phosphor leading-snug">
              <Teletype text={brief.headline} cueKey={cueKey} />
            </p>
          </TransmissionBar>
          <p className="mt-1 text-xs text-dc-ink leading-snug">{brief.vector}</p>
          {brief.tag && (
            <p className="mt-0.5 font-mono text-xs text-dc-muted">
              Technique:{' '}
              {/* Opens the GLOSSARY entry in place (Round 6e). The tag text
                  IS the glossary key, both built by techniqueLabel. */}
              <button
                type="button"
                className="underline text-dc-ink hover:text-phosphor min-h-6"
                data-technique-tag={brief.tag}
                onClick={() => onTag(brief.tag!)}
              >
                {brief.tag}
              </button>
            </p>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer font-mono text-xs text-phosphor">Expand full brief</summary>
            {brief.framing.length > 0 && (
              <div className="mt-2">
                <p className="font-mono font-bold text-phosphor uppercase tracking-widest text-xs">{JOB_FRAMING_HEADING}</p>
                {brief.framing.map((line, i) => (
                  <p key={i} className={`text-sm ${i === brief.framing.length - 1 ? 'mt-1 text-ink-dim' : 'mt-1'}`}>
                    {line}
                  </p>
                ))}
              </div>
            )}
            <ul className="list-disc ml-5 mt-2 font-mono text-xs">
              {brief.full.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
          {shown.flags.lidarFallback && (
            <details className="mt-1 border border-hero-magenta/60 bg-hero-magenta/10 p-1.5">
              <summary className="cursor-pointer font-mono text-xs font-bold text-hero-magenta">{CHAIN_ARMED_LINE}</summary>
              <p className="mt-1 text-xs text-hero-magenta">
                GNSS is jammed, so the next LiDAR attack lands harder (+{CHAIN_BONUS} severity) unless sensor fusion
                cross-checks are in place or every drone flies Tier A sensors.
              </p>
            </details>
          )}
        </div>
      </div>
    </section>
  )
}
