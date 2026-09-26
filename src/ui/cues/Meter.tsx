// Meter and ticker cues (brief v0.5 section 6: "Value counts to target;
// bar eases; drop flashes red, gain flashes green"). One component serves
// the HUD meters and the credit ticker, so the count and the tone rule can
// never disagree between them. Under reduced motion the number is adopted
// at once and nothing animates; the tone colour still carries the meaning.

import { useEffect, useRef, useState } from 'react'
import { COUNT_MS, CUE_MS, useCountUp, useCueClass, useReducedMotion } from './motion'
import { useSound } from '../../audio'
import type { SoundCue } from '../../director/cues'

// Re-exported for the DOM suite, which drives the count and has to know
// how long it runs; the readout itself uses the hook's default.
export const COUNT_MS_FOR_TESTS = COUNT_MS

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

export const TONE_TEXT: Record<MeterTone, string> = {
  good: 'text-hero-blue',
  bad: 'text-hero-magenta',
  neutral: 'text-ink',
}

// How much of a change the player did not choose. Spending credits is a
// decision, not damage, so the chosen part carries no valence; what is
// left still does, which is what keeps a beat that folds a purchase and a
// repair bill flashing for the repair.
export function unchosenDelta(delta: number, chosen: boolean, chosenDelta: number): number {
  if (chosen) return 0
  return delta + chosenDelta
}

// Report the direction of the most recent change, with a nonce so a repeat
// of the same direction still restarts the flash. The tone expires with
// the cue: a drop flashes and then reads as an ordinary number again,
// rather than staying coloured until the next gain.
//
// The valence is decided here, where the change is recorded, and never
// masked further downstream: a masked tone stays latched in this state,
// and useCueClass treats the class it is given changing from empty to a
// real one as a trigger, so the cue would simply fire late.
export function useValueChange(
  value: number,
  basis?: string,
  chosen = false,
  chosenDelta = 0,
): { tone: MeterTone; nonce: number } {
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
    setChange((c) => ({ tone: toneForDelta(unchosenDelta(delta, chosen, chosenDelta)), nonce: c.nonce + 1 }))
  }, [value, basis, chosen, chosenDelta])
  useEffect(() => {
    if (change.tone === 'neutral') return
    const id = window.setTimeout(() => setChange((c) => ({ ...c, tone: 'neutral' })), CUE_MS)
    return () => window.clearTimeout(id)
  }, [change])
  return change
}

export const BAR_TONE: Record<MeterTone, string> = {
  good: 'bg-hero-blue',
  bad: 'bg-hero-magenta',
  neutral: 'bg-phosphor',
}

// The sound half of the same tone decision, so the flash and the tick can
// never disagree about which way a number moved. 'silent' is the honest
// answer for a change with no valence: a rebase, or a spend the player
// chose, which unchosenDelta has already zeroed out.
export const TONE_SOUND: Record<MeterTone, SoundCue> = {
  good: 'tick-up',
  bad: 'tick-down',
  neutral: 'silent',
}

// The other pair this component owns: the warning tone as MAI falls
// through the line and the relief chime as it comes back. Written as data
// for the same reason as everything else in the cue layer, so the coverage
// test can find them instead of taking the component on trust.
export const CROSSING_SOUND: Record<'below' | 'recovered', SoundCue> = {
  below: 'warn-low',
  recovered: 'relief-chime',
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
  // The player drives this number themselves here, so a fall is a decision
  // rather than damage. The count still runs; only the valence is dropped.
  chosen?: boolean
  // How much of the next change the player chose, when only part of it is
  // theirs: playback folds the turn's purchase into a beat that may also
  // carry damage, and only the damage should flash.
  chosenDelta?: number
  // The board's HUD (v1.2 R1) sets MAI as one big display-type number with
  // its label above it, and the four meters as a compact column each.
  // Presentation only: the count, the tones and the sounds are the same.
  stacked?: boolean
  valueClassName?: string
}

export default function Readout({
  label,
  value,
  basis,
  max,
  warnBelow,
  strobeOnWarn,
  suffix,
  chosen,
  chosenDelta,
  stacked,
  valueClassName,
}: ReadoutProps) {
  const reduced = useReducedMotion()
  const shown = useCountUp(value, reduced)
  // Spending credits on a countermeasure is the good move in this game, so
  // the ticker must not paint it with the same cue a hit uses. The tone is
  // dropped rather than inverted: a buy is neither a gain nor a loss.
  const { tone, nonce } = useValueChange(value, basis, chosen, chosenDelta)
  // The colour half of the flash is meaning, not motion, so it plays in
  // both modes; the stylesheet drops only the animation under reduce.
  const flash = useCueClass(nonce, FLASH_CLASS[tone], false)
  const warning = warnBelow !== undefined && value < warnBelow
  const strobe = warning && strobeOnWarn && !reduced ? 'dc-strobe' : ''
  const play = useSound()

  // The tick rides the same nonce the flash does, so a repeat of the same
  // direction sounds again rather than being swallowed as "no change".
  //
  // No guard on the opening render, because there is nothing to guard
  // against: useValueChange only ever raises the nonce together with a
  // tone, so nonce zero means tone neutral, and neutral is silent. A
  // `nonce === 0` check here was dead the moment it was written, and a
  // mutation removing it slept through the suite, which is how it was
  // found. Dead code is removed rather than tested (Round 4b).
  useEffect(() => {
    play(TONE_SOUND[tone])
  }, [nonce, tone, play])

  // The warning tone and the relief chime fire on the CROSSING, not on the
  // state: a meter that is already low when the screen mounts has nothing
  // to announce, and one that stays low would otherwise blare on every
  // render. Gated on strobeOnWarn rather than on the strobe class, because
  // reduced motion removes the strobe and the brief is explicit that sound
  // is unaffected by it.
  const wasWarning = useRef(warning)
  useEffect(() => {
    if (!strobeOnWarn) return
    if (warning === wasWarning.current) return
    wasWarning.current = warning
    play(warning ? CROSSING_SOUND.below : CROSSING_SOUND.recovered)
  }, [warning, strobeOnWarn, play])
  const pct = max ? Math.max(0, Math.min(100, (shown / max) * 100)) : 0
  const barTone: MeterTone = warning ? 'bad' : tone === 'neutral' ? 'neutral' : tone

  return (
    <div className={`font-mono ${strobe}`}>
      <div className={stacked ? 'flex flex-col items-start' : 'flex items-baseline justify-between gap-2'}>
        <span className={`uppercase tracking-widest text-ink-dim ${stacked ? 'text-[9px]' : 'text-xs'}`}>{label}</span>
        <span
          className={`tabular-nums ${valueClassName ?? 'text-sm'} ${flash ? '' : warning ? 'text-alert-amber' : TONE_TEXT[tone]} ${flash}`}
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
