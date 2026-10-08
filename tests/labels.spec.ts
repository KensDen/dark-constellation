// The coverage figure every surface prints (v1.3 Round 0): the HUD
// readout, the posture panel line and the reading-diet values in
// src/ui/brief.ts, and the turn-start line in src/director/beats.ts all
// print coverageFigure from src/ui/labels.ts. One decimal, rounded DOWN,
// because the SLA bonus is paid at 60 or more: a figure rounded to the
// nearest tenth would read 60 on a fleet at 59.96, which the close
// refuses.
//
// The engine's coverage (src/engine/scoring.ts) is an exact multiple of
// 0.01 since the same fix (it sums whole hundredths and divides once), so
// every input below is a count of hundredths divided by 100, as there.

import { describe, expect, it } from 'vitest'

import { coverageFigure } from '../src/ui/labels'

describe('coverageFigure (v1.3 Round 0)', () => {
  it.each([
    [56.22, 56.2],
    [56.29, 56.2],
    [59.96, 59.9],
    [60, 60],
    [58, 58],
    [100, 100],
  ])('prints %s as %s: one decimal, rounded down', (cov, figure) => {
    expect(coverageFigure(cov)).toBe(figure)
  })

  it('never crosses 60 from below: every hundredths value from 59.00 to 60.00', () => {
    let checked = 0
    for (let h = 5900; h <= 6000; h += 1) {
      const cov = h / 100
      const figure = coverageFigure(cov)
      if (h < 6000) expect(figure, `coverage ${cov} prints ${figure}, at or over the 60 the SLA pays at`).toBeLessThan(60)
      else expect(figure).toBe(60)
      checked += 1
    }
    expect(checked).toBe(101)
  })

  it('is the hundredths floored to tenths for every coverage from 0 to 100', () => {
    // An integer oracle: h hundredths print as floor(h / 10) tenths. It
    // pins the rounding DOWN, that the figure has one decimal and no float
    // noise, and that it is never above the coverage nor a tenth or more
    // below it.
    for (let h = 0; h <= 10000; h += 1) {
      const cov = h / 100
      const figure = coverageFigure(cov)
      expect(figure, `coverage ${cov}`).toBe(Math.floor(h / 10) / 10)
      expect(figure, `coverage ${cov} prints above itself`).toBeLessThanOrEqual(cov)
      expect(cov - figure, `coverage ${cov} prints a tenth or more under itself`).toBeLessThan(0.1)
      expect(String(figure), `coverage ${cov} prints with float noise`).toMatch(/^\d+(\.\d)?$/)
    }
  })

  it('reads a coverage a float sum left just under a whole tenth as that tenth', () => {
    // coverageFigure rounds to whole hundredths before it floors, so float
    // noise from a sum (50.05 + 0.05 is 50.099999999999994) does not lose a
    // tenth: a bare floor of cov * 10 would print 50 here. The engine's
    // coverage carries no such noise since the scoring fix (engine.spec.ts
    // pins that a fleet worth exactly 60 is 60), which is what keeps the
    // never-crosses-60 guard above true of what the game actually prints.
    const noisy = 50.05 + 0.05
    expect(noisy, 'the sum carries no float noise on this platform, so this proves nothing').toBeLessThan(50.1)
    expect(coverageFigure(noisy)).toBe(50.1)
    expect(coverageFigure(50.19 + 0.01)).toBe(50.2)
  })
})
