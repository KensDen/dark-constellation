// The event cards' "learn more" (v1.2 R5b, brief 7.3): what opens the
// Field Library at one threat's entries. Game provides it around the board
// and its overlays; the REAL WORLD line reads it. A card rendered anywhere
// else has no provider and shows no link, rather than one that does
// nothing.

import { createContext } from 'react'

// The event, and the link that asked, so focus can come back to it.
export const LearnMore = createContext<((eventId: string, from: HTMLElement) => void) | null>(null)
