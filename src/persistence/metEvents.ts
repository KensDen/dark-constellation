// The events this device has met (v1.2 R5b): every event in every turn
// resolved here, threat or opportunity, landed or held, in a key of its
// own. It is learning progress, the Field Library's FILED stamps, not a
// score, so a Daily Op replayed as practice and a campaign loaded from a
// pasted code count like any other.

const KEY = 'dc-met'

export function metEvents(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function recordMet(ids: string[]): void {
  const met = metEvents()
  const size = met.size
  ids.forEach((id) => met.add(id))
  if (met.size === size) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...met].sort()))
  } catch {
    // Best effort: a refused write leaves the stamps where they were.
  }
}
