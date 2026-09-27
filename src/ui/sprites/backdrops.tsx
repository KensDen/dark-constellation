// The layer backdrops (v1.2 R2, brief 5.2 and 5.3): a starfield over the
// Earth's limb for ORBIT, sky and drifting clouds for AIR, stepped terrain
// for GROUND. Each is decoration behind the panel's tiles, drawn at the
// board's one pixel size, two CSS pixels, with no scaling at all: the
// SVGs are sized in CSS pixels, so a pixel edge lands where a sprite's
// does and nothing blurs at any panel width.
//
// Readability is the tiles' job, not the art's: every piece of text on a
// panel sits on PANEL_FILL (the header plates, the tiles, the detail
// line), and BACKDROP_INKS lists every ink drawn here so the suite can
// check each text colour against the brightest thing that could sit
// under it at 4.5:1. Those, and the inks themselves, live in ./scenery.ts
// as plain data, so this file exports only components.
//
// The idle life (brief 5.3) is CSS only, in src/index.css: stars twinkle,
// clouds drift, and one or two satellites cross the ORBIT sky along an arc
// concentric with the limb, the board's small echo of the start screen's
// constellation. Everything that moves has a resting place set here, so
// under reduced motion the scene is the same picture, standing still.

import { memo, useId, type CSSProperties } from 'react'
import type { Layer } from '../../engine/types'
import PixelSprite from './PixelSprite'
import { CLOUD, LIMB, ORBITS, PX, SILHOUETTE, SKY, TERRAIN_DEPTH, TWINKLE, sceneFor, type Paint } from './scenery'
import type { Ink } from './sprite'

const fill = (ink: Ink): CSSProperties => ({ fill: `var(--dc-${ink.token})`, fillOpacity: ink.alpha })

function Paints({ paints }: { paints: readonly Paint[] }) {
  return paints.map(({ ink, rects }, i) => (
    <g key={i} style={fill(ink)}>
      {rects.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x * PX} y={r.y * PX} width={r.w * PX} height={r.h * PX} />
      ))}
    </g>
  ))
}

function Limb({ paints }: { paints: readonly Paint[] }) {
  return (
    <svg
      className="absolute bottom-0 left-1/2 -translate-x-1/2"
      width={LIMB.cols * PX}
      height={LIMB.crown * PX}
      shapeRendering="crispEdges"
    >
      <Paints paints={paints} />
    </svg>
  )
}

// Two satellites on arms pivoting at the limb's centre, far below the
// panel: the arm turns, and the silhouette at its tip crosses the panel on
// the arc.
function Orbits() {
  const centre = LIMB.radius * PX - LIMB.crown * PX
  return (
    <>
      {ORBITS.map((o, i) => (
        <div
          key={i}
          className="dc-orbit absolute left-1/2 w-0"
          style={{
            bottom: -centre,
            height: centre + LIMB.crown * PX + o.altitude,
            transformOrigin: '50% 100%',
            transform: `rotate(${o.rest}deg)`,
            animationDuration: `${o.seconds}s`,
            animationDelay: `${o.delay}s`,
            animationDirection: o.reverse ? 'reverse' : undefined,
          }}
        >
          <PixelSprite sprite={SILHOUETTE} className="absolute top-0 -translate-x-1/2 -translate-y-1/2" />
        </div>
      ))}
    </>
  )
}

// A few stars that twinkle, placed by percent so they spread across any
// width, over the repeating tile of the rest.
const TWINKLES = [
  [8, 22],
  [31, 58],
  [52, 12],
  [67, 44],
  [83, 26],
  [94, 64],
]

function Starfield({ id, tile }: { id: string; tile: readonly Paint[] }) {
  return (
    <svg className="absolute inset-0 h-full w-full" shapeRendering="crispEdges">
      <defs>
        <pattern id={id} width={48 * PX} height={32 * PX} patternUnits="userSpaceOnUse">
          <Paints paints={tile} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <g style={fill(TWINKLE)}>
        {TWINKLES.map(([x, y], i) => (
          <rect key={i} className="dc-twinkle" x={`${x}%`} y={`${y}%`} width={PX} height={PX} style={{ animationDelay: `${-i * 0.9}s` }} />
        ))}
      </g>
    </svg>
  )
}

function Sky() {
  // Four bands, darker at the top, stepped rather than smooth.
  const bands = [0, 40, 65, 85, 100]
  return (
    <svg className="absolute inset-0 h-full w-full" shapeRendering="crispEdges">
      {SKY.map((ink, i) => (
        <rect key={i} x="0" y={`${bands[i]}%`} width="100%" height={`${bands[i + 1] - bands[i]}%`} style={fill(ink)} />
      ))}
    </svg>
  )
}

const CLOUDS = [
  { top: '18%', seconds: 90, delay: -20, rest: '12%' },
  { top: '55%', seconds: 120, delay: -75, rest: '58%' },
  { top: '8%', seconds: 150, delay: -130, rest: '80%' },
]

function Clouds() {
  return (
    <>
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="dc-drift absolute inset-x-0"
          style={{ top: c.top, transform: `translateX(${c.rest})`, animationDuration: `${c.seconds}s`, animationDelay: `${c.delay}s` }}
        >
          <PixelSprite sprite={CLOUD} />
        </div>
      ))}
    </>
  )
}

function Terrain({ id, tile }: { id: string; tile: readonly Paint[] }) {
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full" height={TERRAIN_DEPTH * PX} shapeRendering="crispEdges">
      <defs>
        <pattern id={id} width={32 * PX} height={TERRAIN_DEPTH * PX} patternUnits="userSpaceOnUse">
          <Paints paints={tile} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

function Backdrop({ layer }: { layer: Layer }) {
  const id = useId()
  const scene = sceneFor(layer)
  return (
    <div aria-hidden="true" data-backdrop={layer} className="pointer-events-none absolute inset-0 overflow-hidden">
      {scene.stars && <Starfield id={`${id}stars`} tile={scene.stars} />}
      {layer === 'ORBIT' && <Orbits />}
      {scene.limb && <Limb paints={scene.limb} />}
      {layer === 'AIR' && (
        <>
          <Sky />
          <Clouds />
        </>
      )}
      {scene.terrain && <Terrain id={`${id}terrain`} tile={scene.terrain} />}
    </div>
  )
}

// Memoised: the scenery depends on the layer alone, so it renders once
// per board mount and never on a director tick or a HUD change. Its
// geometry comes from sceneFor, built once per layer.
export default memo(Backdrop)
