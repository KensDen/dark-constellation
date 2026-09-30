// The REAL WORLD line (v1.2 R3, brief 4.8): every threat in the deck is a
// real technique with a real source behind it, and each event card says so
// in one line built from the event's own content, its first technique
// reference and the short name of its first learn-more source, one tap
// from the learn-more card and its link.
//
// No new text. The short name is the source's own title up to its first
// colon or comma ("CISA AA22-076A", "Cao et al."), or the whole title when
// it has neither ("NASA Orbital Debris Program Office"); the card, the
// body and the links are the content's.

import type { LearnMoreCard, LearnMoreSource, TechniqueRef, ThreatEvent } from '../engine/types'
import { techniqueLabel } from './labels'

export interface RealWorldLine {
  // The event the line is for, when the caller had its id: the card's
  // "learn more" opens the Field Library at it (v1.2 R5b).
  eventId?: string
  technique: string
  ref: TechniqueRef
  source: string
  card: LearnMoreCard
  first: LearnMoreSource
}

export const shortSourceName = (title: string) => title.split(/[:,]/)[0].trim()

// Null for an event with nothing behind it (the opportunities carry no
// technique and no learn-more card).
export function realWorldFor(
  def: (Pick<ThreatEvent, 'techniqueRefs' | 'learnMoreCards'> & { id?: string }) | undefined,
): RealWorldLine | null {
  const ref = def?.techniqueRefs[0]
  const card = def?.learnMoreCards[0]
  const first = card?.sources[0]
  if (!ref || !card || !first) return null
  return { eventId: def.id, technique: techniqueLabel(ref), ref, source: shortSourceName(first.title), card, first }
}
