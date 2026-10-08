// The events this device has met (v1.2 R5b): every event in every turn
// resolved here, threat or opportunity, landed or held, in a key of its
// own. It is learning progress, the Field Library's FILED stamps, not a
// score, so a Daily Op replayed as practice and a campaign loaded from a
// pasted code count like any other.
//
// v1.3 adds the threats an intel brief NAMED (brief 6.9: `met` is every
// threat the player has faced or the brief has named; ruling R1's earned
// answer key reads it). Named threats keep a key of their own, so the
// Field Library's FILED stamps still mean faced until the Dossier takes
// them over in R4; knownThreats() is the union the answer key reads.

const KEY = 'dc-met'
const NAMED_KEY = 'dc-named'

function readSet(key: string): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function addTo(key: string, ids: string[]): void {
  const set = readSet(key)
  const size = set.size
  ids.forEach((id) => set.add(id))
  if (set.size === size) return
  try {
    localStorage.setItem(key, JSON.stringify([...set].sort()))
  } catch {
    // Best effort: a refused write leaves the set where it was.
  }
}

export const metEvents = (): Set<string> => readSet(KEY)
export const recordMet = (ids: string[]): void => addTo(KEY, ids)
export const namedEvents = (): Set<string> => readSet(NAMED_KEY)
export const recordNamed = (ids: string[]): void => addTo(NAMED_KEY, ids)

// The device's `met` (brief 6.9): faced or named.
export function knownThreats(): Set<string> {
  return new Set([...metEvents(), ...namedEvents()])
}
