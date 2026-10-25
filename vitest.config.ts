import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node by default: the suite stays fast and nothing needs a DOM to
    // prove a pure rule. The DOM specs opt in per file with an
    // @vitest-environment docblock, so jsdom is paid for only where the
    // guarantee under test IS the DOM: event ordering, which no amount of
    // reading the source can assert (brief v1.0 principle 13).
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    // A quiet null for jsdom's missing canvas (v1.5 R2; the file says why).
    setupFiles: ['tests/setup-canvas.ts'],
  },
})
