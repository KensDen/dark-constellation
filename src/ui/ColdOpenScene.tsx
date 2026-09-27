// The cold open's four pictures (v1.2 R4, brief 5.1 and 6), hand-built
// from the board's own pixel art: the ORBIT, AIR and GROUND backdrops,
// the asset sprites and the COLDVEIL emblem, plus the two things the
// board never needed, the watch officer and the disaster zone
// (./sprites/coldOpen.ts).
//
// Each scene has ONE small loop, marked data-loop so the suite can find
// it: the satellites' beacons blink, the drones' rotors flicker, the
// emblem glitches, the officer types (brief 6). The reused backdrops and
// sprites bring their own idle life from the board (twinkling stars,
// orbits, drifting clouds, a ground station's beacon), so everything
// that is not the loop sits in a .dc-still wrapper and stands at rest.
// Everything that moves does so in CSS under the no-preference guard (the
// board's idle life in index.css, the cold open's own rules in
// ./coldOpen.css), so under reduced motion each scene is the same
// picture, standing still.
//
// Decoration, like every sprite: the line under the scene carries the
// meaning, so the whole picture is hidden from assistive tech.

import { memo, useId, type CSSProperties, type ReactNode } from 'react'
import PixelSprite from './sprites/PixelSprite'
import Backdrop from './sprites/backdrops'
import { ASSET_SPRITES } from './sprites/assets'
import { COLDVEIL_EMBLEM } from './sprites/icons'
import { DISASTER, FLOOD, WATCH_OFFICER } from './sprites/coldOpen'
import { spriteRects, type Sprite } from './sprites/sprite'
import type { SceneName } from './coldOpenSlides'

// A sprite repeated across the width as a band, the way the backdrops
// repeat their star and terrain tiles.
function Band({ sprite, px, className, style }: { sprite: Sprite; px: number; className?: string; style?: CSSProperties }) {
  const id = useId()
  const w = sprite.rows[0].length
  const h = sprite.rows.length
  return (
    <svg className={className} style={style} width="100%" height={h * px} shapeRendering="crispEdges">
      <defs>
        <pattern id={id} width={w * px} height={h * px} patternUnits="userSpaceOnUse">
          <g transform={`scale(${px})`}>
            {spriteRects(sprite).map(({ char, ink, runs }) => (
              <g key={char} style={{ fill: `var(--dc-${ink.token})`, fillOpacity: ink.alpha }}>
                {runs.map((r) => (
                  <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.width} height={1} />
                ))}
              </g>
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

// Placed by percent of the scene, so the picture holds together at any
// phone width; `x` is the sprite's centre.
function At({ x, y, children, loop }: { x: number; y: number; children: ReactNode; loop?: boolean }) {
  return (
    <div data-loop={loop || undefined} className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      {children}
    </div>
  )
}

// The board's art at rest: its own idle life stays on the board.
function Still({ children, className = 'absolute inset-0' }: { children: ReactNode; className?: string }) {
  return <div className={`dc-still ${className}`}>{children}</div>
}

// STORMGLASS-9 over the Earth's limb, beacons blinking.
const CONSTELLATION = [
  { x: 14, y: 52 },
  { x: 32, y: 38 },
  { x: 50, y: 31 },
  { x: 68, y: 38 },
  { x: 86, y: 52 },
]

function Orbit() {
  return (
    <>
      <Still>
        <Backdrop layer="ORBIT" />
      </Still>
      <div data-loop="" className="absolute inset-0">
        {CONSTELLATION.map((p, i) => (
          <At key={i} x={p.x} y={p.y}>
            <PixelSprite sprite={i === 2 ? ASSET_SPRITES.rpoSat.intact : ASSET_SPRITES.sat.intact} scale={3} />
          </At>
        ))}
      </div>
    </>
  )
}

// KESTREL drones over the disaster zone, rotors flickering: a flooded
// town, a far row faint behind a near one, the water over both.
const SQUADRON = [
  { x: 22, y: 26 },
  { x: 56, y: 40 },
  { x: 80, y: 16 },
]
const FAR = [
  { x: 6, piece: 0 },
  { x: 22, piece: 1 },
  { x: 48, piece: 3 },
  { x: 70, piece: 1 },
  { x: 82, piece: 0 },
]
const NEAR = [
  { x: 10, piece: 1 },
  { x: 36, piece: 0 },
  { x: 62, piece: 2 },
  { x: 90, piece: 0 },
]

function Disaster() {
  return (
    <>
      <Still>
        <Backdrop layer="AIR" />
      </Still>
      <div className="absolute inset-0 opacity-60">
        {FAR.map((t, i) => (
          <div key={i} className="absolute bottom-[22px] -translate-x-1/2" style={{ left: `${t.x}%` }}>
            <PixelSprite sprite={DISASTER[t.piece]} scale={3} className="block" />
          </div>
        ))}
      </div>
      {NEAR.map((t, i) => (
        <div key={i} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${t.x}%` }}>
          <PixelSprite sprite={DISASTER[t.piece]} scale={6} className="block" />
        </div>
      ))}
      <Band sprite={FLOOD} px={3} className="absolute bottom-0 inset-x-0" />
      <div data-loop="" className="absolute inset-0">
        {SQUADRON.map((p, i) => (
          <At key={i} x={p.x} y={p.y}>
            <PixelSprite sprite={ASSET_SPRITES.drone.intact} scale={4} />
          </At>
        ))}
      </div>
    </>
  )
}

// The COLDVEIL emblem glitching in over the ground segment.
function Coldveil() {
  return (
    <>
      <Still>
        <Backdrop layer="GROUND" />
        <div className="absolute bottom-[12px] left-[22%] -translate-x-1/2">
          <PixelSprite sprite={ASSET_SPRITES.groundStation.intact} scale={3} />
        </div>
        <div className="absolute bottom-[12px] left-[78%] -translate-x-1/2">
          <PixelSprite sprite={ASSET_SPRITES.groundStation.intact} scale={2} />
        </div>
      </Still>
      <At x={50} y={24} loop>
        <div className="dc-glitch-in">
          <div className="dc-glitch relative">
            <PixelSprite sprite={COLDVEIL_EMBLEM} scale={8} />
            <PixelSprite sprite={COLDVEIL_EMBLEM} scale={8} className="dc-glitch-ghost absolute left-0 top-0" />
          </div>
        </div>
      </At>
    </>
  )
}

// The watch officer at the desk, typing, under the big board: the ORBIT
// backdrop again, on the ops room's wall screen.
function Watch() {
  return (
    <>
      <Still className="absolute inset-x-[8%] top-[6%] bottom-[52%] overflow-hidden border-2 border-dc-line bg-dc-ground">
        <Backdrop layer="ORBIT" />
      </Still>
      {/* The desk runs the width of the room; the officer's own sprite
          carries its middle, in the same inks, so the two meet flush. */}
      <div className="absolute inset-x-0 bottom-0 h-[60px] border-t-[6px] border-dc-line bg-dc-chrome">
        <div className="h-[6px] bg-dc-muted/60" />
      </div>
      <div data-loop="" className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <div className="relative">
          {WATCH_OFFICER.map((frame, i) => (
            <PixelSprite
              key={i}
              sprite={frame}
              scale={6}
              name={`watch-officer-${i}`}
              className={i === 0 ? 'block' : `dc-officer-${i} absolute left-0 top-0`}
            />
          ))}
        </div>
      </div>
    </>
  )
}

const SCENES: Record<SceneName, () => ReactNode> = {
  orbit: Orbit,
  disaster: Disaster,
  coldveil: Coldveil,
  watch: Watch,
}

export interface ColdOpenSceneProps {
  scene: SceneName
  // The picture crossfading away over the next one, under reduced motion.
  leaving?: boolean
  className?: string
}

function ColdOpenScene({ scene, leaving, className = '' }: ColdOpenSceneProps) {
  const Picture = SCENES[scene]
  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      data-leaving={leaving || undefined}
      className={`absolute inset-0 overflow-hidden bg-dc-ground ${className}`}
    >
      <Picture />
    </div>
  )
}

// Memoised: the line under the scene types forty characters a second, and
// the picture above it has no reason to render with every one of them.
export default memo(ColdOpenScene)
