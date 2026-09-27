// The Daily Op's seed (v1.2 Round 5a, brief 7.1): one mission a day, the
// same for every player whose calendar shows that day. The seed is a hash
// of the date as YYYYMMDD in the player's LOCAL time zone, so a player in
// New York at 23:30 on 27 September still plays the 27th, whatever the UTC
// date has become. Pure: the caller hands in the moment, and nothing here
// reads the clock.

// The local calendar date as YYYYMMDD.
export function dailyKey(at: Date): string {
  const y = String(at.getFullYear()).padStart(4, '0')
  const m = String(at.getMonth() + 1).padStart(2, '0')
  const d = String(at.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// FNV-1a over the key, then a finaliser so neighbouring dates, which share
// seven of their eight characters, land far apart. Changing this changes
// every day's mission for everyone, so tests/daily.spec.ts pins its output.
export function dailySeed(at: Date): number {
  let h = 0x811c9dc5
  for (const c of dailyKey(at)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
