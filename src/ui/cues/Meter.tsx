// Meter and ticker cues (brief v0.5 section 6: "Value counts to target;
// bar eases; drop flashes red, gain flashes green"). One component serves
// the HUD meters and the credit ticker, so the count and the tone rule can
// never disagree between them. Under reduced motion the number is adopted
// at once and nothing animates; the tone colour still carries the meaning.

import { useEffect, useRef, useState } from 'react'
import { CUE_MS, useCountUp, useCueClass, useReducedMotion } from './motion'

export type MeterTone = 'good' | 'bad' | 'neutral'

// Meters and credits are both "more is better", so the sign decides.
export function toneForDelta(delta: number): MeterTone {
  if (delta > 0) return 'good'
  if (delta < 0) return 'bad'
  return 'neutral'
}

export const FLASH_CLASS: Record<MeterTone, string> = {
  good: 'dc-flash-good',
  bad: 'dc-flash-bad',
  neutral: '',
}

const TONE_TEXT: Record<MeterTone, string> = {
  good: 'text-hero-blue',
  bad: 'text-hero-magenta',
  neutral: 'text-ink',
}

// Report the direction of the most recent change, with a nonce so a repeat
// of the same direction still restarts the flash. The tone expires with
// the cue: a drop flashes and then reads as an ordinary number again,
// rather than staying coloured until the next gain.
export function useValueChange(value: number, basis?: string): { tone: MeterTone; nonce: number } {
  const prev = useRef(value)
  const prevBasis = useRef(basis)
  const [change, setChange] = useState<{ tone: MeterTone; nonce: number }>({ tone: 'neutral', nonce: 0 })
  useEffect(() => {
    // A readout can change which quantity it shows (the credit ticker
    // previews the cart during the decision phases and the balance after).
    // That is not a gain or a loss, so it resets the baseline silently.
    if (prevBasis.current !== basis) {
      prevBasis.current = basis
      prev.current = value
      return
    }
    if (prev.current === value) return
    const delta = value - prev.current
    prev.current = value
    setChange((c) => ({ tone: toneForDelta(delta), nonce: c.nonce + 1 }))
  }, [value, basis])
  useEffect(() => {
    if (change.tone === 'neutral') return
    const id = window.setTimeout(() => setChange((c) => ({ ...c, tone: 'neutral' })), CUE_MS)
    return () => window.clearTimeout(id)
  }, [change])
  return change
}

const BAR_TONE: Record<MeterTone, string> = {
  good: 'bg-hero-blue',
  bad: 'bg-hero-magenta',
  neutral: 'bg-phosphor',
}

const format = (shown: number, target: number): string => {
  const decimals = Number.isInteger(target) ? 0 : 1
  return shown.toFixed(decimals)
}

export interface ReadoutProps {
  label: string
  value: number
  // Identifies which quantity `value` currently represents. A change here
  // rebases the readout without flashing a direction.
  basis?: string
  // Present for the 0..100 meters; absent for credits, which have no bar.
  max?: number
  // Below this the readout reads as a warning and, for MAI, strobes.
  warnBelow?: number
  strobeOnWarn?: boolean
  suffix?: string
}

export default function Readout({ label, value, basis, max, warnBelow, strobeOnWarn, suffix }: ReadoutProps) {
  const reduced = useReducedMotion()
  const shown = useCountUp(value, reduced)
  const { tone, nonce } = useValueChange(value, basis)
  // The colour half of the flash is meaning, not motion, so it plays in
  // both modes; the stylesheet drops only the animation under reduce.
  const flash = useCueClass(nonce, FLASH_CLASS[tone], false)
  const warning = warnBelow !== undefined && value < warnBelow
  const strobe = warning && strobeOnWarn && !reduced ? 'dc-strobe' : ''
  const pct = max ? Math.max(0, Math.min(100, (shown / max) * 100)) : 0
  const barTone: MeterTone = warning ? 'bad' : tone === 'neutral' ? 'neutral' : tone

  return (
    <div className={`font-mono ${strobe}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-widest text-ink-dim">{label}</span>
        <span
          className={`tabular-nums text-sm ${flash ? '' : warning ? 'text-alert-amber' : TONE_TEXT[tone]} ${flash}`}
          aria-label={`${label} ${value}${suffix ?? ''}`}
        >
          {format(shown, value)}
          {suffix}
        </span>
      </div>
      {max !== undefined && (
        <div className="mt-1 h-1.5 w-full bg-phosphor/10 overflow-hidden" aria-hidden="true">
          <div className={`dc-meter-fill h-full ${BAR_TONE[barTone]}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
