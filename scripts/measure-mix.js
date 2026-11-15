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
// states, through OfflineAudioContext at 48 kHz, and reports each level
// three ways: unweighted, A-weighted (IEC 61672) and K-weighted (ITU-R
// BS.1770, the broadcast loudness filter); and since v2.0 R3 a fourth
// figure, the K-weighted level of the loudest 400 ms (momentary, below).
// The weighting matters: Round 7 first acted on the unweighted figure,
// which overstates a sub-100 Hz pad, and the verdict on the pad changes
// with the weighting chosen: A puts it well under the effects, K puts it
// well over.
//
// NOT MEASURED: the bed's pentatonic notes. The bed schedules them on the
// wall clock, which never advances inside an offline render, and a note
// played on an unstarted bed produces nothing. The record says so.
//
// Nor is anything here a listener. A level says how much energy a voice
// carries where the ear is sensitive; it does not say whether a heartbeat
// reads as a heartbeat, whether two voices can be told apart, or what a
// phone speaker with nothing under 300 Hz makes of a low one. Those are
// for an ear at #soundboard.
//
// WITHOUT A CONSOLE (v2.0 R3, Ken's ruling of 15 November 2026: voices
// for the threats). There is no Playwright on the machine this is run on,
// so the file also runs under node, where it drives a headless Chrome over
// the CDP client the layout guards already have (scripts/phone-layout.mjs)
// and has the page run measureMix() exactly as the console would:
//
//   npx vite --port 4192 --strictPort          (in another shell)
//   node scripts/measure-mix.js http://localhost:4192 [--write]
//
// It prints what the instrument returned. With --write it also puts the
// figures into tests/mix-measurement.json with the date, the two levels
// and the sha256 of the two measured sources as they are on disk at that
// moment, and touches none of the record's prose, which is a person's to
// write. An offline render needs no gesture and no autoplay flag.
//
// Since v1.3 Round 3 the registry is src/cues.ts. This file went on
// importing it from src/director/cues.ts until v2.0 R3, so between those
// rounds it could not run at all, and the record of those rounds says it
// was rehashed without a render.

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

// The energy of a run of samples under each weighting, as a sum of squares
// (Parseval: the spectrum's power over n is the samples' own).
function energy(samples) {
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
  return { u: u / n, a: a / n, k: k / n }
}

// THE MOMENTARY MAXIMUM (v2.0 R3): the K-weighted level of the loudest
// 400 ms of the render, silence included, which is BS.1770's momentary
// window. u, a and k are means over the samples that sound, so they say
// how loud a voice is WHILE it sounds and are blind to how long that is: a
// 40 ms tick and a tone held for half a second read the same on them, and
// do not sound the same. m is the figure that tells them apart, and the
// threats' voices were the first to need it, some being ticks and some
// being held.
const WINDOW = 0.4 * RATE
function momentary(samples) {
  let max = 0
  for (let at = 0; at === 0 || at + WINDOW <= samples.length; at += WINDOW / 8) {
    max = Math.max(max, energy(samples.subarray(at, at + WINDOW)).k)
  }
  return max / WINDOW
}

function levels(samples, active) {
  const e = energy(samples)
  const db = (x) => +(10 * Math.log10(x)).toFixed(1)
  return { u: db(e.u / active), a: db(e.a / active), k: db(e.k / active), m: db(momentary(samples)) }
}
const activeCount = (d) => { let c = 0; for (const x of d) if (Math.abs(x) > 1e-4) c++; return c }

export async function measureMix() {
  const { VOICES } = await import(B + '/src/audio/voices.ts')
  const { SOUND_MS } = await import(B + '/src/cues.ts')
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

// The node half. A browser has a window and stops above.
if (typeof window === 'undefined') {
  const { createHash } = await import('node:crypto')
  const { readFileSync, writeFileSync } = await import('node:fs')
  const { findChrome, browser, waitFor } = await import('./phone-layout.mjs')
  const origin = process.argv[2]
  const chrome = findChrome()
  if (!origin || !chrome) {
    console.error(origin ? 'no Chrome on this machine (set CHROME_PATH)' : 'usage: node scripts/measure-mix.js <dev server origin> [--write]')
    process.exit(2)
  }
  const b = await browser(chrome)
  try {
    await b.send('Page.navigate', { url: origin + B + '/' })
    await waitFor(b, 'document.readyState === "complete"')
    const out = JSON.parse(await b.evaluate(`import('${B}/scripts/measure-mix.js').then((m) => m.measureMix()).then((r) => JSON.stringify(r))`))
    console.log(JSON.stringify(out, null, 2))
    if (process.argv.includes('--write')) {
      const file = 'tests/mix-measurement.json'
      const record = JSON.parse(readFileSync(file, 'utf8'))
      record.measuredAt = out.measuredAt
      record.measuredAtLevels = { MUSIC_LEVEL: out.musicLevel, EFFECTS_LEVEL: out.effectsLevel }
      record.voices = out.voices
      record.pad = out.pad
      for (const source of Object.keys(record.measuredSources)) {
        record.measuredSources[source] = createHash('sha256').update(readFileSync(source)).digest('hex')
      }
      writeFileSync(file, JSON.stringify(record, null, 2) + '\n')
    }
  } finally {
    b.close()
  }
}
