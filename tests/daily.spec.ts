// The Daily Op's seed (v1.2 Round 5a, brief 7.1): the player's LOCAL
// calendar date, as YYYYMMDD, hashed. Every date below is built from local
// parts (new Date(y, m, d, h)), so it means the same day in any time zone
// the suite runs in; the one test about time zones sets its own.

import { afterEach, describe, expect, it } from 'vitest'

import { dailyKey, dailySeed } from '../src/engine/daily'

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
