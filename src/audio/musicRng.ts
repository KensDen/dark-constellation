// The presentation side's own random numbers (Round 6b).
//
// The music bed picks note pitches and the gaps between them at random, and
// the brief is explicit that this randomness must never touch the engine's
// seeded streams. Two reasons, and only the second one is about audio.
//
// The engine's determinism guarantee is that the same seed and the same
// actions produce the same event log, which the snapshot test pins. Every
// roll flows through an Rng derived from (seed, turn). If a presentation
// module could reach one of those streams, it could advance it: a player
// with music on would resolve a different campaign from a player with music
// off, from the same seed, and the snapshot would move for a reason nobody
// would look for in the audio layer.
//
// So this is NOT mulberry32 imported from src/engine/rng.ts. Importing the
// function would be harmless in itself, since a new stream is a new stream.
// But a boundary enforced by the module graph is checkable by walking the
// graph, while a boundary enforced by intent is checkable only by reading
// every future edit, and Round 6a is the third time this pass that a set
// nobody walked turned out to be wrong. The eight lines below are the price
// of the graph having no path at all from the music bed to the engine's
// randomness, and tests/music.spec.ts walks the closure to prove it.
//
// Nothing here is seeded from the game. The bed is ambience, it is allowed
// to differ between two plays of the same campaign, and that is the point:
// a loop the player can predict has stopped being ambience.

export interface MusicRng {
  next(): number
  // A float in [min, max), which is every call site this module has: note
  // gaps in milliseconds and detune in cents.
  between(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

// xorshift32. Different family from the engine's mulberry32 on purpose, so
// that even a copied line cannot silently become a shared implementation.
export function xorshift32(seed: number): MusicRng {
  let a = seed >>> 0 || 0x9e3779b9
  const next = () => {
    a ^= a << 13
    a >>>= 0
    a ^= a >>> 17
    a ^= a << 5
    a >>>= 0
    return a / 4294967296
  }
  return {
    next,
    between: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}

// The default stream. Seeded from Math.random, which the engine may never
// call and presentation always may: this is the line that makes the two
// sides different in kind rather than only in file.
export function defaultMusicRng(): MusicRng {
  return xorshift32(Math.floor(Math.random() * 0xffffffff))
}
