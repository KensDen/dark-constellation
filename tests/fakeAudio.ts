// A fake AudioContext that records the graph (Round 4d).
//
// jsdom implements no Web Audio at all, so there is no environment in this
// project where the real thing runs. The audio layer therefore takes its
// context as an injected factory, exactly as the director takes its
// Scheduler, and this is what the suite injects: a real implementation of
// src/audio/graph.ts that remembers every node, every connection and every
// scheduled value.
//
// That is the point. The guarantees this round makes are about the GRAPH,
// not about a boolean: "nothing is audible before a gesture" means no node
// was created, and "muted" means nothing was scheduled rather than
// something scheduled into a silent gain. A test that asserted the flags
// would pass against an engine that made noise anyway.
//
// The interfaces it implements are the same ones src/audio/engine.ts
// returns a real AudioContext as, without a cast, so this fake cannot
// drift into implementing a shape no browser has.

import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadLike,
  BufferSourceLike,
  GainLike,
  OscillatorLike,
} from '../src/audio/graph'

export interface ParamEvent {
  kind: 'set' | 'linear' | 'exponential' | 'cancel'
  value: number
  time: number
}

// The real AudioParam throws for the arguments below, and a fake that
// accepts them cannot fail for the one mistake the production code
// documents itself as avoiding: voices.ts defines SILENCE as 0.0001
// precisely because an exponential ramp to zero is a RangeError. Setting
// it back to 0 used to leave every assertion green while the first cue of
// a real session threw out of a React effect and the game stayed silent.
export class FakeParam implements AudioParamLike {
  // `value` IS AN AUTOMATION EVENT, and modelling it as a plain field is
  // what let Round 6b ship a bed with no crossfades at all (fix batch).
  //
  // The spec is explicit: assigning AudioParam.value is defined as calling
  // setValueAtTime(value, currentTime). src/audio/music.ts wrote
  // `gain.gain.value = target` one line after scheduling the crossfade
  // ramp, which plants an event at the ramp's own start instant, makes the
  // ramp's V0 the target, and collapses two seconds of fade into one
  // sample. Five review lenses found it independently and one confirmed it
  // by rendering the sequence through a real Chromium OfflineAudioContext:
  // with the assignment the gain reads 0.55 flat from t=0, without it the
  // ramp runs 0 to 0.55 over two seconds as intended.
  //
  // The suite could not see any of that, because this field recorded
  // nothing. The guard that names the failure, 'never sets one straight to
  // its target', filtered `events` for a set at the target value and the
  // production assignment pushed no event, so it was vacuous by
  // construction: principle 16 wearing principle 15's clothes. The fix is
  // not a new assertion, it is this double telling the truth about the one
  // operation it was silently inventing.
  private stored = 0
  readonly events: ParamEvent[] = []
  // The context this param belongs to, so `value =` can stamp the event at
  // the right time the way the browser does. Null only for a param built
  // outside a context, which in this suite is a programming error rather
  // than a case.
  clock: { currentTime: number } | null = null

  get value(): number {
    return this.stored
  }

  set value(next: number) {
    this.stored = next
    this.check(next, this.clock?.currentTime ?? 0, 'value')
    this.events.push({ kind: 'set', value: next, time: this.clock?.currentTime ?? 0 })
  }
  // The node this param belongs to, so a connection INTO the param can be
  // followed back out to the thing it modulates (Round 6b).
  //
  // Without this the fake would record `lfo.connect(filter.frequency)` and
  // `lfo.connect(nothing)` identically as far as reaches() is concerned,
  // because a param would be a dead end in the walk. That is the same
  // class of defect as Round 4d's bus-connectivity guard, which asked
  // whether ANY node reached the bus: an LFO wired to nothing would then
  // pass every assertion in the suite while the pad sat perfectly still,
  // and a still pad is exactly what this round exists to not ship.
  //
  // Modulation IS an audible path: an oscillator moving a filter cutoff is
  // heard, through the filter, at the speakers. So the walk crosses from a
  // param to its owner, and a param with no owner is a wiring mistake in
  // the fake rather than a silent zero.
  owner: FakeNode | null = null
  readonly connectedFrom: AudioNodeLike[] = []
  cancelScheduledValues(time: number) {
    this.check(0, time, 'cancelScheduledValues')
    // NaN, not 0. A cancel carries no value, and recording one as 0 made
    // it indistinguishable from a real ramp to silence: the round's
    // duck-depth guard took Math.min over every event's value and was
    // satisfied by this sentinel rather than by the bed getting quieter,
    // so DUCK_FACTOR could have been anything. NaN makes that misuse fail
    // loudly instead of passing silently, which is the only honest value
    // for a field that does not apply.
    this.events.push({ kind: 'cancel', value: Number.NaN, time })
    return this
  }
  private check(value: number, time: number, kind: string) {
    if (!Number.isFinite(value)) throw new RangeError(`${kind}: value must be finite, got ${value}`)
    if (!Number.isFinite(time) || time < 0) throw new RangeError(`${kind}: time must be finite and non-negative, got ${time}`)
  }
  setValueAtTime(value: number, time: number) {
    this.check(value, time, 'setValueAtTime')
    this.events.push({ kind: 'set', value, time })
    return this
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.check(value, time, 'linearRampToValueAtTime')
    this.events.push({ kind: 'linear', value, time })
    return this
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.check(value, time, 'exponentialRampToValueAtTime')
    if (value <= 0) {
      throw new RangeError(`exponentialRampToValueAtTime: value must be positive, got ${value}`)
    }
    this.events.push({ kind: 'exponential', value, time })
    return this
  }
  // What is ACTUALLY still scheduled, with cancellations applied.
  //
  // `events` is the full history, which is what most guards here want:
  // "did it ramp", "was it ever set to its target". But a cancel in that
  // list is only a record that cancelling happened, and the spec says
  // cancelScheduledValues(t) REMOVES every event at or after t. So a guard
  // asking "is a ramp to silence still pending" read the cancelled ramp
  // and answered yes, and the first version of the toggle-race guard
  // failed against correct product code for that reason alone.
  //
  // Third time this round that this double and the code it stands in for
  // agreed on something untrue (P15), and the only one of the three where
  // the double was wrong on its own: `.value` recording nothing, a cancel
  // recording a sentinel zero, and now a cancel recording no effect.
  effective(): ParamEvent[] {
    const live: ParamEvent[] = []
    for (const event of this.events) {
      if (event.kind === 'cancel') {
        for (let i = live.length - 1; i >= 0; i -= 1) {
          if (live[i].time >= event.time) live.splice(i, 1)
        }
        continue
      }
      live.push(event)
    }
    return live
  }

  // The first value this param was ever told to hold, which for a tone is
  // its pitch and for an envelope is its floor.
  first(): number | undefined {
    return this.events[0]?.value
  }
}

export class FakeNode implements AudioNodeLike {
  readonly connections: AudioNodeLike[] = []
  // Params this node modulates, kept apart from `connections` because they
  // are a different operation with different audible consequences. Folding
  // them into one list would let a test that means "routed to the bus"
  // pass on a node that only modulates something.
  readonly modulates: FakeParam[] = []
  disconnected = false
  constructor(readonly role: string) {}
  connect(destination: AudioNodeLike): AudioNodeLike
  connect(destination: AudioParamLike): void
  connect(destination: AudioNodeLike | AudioParamLike): AudioNodeLike | void {
    if (destination instanceof FakeParam) {
      this.modulates.push(destination)
      destination.connectedFrom.push(this)
      return
    }
    const node = destination as AudioNodeLike
    this.connections.push(node)
    return node
  }
  disconnect() {
    this.disconnected = true
  }
}

export class FakeGain extends FakeNode implements GainLike {
  gain = new FakeParam()
  constructor() {
    super('gain')
    this.gain.owner = this
  }
}

export class FakeOscillator extends FakeNode implements OscillatorLike {
  type = 'sine'
  frequency = new FakeParam()
  started: number | null = null
  stopped: number | null = null
  constructor() {
    super('oscillator')
    this.frequency.owner = this
  }
  start(when: number) {
    this.started = when
  }
  stop(when: number) {
    this.stopped = when
  }
}

export class FakeBiquad extends FakeNode implements BiquadLike {
  type = 'lowpass'
  frequency = new FakeParam()
  Q = new FakeParam()
  constructor() {
    super('biquad')
    this.frequency.owner = this
    this.Q.owner = this
  }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array
  constructor(readonly length: number) {
    this.data = new Float32Array(length)
  }
  getChannelData() {
    return this.data
  }
}

export class FakeBufferSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null
  started: number | null = null
  stopped: number | null = null
  constructor() {
    super('buffer-source')
  }
  start(when: number) {
    this.started = when
  }
  stop(when: number) {
    this.stopped = when
  }
}

export class FakeAudioContext implements AudioContextLike {
  // Not zero, and movable. Zero is the single value at which "schedule
  // relative to now" and "schedule at absolute zero" record identically,
  // so a fake frozen there is the model agreeing with the code by accident
  // (Appendix E). A context that has been open for a while is the normal
  // case in a real session, and it is the case that breaks if an offset is
  // dropped: every ramp and every start lands in the past.
  currentTime = 12.5
  readonly sampleRate = 48000
  readonly destination = new FakeNode('destination')
  state = 'running'
  readonly created: FakeNode[] = []
  resumeCalls = 0
  suspendCalls = 0
  closeCalls = 0

  private track<T extends FakeNode>(node: T): T {
    this.created.push(node)
    // Every param this context hands out is stamped with this context as
    // its clock, so `param.value = x` records at the same currentTime the
    // browser would use. Done here rather than in each constructor so a
    // node type added later cannot forget.
    for (const key of Object.keys(node) as (keyof T)[]) {
      const field = node[key]
      if (field instanceof FakeParam) field.clock = this
    }
    return node
  }

  createOscillator(): OscillatorLike {
    return this.track(new FakeOscillator())
  }
  createGain(): GainLike {
    return this.track(new FakeGain())
  }
  createBiquadFilter(): BiquadLike {
    return this.track(new FakeBiquad())
  }
  createBuffer(_channels: number, length: number): AudioBufferLike {
    return new FakeBuffer(length)
  }
  createBufferSource(): BufferSourceLike {
    return this.track(new FakeBufferSource())
  }
  async resume() {
    this.resumeCalls += 1
    this.state = 'running'
  }
  async suspend() {
    this.suspendCalls += 1
    this.state = 'suspended'
  }
  async close() {
    this.closeCalls += 1
    this.state = 'closed'
  }

  // Everything reachable from `from` by following connections, which is
  // the only honest meaning of "this node can be heard". The first version
  // of the suite asked instead whether ANY created node connected to the
  // bus, and the envelope gain always does, so an oscillator connected to
  // nothing at all passed: deleting one line in voices.ts silenced most of
  // the game with the suite green.
  // `blocked` cuts a node out of the graph before walking, which is how
  // "does this reach the speakers WITHOUT passing the bus" is asked: the
  // bus itself connects to the destination, so a plain walk reaches the
  // destination from everywhere and proves nothing about bypassing.
  reaches(from: AudioNodeLike, target: AudioNodeLike, blocked?: AudioNodeLike): boolean {
    const seen = new Set<AudioNodeLike>()
    const stack: AudioNodeLike[] = [from]
    while (stack.length) {
      const node = stack.pop()!
      if (node === blocked) continue
      if (node === target) return true
      if (seen.has(node)) continue
      seen.add(node)
      if (node instanceof FakeNode) {
        stack.push(...node.connections)
        // Modulation is a path to the speakers too: an LFO on a filter's
        // cutoff is heard through that filter. Crossing param to owner is
        // what makes "this oscillator is doing something" a question the
        // walk can answer rather than a dead end that looks like silence.
        // A param with no owner is a hole in this fake, not a quiet
        // negative, so it says so.
        for (const param of node.modulates) {
          if (!param.owner) {
            throw new Error('fake audio: a param was connected to but has no owner; reaches() cannot follow it')
          }
          stack.push(param.owner)
        }
      }
    }
    return false
  }

  // Reachable by SIGNAL only, never by modulation.
  //
  // reaches() deliberately crosses from a param to the node that owns it,
  // because modulation is audible: an LFO on a filter cutoff is heard
  // through that filter. But the two paths are not interchangeable, and a
  // guard about gain staging needs the difference: an LFO "reaches" a
  // layer gain while contributing no amplitude to it, so counting it as a
  // voice put three oscillators in a two-oscillator layer and read the
  // LFO's depth gain of 160 as a mix level.
  carriesTo(from: AudioNodeLike, target: AudioNodeLike): boolean {
    const seen = new Set<AudioNodeLike>()
    const stack: AudioNodeLike[] = [from]
    while (stack.length) {
      const node = stack.pop()!
      if (node === target) return true
      if (seen.has(node)) continue
      seen.add(node)
      if (node instanceof FakeNode) stack.push(...node.connections)
    }
    return false
  }

  // Every node that was told to make a sound: oscillators and noise
  // sources that were started. These are the ones whose path to the bus
  // has to be proven, because they are the only ones that produce audio.
  sounding(): FakeNode[] {
    return [
      ...this.oscillators().filter((o) => o.started !== null),
      ...this.sources().filter((s) => s.started !== null),
    ]
  }

  oscillators(): FakeOscillator[] {
    return this.created.filter((n): n is FakeOscillator => n instanceof FakeOscillator)
  }

  sources(): FakeBufferSource[] {
    return this.created.filter((n): n is FakeBufferSource => n instanceof FakeBufferSource)
  }

  // Everything that was actually told to make a sound, which is the only
  // thing a listener would hear.
  startedCount(): number {
    return this.oscillators().filter((o) => o.started !== null).length + this.sources().filter((s) => s.started !== null).length
  }

  // Move the clock the way a real context's does between cues.
  advance(seconds: number): void {
    this.currentTime += seconds
  }

  reset(): void {
    this.created.length = 0
  }
}

// Install the fake as the platform's AudioContext (Round 4d).
//
// jsdom implements no Web Audio, so there is no global to shadow and this
// simply supplies one. That matters: with it in place, src/audio/engine.ts
// reaches the context through its OWN factory, the same path a browser
// takes, with no test-only seam in the production code. The alternative
// would be exporting a setter for the shared engine, and a seam that only
// the suite uses is a seam the suite can be wrong about.
export function installFakeAudioContext(): { contexts: FakeAudioContext[]; ctor: new () => FakeAudioContext } {
  const contexts: FakeAudioContext[] = []
  class Installed extends FakeAudioContext {
    constructor() {
      super()
      contexts.push(this)
    }
  }
  ;(globalThis as { AudioContext?: unknown }).AudioContext = Installed
  return { contexts, ctor: Installed }
}

export function removeFakeAudioContext(): void {
  delete (globalThis as { AudioContext?: unknown }).AudioContext
}
