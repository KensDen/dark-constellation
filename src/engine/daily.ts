// The Daily Op's seed and number (v1.2 Rounds 5a and 5, brief 7.1): one
// mission a day, the same for every player whose calendar shows that day.
// The seed is a hash
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

// THE DAILY OP'S NUMBER (v1.2 Round 5). Day #1 is the local date the Daily
// Op first shipped, so the first day anyone can play it is #1. If the push
// that ships it lands on a later date than this, this constant moves to
// that date in a commit of its own, before the push.
export const DAILY_OP_EPOCH = '20260927'

// Local calendar days are counted as calendar dates, never as elapsed
// milliseconds: a day that gains or loses an hour to daylight saving is
// still one day. Each date's own year, month and day are read into UTC,
// where every day is exactly 86,400,000 ms long, and subtracted there.
const DAY_MS = 86_400_000
const dayIndex = (y: number, month: number, d: number) => Date.UTC(y, month - 1, d) / DAY_MS
const keyIndex = (key: string) => dayIndex(Number(key.slice(0, 4)), Number(key.slice(4, 6)), Number(key.slice(6, 8)))

// The Daily Op number of a moment: 1 on the epoch date, 2 the day after.
// Before the epoch it is below 1, and there is no Daily Op to play.
export function dailyNumber(at: Date): number {
  return keyIndex(dailyKey(at)) - keyIndex(DAILY_OP_EPOCH) + 1
}

// How long until the next Daily Op: the next local midnight, which is
// where dailyKey turns over. Built from local parts, so a daylight-saving
// night is 23 or 25 hours long, as the player's own clock says.
export function msUntilNextDaily(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime() - at.getTime()
}
