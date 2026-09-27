// The Daily Op's seed (v1.2 Round 5a, brief 7.1): the player's LOCAL
// calendar date, as YYYYMMDD, hashed. Its number and its countdown
// (Round 5) count the same local calendar. Every date below is built from local
// parts (new Date(y, m, d, h)), so it means the same day in any time zone
// the suite runs in; the one test about time zones sets its own.

import { afterEach, describe, expect, it } from 'vitest'

import { DAILY_OP_EPOCH, dailyKey, dailyNumber, dailySeed, msUntilNextDaily } from '../src/engine/daily'

const local = (y: number, month: number, d: number, h = 12, min = 0) => new Date(y, month - 1, d, h, min)

describe('the daily seed', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  it('gives a fixed date a fixed seed, pinned so a change to the hash cannot pass unnoticed', () => {
    // Changing the hash changes every day's mission for every player, so
    // the output is pinned rather than only compared with itself.
    expect(dailyKey(local(2026, 9, 27))).toBe('20260927')
    expect(dailySeed(local(2026, 9, 27))).toBe(289227389)
    expect(dailySeed(local(2026, 1, 1))).toBe(1593291930)
    expect(dailySeed(local(2026, 12, 31))).toBe(1695883228)
  })

  it('gives every hour of a day the same seed', () => {
    const seed = dailySeed(local(2026, 9, 27, 0, 0))
    for (let h = 0; h < 24; h += 1) expect(dailySeed(local(2026, 9, 27, h, 59)), `${h}:59`).toBe(seed)
  })

  it('gives neighbouring dates different seeds, across two years of days', () => {
    const seen = new Map<number, string>()
    for (let day = 0; day < 731; day += 1) {
      const at = local(2026, 1, 1 + day)
      const seed = dailySeed(at)
      expect(seen.get(seed), `${dailyKey(at)} shares its seed`).toBeUndefined()
      seen.set(seed, dailyKey(at))
    }
    expect(seen.size).toBe(731)
  })

  it('maps 23:30 on 27 September in New York to the 27th, not the UTC date', () => {
    process.env.TZ = 'America/New_York'
    // 03:30 UTC on the 28th is 23:30 on the 27th in New York (EDT, UTC-4).
    const lateEvening = new Date('2026-09-28T03:30:00Z')
    expect(lateEvening.getHours(), 'the time zone did not take').toBe(23)
    expect(dailyKey(lateEvening)).toBe('20260927')
    expect(dailySeed(lateEvening)).toBe(dailySeed(local(2026, 9, 27)))
    // The positive control: the UTC calendar date is the 28th, a different seed.
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-09-28')
    expect(dailySeed(lateEvening)).not.toBe(dailySeed(local(2026, 9, 28)))
  })
})

describe('the Daily Op number and the countdown (v1.2 Round 5)', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })
  const HOUR = 3_600_000
  // The epoch as a local moment, read from the constant rather than
  // restated, so moving the epoch moves this test with it.
  const epoch = (h = 12) =>
    local(Number(DAILY_OP_EPOCH.slice(0, 4)), Number(DAILY_OP_EPOCH.slice(4, 6)), Number(DAILY_OP_EPOCH.slice(6, 8)), h)

  it('is #1 on the epoch date, all day, and counts on from there', () => {
    expect(dailyKey(epoch()), 'the epoch is not a date this reads back').toBe(DAILY_OP_EPOCH)
    expect(dailyNumber(epoch(0))).toBe(1)
    expect(dailyNumber(new Date(epoch(23).getTime() + 59 * 60_000))).toBe(1)
    const e = epoch()
    expect(dailyNumber(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1, 0, 0))).toBe(2)
    expect(dailyNumber(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 30, 12))).toBe(31)
    // Before the epoch there is no Daily Op; the menu reads this.
    expect(dailyNumber(new Date(e.getFullYear(), e.getMonth(), e.getDate() - 1, 23, 59))).toBe(0)
  })

  it('counts calendar days, not elapsed time, across both daylight-saving changes', () => {
    // New York's clocks go back on 1 November 2026 and forward on 14 March
    // 2027, so those days are 25 and 23 hours long. Every local day from
    // the epoch through both is one more, at the start and at the end.
    process.env.TZ = 'America/New_York'
    const e = epoch()
    // The zone took if the clocks change in it: this fails in a zone
    // without daylight saving, where the loop below would prove nothing.
    expect(local(2026, 11, 1, 0).getTimezoneOffset(), 'the time zone did not take').not.toBe(local(2026, 11, 2, 0).getTimezoneOffset())
    for (let day = 0; day < 200; day += 1) {
      const first = new Date(e.getFullYear(), e.getMonth(), e.getDate() + day, 0, 0)
      const last = new Date(e.getFullYear(), e.getMonth(), e.getDate() + day, 23, 59)
      expect(dailyNumber(first), dailyKey(first)).toBe(day + 1)
      expect(dailyNumber(last), dailyKey(last)).toBe(day + 1)
    }
  })

  it('counts down to the next local midnight, however long the night', () => {
    expect(msUntilNextDaily(local(2026, 9, 27, 16, 0))).toBe(8 * HOUR)
    expect(msUntilNextDaily(new Date(2026, 8, 27, 23, 59, 59, 500))).toBe(500)
    process.env.TZ = 'America/New_York'
    // The day the clocks go back is 25 hours long, and the one they go
    // forward 23, midnight to midnight.
    expect(msUntilNextDaily(local(2026, 11, 1, 0, 0))).toBe(25 * HOUR)
    expect(msUntilNextDaily(local(2027, 3, 14, 0, 0))).toBe(23 * HOUR)
    // Where the countdown ends, the key turns over.
    const at = local(2026, 11, 1, 9, 30)
    expect(dailyKey(new Date(at.getTime() + msUntilNextDaily(at)))).toBe('20261102')
    expect(dailyKey(new Date(at.getTime() + msUntilNextDaily(at) - 1))).toBe('20261101')
  })
})
