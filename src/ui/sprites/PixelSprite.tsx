// The one sprite renderer (v1.2 R2, brief 5.1): a grid to an SVG with
// crisp edges, one rect per horizontal run, grouped by palette entry so a
// colour is written once and an animated part is one element the
// stylesheet can find. Integer scaling only, by type: a scale of 1.5
// would put pixel edges between device pixels and blur them.
//
// Always decoration. Whatever a sprite depicts, the control around it
// carries the name (a tile's accessible name has the call sign, the
// integrity and the state), so the sprite is hidden from assistive tech.

import { memo } from 'react'
import { spriteRects, type Sprite } from './sprite'

export type Scale = 1 | 2 | 3 | 4

export interface PixelSpriteProps {
  sprite: Sprite
  scale?: Scale
  // Which sprite this is, for the tests and for the stylesheet.
  name?: string
  className?: string
}

function PixelSprite({ sprite, scale = 2, name, className }: PixelSpriteProps) {
  const height = sprite.rows.length
  const width = sprite.rows[0].length
  return (
    <svg
      aria-hidden="true"
      data-sprite={name}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {spriteRects(sprite).map(({ char, ink, runs }) => (
        // The ink's alpha is a fill opacity, which leaves the group's own
        // opacity free for the idle life to animate.
        <g key={char} style={{ fill: `var(--dc-${ink.token})`, fillOpacity: ink.alpha }} className={ink.part && `dc-${ink.part}`}>
          {runs.map((r) => (
            <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.width} height={1} />
          ))}
        </g>
      ))}
    </svg>
  )
}

// Memoised, so a sprite renders when its own props change and at no other
// time. Its props are module constants and short strings, and the board
// re-renders on every director tick and every HUD change; without this,
// each of those rebuilt every rect on the board (CI run #19 timed out on
// exactly that). tests/render-count.dom.spec.tsx holds it.
export default memo(PixelSprite)
