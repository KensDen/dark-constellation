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
  kind: 'set' | 'linear' | 'exponential'
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
  value = 0
  readonly events: ParamEvent[] = []
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
  // The first value this param was ever told to hold, which for a tone is
  // its pitch and for an envelope is its floor.
  first(): number | undefined {
    return this.events[0]?.value
  }
}

export class FakeNode implements AudioNodeLike {
  readonly connections: AudioNodeLike[] = []
  disconnected = false
  constructor(readonly role: string) {}
  connect(destination: AudioNodeLike) {
    this.connections.push(destination)
    return destination
  }
  disconnect() {
    this.disconnected = true
  }
}

export class FakeGain extends FakeNode implements GainLike {
  gain = new FakeParam()
  constructor() {
    super('gain')
  }
}

export class FakeOscillator extends FakeNode implements OscillatorLike {
  type = 'sine'
  frequency = new FakeParam()
  started: number | null = null
  stopped: number | null = null
  constructor() {
    super('oscillator')
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
