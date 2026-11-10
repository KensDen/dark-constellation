#!/usr/bin/env node
// THE 3D SLICE'S BOT (experiment, exp/3d-slice). Plays the 3D turn in a
// real headless Chrome over the built game, at 390x844 and 1440x900, and
// captures each beat: the title's way in, the world before the night, a
// tile with its defense ordered, each strike with its response standing
// beside the target, the block or the hit, the result with the Dossier
// card open and filed, and the dawn. Three nights a viewport, so every
// kind of answer is taken (block, halve, ride it out), and one more under
// Reduce Motion. It also checks what a capture cannot show: no page or
// console error, every button named and at least 44px to the thumb, the
// frame's draw calls, and the frame rate the loop holds.
//
//   node scripts/slice3d-bot.mjs --out <dir> [--video]
//
// Run `npm run build` first; dist/ is served at the GitHub Pages base
// path. Exit codes: 0 pass, 1 a check failed, 2 no Chrome on this machine.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { findChrome, serve } from './phone-layout.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const OUT = resolve(value('--out', 'slice3d-captures'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = createServer()
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  const port = s.address().port
  await new Promise((r) => s.close(r))
  return port
}

// A CDP client with events, which the layout guard's does not need: the
// video is the page's own screencast frames.
async function browser(chrome) {
  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'dc-3d-'))
  const proc = spawn(
    chrome,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'],
    { stdio: 'ignore' },
  )
  let list
  for (let i = 0; i < 300 && !list; i += 1) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    } catch {
      await sleep(100)
    }
  }
  if (!list) throw new Error('Chrome did not start')
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  const handlers = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(JSON.stringify(msg.error)))
      else res(msg.result)
    } else if (msg.method) for (const h of handlers.get(msg.method) ?? []) h(msg.params)
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      id += 1
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const on = (method, h) => handlers.set(method, [...(handlers.get(method) ?? []), h])
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const close = () => {
    try {
      ws.close()
    } catch {
      // gone already
    }
    proc.kill('SIGKILL')
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // the OS's to clean
    }
  }
  return { send, on, evaluate, close }
}

async function waitFor(b, expression, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await b.evaluate(`!!(${expression})`).catch(() => false)) return true
    await sleep(40)
  }
  return false
}

const stageIs = (stage, step) => `document.querySelector('[data-t3-stage="${stage}"]${step === undefined ? '' : `[data-t3-step="${step}"]`}')`
const click = (b, selector) => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true })()`)

// Every button the slice shows: named, and big enough for a thumb.
const AUDIT = `(() => {
  const bad = []
  for (const e of document.querySelectorAll('.t3-root button')) {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') continue
    const name = (e.getAttribute('aria-label') || e.textContent || '').trim()
    if (!name) bad.push('unnamed button ' + e.className)
    if (r.width < 43.5 || r.height < 43.5) bad.push('small target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + name.slice(0, 30) + '"')
    if (!e.disabled && (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) && !e.closest('.t3-tags')) bad.push('off screen "' + name.slice(0, 30) + '" ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.right) + ',' + Math.round(r.bottom))
  }
  const dock = document.querySelector('[data-t3-dock]')?.getBoundingClientRect()
  if (dock && dock.height > innerHeight * 0.72) bad.push('the dock covers ' + Math.round((dock.height / innerHeight) * 100) + '% of the height')
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  return bad
})()`

const FPS = `new Promise((done) => { let n = 0; const t0 = performance.now(); const f = (t) => { n += 1; if (t - t0 < 2000) requestAnimationFrame(f); else done(Math.round((n * 1000) / (t - t0))) }; requestAnimationFrame(f) })`

async function run(b, base, view, plan, log, shots) {
  const [w, h, dsf, tag] = view
  const failures = []
  const name = `${tag}_${plan.name}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 700 })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: plan.reduced ? 'reduce' : 'no-preference' }] })
  let n = 0
  const shot = async (label, note = '') => {
    n += 1
    const file = `${name}_${String(n).padStart(2, '0')}_${label}.png`
    const r = await b.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, 'shots', file), Buffer.from(r.data, 'base64'))
    const stage = await b.evaluate(`document.querySelector('.t3-root')?.dataset.t3Stage ?? 'title'`)
    shots.push({ file, run: name, label, stage, note })
    log.push(`- ${file} (${stage})${note ? `: ${note}` : ''}`)
    const bad = await b.evaluate(AUDIT)
    for (const x of bad) failures.push(`${name} ${label}: ${x}`)
  }

  log.push(`\n## ${name}: ${plan.what}\n`)
  await b.send('Page.navigate', { url: 'about:blank' })
  await sleep(150)
  await b.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'local_storage' })
  if (plan.fromTitle) {
    // The way in a player takes: the title's own button.
    await b.send('Page.navigate', { url: base })
    if (!(await waitFor(b, 'document.querySelector("[data-try3d]")'))) return [`${name}: the title has no TRY 3D button`]
    await sleep(600)
    await b.evaluate('document.querySelector("[data-try3d]").scrollIntoView({ block: "center" })')
    await sleep(200)
    await shot('title', 'TRY 3D (EXPERIMENT) on the title')
    await click(b, '[data-try3d]')
  } else await b.send('Page.navigate', { url: `${base}?view=3d&seed=${plan.seed}` })
  if (!(await waitFor(b, stageIs('plan')))) return [`${name}: the slice never reached its plan`]
  if (plan.fromTitle) {
    await sleep(2600)
    await shot('plan-from-title', 'the slice as it opens from the title, on a seed of its own')
    await click(b, '[data-t3-back]')
    if (!(await waitFor(b, 'document.querySelector("[data-try3d]")'))) failures.push(`${name}: BACK did not return to the title`)
    return failures
  }
  await sleep(plan.reduced ? 400 : 700)
  await shot('opening', 'the camera settling, the lines drawing in')
  await sleep(plan.reduced ? 500 : 2300)
  await shot('plan', 'before the night: the moves aimed at their targets')
  const fps = await b.evaluate(FPS)
  const stats = await b.evaluate('window.__dc3d ? window.__dc3d.stats() : null')
  log.push(`- frame: ${fps} fps over 2 s, ${stats ? `${stats.calls} draw calls, ${stats.triangles} triangles, ${stats.points} points` : 'no stats'}`)
  if (fps < 50 && !plan.reduced) failures.push(`${name}: ${fps} fps at the plan`)

  // Tap the first aimed tile: its card stands beside it.
  if (!(await click(b, '.t3-asset.is-aimed'))) failures.push(`${name}: no aimed tile to tap`)
  await sleep(plan.reduced ? 400 : 1300)
  await shot('tile', 'a tile tapped: what is aimed at it, and the defense that answers it')
  if (plan.defense) {
    // Order the defense from whichever tile offers it.
    let ordered = await click(b, `[data-t3-order="${plan.defense}"]`)
    for (const sel of ordered ? [] : await b.evaluate(`[...document.querySelectorAll('[data-t3-asset]')].map((e) => '[data-t3-asset="' + e.dataset.t3Asset + '"]')`)) {
      await click(b, sel)
      await sleep(150)
      ordered = await click(b, `[data-t3-order="${plan.defense}"]`)
      if (ordered) break
      await click(b, sel)
    }
    if (!ordered) failures.push(`${name}: could not order ${plan.defense}`)
    await sleep(plan.reduced ? 400 : 1100)
    await shot('defense-ordered', `${plan.defense} ordered: the shield goes up and the line stops on it`)
  }
  await b.evaluate(`document.querySelector('.t3-asset.is-on')?.click()`)
  await sleep(plan.reduced ? 400 : 1300)
  await shot('before-the-night', 'the whole theater with the orders in')

  await click(b, '[data-t3-begin]')
  await sleep(plan.reduced ? 300 : 1100)
  await shot('nightfall', 'COLDVEIL IS MOVING: night falls on the area of operations')

  for (let i = 0; i < 4; i += 1) {
    const reached = await waitFor(b, `${stageIs('launch', i)} || ${stageIs('choose', i)} || ${stageIs('land', i)} || ${stageIs('result', i)} || ${stageIs('dawn')}`, 12000)
    if (!reached) {
      failures.push(`${name}: strike ${i + 1} never started`)
      break
    }
    if (await b.evaluate(`!!${stageIs('dawn')}`)) break
    if (await b.evaluate(`!!${stageIs('launch', i)}`)) {
      await sleep(plan.reduced ? 500 : 1150)
      await shot(`strike-${i + 1}-incoming`, 'the strike leaves COLDVEIL for its target')
    }
    await waitFor(b, `${stageIs('choose', i)} || ${stageIs('land', i)} || ${stageIs('result', i)}`)
    if (await b.evaluate(`!!${stageIs('choose', i)}`)) {
      await sleep(plan.reduced ? 300 : 900)
      await shot(`strike-${i + 1}-response`, 'the strike holds short of the tile; the answers stand beside it')
      const want = plan.answers[i] ?? 'ride'
      const sel = want === 'ride' ? '[data-t3-response="ride"]' : `[data-t3-response][data-effect="${want}"]:not(:disabled)`
      if (!(await click(b, sel))) {
        failures.push(`${name}: strike ${i + 1} offered no ${want}`)
        await click(b, '[data-t3-response="ride"]')
      }
      log.push(`- strike ${i + 1}: answered with ${want}`)
    }
    await waitFor(b, `${stageIs('land', i)} || ${stageIs('result', i)}`)
    // The impact: a few frames around it, since a still can miss a flash.
    await waitFor(b, `document.querySelector('.t3-float') || ${stageIs('result', i)}`, 6000)
    await shot(`strike-${i + 1}-impact`, 'the moment it lands')
    await sleep(140)
    await shot(`strike-${i + 1}-impact-after`, 'a beat later')
    if (!(await waitFor(b, stageIs('result', i)))) {
      failures.push(`${name}: strike ${i + 1} never showed its result`)
      break
    }
    await sleep(plan.reduced ? 250 : 600)
    const verdict = await b.evaluate(`document.querySelector('[data-t3-verdict]')?.dataset.t3Verdict ?? 'windfall'`)
    log.push(`- strike ${i + 1}: ${verdict}; ${await b.evaluate(`(document.querySelector('[data-t3-helped]')?.textContent ?? '').trim()`)}`)
    await shot(`strike-${i + 1}-result-${verdict}`, 'the result in place: what happened, what would have helped, the Dossier card')
    if (await click(b, '.t3-dossier-head')) {
      await sleep(350)
      await shot(`strike-${i + 1}-dossier-card`, 'READ THE CARD: the whole Dossier card, in place')
      await click(b, '.t3-dossier-head')
      await sleep(150)
    }
    if (await click(b, '[data-t3-file]')) {
      await sleep(180)
      await shot(`strike-${i + 1}-filed`, 'FILE TO DOSSIER: filed, and counted')
      if (!(await b.evaluate(`JSON.parse(localStorage.getItem('dc-dossier') ?? '[]').length > 0`))) failures.push(`${name}: FILE TO DOSSIER filed nothing`)
    } else await click(b, '[data-t3-continue]')
  }
  if (!(await waitFor(b, stageIs('dawn'), 12000))) failures.push(`${name}: the night never reached dawn`)
  await sleep(plan.reduced ? 500 : 2600)
  await shot('dawn', 'dawn: the score and the budget, and what to fix')
  log.push(`- dawn: ${await b.evaluate(`(document.querySelector('[data-t3-final]')?.textContent ?? '').trim()`)}; ${await b.evaluate(`(document.querySelector('[data-t3-ledger]')?.textContent ?? '').trim()`)}`)
  if (plan.again) {
    await click(b, '[data-t3-again]')
    if (!(await waitFor(b, stageIs('plan')))) failures.push(`${name}: PLAY ANOTHER NIGHT did not start one`)
    await sleep(plan.reduced ? 400 : 2200)
    await shot('another-night', 'PLAY ANOTHER NIGHT: a fresh board on a new seed')
  }
  return failures
}

// The cached ffmpeg a Playwright install leaves on a machine, when there
// is one; the video is skipped, and said to be, when there is not.
function findFfmpeg() {
  const roots = [join(homedir(), 'Library', 'Caches', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright')]
  for (const root of roots) {
    for (const dir of ['ffmpeg-1013', 'ffmpeg-1011', 'ffmpeg-1010', 'ffmpeg-1009']) {
      for (const bin of ['ffmpeg-mac', 'ffmpeg-linux']) if (existsSync(join(root, dir, bin))) return join(root, dir, bin)
    }
  }
  for (const bin of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) if (existsSync(bin)) return bin
  return null
}

async function record(b, ffmpeg, file, play) {
  const frames = []
  b.on('Page.screencastFrame', (p) => {
    frames.push({ data: Buffer.from(p.data, 'base64'), t: p.metadata.timestamp })
    void b.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
  })
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  await play()
  await b.send('Page.stopScreencast')
  if (frames.length < 2) return 0
  // Screencast frames come when the page changes; the film is 30 a second.
  const FPS_OUT = 30
  const proc = spawn(ffmpeg, ['-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', `${FPS_OUT}`, '-i', 'pipe:0', '-y', '-an', '-c:v', 'vp8', '-qmin', '4', '-qmax', '40', '-crf', '10', '-b:v', '2M', '-deadline', 'good', file], { stdio: ['pipe', 'ignore', 'inherit'] })
  const t0 = frames[0].t
  const total = Math.ceil((frames[frames.length - 1].t - t0) * FPS_OUT)
  let k = 0
  for (let f = 0; f <= total; f += 1) {
    while (k + 1 < frames.length && frames[k + 1].t - t0 <= f / FPS_OUT) k += 1
    if (!proc.stdin.write(frames[k].data)) await new Promise((r) => proc.stdin.once('drain', r))
  }
  proc.stdin.end()
  await new Promise((r) => proc.on('close', r))
  return frames.length
}

function sheet(title, shots) {
  const cell = (s) => `<figure><img src="shots/${s.file}"><figcaption><b>${s.label}</b> ${s.note}</figcaption></figure>`
  const runs = [...new Set(shots.map((s) => s.run))]
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;padding:24px;background:#0b0f14;color:#e6edf3;font:13px/1.4 system-ui,sans-serif}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:26px 0 10px;color:#7cff9b;letter-spacing:.08em}
.row{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:var(--w)}img{display:block;width:100%;border-radius:8px;border:1px solid #243041}figcaption{margin-top:5px;color:#8b98a8;font-size:11px}figcaption b{color:#e6edf3}
.phone{--w:190px}.desktop{--w:440px}</style>
<h1>${title}</h1><p>Every capture of the bot's runs, in order. Phone runs are 390x844, desktop runs 1440x900.</p>
${runs.map((r) => `<h2>${r}</h2><div class="row ${r.startsWith('390') ? 'phone' : 'desktop'}">${shots.filter((s) => s.run === r).map(cell).join('')}</div>`).join('\n')}`
}

const VIEWS = [
  [390, 844, 2, '390x844'],
  [1440, 900, 1, '1440x900'],
]
// Three nights, so every kind of answer is taken, and the way in.
const PLANS = [
  { name: 'a-shield-and-block', what: 'anti-jam ordered: strike 1 breaks on its shield, strike 2 is blocked by a response; both cards filed', seed: 11, defense: 'antiJam', answers: ['block', 'block'], again: true },
  { name: 'b-halve-then-hit', what: 'no defense: strike 1 halved by a response, strike 2 ridden out with the response used', seed: 1, defense: null, answers: ['halve', 'ride'] },
  { name: 'c-reroute-and-ride', what: 'encrypted backhaul ordered, COLDVEIL reroutes: strike 1 ridden out, strike 2 blocked by a response', seed: 12345, defense: 'encryptedBackhaul', answers: ['ride', 'block'] },
  { name: 'd-reduced-motion', what: 'Reduce Motion: the same night as (a), one framing, no shake', seed: 11, defense: 'antiJam', answers: ['block', 'block'], reduced: true },
  { name: 'e-from-title', what: 'the way in: TRY 3D (EXPERIMENT) on the title, and BACK', fromTitle: true },
]

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.log('no Chrome found (set CHROME_PATH); the 3D bot did not run')
    process.exit(2)
  }
  mkdirSync(join(OUT, 'shots'), { recursive: true })
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}/dark-constellation/`
  const b = await browser(chrome)
  const failures = []
  const errors = []
  const log = ['# The 3D slice: bot runs', '', `Build served from dist/. ${new Date().toISOString()}`]
  const shots = []
  try {
    await b.send('Page.enable')
    await b.send('Runtime.enable')
    await b.send('Log.enable')
    b.on('Runtime.exceptionThrown', (p) => errors.push(`page error: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`))
    b.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`)
    })
    b.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') errors.push(`log error: ${p.entry.text} ${p.entry.url ?? ''}`)
    })
    const only = value('--only', '')
    for (const view of VIEWS) {
      for (const plan of PLANS) {
        if (only && !`${view[3]}_${plan.name}`.includes(only)) continue
        process.stdout.write(`[3d-bot] ${view[3]} ${plan.name} ... `)
        const f = await run(b, base, view, plan, log, shots)
        failures.push(...f)
        console.log(f.length ? `FAIL (${f.length})` : 'ok')
      }
    }
    if (flag('--video')) {
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) log.push('\nNo ffmpeg on this machine: the video was not recorded.')
      else {
        process.stdout.write('[3d-bot] video 390x844 ... ')
        const film = []
        const frames = await record(b, ffmpeg, join(OUT, '390x844_one-night.webm'), () => run(b, base, VIEWS[0], { ...PLANS[0], name: 'video', again: false }, [], film))
        for (const s of film) rmSync(join(OUT, 'shots', s.file), { force: true })
        console.log(`${frames} frames`)
        log.push(`\nVideo: 390x844_one-night.webm, night (a) at 390x844, ${frames} screencast frames at 30 a second.`)
      }
    }
    writeFileSync(join(OUT, 'index.html'), sheet('Dark Constellation: the 3D slice, every beat', shots))
    // The contact sheet: the same page, photographed whole.
    await b.send('Emulation.setEmulatedMedia', { features: [] })
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.send('Page.navigate', { url: pathToFileURL(join(OUT, 'index.html')).href })
    await waitFor(b, 'document.readyState === "complete" && [...document.images].every((i) => i.complete)', 30000)
    const size = await b.evaluate('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })')
    await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: Math.min(size.h, 15000), deviceScaleFactor: 1, mobile: false })
    await sleep(400)
    const png = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(join(OUT, 'contact-sheet.png'), Buffer.from(png.data, 'base64'))
  } finally {
    b.close()
    server.close()
  }
  log.push('\n## Checks\n')
  log.push(errors.length ? errors.map((e) => `- ${e}`).join('\n') : '- No page error and no console error in any run.')
  log.push(failures.length ? failures.map((f) => `- FAIL ${f}`).join('\n') : '- Every button named, at least 44px, and on screen in every capture; every run reached dawn.')
  writeFileSync(join(OUT, 'log.md'), `${log.join('\n')}\n`)
  console.log(`[3d-bot] ${shots.length} captures in ${OUT}`)
  for (const e of errors) console.log(`  ${e}`)
  for (const f of failures) console.log(`  FAIL ${f}`)
  process.exit(failures.length || errors.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
