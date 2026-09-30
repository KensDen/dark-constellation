// What the Field Library's FILED stamps read (v1.2 R5b, brief 7.3). An
// entry is FILED once this device has met an event it pairs with (named,
// or for the SPARTA entry any event with a SPARTA tag); a GENERAL entry
// once this device has finished any campaign. Nothing is ever locked: an
// entry without its stamp is as readable as one with it.
//
// "Finished a campaign" is not recorded anew. The records already hold
// it: every campaign finished here posts to the scoreboard, and every
// official Daily Op to the daily ledger. Clearing the scoreboard takes the
// first of those with it, so after a clear only a recorded Daily Op keeps
// the GENERAL entries filed.
//
// Imported by the library screen and, dynamically, by the menu for its
// counter, so it rides with the library data and never in the first
// download.

import { FIELD_LIBRARY } from '../content/fieldLibrary'
import { isGeneral, pairedEvents, type LibraryEntry } from '../content/librarySchema'
import { LocalDailyLedger, LocalScoreSink, metEvents } from '../persistence'

export interface Progress {
  filed: (entry: LibraryEntry) => boolean
  count: number
  total: number
}

export function libraryProgress(): Progress {
  const met = metEvents()
  const finished = new LocalScoreSink().top(1).length > 0 || new LocalDailyLedger().any()
  const filed = (entry: LibraryEntry) => (isGeneral(entry) && finished) || pairedEvents(entry).some((id) => met.has(id))
  const entries = FIELD_LIBRARY.flatMap((s) => s.entries)
  return { filed, count: entries.filter(filed).length, total: entries.length }
}
