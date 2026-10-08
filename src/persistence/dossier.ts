// THE DOSSIER (v1.3 brief 6.9 and 5.7): every threat this device has filed,
// in a key of its own. It drives GOAL 2 and the Dossier screen, per device
// and across games; PRACTICE runs and campaigns from pasted codes count,
// as FILED always has. Filing happens on the intel card's FILE IT (Round
// 3), which writes at once (brief 5.5 item 3). Round 0 lands the store.

const KEY = 'dc-dossier'

export function dossier(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

// File one card. Writes only when the card is new, and a refused write
// leaves the Dossier where it was.
export function fileCard(id: string): void {
  const filed = dossier()
  if (filed.has(id)) return
  filed.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...filed].sort()))
  } catch {
    // Best effort.
  }
}
