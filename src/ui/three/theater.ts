// THE THEATER (the 3D slice's, exp/3d-slice; the whole game's since v2.0
// R1, where world.ts builds the six-turn game's world on it): the world
// the 3D game plays in.
// A globe, an orbit ring with the satellites, the drones over the area of
// operations, the ground station, and COLDVEIL off the night side, in the
// look of the 3D title prototype: smooth, procedural, no image files.
//
// Imperative on purpose. React owns what the night IS (sliceModel.ts and
// Slice3D.tsx); this owns how it looks and moves, and is told what to show
// through a handful of calls. Nothing here reads the engine.
//
// PHONES FIRST: one renderer, pixel ratio capped at 2, about 45 draw calls
// and under 20,000 vertices; the loop stops while the tab is hidden; under
// Reduce Motion the camera holds one framing, nothing shakes and nothing
// sways.
//
// three.js comes from its source entry, not the package root, so this
// chunk tree-shakes its own copy and the title's constellation frame chunk
// (which the bundle budget recognises by content) is left exactly as built.

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three/src/Three.js'

export type TheaterKind = 'sat' | 'rpoSat' | 'drone' | 'groundStation'
export interface TheaterAsset {
  id: string
  kind: TheaterKind
}
// A move as it is aimed before the night: where from is always COLDVEIL.
export interface TheaterAim {
  key: string
  targetId: string
  // Whether what is owned stops it: the line ends on the shield.
  blocked: boolean
  // How the line reads (v2.0 R1): a move COLDVEIL favors, one it may play,
  // one it will not, or a signature not yet identified.
  tone?: AimTone
}
export type AimTone = 'likely' | 'either' | 'unlikely' | 'unknown'
const AIM_HEX: Record<AimTone, number> = { likely: 0xff5a4f, either: 0xff8a5c, unlikely: 0x8a5a66, unknown: 0x8fa0b8 }
const AIM_ALPHA: Record<AimTone, number> = { likely: 0.9, either: 0.7, unlikely: 0.28, unknown: 0.42 }
export type Impact = 'blocked' | 'halved' | 'hit'
export type Beat = 'wide' | 'night' | 'dawn'
// Where a thing is on screen, in CSS pixels, for the labels the page lays
// over the canvas.
export type Place = (key: string, x: number, y: number, shown: boolean) => void

export const C = {
  void: 0x04070d,
  go: 0x7cff9b,
  sky: 0x5aa9ff,
  threat: 0xff5a4f,
  amber: 0xffb547,
  hull: 0xc9d4e0,
  panel: 0x2e5f99,
  shield: 0x6fe3ff,
}

export const FOV = 40
const TAN = Math.tan((FOV * Math.PI) / 360)
export const RING_R = 1.4
const RING_TILT = 0.96
// COLDVEIL stands off the night side: above the theater on a tall screen,
// out to its left on a wide one, so each shape of screen is filled.
export const COLDVEIL_AT = new Vector3(-1.12, 2.3, -0.3)
const LAYOUT = {
  tall: { foe: [-1.12, 2.3, -0.3], centre: [0, 0.56, 0], halfW: 1.66, halfH: 1.98 },
  wide: { foe: [-2.05, 1.62, -0.3], centre: [-0.34, 0.42, 0], halfW: 2.12, halfH: 1.62 },
}
const SUN_DAY = new Vector3(0.74, 0.34, 0.58).normalize()
const SUN_NIGHT = new Vector3(0.78, 0.16, -0.6).normalize()
export const AO = { lat: 0.4, lon: 0 }
// The theater's bounds for the wide framing: its centre, and half its
// width and height.
export const CENTRE = new Vector3(0, 0.56, 0)
let HALF_W = 1.66
let HALF_H = 1.98
// Where the score stands at dawn: under the globe, in the world.
const SCORE_AT = new Vector3(0, -1.32, 0.2)

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const easeOut = (k: number) => 1 - (1 - k) ** 3
export const easeIn = (k: number) => k * k * k
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
export const backOut = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2

export function onGlobe(lat: number, lon: number, r: number, out = new Vector3()): Vector3 {
  return out.set(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon))
}
export function onRing(a: number, out = new Vector3()): Vector3 {
  return out.set(RING_R * Math.cos(a), RING_R * Math.sin(a) * Math.sin(RING_TILT), RING_R * Math.sin(a) * Math.cos(RING_TILT))
}

// Where each asset keeps station, by kind, in the order the fleet lists
// them. More than the starter fleet holds, so an extra tile has a place.
const STATIONS: Record<TheaterKind, number[][]> = {
  sat: [[2.56], [1.62], [0.16], [3.0]],
  rpoSat: [[0.66], [3.35]],
  drone: [
    [0.7, -0.74],
    [0.66, 0.74],
    [-0.12, -0.5],
    [-0.14, 0.52],
  ],
  groundStation: [
    [0.14, 0.0],
    [-0.3, 0.1],
  ],
}

// One soft round dot, drawn once and used by every glow in the scene.
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    grad.addColorStop(0.6, 'rgba(255,255,255,0.12)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(c)
}

// A RIBBON: a curve drawn as a strip that always faces the camera, so a
// line has a width a phone can see (a GL line is one device pixel). The
// shader draws flowing dashes for a link or an aimed move, and a comet's
// tail when `head` is set.
const RIBBON_N = 44
const RIBBON_VERT = `
attribute float u; attribute float side;
varying float vU; varying float vSide;
void main(){ vU = u; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const RIBBON_FRAG = `
uniform vec3 color; uniform float time; uniform float alpha; uniform float reveal;
uniform float head; uniform float tail; uniform float dashes; uniform float flow; uniform float fadeEnd;
varying float vU; varying float vSide;
void main(){
  float edge = 1.0 - vSide * vSide;
  float a;
  if (head >= 0.0) {
    a = smoothstep(head - tail, head, vU) * step(vU, head);
    a = a * a;
  } else {
    float d = fract(vU * dashes - time * flow);
    a = (0.28 + 0.72 * smoothstep(0.0, 0.12, d) * smoothstep(0.62, 0.5, d)) * step(vU, reveal);
    a *= mix(1.0, smoothstep(1.0, 0.82, vU), fadeEnd);
  }
  gl_FragColor = vec4(color, a * edge * alpha);
}`

export class Ribbon {
  mesh: Mesh
  uniforms: Record<string, { value: number | Color }>
  private pos: Float32Array
  protected a = new Vector3()
  protected b = new Vector3()
  protected c = new Vector3()
  protected p = new Vector3()
  protected q = new Vector3()
  protected t = new Vector3()
  protected s = new Vector3()

  constructor(color: number, dashes: number, flow: number) {
    const n = RIBBON_N + 1
    this.pos = new Float32Array(n * 2 * 3)
    const u = new Float32Array(n * 2)
    const side = new Float32Array(n * 2)
    const index: number[] = []
    for (let i = 0; i < n; i += 1) {
      u[i * 2] = u[i * 2 + 1] = i / RIBBON_N
      side[i * 2] = -1
      side[i * 2 + 1] = 1
      if (i < RIBBON_N) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    }
    const geo = new BufferGeometry()
    const attr = new BufferAttribute(this.pos, 3)
    attr.setUsage(DynamicDrawUsage)
    geo.setAttribute('position', attr)
    geo.setAttribute('u', new BufferAttribute(u, 1))
    geo.setAttribute('side', new BufferAttribute(side, 1))
    geo.setIndex(index)
    this.uniforms = {
      color: { value: new Color(color) },
      time: { value: 0 },
      alpha: { value: 1 },
      reveal: { value: 1 },
      head: { value: -1 },
      tail: { value: 0.4 },
      dashes: { value: dashes },
      flow: { value: flow },
      fadeEnd: { value: 0 },
    }
    this.mesh = new Mesh(
      geo,
      new ShaderMaterial({ uniforms: this.uniforms, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    )
    this.mesh.frustumCulled = false
  }

  set(a: Vector3, c: Vector3, b: Vector3): void {
    this.a.copy(a)
    this.c.copy(c)
    this.b.copy(b)
  }

  at(k: number, out: Vector3): Vector3 {
    const m = 1 - k
    return out.set(
      m * m * this.a.x + 2 * m * k * this.c.x + k * k * this.b.x,
      m * m * this.a.y + 2 * m * k * this.c.y + k * k * this.b.y,
      m * m * this.a.z + 2 * m * k * this.c.z + k * k * this.b.z,
    )
  }

  update(cam: Vector3, width: number): void {
    const pos = this.pos
    for (let i = 0; i <= RIBBON_N; i += 1) {
      const k = i / RIBBON_N
      this.at(k, this.p)
      this.at(Math.min(1, k + 0.01), this.q)
      this.t.copy(this.q).sub(this.at(Math.max(0, k - 0.01), this.q))
      this.s.copy(cam).sub(this.p).cross(this.t).normalize().multiplyScalar(width)
      pos[i * 6] = this.p.x - this.s.x
      pos[i * 6 + 1] = this.p.y - this.s.y
      pos[i * 6 + 2] = this.p.z - this.s.z
      pos[i * 6 + 3] = this.p.x + this.s.x
      pos[i * 6 + 4] = this.p.y + this.s.y
      pos[i * 6 + 5] = this.p.z + this.s.z
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
  }

  num(name: string): number {
    return this.uniforms[name].value as number
  }
}

// PARTICLES: one pool for every spark, shard and ember, one draw call.
const PARTICLES = 420
export class Sparks {
  points: Points
  protected pos = new Float32Array(PARTICLES * 3)
  protected col = new Float32Array(PARTICLES * 3)
  protected size = new Float32Array(PARTICLES)
  protected alpha = new Float32Array(PARTICLES)
  protected vel = new Float32Array(PARTICLES * 3)
  protected life = new Float32Array(PARTICLES)
  protected span = new Float32Array(PARTICLES)
  protected drag = new Float32Array(PARTICLES)
  protected next = 0
  uniforms = { scale: { value: 1 } }

  constructor() {
    const geo = new BufferGeometry()
    for (const [name, arr, n] of [
      ['position', this.pos, 3],
      ['color', this.col, 3],
      ['aSize', this.size, 1],
      ['aAlpha', this.alpha, 1],
    ] as const) {
      const attr = new BufferAttribute(arr, n)
      attr.setUsage(DynamicDrawUsage)
      geo.setAttribute(name, attr)
    }
    this.points = new Points(
      geo,
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `attribute vec3 color; attribute float aSize; attribute float aAlpha; uniform float scale; varying vec3 vC; varying float vA;
void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * scale / -mv.z; }`,
        fragmentShader: `varying vec3 vC; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d)); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.points.frustumCulled = false
  }

  emit(at: Vector3, vx: number, vy: number, vz: number, color: Color, life: number, size: number, drag = 2.2): void {
    const i = this.next
    this.next = (i + 1) % PARTICLES
    this.pos[i * 3] = at.x
    this.pos[i * 3 + 1] = at.y
    this.pos[i * 3 + 2] = at.z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.col[i * 3] = color.r
    this.col[i * 3 + 1] = color.g
    this.col[i * 3 + 2] = color.b
    this.life[i] = this.span[i] = life
    this.size[i] = size
    this.drag[i] = drag
  }

  step(dt: number): void {
    for (let i = 0; i < PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      const k = Math.max(0, 1 - this.drag[i] * dt)
      for (let a = 0; a < 3; a += 1) {
        this.vel[i * 3 + a] *= k
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt
      }
      this.alpha[i] = Math.min(1, (this.life[i] / this.span[i]) * 1.6)
    }
    const at = this.points.geometry.attributes
    at.position.needsUpdate = true
    at.color.needsUpdate = true
    at.aSize.needsUpdate = true
    at.aAlpha.needsUpdate = true
  }
}

const std = (color: number, emissive = 0x000000, intensity = 0, role = '') => {
  const m = new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, emissive, emissiveIntensity: intensity })
  // What a skin recolours (world.ts): the hull and the solar cells.
  m.userData.role = role
  return m
}

function buildSat(rpo: boolean): Group {
  const g = new Group()
  const hull = std(C.hull, 0, 0, 'hull')
  const body = new Mesh(new BoxGeometry(0.1, 0.1, 0.15), hull)
  g.add(body)
  const cells = std(C.panel, 0x2a6fd0, 0.55, 'panel')
  for (const s of [-1, 1]) {
    const arm = new Mesh(new BoxGeometry(0.05, 0.012, 0.012), hull)
    arm.position.x = s * 0.07
    const panel = new Mesh(new BoxGeometry(0.17, 0.008, 0.1), cells)
    panel.position.x = s * 0.18
    g.add(arm, panel)
  }
  const dish = new Mesh(new ConeGeometry(0.045, 0.035, 20, 1, true), std(0xf0f4f8))
  dish.material.side = DoubleSide
  dish.position.set(0, -0.07, 0)
  g.add(dish)
  if (rpo) {
    // The docking LiDAR: an arm and a lit lens.
    const arm = new Mesh(new CylinderGeometry(0.01, 0.01, 0.12, 8), hull)
    arm.rotation.x = Math.PI / 2
    arm.position.z = 0.13
    const lens = new Mesh(new SphereGeometry(0.026, 14, 10), new MeshBasicMaterial({ color: 0x8ff0ff }))
    lens.position.z = 0.2
    g.add(arm, lens)
  }
  return g
}

function buildDrone(): Group {
  const g = new Group()
  const hull = std(0xe6edf3, 0, 0, 'hull')
  const body = new Mesh(new CylinderGeometry(0.02, 0.012, 0.17, 10), hull)
  body.rotation.x = Math.PI / 2
  const wing = new Mesh(new BoxGeometry(0.3, 0.008, 0.05), hull)
  wing.position.z = 0.01
  const tail = new Mesh(new BoxGeometry(0.1, 0.008, 0.03), hull)
  tail.position.z = -0.08
  const fin = new Mesh(new BoxGeometry(0.008, 0.05, 0.03), hull)
  fin.position.set(0, 0.025, -0.08)
  const eye = new Mesh(new SphereGeometry(0.018, 12, 8), new MeshBasicMaterial({ color: 0x8ff0ff }))
  eye.position.set(0, -0.012, 0.07)
  g.add(body, wing, tail, fin, eye)
  return g
}

function buildStation(): Group {
  const g = new Group()
  const base = new Mesh(new CylinderGeometry(0.05, 0.065, 0.03, 16), std(0x788696))
  base.position.y = 0.015
  const mast = new Mesh(new CylinderGeometry(0.012, 0.012, 0.08, 8), std(C.hull, 0, 0, 'hull'))
  mast.position.y = 0.07
  const dish = new Mesh(new SphereGeometry(0.085, 22, 10, 0, Math.PI * 2, 0, 1.05), std(0xf0f4f8, 0x7cff9b, 0.12))
  dish.material.side = DoubleSide
  dish.rotation.x = Math.PI + 0.5
  dish.position.set(0, 0.185, 0.03)
  const lamp = new Mesh(new SphereGeometry(0.014, 10, 8), new MeshBasicMaterial({ color: C.go }))
  lamp.position.y = 0.125
  g.add(base, mast, dish, lamp)
  return g
}

const SHIELD_VERT = `varying vec3 vN; varying vec3 vV;
void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const SHIELD_FRAG = `uniform vec3 color; uniform float power; uniform float alpha; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(mix(color, vec3(1.0), clamp(power, 0.0, 1.0) * 0.7), (0.1 + f * 0.9 + power * 0.5) * alpha); }`

export interface Shield {
  group: Group
  wire: LineSegments
  uniforms: { color: { value: Color }; power: { value: number }; alpha: { value: number } }
  // 0 down, 1 up: eased by the frame.
  up: number
  want: number
  flash: number
  tone: 'defense' | 'response'
}

export interface Body {
  id: string
  kind: TheaterKind
  root: Group
  model: Group
  station: number[]
  phase: number
  radius: number
  integrity: number
  shown: number
  jolt: number
  shield: Shield | null
  reticle: Mesh
  targeted: number
  wantTargeted: number
  link: Ribbon | null
  jammed: boolean
  // The asset its link is rerouted through tonight (v2.0 R1), when it is.
  via: string | null
  pos: Vector3
}

export interface AimLine {
  key: string
  ribbon: Ribbon
  targetId: string
  blocked: boolean
  tone: AimTone
  // Where its end is drawn, eased toward the target so a retarget swings.
  end: Vector3
  lift: number
  bend: number
  fresh: number
  gone: boolean
}

export interface Tween {
  t: number
  dur: number
  fn: (k: number) => void
  done: () => void
}

export class Theater {
  protected renderer: WebGLRenderer
  protected scene = new Scene()
  protected camera = new PerspectiveCamera(FOV, 1, 0.1, 120)
  protected canvas: HTMLCanvasElement
  protected place: Place
  protected reduced: boolean
  protected raf = 0
  protected running = false
  protected dead = false
  protected last = 0
  protected time = 0
  protected freeze = 0
  protected tweens: Tween[] = []
  protected w = 1
  protected h = 1
  // The part of the canvas the page leaves clear of its own chrome, as
  // fractions of the height from the top; the theater frames itself there.
  protected clearTop = 0.1
  protected clearBottom = 0.7
  protected clearRight = 1

  protected glow = glowTexture()
  protected sun = SUN_DAY.clone()
  protected night = 0
  protected globeUniforms = { sun: { value: this.sun }, time: { value: 0 }, scale: { value: 1 }, ao: { value: onGlobe(AO.lat, AO.lon, 1) }, power: { value: 1 } }
  protected airUniforms = { sun: { value: this.sun }, tint: { value: new Color(C.sky) } }
  protected sunLight = new DirectionalLight(0xffffff, 2.4)
  protected stars: Points
  protected sparks = new Sparks()
  protected bodies = new Map<string, Body>()
  protected aims: AimLine[] = []
  protected coldveil = new Group()
  protected coldGlow: Sprite
  protected coldCharge = 0
  protected rings: { mesh: Mesh; t: number; dur: number; size: number }[] = []
  protected flashes: { sprite: Sprite; t: number; dur: number; size: number }[] = []
  protected comet: { ribbon: Ribbon; head: Sprite; core: Mesh; u: number; targetId: string; lift: number; bend: number } | null = null

  // The camera: where it is easing to, and the player's own offset on top.
  protected cam = { az: 0, el: 0.3, dist: 30, look: CENTRE.clone() }
  protected want = { az: 0, el: 0.3, dist: 12, look: CENTRE.clone() }
  protected drag = { az: 0, el: 0, zoom: 1, held: false, x: 0, y: 0, moved: 0 }
  protected pinch = 0
  protected shake = 0
  protected focusId: string | null = null
  protected beat: Beat = 'wide'
  protected camPos = new Vector3()
  protected tmp = new Vector3()
  protected tmp2 = new Vector3()
  protected tmp3 = new Vector3()
  protected col = new Color()
  protected pointers = new Map<number, { x: number; y: number }>()
  onTapEmpty: (() => void) | null = null
  // A finger down on the world, before it is known to be a tap or a drag:
  // the timed tap reads the moment (v2.0 R1).
  onPress: (() => void) | null = null
  // Low power (v2.0 R1): pixel ratio 1, a third of the particles, and
  // every other frame drawn.
  protected low = false
  protected skip = false
  // A fixed shot the camera holds (the opening's beats), over the framing.
  protected shot: { az: number; el: number; dist: number; lookY: number } | null = null

  constructor(canvas: HTMLCanvasElement, place: Place, reduced: boolean) {
    this.canvas = canvas
    this.place = place
    this.reduced = reduced
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setClearColor(C.void)
    this.buildWorld()
    this.stars = this.buildStars()
    this.scene.add(this.stars, this.sparks.points)
    const glowMat = () => new SpriteMaterial({ map: this.glow, color: C.threat, blending: AdditiveBlending, depthWrite: false, transparent: true })
    this.coldGlow = new Sprite(glowMat())
    this.buildColdveil()
    for (let i = 0; i < 4; i += 1) {
      const mesh = new Mesh(new RingGeometry(0.86, 1, 48), new MeshBasicMaterial({ color: C.threat, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
      mesh.visible = false
      this.scene.add(mesh)
      this.rings.push({ mesh, t: 1, dur: 1, size: 1 })
      const sprite = new Sprite(glowMat())
      sprite.visible = false
      this.scene.add(sprite)
      this.flashes.push({ sprite, t: 1, dur: 1, size: 1 })
    }
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: true })
    this.resize()
    // The opening: the camera starts far out and settles on the theater.
    this.frameWide()
    this.cam.az = this.want.az - (reduced ? 0 : 0.55)
    this.cam.el = this.want.el + (reduced ? 0 : 0.25)
    this.cam.dist = this.want.dist * (reduced ? 1 : 1.9)
    this.cam.look.copy(this.want.look)
  }

  // ---------------------------------------------------------------- world

  protected buildWorld(): void {
    const core = new Mesh(
      new SphereGeometry(0.985, 56, 36),
      new ShaderMaterial({
        uniforms: this.globeUniforms,
        vertexShader: `varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){ vW = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 sun; varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){ float day = smoothstep(-0.25, 0.5, dot(vW, sun)); vec3 c = mix(vec3(0.012, 0.022, 0.045), vec3(0.03, 0.085, 0.19), day);
  float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); c += rim * mix(vec3(0.03, 0.06, 0.14), vec3(0.12, 0.3, 0.6), day); gl_FragColor = vec4(c, 1.0); }`,
      }),
    )
    this.scene.add(core)

    // The surface: dots on a Fibonacci sphere, blotchy land as the
    // prototype drew it, lit by the sun, with lights on the night side.
    const N = 8200
    const pos = new Float32Array(N * 3)
    const kind = new Float32Array(N)
    const rnd = new Float32Array(N)
    const golden = Math.PI * (3 - Math.sqrt(5))
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < N; i += 1) {
      const y = 1 - (2 * (i + 0.5)) / N
      const r = Math.sqrt(1 - y * y)
      const t = i * golden
      const x = Math.cos(t) * r
      const z = Math.sin(t) * r
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      const land = Math.sin(x * 3.1 + 1.3) * Math.cos(y * 2.7 - 0.4) + Math.sin(z * 4.2 + x * 1.7) * 0.7 + Math.cos(y * 5.1 + z * 2.2) * 0.45
      kind[i] = land > 0.32 ? 1 : 0
      rnd[i] = rand()
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('kind', new BufferAttribute(kind, 1))
    geo.setAttribute('rnd', new BufferAttribute(rnd, 1))
    const dots = new Points(
      geo,
      new ShaderMaterial({
        uniforms: this.globeUniforms,
        vertexShader: `attribute float kind; attribute float rnd; uniform vec3 sun; uniform vec3 ao; uniform float time; uniform float scale; uniform float power; varying vec3 vC;
void main(){ vec3 n = normalize(position); float day = smoothstep(-0.2, 0.4, dot(n, sun));
  vec3 ocean = mix(vec3(0.02, 0.05, 0.12), vec3(0.07, 0.22, 0.44), day);
  vec3 land = mix(vec3(0.03, 0.09, 0.08), vec3(0.22, 0.68, 0.42), day);
  vec3 c = mix(ocean, land, kind);
  float city = kind * step(0.8, rnd) * (1.0 - day);
  c += city * vec3(1.0, 0.7, 0.34) * (0.65 + 0.35 * sin(time * 1.7 + rnd * 40.0));
  float inAo = smoothstep(0.955, 0.99, dot(n, ao));
  c += inAo * vec3(0.06, 0.3, 0.42) * (0.7 + 0.3 * sin(time * 1.3 + rnd * 6.0)) * power;
  c *= mix(1.0, 0.35 + 0.65 * power, inAo);
  vC = c; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, (kind > 0.5 ? 0.021 : 0.015) * (1.0 + city * 0.5) * scale / -mv.z); }`,
        fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.25, d)); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.scene.add(dots)

    const air = new Mesh(
      new SphereGeometry(1.15, 56, 36),
      new ShaderMaterial({
        uniforms: this.airUniforms,
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){ vW = normalize(position); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 sun; uniform vec3 tint; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){ float c = clamp(-dot(vN, vV) / 0.5, 0.0, 1.0); float lit = 0.3 + 0.7 * smoothstep(-0.35, 0.5, dot(vW, sun)); gl_FragColor = vec4(tint, c * c * 0.85 * lit); }`,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.scene.add(air)

    // The orbit: a full ring, drawn as dashes so it reads as a track.
    const track: number[] = []
    for (let i = 0; i < 180; i += 1) {
      if (i % 3 === 2) continue
      for (const a of [i, i + 1]) {
        const p = onRing((a / 180) * Math.PI * 2, this.tmp)
        track.push(p.x, p.y, p.z)
      }
    }
    const ringGeo = new BufferGeometry()
    ringGeo.setAttribute('position', new BufferAttribute(new Float32Array(track), 3))
    this.scene.add(new LineSegments(ringGeo, new LineBasicMaterial({ color: C.sky, transparent: true, opacity: 0.32 })))

    this.scene.add(new HemisphereLight(0x9cc4ff, 0x0b1322, 1.5), this.sunLight)
  }

  protected buildStars(): Points {
    const n = 900
    const pos = new Float32Array(n * 3)
    let seed = 11
    const rand = () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < n; i += 1) {
      this.tmp
        .set(rand() - 0.5, rand() - 0.5, rand() - 0.5)
        .normalize()
        .multiplyScalar(45 + rand() * 25)
      pos[i * 3] = this.tmp.x
      pos[i * 3 + 1] = this.tmp.y
      pos[i * 3 + 2] = this.tmp.z
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    return new Points(
      geo,
      new ShaderMaterial({
        uniforms: { px: { value: 1 } },
        vertexShader: `uniform float px; varying float vT; void main(){ vT = fract(position.x * 7.3 + position.y * 3.1); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = px * (1.2 + vT * 1.6); }`,
        fragmentShader: `varying float vT; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(mix(vec3(0.56, 0.64, 0.78), vec3(0.9, 0.93, 1.0), vT), (0.35 + vT * 0.6) * smoothstep(0.5, 0.15, d)); }`,
        transparent: true,
        depthWrite: false,
      }),
    )
  }

  protected buildColdveil(): void {
    const g = this.coldveil
    g.position.copy(COLDVEIL_AT)
    g.add(new Mesh(new OctahedronGeometry(0.2), new MeshBasicMaterial({ color: C.threat, wireframe: true })))
    g.add(new Mesh(new OctahedronGeometry(0.085), new MeshBasicMaterial({ color: 0xffb0a8 })))
    for (const [r, tilt] of [
      [0.3, 0.5],
      [0.36, -0.9],
    ]) {
      const ring = new Mesh(new TorusGeometry(r, 0.004, 6, 56), new MeshBasicMaterial({ color: C.threat, transparent: true, opacity: 0.6 }))
      ring.rotation.x = tilt
      g.add(ring)
    }
    this.coldGlow.scale.setScalar(0.9)
    g.add(this.coldGlow)
    this.scene.add(g)
  }

  protected makeShield(body: Body, tone: 'defense' | 'response'): Shield {
    const r = body.radius * 1.5
    const uniforms = { color: { value: new Color(tone === 'defense' ? C.shield : C.go) }, power: { value: 0 }, alpha: { value: 0 } }
    const shell = new Mesh(
      new SphereGeometry(r, 28, 18),
      new ShaderMaterial({ uniforms, vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    )
    const wire = new LineSegments(new EdgesGeometry(new OctahedronGeometry(r * 1.02, 2)), new LineBasicMaterial({ color: uniforms.color.value, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
    const group = new Group()
    group.add(shell, wire)
    group.visible = false
    body.root.add(group)
    return { group, wire, uniforms, up: 0, want: 0, flash: 0, tone }
  }

  // ---------------------------------------------------------------- state

  setAssets(list: readonly TheaterAsset[]): void {
    const count: Partial<Record<TheaterKind, number>> = {}
    for (const a of list) {
      if (this.bodies.has(a.id)) continue
      const n = count[a.kind] ?? [...this.bodies.values()].filter((b) => b.kind === a.kind).length
      count[a.kind] = n + 1
      const slots = STATIONS[a.kind]
      const station = slots[n % slots.length]
      const model = a.kind === 'drone' ? buildDrone() : a.kind === 'groundStation' ? buildStation() : buildSat(a.kind === 'rpoSat')
      const root = new Group()
      root.add(model)
      const reticle = new Mesh(new RingGeometry(0.94, 1, 64), new MeshBasicMaterial({ color: C.threat, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: DoubleSide }))
      reticle.visible = false
      this.scene.add(root, reticle)
      const radius = a.kind === 'drone' ? 0.17 : a.kind === 'groundStation' ? 0.15 : 0.24
      const body: Body = { id: a.id, kind: a.kind, root, model, station, phase: n * 2.1 + 0.4, radius, integrity: 100, shown: 100, jolt: 0, shield: null, reticle, targeted: 0, wantTargeted: 0, link: null, jammed: false, via: null, pos: new Vector3() }
      if (a.kind !== 'groundStation') {
        body.link = new Ribbon(C.go, a.kind === 'drone' ? 5 : 9, 0.5)
        body.link.uniforms.alpha.value = 0.5
        this.scene.add(body.link.mesh)
      }
      this.bodies.set(a.id, body)
    }
    this.poseBodies(0)
  }

  setIntegrity(id: string, integrity: number): void {
    const b = this.bodies.get(id)
    if (b) b.integrity = integrity
  }

  // A condition pressing on a tile's link: it runs amber and broken.
  setJammed(id: string, jammed: boolean): void {
    const b = this.bodies.get(id)
    if (b) b.jammed = jammed
  }

  // The moves as they are aimed. A key that stays keeps its line and swings
  // it to the new target; a key that goes fades out.
  setAims(aims: readonly TheaterAim[]): void {
    for (const line of this.aims) if (!aims.some((a) => a.key === line.key)) line.gone = true
    const perTarget = new Map<string, number>()
    for (const a of aims) {
      const nth = perTarget.get(a.targetId) ?? 0
      perTarget.set(a.targetId, nth + 1)
      let line = this.aims.find((l) => l.key === a.key && !l.gone)
      if (!line) {
        const ribbon = new Ribbon(C.threat, 16, 0.55)
        ribbon.uniforms.reveal.value = 0
        ribbon.uniforms.alpha.value = 0.9
        this.scene.add(ribbon.mesh)
        line = { key: a.key, ribbon, targetId: a.targetId, blocked: a.blocked, tone: a.tone ?? 'likely', end: COLDVEIL_AT.clone(), lift: 0.7, bend: 0, fresh: 0, gone: false }
        this.aims.push(line)
      }
      line.targetId = a.targetId
      line.blocked = a.blocked
      line.tone = a.tone ?? 'likely'
      line.lift = 0.62 + nth * 0.24
      line.bend = nth === 0 ? -0.12 : nth === 1 ? 0.34 : -0.4
    }
    const hot = (a: TheaterAim) => !a.blocked && (a.tone ?? 'likely') !== 'unlikely' && a.tone !== 'unknown'
    for (const b of this.bodies.values()) b.wantTargeted = aims.some((a) => a.targetId === b.id && hot(a)) ? 1 : aims.some((a) => a.targetId === b.id) ? 0.35 : 0
  }

  setShield(id: string, tone: 'defense' | 'response' | null): void {
    const b = this.bodies.get(id)
    if (!b) return
    if (tone === null) {
      if (b.shield) b.shield.want = 0
      return
    }
    if (!b.shield || b.shield.tone !== tone) {
      if (b.shield) b.root.remove(b.shield.group)
      b.shield = this.makeShield(b, tone)
    }
    if (b.shield.want === 0) {
      b.shield.flash = 1
      this.burst(b.pos, tone === 'defense' ? C.shield : C.go, 16, 0.5, 0.5, 0.03)
    }
    b.shield.want = 1
  }

  setFocus(id: string | null): void {
    this.focusId = id
    this.easeDragHome()
    this.frame()
  }

  setBeat(beat: Beat): void {
    if (beat === this.beat) return
    this.beat = beat
    const to = beat === 'night' ? 1 : 0
    const from = this.night
    void this.tween(this.reduced ? 0.6 : beat === 'night' ? 2 : 2.6, (k) => {
      this.night = lerp(from, to, easeInOut(k))
    })
    this.frame()
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced
    this.frame()
  }

  // What the page keeps clear for the theater: the fractions of the height
  // its top chrome and its bottom sheet take, and of the width a side card
  // takes on a wide screen.
  setClear(top: number, bottom: number, right = 1): void {
    this.clearTop = top
    this.clearBottom = bottom
    this.clearRight = right
    this.frame()
  }

  // ------------------------------------------------------------- the night

  // A strike leaves COLDVEIL for its target and slows to a hold short of
  // it, where the night waits for the player's answer. Resolves at the hold.
  async launch(key: string, targetId: string, hold: boolean): Promise<void> {
    const b = this.bodies.get(targetId)
    if (!b) return
    // The strike flies the line it was aimed along, and the line goes.
    const aimed = this.aims.find((l) => l.key === key && !l.gone)
    if (aimed) aimed.gone = true
    this.clearComet()
    const ribbon = new Ribbon(C.threat, 1, 0)
    ribbon.uniforms.head.value = 0
    ribbon.uniforms.tail.value = 0.5
    const head = new Sprite(new SpriteMaterial({ map: this.glow, color: 0xffd2c8, blending: AdditiveBlending, depthWrite: false, transparent: true }))
    const core = new Mesh(new SphereGeometry(0.03, 12, 8), new MeshBasicMaterial({ color: 0xffffff }))
    this.scene.add(ribbon.mesh, head, core)
    this.comet = { ribbon, head, core, u: 0, targetId, lift: aimed?.lift ?? 0.62, bend: aimed?.bend ?? -0.12 }
    this.focusId = targetId
    this.easeDragHome()
    this.frame()
    // COLDVEIL gathers itself, then lets go.
    await this.tween(this.reduced ? 0.25 : 0.7, (k) => {
      this.coldCharge = easeIn(k)
    })
    this.coldCharge = 0
    this.flash(COLDVEIL_AT, C.threat, 1.5, 0.5)
    const comet = this.comet
    if (!comet) return
    if (hold) {
      await this.tween(this.reduced ? 0.7 : 1.25, (k) => {
        comet.u = 0.6 * easeOut(k)
      })
    } else {
      await this.tween(this.reduced ? 0.5 : 0.75, (k) => {
        comet.u = 0.42 * k
      })
    }
  }

  // The strike finishes its run and lands as the engine resolved it:
  // broken on the shield, half through, or a hit. Resolves on the impact.
  async land(impact: Impact, run = 0.48): Promise<void> {
    const comet = this.comet
    if (!comet) return
    const b = this.bodies.get(comet.targetId)
    if (!b) return
    const from = comet.u
    // A blocked strike stops at the shield's surface, not the hull.
    const stop = impact === 'hit' ? 1 : 0.955
    await this.tween(this.reduced ? Math.min(run, 0.4) : run, (k) => {
      comet.u = lerp(from, stop, easeIn(k))
    })
    const at = comet.ribbon.at(stop, this.tmp3).clone()
    this.clearComet()
    if (impact === 'blocked') {
      if (b.shield) b.shield.flash = 1.6
      this.flash(at, 0xdffaff, 1.1, 0.4)
      this.ring(at, C.shield, 0.75, 0.6)
      this.shatter(at, b.pos, C.shield, 70)
      this.freeze = this.reduced ? 0 : 0.07
    } else {
      const half = impact === 'halved'
      if (b.shield && half) b.shield.flash = 1.2
      this.flash(b.pos, half ? C.amber : 0xffc2b0, half ? 1 : 1.5, 0.5)
      this.ring(b.pos, half ? C.amber : C.threat, half ? 0.7 : 1.05, 0.7)
      this.burst(b.pos, half ? C.amber : C.threat, half ? 26 : 54, 1.3, 0.9, 0.04)
      this.burst(b.pos, 0xffe2b0, 14, 0.7, 0.5, 0.025)
      b.jolt = half ? 0.6 : 1
      if (!this.reduced) this.shake = half ? 0.5 : 1
      this.freeze = this.reduced ? 0 : 0.09
    }
  }

  // A response's shield has done its night's work; a defense's stays up.
  dropResponseShields(): void {
    for (const b of this.bodies.values()) if (b.shield?.tone === 'response') b.shield.want = 0
  }

  protected clearComet(): void {
    const c = this.comet
    if (!c) return
    this.scene.remove(c.ribbon.mesh, c.head, c.core)
    c.ribbon.mesh.geometry.dispose()
    this.comet = null
  }

  // ------------------------------------------------------------------ fx

  protected flash(at: Vector3, color: number, size: number, dur: number): void {
    const f = this.flashes.reduce((a, b) => (a.t >= b.t ? a : b))
    f.sprite.position.copy(at)
    f.sprite.material.color.setHex(color)
    f.t = 0
    f.dur = dur
    f.size = size
    f.sprite.visible = true
  }

  protected ring(at: Vector3, color: number, size: number, dur: number): void {
    const r = this.rings.reduce((a, b) => (a.t >= b.t ? a : b))
    // Reduce Motion: a small, short ring, not a wave across the globe.
    if (this.reduced) {
      size *= 0.45
      dur = Math.min(dur, 0.35)
    }
    r.mesh.position.copy(at)
    ;(r.mesh.material as MeshBasicMaterial).color.setHex(color)
    r.t = 0
    r.dur = dur
    r.size = size
    r.mesh.visible = true
  }

  protected burst(at: Vector3, color: number, n: number, speed: number, life: number, size: number): void {
    const count = this.reduced || this.low ? Math.ceil(n / 3) : n
    this.col.setHex(color)
    for (let i = 0; i < count; i += 1) {
      this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const s = speed * (0.35 + Math.random() * 0.65)
      this.sparks.emit(at, this.tmp.x * s, this.tmp.y * s, this.tmp.z * s, this.col, life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.8))
    }
  }

  // A strike breaking on a shield: shards skid away across its surface.
  protected shatter(at: Vector3, centre: Vector3, color: number, n: number): void {
    const count = this.reduced ? Math.ceil(n / 3) : n
    const out = this.tmp2.copy(at).sub(centre).normalize()
    for (let i = 0; i < count; i += 1) {
      this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      // Mostly sideways along the shell, a little back the way it came.
      this.tmp.addScaledVector(out, -this.tmp.dot(out) * 0.8).normalize()
      this.tmp.addScaledVector(out, 0.25 + Math.random() * 0.5)
      const s = 0.5 + Math.random() * 1.5
      this.col.setHex(i % 4 === 0 ? 0xffffff : i % 4 === 1 ? C.threat : color)
      this.sparks.emit(at, this.tmp.x * s, this.tmp.y * s, this.tmp.z * s, this.col, 0.45 + Math.random() * 0.7, 0.028 + Math.random() * 0.03, 2.8)
    }
  }

  // --------------------------------------------------------------- camera

  protected frameWide(): void {
    const aspect = this.w / this.h
    const clearH = Math.max(0.3, this.clearBottom - this.clearTop)
    const clearW = Math.max(0.4, this.clearRight)
    // At dawn the score stands under the globe, so the frame makes room.
    const dawn = this.beat === 'dawn'
    this.want.dist = Math.max(HALF_W / (TAN * aspect * clearW), (HALF_H + (dawn ? 0.42 : 0)) / (TAN * clearH)) * 1.04
    this.want.az = dawn ? 0.14 : 0
    this.want.el = 0.3
    this.want.look.copy(CENTRE)
    if (dawn) this.want.look.y -= 0.36
  }

  // Where the camera should be for what is happening: the whole theater,
  // or closer on the tile in focus (never under Reduce Motion, which keeps
  // the one framing).
  protected frame(): void {
    this.frameWide()
    if (this.shot) {
      this.want.az = this.shot.az
      this.want.el = this.shot.el
      this.want.dist *= this.shot.dist
      this.want.look.y += this.shot.lookY
      return
    }
    const b = this.focusId ? this.bodies.get(this.focusId) : undefined
    if (!b || this.reduced) return
    const wide = this.want.dist
    const aspect = this.w / this.h
    const clearH = Math.max(0.3, this.clearBottom - this.clearTop)
    // Closer than the whole theater: a round patch of it about the tile,
    // sized to what the chrome leaves clear.
    const near = (r: number) => Math.min(wide, Math.max(r / (TAN * aspect * Math.max(0.4, this.clearRight)), r / (TAN * clearH)))
    if (this.comet) {
      // A strike: between the tile and where the strike comes from, close
      // enough to see the shield and far enough to see it coming.
      this.want.look.copy(b.pos).lerp(COLDVEIL_AT, 0.2).lerp(CENTRE, 0.25)
      this.want.dist = near(1.42)
      this.want.az = clamp(Math.atan2(b.pos.x, b.pos.z + 1.2) * 0.5, -0.5, 0.5) + 0.12
      this.want.el = 0.36
    } else {
      this.want.look.copy(CENTRE).lerp(b.pos, 0.5)
      this.want.dist = near(1.5)
      this.want.az = clamp(Math.atan2(b.pos.x, b.pos.z + 1.6) * 0.45, -0.45, 0.45)
      this.want.el = 0.33
    }
  }

  protected easeDragHome(): void {
    const from = { az: this.drag.az, el: this.drag.el, zoom: this.drag.zoom }
    if (Math.abs(from.az) + Math.abs(from.el) + Math.abs(from.zoom - 1) < 0.01) return
    void this.tween(0.7, (k) => {
      if (this.drag.held) return
      const e = easeInOut(k)
      this.drag.az = lerp(from.az, 0, e)
      this.drag.el = lerp(from.el, 0, e)
      this.drag.zoom = lerp(from.zoom, 1, e)
    })
  }

  protected onDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.onPress?.()
    this.canvas.setPointerCapture?.(e.pointerId)
    this.drag.held = true
    this.drag.x = e.clientX
    this.drag.y = e.clientY
    this.drag.moved = 0
    this.pinch = 0
  }

  protected onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    if (this.pointers.size === 2) {
      p.x = e.clientX
      p.y = e.clientY
      const [a, b] = [...this.pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.pinch > 0) this.drag.zoom = clamp(this.drag.zoom * (this.pinch / d), 0.55, 1.35)
      this.pinch = d
      this.drag.moved = 99
      return
    }
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    this.drag.moved += Math.abs(dx) + Math.abs(dy)
    this.drag.az = clamp(this.drag.az - dx * 0.006, -1.3, 1.3)
    this.drag.el = clamp(this.drag.el + dy * 0.005, -0.5, 0.85)
  }

  protected onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size === 0) {
      this.drag.held = false
      if (this.drag.moved < 6) this.onTapEmpty?.()
    }
    this.pinch = 0
  }

  protected onWheel = (e: WheelEvent): void => {
    this.drag.zoom = clamp(this.drag.zoom * (1 + e.deltaY * 0.001), 0.55, 1.35)
  }

  // ----------------------------------------------------------------- loop

  tween(dur: number, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      if (this.dead) return
      fn(0)
      this.tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, done })
    })
  }

  wait(sec: number): Promise<void> {
    return this.tween(sec, () => {})
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.w = w
    this.h = h
    const ratio = this.low ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    const lay = w > h * 1.15 ? LAYOUT.wide : LAYOUT.tall
    COLDVEIL_AT.fromArray(lay.foe)
    CENTRE.fromArray(lay.centre)
    HALF_W = lay.halfW
    HALF_H = lay.halfH
    this.coldveil.position.copy(COLDVEIL_AT)
    const px = (h * ratio) / (2 * TAN)
    this.globeUniforms.scale.value = px
    this.sparks.uniforms.scale.value = px
    ;(this.stars.material as ShaderMaterial).uniforms.px.value = ratio
    this.frame()
  }

  setRunning(on: boolean): void {
    if (this.dead || on === this.running) return
    this.running = on
    if (on) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    } else cancelAnimationFrame(this.raf)
  }

  protected tick = (now: number): void => {
    if (!this.running || this.dead) return
    this.raf = requestAnimationFrame(this.tick)
    // Low power draws every other frame.
    this.skip = this.low && !this.skip
    if (this.skip) return
    const real = Math.min(this.low ? 0.1 : 0.05, (now - this.last) / 1000)
    this.last = now
    // A hit stops the world for a few frames: that is its weight.
    let dt = real
    if (this.freeze > 0) {
      this.freeze -= real
      dt = real * 0.05
    }
    this.step(dt, real)
    this.renderer.render(this.scene, this.camera)
    this.placeAll()
  }

  // One frame, drawn now: for a capture, and for the first paint.
  renderOnce(): void {
    if (this.dead) return
    this.step(0, 0)
    this.renderer.render(this.scene, this.camera)
    this.placeAll()
  }

  protected poseBodies(time: number): void {
    const calm = this.reduced ? 0 : 1
    for (const b of this.bodies.values()) {
      const s = b.station
      if (b.kind === 'groundStation') {
        onGlobe(s[0], s[1], 1, b.pos)
        b.root.position.copy(b.pos)
        b.root.up.set(0, 1, 0)
        // Stand on the surface: its own up is the globe's normal.
        b.root.quaternion.setFromUnitVectors(this.tmp.set(0, 1, 0), this.tmp2.copy(b.pos).normalize())
        b.pos.multiplyScalar(1.1)
      } else if (b.kind === 'drone') {
        const a = time * 0.42 * calm + b.phase
        const lat = s[0] + Math.sin(a) * 0.035
        const lon = s[1] + Math.cos(a) * 0.05
        onGlobe(lat, lon, 1.15, b.pos)
        b.root.position.copy(b.pos)
        onGlobe(s[0] + Math.sin(a + 0.3) * 0.035, s[1] + Math.cos(a + 0.3) * 0.05, 1.15, this.tmp)
        b.root.up.copy(b.pos).normalize()
        b.root.lookAt(this.tmp)
        b.model.rotation.z = 0.35
      } else {
        const a = s[0] + Math.sin(time * 0.21 + b.phase) * 0.035 * calm
        onRing(a, b.pos)
        b.root.position.copy(b.pos)
        b.root.up.copy(b.pos).normalize()
        b.root.lookAt(onRing(a + 0.2, this.tmp))
        b.model.rotation.z = Math.sin(time * 0.3 + b.phase) * 0.08 * calm
      }
      if (b.jolt > 0) {
        b.root.position.addScaledVector(this.tmp.copy(b.pos).normalize(), -0.05 * b.jolt * Math.sin(b.jolt * 14))
        b.model.rotation.x = b.jolt * 0.5 * Math.sin(b.jolt * 20)
      } else b.model.rotation.x = 0
    }
  }

  protected curve(ribbon: Ribbon, end: Vector3, lift: number, bend: number): void {
    const mid = this.tmp.copy(COLDVEIL_AT).add(end).multiplyScalar(0.5)
    const out = this.tmp2.copy(mid).normalize()
    mid.addScaledVector(out, lift)
    mid.x += bend
    ribbon.set(COLDVEIL_AT, mid, end)
  }

  protected step(dt: number, real: number): void {
    this.time += dt
    const time = this.time
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const tw = this.tweens[i]
      tw.t += dt
      const k = Math.min(1, tw.t / tw.dur)
      tw.fn(k)
      if (k >= 1) {
        this.tweens.splice(i, 1)
        tw.done()
      }
    }

    // The sun: the night turns the area of operations dark and the lights
    // on the ground come up; dawn brings it back.
    this.sun.copy(SUN_DAY).lerp(SUN_NIGHT, this.night).normalize()
    this.sunLight.position.copy(this.sun).multiplyScalar(10)
    this.sunLight.intensity = lerp(2.4, 0.9, this.night)
    this.sunLight.color.setRGB(lerp(1, 0.62, this.night), lerp(0.97, 0.74, this.night), 1)
    this.airUniforms.tint.value.setRGB(lerp(0.35, 0.5, this.night), lerp(0.66, 0.4, this.night), lerp(1, 0.95, this.night))
    this.globeUniforms.time.value = time

    // The camera eases to where it is wanted; the player's drag rides on top.
    const k = this.reduced ? 1 - Math.pow(0.0005, real) : 1 - Math.pow(0.06, real)
    const cam = this.cam
    cam.az += (this.want.az - cam.az) * k
    cam.el += (this.want.el - cam.el) * k
    cam.dist += (this.want.dist - cam.dist) * k
    cam.look.lerp(this.want.look, k)
    const sway = this.reduced ? 0 : Math.sin(time * 0.17) * 0.035
    const az = cam.az + this.drag.az + sway
    const el = clamp(cam.el + this.drag.el, -0.3, 1.25)
    const dist = cam.dist * this.drag.zoom
    this.camPos.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist).add(cam.look)
    this.camera.position.copy(this.camPos)
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - real * 2.6)
      const s = this.shake * this.shake * 0.06 * dist * 0.1
      this.camera.position.x += Math.sin(time * 71) * s
      this.camera.position.y += Math.cos(time * 83) * s
    }
    this.camera.lookAt(cam.look)
    // The theater sits in what the page leaves clear: up from the sheet on
    // a phone, left of the card on a wide screen.
    const oy = ((1 - this.clearBottom - this.clearTop) / 2) * this.h
    const ox = ((1 - this.clearRight) / 2) * this.w
    this.camera.setViewOffset(this.w, this.h, ox, oy, this.w, this.h)

    this.poseBodies(time)
    const gs = [...this.bodies.values()].find((b) => b.kind === 'groundStation')

    for (const b of this.bodies.values()) {
      b.jolt = Math.max(0, b.jolt - dt * 1.6)
      b.shown += (b.integrity - b.shown) * Math.min(1, dt * 5)
      // A hurt tile throws the odd spark.
      if (b.integrity < 100 && !this.reduced && Math.random() < dt * (100 - b.integrity) * 0.09) this.burst(b.pos, C.amber, 1, 0.25, 0.5, 0.022)
      b.targeted += (b.wantTargeted - b.targeted) * Math.min(1, dt * 6)
      const ret = b.reticle
      ret.visible = b.targeted > 0.02
      if (ret.visible) {
        ret.position.copy(b.pos)
        ret.quaternion.copy(this.camera.quaternion)
        const pulse = this.reduced ? 1 : 1 + Math.sin(time * 4.2) * 0.07
        ret.scale.setScalar(b.radius * 1.32 * pulse)
        ret.rotation.z = time * 0.6
        ;(ret.material as MeshBasicMaterial).opacity = b.targeted * 0.75
      }
      const sh = b.shield
      if (sh) {
        sh.up += (sh.want - sh.up) * Math.min(1, dt * (sh.want ? 7 : 3.2))
        sh.flash = Math.max(0, sh.flash - dt * 2.2)
        sh.group.visible = sh.up > 0.01
        if (sh.group.visible) {
          const pop = sh.want ? backOut(clamp(sh.up, 0, 1)) : sh.up
          sh.group.scale.setScalar(Math.max(0.01, pop) * (1 + sh.flash * 0.07))
          sh.group.rotation.y = time * 0.35
          sh.group.rotation.x = time * 0.21
          sh.uniforms.alpha.value = sh.up * (0.5 + 0.08 * Math.sin(time * 2.6))
          sh.uniforms.power.value = sh.flash
          ;(sh.wire.material as LineBasicMaterial).opacity = sh.up * (0.3 + sh.flash * 0.6)
        }
      }
      if (b.link && gs) {
        // Up from the dish; a link the globe hides is not drawn.
        const from = this.tmp3.copy(gs.pos)
        const seen = this.tmp.copy(b.pos).sub(from).dot(from) > -0.15
        b.link.mesh.visible = seen
        if (seen) {
          const relay = b.via ? this.bodies.get(b.via) : undefined
          // A rerouted link bends out through its relay.
          const mid = relay ? this.tmp.copy(relay.pos).multiplyScalar(2).addScaledVector(from, -0.5).addScaledVector(b.pos, -0.5) : this.tmp.copy(from).add(b.pos).multiplyScalar(0.5)
          if (!relay) mid.addScaledVector(this.tmp2.copy(mid).normalize(), b.kind === 'drone' ? 0.06 : 0.16)
          b.link.set(from, mid, b.pos)
          b.link.update(this.camPos, 0.008)
          const u = b.link.uniforms
          u.time.value = time
          ;(u.color.value as Color).setHex(b.jammed ? C.amber : C.go)
          u.flow.value = b.jammed ? 0.08 : 0.5
          u.alpha.value = b.jammed ? 0.35 + 0.25 * Math.sin(time * 23) : 0.42
        }
      }
    }

    // The aimed moves: each line swings to its target and stops on a
    // shield that will hold it.
    for (let i = this.aims.length - 1; i >= 0; i -= 1) {
      const line = this.aims[i]
      const b = this.bodies.get(line.targetId)
      const u = line.ribbon.uniforms
      if (line.gone || !b) {
        u.alpha.value = line.ribbon.num('alpha') - dt * 3
        if (line.ribbon.num('alpha') <= 0) {
          this.scene.remove(line.ribbon.mesh)
          line.ribbon.mesh.geometry.dispose()
          this.aims.splice(i, 1)
          continue
        }
      } else {
        line.fresh = Math.min(1, line.fresh + dt * (this.reduced ? 4 : 1.1))
        u.reveal.value = easeOut(line.fresh)
        const stop = line.blocked ? this.tmp.copy(COLDVEIL_AT).sub(b.pos).normalize().multiplyScalar(b.radius * 1.5).add(b.pos) : this.tmp.copy(b.pos)
        line.end.lerp(stop, Math.min(1, dt * 5))
        u.alpha.value = lerp(line.ribbon.num('alpha'), line.blocked ? 0.4 : AIM_ALPHA[line.tone], Math.min(1, dt * 4))
        ;(u.color.value as Color).lerp(this.col.setHex(AIM_HEX[line.tone]), Math.min(1, dt * 6))
        u.fadeEnd.value = 0
      }
      this.curve(line.ribbon, line.end, line.lift, line.bend)
      line.ribbon.update(this.camPos, 0.013)
      u.time.value = time
    }

    const comet = this.comet
    if (comet) {
      const b = this.bodies.get(comet.targetId)
      if (b) {
        this.curve(comet.ribbon, b.pos, comet.lift, comet.bend)
        comet.ribbon.update(this.camPos, 0.03)
        comet.ribbon.uniforms.head.value = comet.u
        const at = comet.ribbon.at(comet.u, this.tmp3)
        comet.head.position.copy(at)
        comet.core.position.copy(at)
        const pulse = 1 + Math.sin(time * 9) * 0.12
        comet.head.scale.setScalar(0.42 * pulse)
        comet.head.visible = comet.core.visible = comet.u > 0.01
        if (comet.u > 0.01 && !this.reduced && Math.random() < dt * 50) {
          this.col.setHex(Math.random() < 0.5 ? C.threat : 0xffc2a8)
          this.sparks.emit(at, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, this.col, 0.5, 0.03)
        }
      }
    }

    // COLDVEIL turns, and swells as it gathers a strike.
    const cv = this.coldveil
    cv.rotation.y = time * 0.6
    cv.children[0].rotation.x = time * 0.35
    cv.children[2].rotation.z = time * 0.8
    cv.children[3].rotation.z = -time * 0.55
    const heat = 0.55 + this.night * 0.25 + this.coldCharge * 0.9
    this.coldGlow.scale.setScalar(0.75 + heat * 0.7 + Math.sin(time * 2.2) * 0.05)
    this.coldGlow.material.opacity = Math.min(1, heat)
    cv.scale.setScalar(1 + this.coldCharge * 0.3)

    for (const f of this.flashes) {
      if (f.t >= 1) continue
      f.t = Math.min(1, f.t + dt / f.dur)
      f.sprite.scale.setScalar(f.size * (0.5 + easeOut(f.t)))
      f.sprite.material.opacity = (1 - f.t) ** 2
      if (f.t >= 1) f.sprite.visible = false
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue
      r.t = Math.min(1, r.t + dt / r.dur)
      r.mesh.quaternion.copy(this.camera.quaternion)
      r.mesh.scale.setScalar(r.size * (0.15 + easeOut(r.t)))
      ;(r.mesh.material as MeshBasicMaterial).opacity = (1 - r.t) * 0.9
      if (r.t >= 1) r.mesh.visible = false
    }
    this.sparks.step(dt)
    this.stars.rotation.y = this.reduced ? 0 : time * 0.004
  }

  protected placeOne(key: string, at: Vector3): void {
    const p = this.tmp.copy(at).project(this.camera)
    // Behind the globe, as seen from the camera: not shown.
    const toCam = this.tmp2.copy(this.camPos).sub(at)
    const d = toCam.length()
    toCam.divideScalar(d)
    const along = -at.dot(toCam)
    const hidden = along > 0 && along < d && at.lengthSq() - along * along < 0.97
    this.place(key, (p.x * 0.5 + 0.5) * this.w, (-p.y * 0.5 + 0.5) * this.h, p.z < 1 && !hidden)
  }

  protected placeAll(): void {
    for (const b of this.bodies.values()) this.placeOne(b.id, b.pos)
    this.placeOne('coldveil', COLDVEIL_AT)
    this.placeOne('score', SCORE_AT)
    if (this.comet) this.placeOne('comet', this.comet.ribbon.at(this.comet.u, this.tmp3))
    else this.place('comet', 0, 0, false)
  }

  // What a capture or a test needs to know of the frame.
  stats(): { calls: number; triangles: number; points: number } {
    const r = this.renderer.info.render
    return { calls: r.calls, triangles: r.triangles, points: r.points }
  }

  dispose(): void {
    this.dead = true
    this.running = false
    cancelAnimationFrame(this.raf)
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('wheel', this.onWheel)
    this.scene.traverse((o: Object3D) => {
      const m = o as Mesh
      m.geometry?.dispose?.()
      const mat = m.material as { dispose?: () => void } | { dispose?: () => void }[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose?.())
      else mat?.dispose?.()
    })
    this.glow.dispose()
    this.renderer.dispose()
  }
}
