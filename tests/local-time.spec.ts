// QC gauntlet Q8: stored UTC times are shown in local time.
import { describe, expect, it } from 'vitest'
import { localDate, localDateTime } from '../src/ui/localTime'

describe('local time for stored UTC stamps', () => {
  it('formats from local parts, not the UTC string', () => {
    const iso = '2026-10-21T02:36:07.000Z'
    const at = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    expect(localDate(iso)).toBe(`${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`)
    expect(localDateTime(iso)).toBe(`${localDate(iso)} ${p(at.getHours())}:${p(at.getMinutes())}`)
  })

  it('falls back to the stored text when it is not a date', () => {
    expect(localDate('not-a-date-at-all')).toBe('not-a-date')
    expect(localDateTime('2026-99-99Tnope')).toBe('2026-99-99 nope')
  })
})
