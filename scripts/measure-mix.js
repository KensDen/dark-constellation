// The mix measurement behind tests/mix-measurement.json (Round 7).
//
// Loudness can only be measured by rendering, and the battery runs in node,
// which has no Web Audio, so this runs in a browser. With the dev server up,
// open the game and run in the console:
//
//   const m = await import('/dark-constellation/scripts/measure-mix.js')
//   JSON.stringify(await m.measureMix())
//
// It renders every effect voice alone and the music pad in its base and full
// states, through
// OfflineAudioContext at 48 kHz, and reports each level three ways:
// unweighted, A-weighted (IEC 61672) and K-weighted (ITU-R BS.1770, the
// broadcast loudness filter). The weighting matters: Round 7 first acted on
// the unweighted figure, which overstates a sub-100 Hz pad, and the verdict
// on the pad changes with the weighting chosen: A puts it well under the
// effects, K puts it well over.
//
// NOT MEASURED: the bed's pentatonic notes. The bed schedules them on the
// wall clock, which never advances inside an offline render, and a note
// played on an unstarted bed produces nothing. The record says so.

const RATE = 48000
const B = '/dark-constellation'

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1
    for (; j & b; b >>= 1) j ^= b
    j ^= b
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const h = i + k + len / 2
        const vr = re[h] * cr - im[h] * ci, vi = re[h] * ci + im[h] * cr
        re[h] = re[i + k] - vr; im[h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
}

// IEC 61672 A-weighting magnitude, normalised to unity at 1 kHz.
const ra = (f) => { const f2 = f * f; return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)) }
const A = (f) => ra(f) / ra(1000)
// ITU-R BS.1770 K-weighting magnitude: the RLB high-pass (38.1 Hz, Q 0.5)
// and the +4 dB high shelf near 1.7 kHz, normalised to unity at 1 kHz.
const kRaw = (f) => {
  const f0 = 38.135, q = 0.5003
  const hp = (f * f) / Math.sqrt((f0 * f0 - f * f) ** 2 + ((f * f0) / q) ** 2)
  const g = 10 ** (4 / 20), fc = 1681.97
  const shelf = Math.sqrt((1 + ((f / fc) ** 2) * g * g) / (1 + (f / fc) ** 2))
  return hp * shelf
}
const K = (f) => kRaw(f) / kRaw(1000)

function levels(samples, active) {
  let n = 1
  while (n < samples.length) n <<= 1
  const re = new Float64Array(n), im = new Float64Array(n)
  re.set(samples)
  fft(re, im)
  let u = 0, a = 0, k = 0
  for (let i = 0; i < n; i++) {
    const f = Math.max(1, ((i <= n / 2 ? i : n - i) * RATE) / n)
    const p = re[i] * re[i] + im[i] * im[i]
    u += p; a += p * A(f) ** 2; k += p * K(f) ** 2
  }
  const d = n * active
  const db = (e) => +(10 * Math.log10(e / d)).toFixed(1)
  return { u: db(u), a: db(a), k: db(k) }
}
const activeCount = (d) => { let c = 0; for (const x of d) if (Math.abs(x) > 1e-4) c++; return c }

export async function measureMix() {
  const { VOICES } = await import(B + '/src/audio/voices.ts')
  const { SOUND_MS } = await import(B + '/src/director/cues.ts')
  const E = await import(B + '/src/audio/engine.ts')
  const M = await import(B + '/src/audio/music.ts')
  const out = { measuredAt: new Date().toISOString().slice(0, 10), musicLevel: E.MUSIC_LEVEL, effectsLevel: E.EFFECTS_LEVEL, voices: {}, pad: {} }
  for (const [cue, voice] of Object.entries(VOICES)) {
    if (cue === 'placeholder' || cue === 'silent') continue
    const secs = Math.max(0.5, (SOUND_MS[cue] ?? 400) / 1000 + 0.4)
    const ctx = new OfflineAudioContext(1, Math.ceil(secs * RATE), RATE)
    const g = ctx.createGain(); g.connect(ctx.destination)
    voice(ctx, g, 0.01, {})
    const d = (await ctx.startRendering()).getChannelData(0)
    out.voices[cue] = levels(d, activeCount(d))
  }
  const full = { ...M.MENU_MUSIC_STATE, mai: 60, threshold: 70, conditions: 2, chainArmed: true }
  for (const [name, state] of [['base', M.MENU_MUSIC_STATE], ['full', full]]) {
    const off = new OfflineAudioContext(1, RATE * 14, RATE)
    const eng = new E.AudioEngine({ createContext: () => off, prefs: { effects: true, music: true }, isVisible: () => true })
    eng.unlock(); eng.setMusicState(state)
    const d = (await off.startRendering()).getChannelData(0).slice(RATE * 4)
    out.pad[name] = levels(d, d.length)
  }
  return out
}
