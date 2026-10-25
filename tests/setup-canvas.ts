// jsdom has no canvas: it answers getContext with null and writes a "not
// implemented" line to the console on every ask. The playfield and the
// title's key art (v1.5 R2) ask once a mount, and the suite mounts the
// board hundreds of times, so here the ask gets its null quietly: the test
// log stays readable, and under the 1 MB the battery reads it through.
// Nothing under test draws; the drawing is checked in a real browser
// (scripts/phone-layout.mjs).
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
