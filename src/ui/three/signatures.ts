// THE SIGNATURES (v2.0 R1): each of the deck's 18 threats has a look of its
// own in the world, so a player learns to tell them apart on sight, which
// is the lesson (jamming is a cone of noise, spoofing a ghost twin of the
// thing it lies about, exfiltration data leaving a link sideways). The
// same 17 forms are drawn small for the contact chips and the Dossier
// (glyphs.tsx), in the same colours, so the chip and the world agree.
//
// Imperative, and built from a handful of parts (a noise cone, a ghost
// clone, rings, ribbons, the shared particle pool), so 18 looks cost a few
// draw calls each and only the ones on screen exist.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type CanvasTexture,
  type PerspectiveCamera,
  type Scene,
} from 'three/src/Three.js'
import { Ribbon, onGlobe, type Sparks } from './theater'

export type Form = 'cone' | 'twin' | 'ticks' | 'beam' | 'phantom' | 'mask' | 'drip' | 'seed' | 'rogue' | 'echo' | 'listen' | 'siphon' | 'cage' | 'hook' | 'inside' | 'debris' | 'chain'

// One look a threat: its form, its colour, and the plain name of the look
// for a screen reader ("a cone of noise").
export const SIGNATURE: Record<string, { form: Form; color: number; look: string; wide?: boolean }> = {
  'pnt-jamming': { form: 'cone', color: 0xffb547, look: 'a wide cone of noise', wide: true },
  'uplink-jamming': { form: 'cone', color: 0xff5a4f, look: 'a narrow cone of noise on a link' },
  'gnss-spoofing': { form: 'twin', color: 0x7de3ff, look: 'a ghost twin drifting off the real one' },
  'time-spoof': { form: 'ticks', color: 0xffd35a, look: 'a clock ring that skips' },
  'lidar-dazzle': { form: 'beam', color: 0xe6ccff, look: 'a blinding beam' },
  'lidar-injection': { form: 'phantom', color: 0xff8ad8, look: 'phantom shapes that are not there' },
  'lidar-blinding': { form: 'mask', color: 0x8f7bff, look: 'a dark patch that hides what is there' },
  'training-data-poisoning': { form: 'drip', color: 0xb26bff, look: 'a tainted stream climbing a link' },
  'supply-chain-implant': { form: 'seed', color: 0xff3d6a, look: 'a pulse beating inside the asset' },
  'rogue-ground-station': { form: 'rogue', color: 0xff5a4f, look: 'a second dish sending its own link' },
  'telemetry-replay': { form: 'echo', color: 0x9ad1ff, look: 'rings looping back down a link' },
  'downlink-eavesdropping': { form: 'listen', color: 0xa9a0ff, look: 'a quiet listener under the beam' },
  'backhaul-exfil': { form: 'siphon', color: 0xff7a4f, look: 'data streaming off a link' },
  'ground-ransomware': { form: 'cage', color: 0xff5a4f, look: 'a cage locking around the station' },
  'ops-phishing': { form: 'hook', color: 0xffd35a, look: 'a baited line dropped on the station' },
  'insider-exfil': { form: 'inside', color: 0xffc46b, look: 'data leaving from the inside' },
  'debris-conjunction': { form: 'debris', color: 0xc9d4e0, look: 'tumbling debris on a crossing orbit' },
  'blackout-chain': { form: 'chain', color: 0xff3d3d, look: 'a cone of noise, then phantom shapes' },
}

export interface SigHost {
  scene: Scene
  sparks: Sparks
  glow: CanvasTexture
  camera: PerspectiveCamera
  foe: Vector3
  // The ground station's place, when the fleet has one.
  station(): Vector3 | null
  // Reduce Motion or low power: no flicker, a third of the particles.
  quiet(): boolean
}
export interface SigTarget {
  pos: Vector3
  radius: number
  model: Group
}

const additive = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
const UP = new Vector3(0, 1, 0)

const NOISE_FRAG = `uniform vec3 color; uniform float time; uniform float alpha; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){ vec2 g = floor(vUv * vec2(46.0, 30.0) + vec2(0.0, floor(time * 14.0) * 3.0));
  float n = h(g + floor(time * 9.0)); float band = 0.5 + 0.5 * sin(vUv.y * 40.0 - time * 9.0);
  gl_FragColor = vec4(color, alpha * (0.08 + 0.55 * step(0.6, n) + 0.2 * band) * smoothstep(1.0, 0.55, vUv.y)); }`
const NOISE_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

export class Signature {
  readonly eventId: string
  private host: SigHost
  private target: SigTarget
  private parts: Object3D[] = []
  private ribbons: Ribbon[] = []
  private steps: ((dt: number, time: number, k: number) => void)[] = []
  private col = new Color()
  private a = new Vector3()
  private b = new Vector3()
  private c = new Vector3()
  private q = new Quaternion()
  private acc = 0
  // 0 to 1: how strongly it shows. A lingering condition sits low.
  level = 1

  constructor(host: SigHost, eventId: string, target: SigTarget) {
    this.host = host
    this.eventId = eventId
    this.target = target
    const spec = SIGNATURE[eventId]
    if (!spec) return
    this.col.setHex(spec.color)
    this.build(spec.form, spec.color, !!spec.wide)
  }

  private add<T extends Object3D>(o: T): T {
    this.parts.push(o)
    this.host.scene.add(o)
    return o
  }

  private ribbon(color: number, dashes: number, flow: number): Ribbon {
    const r = new Ribbon(color, dashes, flow)
    this.ribbons.push(r)
    this.host.scene.add(r.mesh)
    return r
  }

  // A few particles a second, fewer when the host is quiet.
  private rate(dt: number, perSec: number, k: number): number {
    this.acc += dt * perSec * k * (this.host.quiet() ? 0.34 : 1)
    const n = Math.floor(this.acc)
    this.acc -= n
    return n
  }

  private emit(at: Vector3, to: Vector3, speed: number, life: number, size: number, jitter = 0.05): void {
    const v = this.b.copy(to).sub(at).normalize().multiplyScalar(speed)
    this.host.sparks.emit(at, v.x + (Math.random() - 0.5) * jitter, v.y + (Math.random() - 0.5) * jitter, v.z + (Math.random() - 0.5) * jitter, this.col, life, size, 0.2)
  }

  private build(form: Form, color: number, wide: boolean): void {
    const t = this.target
    const r = t.radius
    const host = this.host
    if (form === 'cone' || form === 'chain') {
      // A cone of noise from COLDVEIL's side onto the target.
      const uniforms = { color: { value: new Color(color) }, time: { value: 0 }, alpha: { value: 0 } }
      const cone = this.add(new Mesh(new ConeGeometry(1, 1, 28, 1, true), new ShaderMaterial({ uniforms, vertexShader: NOISE_VERT, fragmentShader: NOISE_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide })))
      const len = wide || form === 'chain' ? 1.15 : 0.95
      const spread = wide || form === 'chain' ? r * 2.4 : r * 1.0
      this.steps.push((dt, time, k) => {
        const dir = this.a.copy(host.foe).sub(t.pos).normalize()
        cone.position.copy(t.pos).addScaledVector(dir, len / 2)
        cone.quaternion.setFromUnitVectors(UP, dir)
        cone.scale.set(spread, len, spread)
        uniforms.time.value = host.quiet() ? 0 : time
        uniforms.alpha.value = k * 0.5
        for (let i = this.rate(dt, 26, k); i > 0; i -= 1) {
          this.c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 1.6).add(t.pos)
          host.sparks.emit(this.c, 0, 0, 0, this.col, 0.12 + Math.random() * 0.12, 0.02 + Math.random() * 0.02)
        }
      })
    }
    if (form === 'twin') {
      // A ghost of the asset, sliding off where the real one is.
      const mat = additive(color, 0.5)
      const ghost = t.model.clone(true)
      ghost.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh) m.material = mat
      })
      this.parts.push(ghost)
      host.scene.add(ghost)
      const beam = this.ribbon(color, 22, 1.4)
      this.steps.push((_dt, time, k) => {
        const side = this.a.copy(t.pos).cross(UP).normalize()
        const drift = host.quiet() ? 1 : 0.65 + 0.35 * Math.sin(time * 1.3)
        ghost.position.copy(t.pos).addScaledVector(side, r * 1.5 * drift * k).addScaledVector(UP, r * 0.35 * k)
        t.model.getWorldQuaternion(this.q)
        ghost.quaternion.copy(this.q)
        mat.opacity = k * (host.quiet() ? 0.5 : 0.36 + 0.2 * Math.sin(time * 7))
        beam.set(host.foe, this.b.copy(host.foe).add(ghost.position).multiplyScalar(0.5).addScaledVector(UP, 0.3), ghost.position)
        beam.update(host.camera.position, 0.006)
        beam.uniforms.time.value = time
        beam.uniforms.alpha.value = k * 0.6
      })
    }
    if (form === 'ticks') {
      // A clock face around the asset whose hand jumps back.
      const pts: number[] = []
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2
        const inner = i % 3 === 0 ? 0.78 : 0.88
        pts.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a), Math.sin(a), 0)
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
      const face = this.add(new LineSegments(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })))
      const handGeo = new BufferGeometry()
      handGeo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0.82, 0]), 3))
      const hand = this.add(new LineSegments(handGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })))
      this.steps.push((_dt, time, k) => {
        for (const o of [face, hand]) {
          o.position.copy(t.pos)
          o.quaternion.copy(host.camera.quaternion)
          o.scale.setScalar(r * 1.75)
        }
        // Forward 3 ticks, back 2: time that does not hold.
        const beat = Math.floor(time * 3)
        const step = host.quiet() ? 4 : beat - Math.floor(beat / 5) * 4
        hand.rotateZ(-(step / 12) * Math.PI * 2)
        ;(face.material as LineBasicMaterial).opacity = k * 0.9
        ;(hand.material as LineBasicMaterial).opacity = k
      })
    }
    if (form === 'beam') {
      // A hard bright beam and a flare on the lens.
      const beam = this.ribbon(color, 1, 0)
      beam.uniforms.dashes.value = 60
      beam.uniforms.flow.value = 6
      const flare = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color: 0xffffff, blending: AdditiveBlending, depthWrite: false, transparent: true })))
      this.steps.push((_dt, time, k) => {
        beam.set(host.foe, this.b.copy(host.foe).lerp(t.pos, 0.5), t.pos)
        beam.update(host.camera.position, 0.02 * k)
        beam.uniforms.time.value = time
        beam.uniforms.alpha.value = k
        flare.position.copy(t.pos)
        flare.scale.setScalar(r * (host.quiet() ? 4.6 : 4 + 1.2 * Math.sin(time * 17)) * k)
        flare.material.opacity = k * 0.95
      })
    }
    if (form === 'phantom' || form === 'chain') {
      // Shapes in the air that are not there.
      const ghostColor = form === 'chain' ? 0xff8ad8 : color
      const boxes: { m: LineSegments; at: Vector3; ph: number }[] = []
      for (let i = 0; i < 5; i += 1) {
        const m = this.add(new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1, 1)), new LineBasicMaterial({ color: ghostColor, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })))
        const a = (i / 5) * Math.PI * 2
        boxes.push({ m, at: new Vector3(Math.cos(a) * 1.5, 0.3 + (i % 2) * 0.5, Math.sin(a) * 1.5), ph: i * 1.7 })
      }
      this.steps.push((_dt, time, k) => {
        for (const bx of boxes) {
          const on = host.quiet() ? 0.7 : Math.max(0, Math.sin(time * 2.4 + bx.ph))
          bx.m.position.copy(t.pos).addScaledVector(bx.at, r)
          bx.m.rotation.set(time * 0.4 + bx.ph, time * 0.3, 0)
          bx.m.scale.setScalar(r * (0.34 + 0.2 * on))
          ;(bx.m.material as LineBasicMaterial).opacity = k * on * (form === 'chain' ? 0.75 : 0.95)
        }
      })
    }
    if (form === 'mask') {
      // A patch of dark over what is really there, with a faint rim.
      const dark = this.add(new Mesh(new SphereGeometry(1, 20, 14), new MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0, depthWrite: false })))
      const rim = this.add(new Mesh(new RingGeometry(0.93, 1, 48), additive(color, 0)))
      this.steps.push((_dt, time, k) => {
        const breathe = host.quiet() ? 1 : 0.9 + 0.12 * Math.sin(time * 2.2)
        dark.position.copy(t.pos)
        dark.scale.setScalar(r * 1.25 * breathe)
        ;(dark.material as MeshBasicMaterial).opacity = k * 0.86
        rim.position.copy(t.pos)
        rim.quaternion.copy(host.camera.quaternion)
        rim.scale.setScalar(r * 1.42 * breathe)
        ;(rim.material as MeshBasicMaterial).opacity = k * 0.8
      })
    }
    if (form === 'drip') {
      // A tainted stream climbing the link from the ground.
      this.steps.push((dt, _time, k) => {
        const from = host.station() ?? this.a.copy(t.pos).multiplyScalar(0.86)
        for (let i = this.rate(dt, 22, k); i > 0; i -= 1) {
          this.c.copy(from).lerp(t.pos, Math.random() * 0.25)
          this.emit(this.c, t.pos, 0.42, 1.1, 0.03, 0.04)
        }
      })
      const blot = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color, blending: AdditiveBlending, depthWrite: false, transparent: true })))
      this.steps.push((_dt, time, k) => {
        blot.position.copy(t.pos)
        blot.scale.setScalar(r * (2.2 + (host.quiet() ? 0 : 0.5 * Math.sin(time * 3))))
        blot.material.opacity = k * 0.55
      })
    }
    if (form === 'seed') {
      // Something inside the asset with a heartbeat.
      const core = this.add(new Mesh(new SphereGeometry(1, 12, 8), new MeshBasicMaterial({ color })))
      const halo = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color, blending: AdditiveBlending, depthWrite: false, transparent: true, depthTest: false })))
      const ring = this.add(new Mesh(new RingGeometry(0.9, 1, 40), additive(color, 0)))
      this.steps.push((_dt, time, k) => {
        const ph = (time * 1.25) % 1
        const beat = host.quiet() ? 0.5 : Math.exp(-ph * 9) + 0.6 * Math.exp(-Math.abs(ph - 0.22) * 16)
        core.position.copy(t.pos)
        core.scale.setScalar(r * (0.16 + 0.1 * beat) * k)
        halo.position.copy(t.pos)
        halo.scale.setScalar(r * (1.6 + 2.2 * beat))
        halo.material.opacity = k * (0.35 + 0.6 * beat)
        ring.position.copy(t.pos)
        ring.quaternion.copy(host.camera.quaternion)
        ring.scale.setScalar(r * (0.6 + ph * 1.6))
        ;(ring.material as MeshBasicMaterial).opacity = k * (1 - ph) * 0.7
      })
    }
    if (form === 'rogue') {
      // A dish that is not ours, on the ground, with a link of its own.
      const at = onGlobe(-0.06, 0.4, 1.02)
      const dish = this.add(new Mesh(new ConeGeometry(0.05, 0.09, 12, 1, true), additive(color, 0)))
      dish.position.copy(at)
      dish.quaternion.setFromUnitVectors(UP, at.clone().normalize().negate())
      const halo = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color, blending: AdditiveBlending, depthWrite: false, transparent: true })))
      halo.position.copy(at)
      const link = this.ribbon(color, 12, 1.6)
      this.steps.push((_dt, time, k) => {
        ;(dish.material as MeshBasicMaterial).opacity = k
        halo.scale.setScalar(0.3 + (host.quiet() ? 0 : 0.06 * Math.sin(time * 5)))
        halo.material.opacity = k * 0.8
        const mid = this.b.copy(at).add(t.pos).multiplyScalar(0.5)
        mid.addScaledVector(this.c.copy(mid).normalize(), 0.22)
        link.set(at, mid, t.pos)
        link.update(host.camera.position, 0.011)
        link.uniforms.time.value = time
        link.uniforms.alpha.value = k * 0.95
      })
    }
    if (form === 'echo') {
      // The same rings, down the link, again and again.
      const rings = [0, 1, 2].map(() => this.add(new Mesh(new RingGeometry(0.78, 1, 36), additive(color, 0))))
      this.steps.push((_dt, time, k) => {
        const to = host.station() ?? this.a.copy(t.pos).multiplyScalar(0.8)
        rings.forEach((ring, i) => {
          const u = host.quiet() ? (i + 0.5) / 3 : (time * 0.42 + i / 3) % 1
          ring.position.copy(t.pos).lerp(to, u * 0.8)
          ring.quaternion.copy(host.camera.quaternion)
          ring.scale.setScalar(r * (0.75 - u * 0.35))
          ;(ring.material as MeshBasicMaterial).opacity = k * (1 - u) * 0.95
        })
      })
    }
    if (form === 'listen') {
      // A receiver on a roof, and the beam drifting down to it.
      const ear = onGlobe(0.56, -0.36, 1.02)
      const mark = this.add(new Mesh(new RingGeometry(0.6, 1, 32), additive(color, 0)))
      mark.position.copy(ear)
      mark.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), ear.clone().normalize())
      this.steps.push((dt, time, k) => {
        const ph = host.quiet() ? 0.5 : (time * 0.5) % 1
        mark.scale.setScalar(0.05 + ph * 0.09)
        ;(mark.material as MeshBasicMaterial).opacity = k * (1 - ph)
        for (let i = this.rate(dt, 9, k); i > 0; i -= 1) {
          this.c.copy(t.pos).lerp(ear, Math.random() * 0.2)
          this.emit(this.c, ear, 0.2, 1.8, 0.022, 0.02)
        }
      })
    }
    if (form === 'siphon') {
      // Data leaving the link sideways, toward COLDVEIL.
      this.steps.push((dt, _time, k) => {
        const from = host.station() ?? this.a.copy(t.pos).multiplyScalar(0.86)
        for (let i = this.rate(dt, 34, k); i > 0; i -= 1) {
          this.c.copy(from).lerp(t.pos, 0.35 + Math.random() * 0.5)
          this.emit(this.c, host.foe, 0.9 + Math.random() * 0.5, 1.2, 0.03, 0.08)
        }
      })
    }
    if (form === 'cage') {
      // Bars closing around the station.
      const bars = [1, 0.82].map((s) => {
        const m = this.add(new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1.2, 1, 3, 3, 3)), new LineBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })))
        m.userData.s = s
        return m
      })
      this.steps.push((_dt, time, k) => {
        const up = this.a.copy(t.pos).normalize()
        bars.forEach((m, i) => {
          m.position.copy(t.pos)
          m.quaternion.setFromUnitVectors(UP, up)
          m.rotateY(time * (i ? -0.5 : 0.35))
          const clamp = host.quiet() ? 1 : 1 + 0.08 * Math.sin(time * 6 + i)
          m.scale.setScalar(r * 2 * (m.userData.s as number) * clamp * (0.4 + 0.6 * k))
          ;(m.material as LineBasicMaterial).opacity = k * (i ? 0.5 : 0.95)
        })
      })
    }
    if (form === 'hook') {
      // A line dropped on the station with something bright on the end.
      const line = this.ribbon(color, 30, 0.2)
      const lure = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color: 0xfff1b8, blending: AdditiveBlending, depthWrite: false, transparent: true })))
      this.steps.push((_dt, time, k) => {
        const above = this.a.copy(t.pos).normalize().multiplyScalar(r * 2.4).add(t.pos)
        const bob = host.quiet() ? 0 : Math.sin(time * 2.6) * r * 0.5
        const end = this.c.copy(t.pos).addScaledVector(this.b.copy(t.pos).normalize(), r * 0.9 + bob)
        line.set(host.foe, above, end)
        line.update(host.camera.position, 0.006)
        line.uniforms.time.value = time
        line.uniforms.alpha.value = k * 0.85
        lure.position.copy(end)
        lure.scale.setScalar(r * (1.1 + (host.quiet() ? 0 : 0.3 * Math.sin(time * 9))))
        lure.material.opacity = k
      })
    }
    if (form === 'inside') {
      // Nothing comes in: it leaves, from inside, upward.
      const cloud = this.add(new Sprite(new SpriteMaterial({ map: host.glow, color, blending: AdditiveBlending, depthWrite: false, transparent: true })))
      this.steps.push((dt, _time, k) => {
        const out = this.a.copy(t.pos).normalize().multiplyScalar(r * 3.4).add(t.pos)
        out.x += r * 1.6
        cloud.position.copy(out)
        cloud.scale.setScalar(r * 2.6)
        cloud.material.opacity = k * 0.5
        for (let i = this.rate(dt, 18, k); i > 0; i -= 1) this.emit(t.pos, out, 0.3 + Math.random() * 0.15, 1.3, 0.026, 0.05)
      })
    }
    if (form === 'debris') {
      // Dead metal, tumbling.
      const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0 })
      const shards: { m: Mesh; at: Vector3; spin: Vector3 }[] = []
      for (let i = 0; i < 9; i += 1) {
        const m = this.add(new Mesh(new OctahedronGeometry(0.018 + (i % 3) * 0.011), mat))
        shards.push({ m, at: new Vector3(Math.sin(i * 2.4) * 1.3, Math.cos(i * 1.7) * 0.8, Math.sin(i * 0.9) * 1.1), spin: new Vector3(1 + (i % 3), 0.6 + (i % 4) * 0.5, 0.8) })
      }
      this.steps.push((_dt, time, k) => {
        const side = this.a.copy(t.pos).cross(UP).normalize()
        mat.opacity = k
        for (const s of shards) {
          s.m.position.copy(t.pos).addScaledVector(side, r * 2.2).addScaledVector(s.at, r * 0.9)
          if (!host.quiet()) s.m.rotation.set(time * s.spin.x, time * s.spin.y, time * s.spin.z)
        }
      })
    }
  }

  step(dt: number, time: number): void {
    for (const s of this.steps) s(dt, time, this.level)
  }

  dispose(): void {
    for (const o of this.parts) {
      this.host.scene.remove(o)
      const m = o as Mesh
      // A ghost twin shares its geometry with the asset it copies.
      if (!(o as Group).isGroup) m.geometry?.dispose?.()
      const mat = m.material as { dispose?: () => void } | undefined
      mat?.dispose?.()
    }
    for (const r of this.ribbons) {
      this.host.scene.remove(r.mesh)
      r.mesh.geometry.dispose()
    }
    this.parts = []
    this.ribbons = []
    this.steps = []
  }
}
