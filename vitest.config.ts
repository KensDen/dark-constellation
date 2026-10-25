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
    // 15 seconds a test, not the default 5 (v1.5.0's deploy). The heaviest
    // DOM specs run about 1.1 seconds here, but CI's runner is about five
    // times slower under the full suite, and two of them crossed 5 seconds
    // there on 25 October 2026. A test that hangs still fails.
    testTimeout: 15_000,
  },
})
