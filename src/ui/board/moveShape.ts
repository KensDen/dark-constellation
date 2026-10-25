// THE SHAPE OF A MOVE ON THE PLAYFIELD (v1.5 R2): how each of COLDVEIL's
// moves is drawn on its tile (./Playfield.tsx), by how it travels, with the
// spoofs and replays drawn as a ghost of their target. Its own module, so
// the playfield's file exports components only, and the suite reads it.

import { DEFAULT_SCENARIO } from '../../content'
import type { Vector } from '../../engine/types'

// The move's shape on the board: by how it travels, with the spoofs and
// replays drawn as a ghost of their target.
export type Shape = 'waves' | 'ghost' | 'beam' | 'packets' | 'chip' | 'hook' | 'debris'
const GHOSTS = new Set(['gnss-spoofing', 'time-spoof', 'telemetry-replay', 'lidar-injection'])
const BY_VECTOR: Record<Vector, Shape> = { rf: 'waves', optical: 'beam', cyber: 'packets', supplyChain: 'chip', human: 'hook', environmental: 'debris' }
export function shapeOf(eventId: string | undefined): Shape {
  if (!eventId) return 'waves'
  if (GHOSTS.has(eventId)) return 'ghost'
  const v = DEFAULT_SCENARIO.events.find((e) => e.id === eventId)?.vector
  return v ? BY_VECTOR[v] : 'waves'
}

