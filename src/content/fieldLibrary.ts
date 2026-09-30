// THE FIELD LIBRARY (v1.2 R5b, brief 4.8 and 7.3), validated. The list
// is ./fieldLibraryData.ts and its rules ./librarySchema.ts; this is what
// the game reads, and it does not ship unless it parses, like the rest of
// the content.
//
// It rides in the library's own chunk. Nothing in the first download
// imports it: an event card shows its "learn more" link for every threat
// without knowing the pairings, because validation guarantees each threat
// has at least one, and tests/lazy-screens.spec.ts keeps this module off
// the entry's static graph.

import { DEFAULT_SCENARIO } from '.'
import { SHELVES_AS_DRAFTED } from './fieldLibraryData'
import { validateLibrary, type Shelf } from './librarySchema'

export const FIELD_LIBRARY: Shelf[] = validateLibrary(SHELVES_AS_DRAFTED, DEFAULT_SCENARIO)
