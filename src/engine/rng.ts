// Seeded deterministic PRNG (mulberry32). The engine must never touch
// Math.random or Date; every roll flows through an Rng derived from the
// game seed. Same seed + same actions = same log.

export interface Rng {
  next(): number
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  chance(probability: number): boolean
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  }
}

// Stable per-turn stream: resolveTurn derives its rolls from (seed, turn),
// so a reloaded or replayed game resolves identically regardless of how
// many rolls earlier turns consumed.
//
// TWO STREAMS A TURN since v1.2 Round 5a (brief 7.1, the Daily Op). 'deck'
// is the adversary's draw: each slot's event, and the opportunity roll and
// pick. 'main' is everything that depends on what the player owns or
// bought: delivery and slip rolls, targets, durations, implant hosts and
// debris. Purchases draw from the main stream before the adversary plays,
// so while the two shared one stream, two players on the same seed faced
// different threats as soon as they bought different things. The main
// stream's salt is zero, so it is exactly the stream every earlier version
// drew; only the deck is new.
export type TurnStream = 'main' | 'deck'
const STREAM_SALT: Record<TurnStream, number> = { main: 0, deck: 0x2f1d7a93 }

export function turnRng(seed: number, turn: number, stream: TurnStream = 'main'): Rng {
  return mulberry32(
    (Math.imul(seed ^ 0x9e3779b9, 2654435761) ^ Math.imul(turn + 1, 40503) ^ Math.imul(STREAM_SALT[stream], 0x85ebca6b)) >>> 0,
  )
}
