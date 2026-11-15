// jsdom has no canvas: it answers getContext with null and writes a "not
// implemented" line to the console on every ask. The title's hero and the
// 3D game ask for WebGL as they mount, and the suite mounts the title many
// times, so here the ask gets its null quietly: the test log stays
// readable, and under the 1 MB the battery reads it through. Nothing under
// test draws; the drawing is checked in a real browser
// (scripts/phone-layout.mjs). With no context the 3D game shows its own
// fallback, which tests/game3d.dom.spec.tsx holds.

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
