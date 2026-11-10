// jsdom has no canvas: it answers getContext with null and writes a "not
// implemented" line to the console on every ask. The playfield and the
// title's key art (v1.5 R2) ask once a mount, and the suite mounts the
// board hundreds of times, so here the ask gets its null quietly: the test
// log stays readable, and under the 1 MB the battery reads it through.
// Nothing under test draws; the drawing is checked in a real browser
// (scripts/phone-layout.mjs).
import { beforeAll } from 'vitest'

// THE PIXEL BOARD IS LOADED BEFORE A DOM SUITE RUNS (v2.0 R1). The board
// is a deferred chunk since PLAY opens the 3D game (src/ui/classic.ts);
// the app renders it from the loaded module, so with it here a tap that
// opens the board still mounts it in the same commit, which is what these
// suites have always held. In a hook, so a suite's own mocks are in place
// before the board's modules are evaluated.
if (typeof window !== 'undefined') {
  beforeAll(async () => {
    const { loadClassic } = await import('../src/ui/classic')
    await loadClassic()
  })
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
