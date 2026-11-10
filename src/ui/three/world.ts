// THE GAME'S WORLD (v2.0 R1): the theater the slice built, with what a
// whole game needs on it. Assets arrive and are lost, defenses sit on the
// assets they were placed on, the scan sweeps, each threat shows its
// signature, a strike closes a ring to tap on, the debris crosses the
// orbit, a block streak builds a ring over the area of operations, the
// lights go out for the BLACKOUT CHAIN, and the camera flies the opening.
//
// Imperative, as the theater is. React says what the game is (Game3D.tsx
// and gameModel.ts); this is told what to show. Nothing here reads the
// engine.

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three/src/Three.js'
import { Signature, type SigHost } from './signatures'
import { AO, C, COLDVEIL_AT, Ribbon, Theater, clamp, easeInOut, easeOut, lerp, onGlobe, type Body, type Impact, type Place, type TheaterAsset } from './theater'

export type SkinId = 'standard' | 'foil' | 'nightwatch' | 'signal'
const SKINS: Record<SkinId, { hull: number; panel: number; glow: number }> = {
  standard: { hull: C.hull, panel: C.panel, glow: 0x2a6fd0 },
  foil: { hull: 0xe0b354, panel: 0x4a3a86, glow: 0x7a5cff },
  nightwatch: { hull: 0x4a5564, panel: 0x12b5a6, glow: 0x1ad1c2 },
  signal: { hull: 0xf4f7fb, panel: 0xc23f7d, glow: 0xff5aa5 },
}

// A camera shot for the opening: where it looks from, how far out against
// the whole-theater framing, and how far it tips its eye up or down.
export interface Shot {
  az: number
  el: number
  dist: number
  lookY: number
}

interface Extra {
  // 0 arriving, 1 on station.
  arrive: number
  lost: boolean
  gone: number
  home: number
  modules: Mesh[]
  iso: Mesh | null
  isoK: number
  isoWant: number
}

const STREAK_ARCS = 6
const moduleMat = () => new MeshBasicMaterial({ color: C.shield, transparent: true, opacity: 0.95 })

export class World extends Theater {
  private extra = new Map<string, Extra>()
  private sigs = new Map<string, Signature>()
  private sigHost: SigHost
  private skin: SkinId = 'standard'
  private speed = 1
  // The timed tap: the ring on the target, the real moment the strike
  // lands, and the first tap inside the window.
  private tapRing: Mesh
  private ringStop: Mesh
  private ringK = -1
  private ringOn = 0
  private moment = 0
  private tapAt = 0
  private windowOpen = false
  // The scan's beam and the ring it leaves on what it names.
  private beam: Ribbon
  private beamK = 0
  private ping: Mesh
  private pingK = 1
  private pingAt = new Vector3()
  // The streak's ring over the area of operations.
  private arcs: { mesh: Mesh; on: number; want: number }[] = []
  private streak = 0
  private streakFlash = 0
  // The debris, and where it is on its pass.
  private debris = new Group()
  private debrisAt = new Vector3(9, 9, 9)
  private debrisOn = 0
  private blackout = 0
  private wantBlackout = 0
  private v = new Vector3()
  private v2 = new Vector3()
  private c2 = new Color()

  constructor(canvas: HTMLCanvasElement, place: Place, reduced: boolean) {
    super(canvas, place, reduced)
    this.sigHost = {
      scene: this.scene,
      sparks: this.sparks,
      glow: this.glow,
      camera: this.camera,
      foe: COLDVEIL_AT,
      station: () => [...this.bodies.values()].find((b) => b.kind === 'groundStation' && !this.extra.get(b.id)?.lost)?.pos ?? null,
      quiet: () => this.reduced || this.low,
    }
    const ringMat = (color: number) => new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: DoubleSide, blending: AdditiveBlending })
    this.tapRing = new Mesh(new RingGeometry(0.95, 1, 72), ringMat(0xffffff))
    this.ringStop = new Mesh(new RingGeometry(0.9, 1, 72), ringMat(C.go))
    this.tapRing.visible = this.ringStop.visible = false
    this.beam = new Ribbon(C.sky, 26, 2.4)
    this.beam.uniforms.alpha.value = 0
    this.ping = new Mesh(new RingGeometry(0.86, 1, 56), ringMat(C.sky))
    this.ping.visible = false
    this.scene.add(this.tapRing, this.ringStop, this.beam.mesh, this.ping)

    // The watch ring: six arcs of a circle around the area of operations,
    // one lit a block, all of them once the streak is long.
    const centre = onGlobe(AO.lat, AO.lon, 1)
    const holder = new Group()
    holder.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), centre)
    holder.position.copy(centre).multiplyScalar(1.25 * Math.cos(0.98))
    const gap = 0.12
    for (let i = 0; i < STREAK_ARCS; i += 1) {
      const mesh = new Mesh(new TorusGeometry(1.25 * Math.sin(0.98), 0.013, 6, 24, (Math.PI * 2) / STREAK_ARCS - gap), new MeshBasicMaterial({ color: C.shield, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
      mesh.rotation.z = (i / STREAK_ARCS) * Math.PI * 2 + Math.PI / 2
      holder.add(mesh)
      this.arcs.push({ mesh, on: 0, want: 0 })
    }
    this.scene.add(holder)

    const shardMat = new MeshBasicMaterial({ color: 0xc9d4e0 })
    for (let i = 0; i < 14; i += 1) {
      const m = new Mesh(new OctahedronGeometry(0.016 + (i % 4) * 0.009), shardMat)
      m.position.set(Math.sin(i * 2.4) * 0.16, Math.cos(i * 1.7) * 0.1, Math.sin(i * 0.9) * 0.14)
      m.userData.spin = [1 + (i % 3), 0.6 + (i % 4) * 0.5, 0.8 + (i % 2)]
      this.debris.add(m)
    }
    this.debris.visible = false
    this.scene.add(this.debris)
  }

  // ----------------------------------------------------------- the fleet

  private extraOf(id: string): Extra {
    let e = this.extra.get(id)
    if (!e) this.extra.set(id, (e = { arrive: 1, lost: false, gone: 0, home: 0, modules: [], iso: null, isoK: 0, isoWant: 0 }))
    return e
  }

  // The fleet as it stands. An asset in `arriving` flies in; the rest are
  // simply there (a game resumed from a save).
  syncAssets(list: readonly TheaterAsset[], arriving: ReadonlySet<string> = new Set()): void {
    // An asset of an earlier game that this one does not hold leaves.
    for (const [id, b] of this.bodies) {
      if (list.some((a) => a.id === id)) continue
      this.scene.remove(b.root, b.reticle)
      if (b.link) this.scene.remove(b.link.mesh)
      const e = this.extra.get(id)
      for (const m of e?.modules ?? []) this.scene.remove(m)
      if (e?.iso) this.scene.remove(e.iso)
      this.extra.delete(id)
      this.bodies.delete(id)
    }
    const fresh = list.filter((a) => !this.bodies.has(a.id))
    this.setAssets(list)
    for (const a of fresh) {
      const b = this.bodies.get(a.id)
      if (!b) continue
      // Its station is its own, so a burn moves this satellite alone.
      b.station = [...b.station]
      const e = this.extraOf(a.id)
      e.home = b.station[0]
      e.arrive = arriving.has(a.id) && !this.reduced ? 0 : 1
      this.paint(b)
    }
  }

  private paint(b: Body): void {
    const skin = SKINS[this.skin]
    b.model.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined
      const role = mat?.userData?.role as string | undefined
      if (!mat || !role) return
      if (role === 'hull') mat.color.setHex(b.kind === 'drone' && this.skin === 'standard' ? 0xe6edf3 : skin.hull)
      if (role === 'panel') {
        mat.color.setHex(skin.panel)
        mat.emissive.setHex(skin.glow)
      }
    })
  }

  setSkin(skin: SkinId): void {
    this.skin = skin
    for (const b of this.bodies.values()) this.paint(b)
  }

  // An asset the debris took, or one a save already had as lost.
  setLost(id: string, lost: boolean, burst = false): void {
    const b = this.bodies.get(id)
    if (!b) return
    const e = this.extraOf(id)
    if (lost && !e.lost && burst) {
      this.flash(b.pos, 0xfff0d0, 2.2, 0.7)
      this.ring(b.pos, C.threat, 1.3, 0.7)
      this.burst(b.pos, 0xffc28a, 90, 1.5, 1.4, 0.04)
      this.burst(b.pos, 0xc9d4e0, 40, 0.7, 1.8, 0.03)
      if (!this.reduced) this.shake = 1
    }
    e.lost = lost
    if (!burst) e.gone = lost ? 1 : 0
    if (lost) super.setIntegrity(id, 100)
  }

  // The defenses placed on an asset: one small light in orbit about it each.
  setModules(counts: ReadonlyMap<string, number>): void {
    for (const b of this.bodies.values()) {
      const e = this.extraOf(b.id)
      const want = counts.get(b.id) ?? 0
      while (e.modules.length < want) {
        const m = new Mesh(new OctahedronGeometry(0.02), moduleMat())
        this.scene.add(m)
        e.modules.push(m)
      }
      while (e.modules.length > want) {
        const m = e.modules.pop() as Mesh
        this.scene.remove(m)
        m.geometry.dispose()
      }
    }
  }

  // A piece set down on an asset.
  placeFx(id: string, tone: 'defense' | 'response' = 'defense'): void {
    const b = this.bodies.get(id)
    if (!b) return
    const color = tone === 'defense' ? C.shield : C.go
    this.flash(b.pos, color, 0.9, 0.4)
    this.ring(b.pos, color, 0.55, 0.7)
    this.burst(b.pos, color, 22, 0.6, 0.5, 0.03)
  }

  // A link run through another asset for tonight, and back.
  setVia(id: string, via: string | null): void {
    const b = this.bodies.get(id)
    if (!b) return
    b.via = via
    if (via) {
      const relay = this.bodies.get(via)
      if (relay) this.placeFx(via, 'response')
    }
  }

  // An asset cut off from the rest for tonight: a ring closes around it.
  setIsolated(id: string, on: boolean): void {
    const b = this.bodies.get(id)
    if (!b) return
    const e = this.extraOf(id)
    if (on && !e.iso) {
      e.iso = new Mesh(new TorusGeometry(1, 0.03, 8, 48), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
      this.scene.add(e.iso)
    }
    e.isoWant = on ? 1 : 0
    if (on) this.burst(b.pos, 0xffffff, 14, 0.4, 0.4, 0.025)
  }

  clearNight(): void {
    for (const b of this.bodies.values()) {
      b.via = null
      this.extraOf(b.id).isoWant = 0
    }
    this.dropResponseShields()
  }

  // ------------------------------------------------------------ the scan

  // The beam sweeps from the ground station to what it is naming.
  async scan(targetId: string): Promise<void> {
    const b = this.bodies.get(targetId)
    if (!b) return
    const from = this.sigHost.station() ?? this.v.copy(b.pos).multiplyScalar(0.7)
    const start = from.clone()
    const sweep = this.v2.copy(b.pos).cross(new Vector3(0, 1, 0)).normalize().multiplyScalar(0.9).clone()
    this.beam.uniforms.reveal.value = 1
    await this.tween(this.reduced ? 0.2 : 0.62, (k) => {
      const e = easeInOut(k)
      // It comes in from the side and settles on the target.
      const end = this.v.copy(b.pos).addScaledVector(sweep, 1 - e)
      const mid = this.v2.copy(start).add(end).multiplyScalar(0.5)
      mid.addScaledVector(mid.clone().normalize(), 0.2)
      this.beam.set(start, mid, end)
      this.beamK = Math.min(1, k * 4)
    })
    this.pingAt.copy(b.pos)
    this.pingK = 0
    this.flash(b.pos, C.sky, 1, 0.45)
    this.burst(b.pos, C.sky, 18, 0.5, 0.5, 0.026)
    void this.tween(0.35, (k) => {
      this.beamK = 1 - k
    })
  }

  // ------------------------------------------------------ the signatures

  // One signature a key: the strike in hand, a contact being looked at, a
  // condition that lingers. A key set again swaps its look.
  setSignature(key: string, eventId: string | null, targetId?: string, level = 1): void {
    const had = this.sigs.get(key)
    const b = targetId ? this.bodies.get(targetId) : undefined
    if (had && (eventId === null || had.eventId !== eventId || !b)) {
      had.dispose()
      this.sigs.delete(key)
    }
    if (eventId === null || !b) return
    let sig = this.sigs.get(key)
    if (!sig) this.sigs.set(key, (sig = new Signature(this.sigHost, eventId, b)))
    sig.level = level
  }

  clearSignatures(prefix = ''): void {
    for (const [key, sig] of this.sigs) {
      if (!key.startsWith(prefix)) continue
      sig.dispose()
      this.sigs.delete(key)
    }
  }

  // -------------------------------------------------------- the timed tap

  // The strike runs in from where it held, and a ring closes on its target
  // to meet it. Resolves as the ring closes: that is the moment.
  async approach(ring: boolean): Promise<void> {
    const comet = this.comet
    if (!comet) return
    const from = comet.u
    this.tapAt = 0
    this.windowOpen = ring
    this.ringOn = ring ? 1 : 0
    this.ringK = 0
    await this.tween(this.reduced ? 0.35 : 1, (k) => {
      comet.u = lerp(from, 0.9, easeInOut(k))
      this.ringK = k
    })
    this.moment = performance.now() + 60
  }

  // A press anywhere on the world, or on the card's own button.
  tap(): void {
    if (!this.windowOpen || this.tapAt) return
    this.tapAt = performance.now()
    const b = this.comet ? this.bodies.get(this.comet.targetId) : undefined
    if (b) this.ring(b.pos, 0xffffff, b.radius * 2.2, 0.7)
  }

  // How far off the moment the tap came, in seconds, early as a negative;
  // null with no tap. Waits a beat for a late one.
  async tapOffset(late = 0.22): Promise<number | null> {
    if (!this.windowOpen) return null
    if (!this.tapAt) await new Promise((done) => window.setTimeout(done, late * 1000))
    this.windowOpen = false
    this.ringOn = 0
    return this.tapAt ? (this.tapAt - this.moment) / 1000 : null
  }

  closeWindow(): void {
    this.windowOpen = false
    this.ringOn = 0
    this.ringK = -1
  }

  // What the tap earned, shown on the ring it was made on.
  tapFx(targetId: string, grade: 0 | 1 | 2): void {
    const b = this.bodies.get(targetId)
    if (!b || !grade) return
    const color = grade === 2 ? 0xfff3a0 : C.go
    this.ring(b.pos, color, b.radius * (grade === 2 ? 3.4 : 2.4), 0.7)
    this.burst(b.pos, color, grade === 2 ? 40 : 16, 0.9, 0.7, 0.03)
  }

  // ---------------------------------------------------------- the streak

  setStreak(n: number): void {
    if (n < this.streak && this.streak > 0) {
      // A hit breaks the ring: its lit arcs scatter.
      for (const arc of this.arcs) {
        if (arc.on < 0.3) continue
        arc.mesh.getWorldPosition(this.v)
        this.burst(this.v, C.shield, 10, 0.5, 0.8, 0.026)
      }
    } else if (n > this.streak) this.streakFlash = 1
    this.streak = n
    this.arcs.forEach((arc, i) => (arc.want = i < Math.min(n, STREAK_ARCS) ? 1 : 0))
  }

  // ---------------------------------------------------------- the debris

  private debrisPath(b: Body, k: number, miss: number): Vector3 {
    // Across the orbit from the right of the screen to the left, through
    // where the satellite keeps station (or just over it, on a miss).
    const side = this.v.set(1, 0.12, 0.25).normalize()
    return this.v2.copy(b.pos).addScaledVector(side, lerp(2.4, -2.6, k)).addScaledVector(this.v.copy(b.pos).normalize(), miss)
  }

  async debrisIn(targetId: string): Promise<void> {
    const b = this.bodies.get(targetId)
    if (!b) return
    const at = b.pos.clone()
    const ghost = { pos: at, radius: b.radius } as Body
    this.debris.visible = true
    this.debrisOn = 1
    this.focusId = targetId
    this.frame()
    await this.tween(this.reduced ? 0.4 : 1.5, (k) => {
      this.debrisAt.copy(this.debrisPath(ghost, 0.36 * easeOut(k), 0))
    })
  }

  // The satellite thrusts along its orbit, out of the corridor.
  async burn(targetId: string): Promise<void> {
    const b = this.bodies.get(targetId)
    if (!b) return
    const from = b.station[0]
    await this.tween(this.reduced ? 0.3 : 1.1, (k) => {
      b.station[0] = from + 0.5 * easeInOut(k)
      if (!this.reduced && Math.random() < 0.7) {
        this.c2.setHex(0x9fd8ff)
        this.sparks.emit(b.pos, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, this.c2, 0.5, 0.03)
      }
    })
  }

  // The debris finishes its pass over where the satellite was, or is.
  async debrisPass(targetId: string, at: Vector3 | null, lost: boolean): Promise<void> {
    const b = this.bodies.get(targetId)
    if (!b) return
    const ghost = { pos: at ?? b.pos.clone(), radius: b.radius } as Body
    const miss = lost ? 0 : 0.1
    const hitAt = 0.48
    let struck = false
    await this.tween(this.reduced ? 0.5 : 1.3, (k) => {
      const u = lerp(0.36, 1, k * k * (3 - 2 * k))
      this.debrisAt.copy(this.debrisPath(ghost, u, miss))
      if (lost && !struck && u >= hitAt) {
        struck = true
        this.setLost(targetId, true, true)
        this.freeze = this.reduced ? 0 : 0.1
      }
    })
    this.debrisOn = 0
    this.debris.visible = false
    this.focusId = null
    this.frame()
  }

  // The satellites that burned come back on station with the morning.
  settle(): void {
    for (const b of this.bodies.values()) {
      const e = this.extraOf(b.id)
      if (b.kind === 'drone' || b.kind === 'groundStation' || Math.abs(b.station[0] - e.home) < 0.001) continue
      const from = b.station[0]
      void this.tween(this.reduced ? 0.2 : 1.6, (k) => {
        b.station[0] = lerp(from, e.home, easeInOut(k))
      })
    }
  }

  // --------------------------------------------------- the night's extras

  // The lights over the area of operations go out, or come back.
  setBlackout(on: boolean): void {
    this.wantBlackout = on ? 1 : 0
  }

  setShot(shot: Shot | null): void {
    this.shot = shot
    this.frame()
  }

  setLowPower(on: boolean): void {
    if (this.low === on) return
    this.low = on
    this.resize()
  }

  // The frame rate the loop has held lately, for the game to offer low
  // power on a device that cannot keep up.
  private frameMs = 16
  fps(): number {
    return Math.round(1000 / this.frameMs)
  }

  setSpeed(mult: number): void {
    this.speed = clamp(mult, 0.5, 4)
  }

  // A strike played straight through, for the after-action replay.
  async quickStrike(key: string, targetId: string, impact: Impact): Promise<void> {
    await this.launch(key, targetId, false)
    await this.land(impact, 0.3)
  }

  // Where an asset is now, for something that must remember the place.
  posOf(id: string): Vector3 | null {
    return this.bodies.get(id)?.pos.clone() ?? null
  }

  // ---------------------------------------------------------------- loop

  protected step(dt: number, real: number): void {
    if (real > 0) this.frameMs += (real * 1000 - this.frameMs) * 0.05
    dt *= this.speed
    super.step(dt, real)
    const time = this.time
    const quiet = this.reduced || this.low

    this.blackout += (this.wantBlackout - this.blackout) * Math.min(1, dt * 2.2)
    this.globeUniforms.power.value = 1 - this.blackout * 0.92

    for (const b of this.bodies.values()) {
      const e = this.extra.get(b.id)
      if (!e) continue
      // Arriving: in from deep space for a satellite, up from the ground
      // for a drone, raised on the spot for a station.
      if (e.arrive < 1) {
        e.arrive = Math.min(1, e.arrive + dt / 1.8)
        const k = easeOut(e.arrive)
        if (b.kind === 'groundStation') b.model.scale.setScalar(Math.max(0.01, k))
        else {
          const from = b.kind === 'drone' ? this.v.copy(b.pos).multiplyScalar(0.86) : this.v.copy(b.pos).multiplyScalar(2.3).addScaledVector(this.v2.set(0.6, 0.5, 0), 1)
          b.root.position.copy(from).lerp(b.pos, k)
          b.model.scale.setScalar(Math.max(0.01, 0.3 + 0.7 * k))
          if (!quiet && Math.random() < dt * 40) {
            this.c2.setHex(C.go)
            this.sparks.emit(b.root.position, 0, 0, 0, this.c2, 0.6, 0.03)
          }
        }
        if (e.arrive >= 1) {
          b.model.scale.setScalar(1)
          this.placeFx(b.id, 'response')
        }
      }
      if (e.lost) {
        e.gone = Math.min(1, e.gone + dt * 2.5)
        b.model.scale.setScalar(Math.max(0.001, 1 - e.gone))
        if (e.gone >= 1) b.root.visible = false
        if (b.link) b.link.mesh.visible = false
        b.reticle.visible = false
        if (b.shield) b.shield.want = 0
      } else if (!b.root.visible) b.root.visible = true

      e.modules.forEach((m, i) => {
        m.visible = !e.lost
        const a = time * (quiet ? 0 : 0.9) + (i / Math.max(1, e.modules.length)) * Math.PI * 2 + b.phase
        const up = this.v.copy(b.pos).normalize()
        const side = this.v2.copy(up).cross(this.camPos).normalize()
        m.position.copy(b.pos).addScaledVector(side, Math.cos(a) * b.radius * 0.95).addScaledVector(up, Math.sin(a) * b.radius * 0.6 + b.radius * 0.2)
        m.rotation.set(time, time * 0.7, 0)
      })

      if (e.iso) {
        e.isoK += (e.isoWant - e.isoK) * Math.min(1, dt * 6)
        e.iso.visible = e.isoK > 0.02
        if (e.iso.visible) {
          e.iso.position.copy(b.pos)
          e.iso.quaternion.copy(this.camera.quaternion)
          // It closes in from wide to a tight band.
          e.iso.scale.setScalar(b.radius * lerp(3.2, 1.25, easeOut(clamp(e.isoK, 0, 1))))
          ;(e.iso.material as MeshBasicMaterial).opacity = e.isoK * 0.9
        }
      }
    }

    for (const sig of this.sigs.values()) sig.step(dt, time)

    // The ring that closes on the target as the strike comes in.
    const comet = this.comet
    const tb = comet ? this.bodies.get(comet.targetId) : undefined
    const showRing = !!tb && this.ringOn > 0 && this.ringK >= 0
    this.tapRing.visible = this.ringStop.visible = showRing
    if (showRing && tb) {
      const stop = tb.radius * 1.5
      for (const m of [this.tapRing, this.ringStop]) {
        m.position.copy(tb.pos)
        m.quaternion.copy(this.camera.quaternion)
      }
      this.tapRing.scale.setScalar(lerp(stop * 3.6, stop, clamp(this.ringK, 0, 1)))
      ;(this.tapRing.material as MeshBasicMaterial).opacity = 0.35 + 0.65 * clamp(this.ringK, 0, 1)
      this.ringStop.scale.setScalar(stop)
      ;(this.ringStop.material as MeshBasicMaterial).opacity = 0.5
    }

    this.beam.update(this.camPos, 0.016)
    this.beam.uniforms.time.value = time
    this.beam.uniforms.alpha.value = this.beamK
    this.beam.mesh.visible = this.beamK > 0.01
    if (this.pingK < 1) {
      this.pingK = Math.min(1, this.pingK + dt / 0.8)
      this.ping.visible = true
      this.ping.position.copy(this.pingAt)
      this.ping.quaternion.copy(this.camera.quaternion)
      this.ping.scale.setScalar(0.1 + easeOut(this.pingK) * 0.42)
      ;(this.ping.material as MeshBasicMaterial).opacity = (1 - this.pingK) * 0.9
    } else this.ping.visible = false

    this.streakFlash = Math.max(0, this.streakFlash - dt * 1.4)
    const long = this.streak >= 3
    for (const arc of this.arcs) {
      arc.on += (arc.want - arc.on) * Math.min(1, dt * 5)
      const mat = arc.mesh.material as MeshBasicMaterial
      mat.opacity = arc.on * (0.8 + this.streakFlash * 0.2 + (long && !quiet ? 0.2 * Math.sin(time * 3) : 0)) + (1 - arc.on) * 0.07
      mat.color.setHex(this.streak >= STREAK_ARCS ? 0xffe38a : long ? 0x9ff5ff : C.shield)
    }

    if (this.debrisOn > 0) {
      this.debris.position.copy(this.debrisAt)
      if (!this.reduced) {
        for (const m of this.debris.children) {
          const s = m.userData.spin as number[]
          m.rotation.set(time * s[0], time * s[1], time * s[2])
        }
      }
    }
  }

  dispose(): void {
    this.clearSignatures()
    super.dispose()
  }
}
