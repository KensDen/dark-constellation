#!/usr/bin/env node
// THE 3D GAME'S BOT (v2.0 R1; the 3D slice's bot before it). Plays whole
// six-night games in a real headless Chrome over the built game, at
// 390x844 and 1440x900, the way four kinds of player would (a first-time
// player on EASY, the Daily Op, a deliberately poor line, a beginner who
// only taps), using the game's own hands: the scan (tapped, and dragged as
// a lens), a defense dragged onto an asset, an answer dragged onto its
// target, a link rerouted, an asset isolated, the timed tap, the debris
// call. It captures every beat (the opening, each night's plan, each
// strike's answer, impact and result, each dawn, the debrief, the replay
// and the Dossier), and checks what a capture cannot show: no page or
// console error, every button named and at least 44px to the thumb, the
// dock's height, the frame's draw calls and the frame rate the loop holds.
// It writes a contact sheet a game, a log, a playtest table, and with
// --video one whole phone game as a film.
//
//   node scripts/game3d-bot.mjs --out <dir> [--video] [--only <run>] [--sheets]
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
const OUT = resolve(value('--out', 'game3d-captures'))
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

const root = (key) => `(document.querySelector('.t3-root')?.dataset.${key} ?? '')`
const stageIs = (stage, step) => `document.querySelector('[data-t3-stage="${stage}"]${step === undefined ? '' : `[data-t3-step="${step}"]`}')`
const click = (b, selector) => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; e.click(); return true })()`)
const exists = (b, selector) => b.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)
const centre = (b, selector) =>
  b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)

// A finger (the page hears it as a pointer): down on one thing, across the
// world in steps, and up on another, with a rest before letting go.
async function dragTo(b, from, to, rest = 120) {
  const a = typeof from === 'string' ? await centre(b, from) : from
  const z = typeof to === 'string' ? await centre(b, to) : to
  if (!a || !z) return false
  const mouse = (type, x, y) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' })
  await mouse('mousePressed', a.x, a.y)
  const steps = 14
  for (let i = 1; i <= steps; i += 1) {
    await mouse('mouseMoved', a.x + ((z.x - a.x) * i) / steps, a.y + ((z.y - a.y) * i) / steps)
    await sleep(18)
  }
  await sleep(rest)
  await mouse('mouseReleased', z.x, z.y)
  return true
}
async function press(b, x, y) {
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

// Every button the game shows: named, and big enough for a thumb.
const AUDIT = `(() => {
  const bad = []
  for (const e of document.querySelectorAll('.t3-root button, .t3-root a.t3-btn')) {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') continue
    const name = (e.getAttribute('aria-label') || e.textContent || '').trim()
    if (!name) bad.push('unnamed button ' + e.className)
    if (r.width < 43.5 || r.height < 43.5) bad.push('small target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + name.slice(0, 30) + '"')
    const scroller = e.closest('.t3-tray, .t3-debrief, .t3-room')
    if (!e.disabled && !scroller && (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) && !e.closest('.t3-tags')) bad.push('off screen "' + name.slice(0, 30) + '" ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.right) + ',' + Math.round(r.bottom))
  }
  const dock = document.querySelector('[data-t3-dock]')?.getBoundingClientRect()
  if (dock && innerWidth < 1000 && dock.height > innerHeight * 0.72) bad.push('the dock covers ' + Math.round((dock.height / innerHeight) * 100) + '% of the height')
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  return bad
})()`

const FPS = `new Promise((done) => { let n = 0; const t0 = performance.now(); const f = (t) => { n += 1; if (t - t0 < 2000) requestAnimationFrame(f); else done(Math.round((n * 1000) / (t - t0))) }; requestAnimationFrame(f) })`

// What is over the fleet before a night: each signature, whether the scan
// has named it, and what COLDVEIL does with it.
const CONTACTS = `[...document.querySelectorAll('[data-t3-contact]')].map((e) => ({ id: e.dataset.t3Contact, known: e.dataset.known === 'true', favor: e.dataset.favor, held: e.classList.contains('is-held'), asset: e.closest('.t3-tag')?.querySelector('[data-t3-asset]')?.dataset.t3Asset }))`

// A stream of the bot's own, so a line that flips coins replays.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function run(b, base, view, plan, log, shots, table) {
  const [w, h, dsf, tag] = view
  const failures = []
  const name = `${tag}_${plan.name}`
  const quick = !!plan.reduced
  const coin = rng(plan.seed ?? 7)
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 700 })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: plan.reduced ? 'reduce' : 'no-preference' }] })
  let n = 0
  const shot = async (label, note = '') => {
    n += 1
    const file = `${name}_${String(n).padStart(3, '0')}_${label}.png`
    const r = await b.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, 'shots', file), Buffer.from(r.data, 'base64'))
    const stage = await b.evaluate(`document.querySelector('.t3-root')?.dataset.t3Stage ?? 'title'`)
    shots.push({ file, run: name, label, stage, note })
    log.push(`- ${file} (${stage})${note ? `: ${note}` : ''}`)
    const bad = await b.evaluate(AUDIT)
    for (const x of bad) failures.push(`${name} ${label}: ${x}`)
  }
  const fail = (m) => failures.push(`${name}: ${m}`)

  log.push(`\n## ${name}: ${plan.what}\n`)
  await b.send('Page.navigate', { url: 'about:blank' })
  await sleep(150)
  await b.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'local_storage' })
  await b.send('Page.navigate', { url: base })
  if (!(await waitFor(b, 'document.querySelector("[data-play]")'))) return [`${name}: the title never showed PLAY`]
  // What the device already has: nothing for a first visit; otherwise the
  // briefing seen, the guide done, and the difficulty set.
  await b.evaluate(`(() => {
    ${plan.fresh ? '' : `localStorage.setItem('dc-intro-seen', '1'); localStorage.setItem('dc-3d-prefs', JSON.stringify({ guideSeen: true, assist: ${!!plan.assist}, lowPower: ${!!plan.lowPower} }));`}
    ${plan.difficulty ? `localStorage.setItem('dc-difficulty', '${plan.difficulty}');` : ''}
    return true
  })()`)
  await b.send('Page.reload')
  if (!(await waitFor(b, 'document.querySelector("[data-play]")'))) return [`${name}: the title never showed PLAY`]
  await sleep(quick ? 300 : 900)
  await shot('title', plan.daily ? 'the title: DAILY OP' : 'the title: PLAY goes to the 3D game')
  const started = Date.now()
  if (plan.daily) {
    await click(b, '[data-daily]')
  } else if (plan.seed && !plan.fresh) {
    // A seed of its own, through the address a share would carry.
    await b.send('Page.navigate', { url: `${base}?view=3d&seed=${plan.seed}` })
  } else await click(b, '[data-play]')
  if (!(await waitFor(b, 'document.querySelector(".t3-root canvas")', 20000))) return [`${name}: the 3D game never opened`]

  if (plan.fresh) {
    // The briefing, in the world: four shots, then the watch.
    if (!(await waitFor(b, stageIs('opening')))) fail('a first visit did not open on the briefing')
    for (let i = 0; i < 4; i += 1) {
      await waitFor(b, `document.querySelector('[data-t3-beat="${i}"]')`)
      await sleep(quick ? 250 : 2600)
      await shot(`opening-${i + 1}`, 'the briefing in the world: the watch officer, and the camera on what is said')
      await click(b, '[data-t3-opening-next]')
      await sleep(120)
      if (await exists(b, `[data-t3-beat="${i}"]`)) await click(b, '[data-t3-opening-next]')
    }
  }
  if (!(await waitFor(b, stageIs('plan')))) return [...failures, `${name}: the game never reached its first plan`]
  log.push(`- ${await b.evaluate(`document.querySelector('[data-t3-night]')?.textContent`)}, status ${await b.evaluate(root('t3Status'))}`)

  const stats = { scans: 0, lens: 0, placed: 0, dragged: 0, rerouted: 0, isolated: 0, shielded: 0, tapped: 0, perfect: 0, good: 0, rode: 0, burned: 0, held: 0 }
  let fpsLogged = false

  let reloaded = false
  // ---------------------------------------------------------- one night
  const planNight = async (night) => {
    if (plan.continueAt === night) {
      // THE AUTOSAVE: leave for the title mid-game, and CONTINUE.
      await b.send('Page.navigate', { url: base })
      if (!(await waitFor(b, 'document.querySelector("[data-continue]")', 8000))) {
        // A game in progress resumes at once; the title offers it when asked for.
        if (!(await waitFor(b, stageIs('plan'), 8000))) fail(`night ${night}: the autosave did not resume`)
      } else {
        await shot(`n${night}-title-continue`, 'the title with a game in progress: CONTINUE')
        await click(b, '[data-continue]')
      }
      if (!(await waitFor(b, stageIs('plan'), 10000))) fail(`night ${night}: CONTINUE did not return to the plan`)
      const turn = await b.evaluate(root('t3Turn'))
      if (String(turn) !== String(night)) fail(`the autosave resumed on night ${turn}, not night ${night}`)
      else log.push(`- night ${night}: left for the title and resumed from the autosave on night ${turn}`)
      // And the save code, from SYSTEM.
      await b.evaluate(`navigator.clipboard.writeText = async (t) => { window.__code = t }`)
      await click(b, '[data-t3-menu]')
      await waitFor(b, 'document.querySelector("[data-t3-sys=code]")')
      await click(b, '[data-t3-sys="code"]')
      await sleep(300)
      const code = await b.evaluate('window.__code ?? ""')
      if (!code.startsWith('DC1-')) fail('SYSTEM copied no save code')
      else log.push(`- night ${night}: SYSTEM copied a save code of ${code.length} characters`)
      await click(b, '[data-t3-room-back]')
    }
    await sleep(quick ? 400 : 2100)
    if (await exists(b, '[data-t3-guide]')) await shot(`n${night}-guide`, 'the guide: one line, in the world, and a way to skip it')
    await shot(`n${night}-dusk`, 'before the night: unidentified signatures over the fleet, the stakes, the scan, the pieces')
    if (!fpsLogged) {
      fpsLogged = true
      const fps = await b.evaluate(FPS)
      const st = await b.evaluate('window.__dc3d ? window.__dc3d.stats() : null')
      log.push(`- frame: ${fps} fps over 2 s, ${st ? `${st.calls} draw calls, ${st.triangles} triangles, ${st.points} points` : 'no stats'}`)
      table.fps.push({ run: name, fps, calls: st?.calls ?? 0, triangles: st?.triangles ?? 0 })
      if (fps < 50 && !plan.reduced && !plan.lowPower) fail(`${fps} fps at the plan`)
    }
    // THE SCAN.
    let contacts = await b.evaluate(CONTACTS)
    const unknown = () => contacts.filter((c) => !c.known)
    let scanned = 0
    while (plan.scan !== 'none' && unknown().length > 0) {
      const c = unknown()[plan.scan === 'second' && scanned === 0 && unknown().length > 1 ? 1 : 0]
      const left = Number(await b.evaluate(root('t3Pulses')))
      if (!(left > 0)) break
      let byLens = false
      if (plan.scan === 'lens' && scanned === 0) {
        // The lens, dragged over the signature and held there.
        await click(b, '[data-t3-close]')
        await sleep(150)
        await dragTo(b, '[data-t3-lens]', `[data-t3-contact="${c.id}"]`, 780)
        byLens = await waitFor(b, `document.querySelector('[data-t3-contact="${c.id}"][data-known="true"]')`, 2500)
        if (byLens) stats.lens += 1
      }
      if (!byLens) {
        await click(b, `[data-t3-contact="${c.id}"]`)
        await sleep(quick ? 200 : 700)
        if (scanned === 0 && night <= 2) await shot(`n${night}-unidentified`, 'a signature in hand: its look, its track, and the scan')
        await click(b, `[data-t3-scan="${c.id}"]`)
      }
      if (!(await waitFor(b, `document.querySelector('[data-t3-contact="${c.id}"][data-known="true"]')`, 6000))) {
        fail(`night ${night}: the scan did not identify ${c.id}`)
        break
      }
      scanned += 1
      stats.scans += 1
      await sleep(quick ? 150 : 500)
      if (scanned === 1 && night <= 3) await shot(`n${night}-identified`, 'identified: the name, what COLDVEIL does with it, what it would take, and the pieces that answer it')
      contacts = await b.evaluate(CONTACTS)
    }
    await click(b, '[data-t3-close]')
    contacts = await b.evaluate(CONTACTS)
    // THE PIECE.
    if (plan.place === 'smart') {
      const want = contacts.filter((c) => c.known && !c.held && c.favor !== 'unlikely')
      for (const c of want) {
        await click(b, `[data-t3-contact="${c.id}"]`)
        await sleep(quick ? 150 : 450)
        // A careful player leaves a piece that would put WORST CASE below 0.
        const piece = await b.evaluate(`document.querySelector('[data-t3-order]:not(:disabled):not([data-risky])[aria-pressed="false"]')?.dataset.t3Order ?? null`)
        if (!piece) {
          await click(b, '[data-t3-close]')
          continue
        }
        if (plan.hands && night % 2 === 1) {
          // Dragged from the tray onto the asset under the signature.
          await click(b, '[data-t3-close]')
          await sleep(200)
          await b.evaluate(`document.querySelector('[data-t3-piece="${piece}"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })`)
          await sleep(150)
          await dragTo(b, `[data-t3-piece="${piece}"]`, `[data-t3-asset="${c.asset}"]`, 260)
          stats.dragged += 1
        } else await click(b, `[data-t3-order="${piece}"]`)
        if (await waitFor(b, `document.querySelector('[data-t3-piece="${piece}"].is-ordered')`, 3000)) stats.placed += 1
        else fail(`night ${night}: ${piece} was not placed`)
        await sleep(quick ? 200 : 900)
        await shot(`n${night}-placed`, `${piece} placed on the asset: the shield stands, and COLDVEIL reads it`)
        break
      }
    } else if (plan.place === 'random') {
      // A beginner picks by name, risky or not: the game says so at BEGIN.
      const free = await b.evaluate(`[...document.querySelectorAll('[data-t3-piece][data-state="free"]')].map((e) => e.dataset.t3Piece)`)
      if (free.length && coin() < 0.85) {
        const piece = free[Math.floor(coin() * free.length)]
        await click(b, `[data-t3-piece="${piece}"]`)
        await sleep(quick ? 150 : 450)
        if (night <= 2) await shot(`n${night}-piece`, 'a piece in hand: its formal name, what it answers tonight, and where it can go')
        if (await click(b, '[data-t3-place]')) stats.placed += 1
        await sleep(quick ? 150 : 600)
      }
    }
    if (plan.fleet && night === 1) {
      await click(b, '[data-t3-fleet]')
      await sleep(quick ? 150 : 400)
      await click(b, '[data-t3-asset-order="drone"]')
      await sleep(quick ? 150 : 400)
      await shot(`n${night}-fleet`, 'the fleet: a drone ordered, arriving at dawn')
    }
    await click(b, '[data-t3-close]')
    await sleep(quick ? 300 : 1200)
    await shot(`n${night}-orders`, 'the whole theater with tonight’s orders in')
    log.push(`- night ${night}: ${await b.evaluate(`(document.querySelector('[data-t3-order-line]')?.textContent ?? '').trim()`)}; ${await b.evaluate(`(document.querySelector('[data-t3-stakes]')?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)}`)
    if (!(await click(b, '[data-t3-begin]'))) fail(`night ${night}: no BEGIN THE NIGHT`)
    await sleep(150)
    if (await exists(b, '[data-t3-risk]')) {
      // WORST CASE is below 0: the game asks again, and says what it risks.
      await shot(`n${night}-at-risk`, 'BEGIN asked twice: tonight could break the budget, and the game says so first')
      log.push(`- night ${night}: ${await b.evaluate(`document.querySelector('[data-t3-risk]').textContent`)}`)
      // The beginner takes the order back and begins safe.
      const mine = await b.evaluate(`document.querySelector('[data-t3-piece].is-ordered')?.dataset.t3Piece ?? null`)
      if (mine) {
        await click(b, `[data-t3-piece="${mine}"]`)
        await sleep(200)
        await click(b, '[data-t3-remove]')
        await sleep(200)
        await click(b, '[data-t3-close]')
        stats.placed -= 1
        log.push(`- night ${night}: took ${mine} back`)
      }
      await click(b, '[data-t3-begin]')
      await sleep(150)
      if (await exists(b, '[data-t3-risk]')) await click(b, '[data-t3-begin]')
    }
  }

  const answer = async (night, i) => {
    await sleep(quick ? 300 : 900)
    await shot(`n${night}-s${i + 1}-answer`, 'the strike holds short of its target with its signature on it; the answers stand beside it')
    const options = await b.evaluate(`[...document.querySelectorAll('[data-t3-response]:not(:disabled)')].map((e) => ({ id: e.dataset.t3Response, effect: e.dataset.effect, gesture: e.dataset.gesture ?? null }))`)
    const real = options.filter((o) => o.id !== 'ride')
    let pick = null
    if (plan.respond === 'best') pick = real.find((o) => o.effect === 'block') ?? real[0] ?? null
    if (plan.respond === 'careless') pick = coin() < 2 / 3 ? (real[0] ?? null) : null
    const target = await b.evaluate(root('t3Target'))
    if (!pick) {
      await click(b, '[data-t3-response="ride"]')
      stats.rode += 1
      log.push(`- night ${night} strike ${i + 1}: rode it out`)
      return
    }
    let how = 'tapped'
    if (plan.hands && pick.gesture === 'isolate') {
      // The asset itself: a tap isolates it.
      how = (await click(b, `[data-t3-asset="${target}"]`)) ? 'isolated on the world' : how
      if (how !== 'tapped') stats.isolated += 1
    } else if (plan.hands && pick.gesture === 'reroute') {
      const relay = await b.evaluate(`[...document.querySelectorAll('[data-t3-asset]')].filter((e) => e.dataset.t3Asset !== ${JSON.stringify(target)} && e.dataset.t3Kind !== 'drone' && getComputedStyle(e.closest('.t3-tag')).visibility !== 'hidden' && !e.classList.contains('is-lost')).map((e) => e.dataset.t3Asset)[0] ?? null`)
      if (relay && (await dragTo(b, `[data-t3-asset="${target}"]`, `[data-t3-asset="${relay}"]`, 240))) {
        how = 'link dragged to a relay'
        stats.rerouted += 1
      }
    } else if (plan.hands) {
      if (await dragTo(b, `[data-t3-response="${pick.id}"]`, `[data-t3-asset="${target}"]`, 240)) {
        how = 'dragged onto the target'
        stats.shielded += 1
      }
    }
    await sleep(120)
    // The tap is every gesture's alternative, and the fallback here.
    if (await b.evaluate(`!!${stageIs('choose', i)}`)) {
      await click(b, `[data-t3-response="${pick.id}"]`)
      how = how === 'tapped' ? 'tapped' : `${how} (missed; tapped)`
    }
    log.push(`- night ${night} strike ${i + 1}: ${pick.effect} by ${pick.id}, ${how}`)
  }

  const night = async (nightNo) => {
    await planNight(nightNo)
    await sleep(quick ? 300 : 1100)
    await shot(`n${nightNo}-nightfall`, 'COLDVEIL IS MOVING: night falls, and live conditions press')
    for (let i = 0; i < 5; i += 1) {
      const any = `${stageIs('launch', i)} || ${stageIs('choose', i)} || ${stageIs('call', i)} || ${stageIs('land', i)} || ${stageIs('impact', i)} || ${stageIs('result', i)} || ${stageIs('dawn')}`
      if (!(await waitFor(b, any, 15000))) {
        fail(`night ${nightNo}: step ${i + 1} never started`)
        return false
      }
      if (await b.evaluate(`!!${stageIs('dawn')}`)) break
      if (await b.evaluate(`!!${stageIs('launch', i)}`)) {
        await sleep(quick ? 400 : 1000)
        await shot(`n${nightNo}-s${i + 1}-incoming`, 'the strike leaves COLDVEIL with its own look and sound')
      }
      await waitFor(b, `${stageIs('choose', i)} || ${stageIs('call', i)} || ${stageIs('land', i)} || ${stageIs('impact', i)} || ${stageIs('result', i)}`, 15000)
      if (plan.reloadAt === nightNo && !reloaded && (await b.evaluate(`!!${stageIs('choose', i)}`))) {
        // A RELOAD IN THE NIGHT: it lands on that night's dawn, the move
        // in hand ridden out, never back before the night.
        reloaded = true
        await shot(`n${nightNo}-s${i + 1}-before-reload`, 'a strike held for its answer, and the page reloaded here')
        await b.send('Page.reload')
        if (!(await waitFor(b, stageIs('dawn'), 15000))) fail(`night ${nightNo}: a reload in the night did not land on its dawn`)
        else log.push(`- night ${nightNo}: reloaded with a strike in hand; the game came back at that night's dawn`)
        break
      }
      if (await b.evaluate(`!!${stageIs('choose', i)}`)) await answer(nightNo, i)
      if (await b.evaluate(`!!${stageIs('call', i)}`)) {
        await sleep(quick ? 300 : 900)
        await shot(`n${nightNo}-s${i + 1}-call`, 'the debris call, in the world: burn the satellite off the crossing orbit, or hold')
        const burn = plan.debris === 'burn' || (plan.debris === 'coin' && coin() < 0.5)
        if (burn && plan.hands) {
          const target = await b.evaluate(root('t3Target'))
          const at = await centre(b, `[data-t3-asset="${target}"]`)
          if (at) await dragTo(b, at, { x: at.x - 90, y: at.y - 30 }, 200)
        }
        if (await b.evaluate(`!!${stageIs('call', i)}`)) await click(b, `[data-t3-call="${burn ? 'burn' : 'hold'}"]`)
        stats[burn ? 'burned' : 'held'] += 1
        log.push(`- night ${nightNo}: debris call, ${burn ? 'BURN' : 'HOLD'}`)
        await sleep(quick ? 300 : 1300)
        await shot(`n${nightNo}-s${i + 1}-pass`, burn ? 'the satellite burns along its orbit and the debris crosses behind it' : 'the debris crosses the orbit')
      }
      // THE TIMED TAP: the ring closes on the target as the strike lands.
      if (await waitFor(b, `document.querySelector('[data-t3-tap]') || ${stageIs('impact', i)} || ${stageIs('result', i)}`, 9000)) {
        if (await exists(b, '[data-t3-tap]')) {
          if (plan.timing === 'aim') {
            await sleep(560)
            await shot(`n${nightNo}-s${i + 1}-ring`, 'the ring closing on the target: tap as it meets the strike')
            await sleep(Math.max(0, 300 - 120))
            await press(b, Math.round(w * 0.5), Math.round(h * 0.2))
            stats.tapped += 1
          } else if (plan.timing === 'button') {
            await sleep(700 + Math.floor(coin() * 420))
            await b.evaluate(`document.querySelector('[data-t3-tap]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
            stats.tapped += 1
          }
        }
      }
      await waitFor(b, `document.querySelector('.t3-float') || ${stageIs('result', i)}`, 9000)
      await shot(`n${nightNo}-s${i + 1}-impact`, 'the moment it lands')
      if (!(await waitFor(b, stageIs('result', i), 12000))) {
        fail(`night ${nightNo}: step ${i + 1} never showed its result`)
        return false
      }
      await sleep(quick ? 250 : 600)
      const verdict = await b.evaluate(`document.querySelector('[data-t3-verdict]')?.dataset.t3Verdict ?? 'windfall'`)
      const tapline = await b.evaluate(`(document.querySelector('[data-t3-tapline]')?.textContent ?? '').trim()`)
      if (tapline.startsWith('PERFECT')) stats.perfect += 1
      if (tapline.startsWith('GOOD')) stats.good += 1
      log.push(`- night ${nightNo} step ${i + 1}: ${verdict}${tapline ? `, ${tapline}` : ''}; ${await b.evaluate(`(document.querySelector('[data-t3-helped]')?.textContent ?? '').trim()`)}`)
      await shot(`n${nightNo}-s${i + 1}-result-${verdict}`, 'the result: what happened, why a defense held, what would have helped, the Dossier card')
      if ((await exists(b, '[data-t3-file]')) && (await click(b, '.t3-dossier-head'))) {
        await sleep(300)
        await shot(`n${nightNo}-s${i + 1}-card`, 'READ THE CARD: the Dossier card, in place')
        await click(b, '.t3-dossier-head')
        await sleep(120)
      }
      if (!(await click(b, '[data-t3-file]'))) await click(b, '[data-t3-continue]')
    }
    if (!(await waitFor(b, stageIs('dawn'), 15000))) {
      fail(`night ${nightNo} never reached dawn`)
      return false
    }
    await sleep(quick ? 500 : 2700)
    await shot(`n${nightNo}-dawn`, 'dawn: the score against the win line, the watch ring, arrivals, the budget, and what to fix')
    log.push(`- dawn ${nightNo}: ${await b.evaluate(`(document.querySelector('[data-t3-scoreline]')?.textContent ?? '').trim()`)} | ${await b.evaluate(`(document.querySelector('[data-t3-ledger]')?.textContent ?? '').trim()`)}`)
    return true
  }

  for (let nightNo = 1; nightNo <= 6; nightNo += 1) {
    if (!(await night(nightNo))) break
    const over = (await b.evaluate(root('t3Status'))) !== 'playing'
    await click(b, '[data-t3-next]')
    if (over) break
    if (!(await waitFor(b, stageIs('plan'), 8000))) {
      fail(`night ${nightNo + 1} never opened`)
      break
    }
  }

  // --------------------------------------------------------- the debrief
  if (!(await waitFor(b, 'document.querySelector("[data-t3-debrief]")', 10000))) return [...failures, `${name}: the game never reached its debrief`]
  const seconds = Math.round((Date.now() - started) / 1000)
  await sleep(quick ? 400 : 1700)
  await shot('debrief', 'the debrief: the grade, the final score against the line, the nights, NEXT TIME')
  const result = await b.evaluate(`(() => { const d = document.querySelector('[data-t3-debrief]'); const stat = (label) => [...d.querySelectorAll('[data-t3-stats] div')].find((x) => x.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent.trim() ?? ''; return { grade: d.dataset.t3Grade, score: d.querySelector('[data-t3-final-score] b')?.textContent ?? '', head: d.querySelector('h2')?.textContent ?? '', blocks: stat('MOVES BLOCKED'), hits: stat('HITS TAKEN'), streak: stat('BEST STREAK'), time: stat('TIME'), next: (d.querySelector('[data-t3-next-time] p')?.textContent ?? '').trim(), earned: [...d.querySelectorAll('[data-t3-earned] p:not(.t3-hint)')].map((x) => x.textContent) } })()`)
  log.push(`- result: ${result.head}, grade ${result.grade}, score ${result.score}, blocks ${result.blocks}, hits ${result.hits}, best streak ${result.streak}, time on the game's clock ${result.time}, the bot's wall clock ${seconds}s`)
  log.push(`- NEXT TIME: ${result.next}`)
  if (result.earned.length) log.push(`- earned: ${result.earned.join('; ')}`)
  log.push(`- hands: ${JSON.stringify(stats)}`)
  table.games.push({ run: name, what: plan.label, ...result, seconds, stats })
  await b.evaluate(`document.querySelector('.t3-debrief').scrollTo(0, 99999)`)
  await sleep(250)
  await shot('debrief-foot', 'the debrief’s foot: what was earned, PLAY AGAIN, the Dossier, SHARE and the save code')
  if (plan.daily) {
    await b.evaluate(`navigator.share = undefined; navigator.clipboard.writeText = async (t) => { window.__shared = t }`)
    await click(b, '[data-t3-share]')
    await sleep(300)
    const shared = await b.evaluate('window.__shared ?? ""')
    log.push(`- shared: ${JSON.stringify(shared)}`)
    if (!/Daily Op #\d+/.test(shared)) fail('the Daily Op’s share text did not name the Daily Op')
  }
  // THE AFTER-ACTION REPLAY.
  await b.evaluate(`document.querySelector('.t3-debrief').scrollTo(0, 0)`)
  await click(b, '[data-t3-replay]')
  if (!(await waitFor(b, 'document.querySelector("[data-t3-card=replay] [data-t3-scrub]")', 6000))) fail('the replay did not open')
  else {
    await sleep(quick ? 500 : 2600)
    await shot('replay-you', 'the after-action replay: night 1 played in the world, each move and what would have helped')
    const nights = await b.evaluate(`document.querySelectorAll('[data-t3-replay-pick]').length`)
    await click(b, `[data-t3-replay-pick="${Math.min(3, nights)}"]`)
    await sleep(quick ? 500 : 3200)
    await shot('replay-night', 'scrubbed to a later night')
    await click(b, '[data-t3-who="ghost"]')
    await sleep(quick ? 500 : 3200)
    await shot('replay-ghost', 'the ghost run on the same night: NEXT TIME, watched')
    log.push(`- replay: ${await b.evaluate(`[...document.querySelectorAll('.t3-seg button')].map((e) => e.textContent).join(' | ')`)}`)
    await click(b, '[data-t3-replay-back]')
  }
  // THE DOSSIER.
  await waitFor(b, 'document.querySelector("[data-t3-debrief]")')
  await click(b, '[data-t3-dossier-open]')
  if (!(await waitFor(b, 'document.querySelector("[data-t3-room=dossier]")', 5000))) fail('the Dossier did not open')
  else {
    await sleep(quick ? 300 : 900)
    await shot('dossier', 'the Dossier: every threat’s signature in miniature, filed or not, and where it hit')
    await click(b, '[data-t3-dcard][data-filed] .t3-dcard-head')
    await sleep(300)
    await shot('dossier-card', 'a filed card open: the blurb, what stops it, the technique, every source, LEARN MORE')
    const sources = await b.evaluate(`document.querySelectorAll('[data-t3-source]').length`)
    if (sources < 1) fail('a filed Dossier card shows no source link')
    log.push(`- Dossier: ${await b.evaluate(`document.querySelector('[data-t3-dossier-count]')?.textContent`)}; the open card lists ${sources} source link${sources === 1 ? '' : 's'}`)
    await click(b, '[data-t3-room-back]')
  }
  if (plan.system) {
    await click(b, '[data-t3-menu]')
    await waitFor(b, 'document.querySelector("[data-t3-room=system]")')
    await sleep(300)
    await shot('system', 'SYSTEM: Assist, Reduce motion, Low power, sound, and what finished games have earned')
    await click(b, '[data-t3-room-back]')
  }
  if (plan.again) {
    // PLAY AGAIN: a new operation in the same world, from night 1.
    await click(b, '[data-t3-again]')
    if (!(await waitFor(b, stageIs('plan'), 8000)) || String(await b.evaluate(root('t3Turn'))) !== '1') fail('PLAY AGAIN did not open night 1 of a new operation')
    else {
      await sleep(quick ? 400 : 2200)
      await shot('play-again', 'PLAY AGAIN: a new operation, the fleet as it starts, the world kept')
      const assets = await b.evaluate(`document.querySelectorAll('[data-t3-asset]').length`)
      if (assets !== 6) fail(`PLAY AGAIN opened with ${assets} assets, not the starting 6`)
    }
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
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 62, everyNthFrame: 2 })
  await play()
  await b.send('Page.stopScreencast')
  if (frames.length < 2) return 0
  // Screencast frames come when the page changes; the film is 30 a second.
  const FPS_OUT = 30
  const proc = spawn(ffmpeg, ['-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', `${FPS_OUT}`, '-i', 'pipe:0', '-y', '-an', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '6', '-row-mt', '1', file], { stdio: ['pipe', 'ignore', 'inherit'] })
  // An encoder that refuses its input closes the pipe; that is a missing
  // video, said in the log, not a crash of the run.
  let dead = false
  proc.stdin.on('error', () => (dead = true))
  proc.on('close', () => (dead = true))
  const t0 = frames[0].t
  const total = Math.ceil((frames[frames.length - 1].t - t0) * FPS_OUT)
  let k = 0
  for (let f = 0; f <= total; f += 1) {
    while (k + 1 < frames.length && frames[k + 1].t - t0 <= f / FPS_OUT) k += 1
    if (dead) return 0
    if (!proc.stdin.write(frames[k].data)) await Promise.race([new Promise((r) => proc.stdin.once('drain', r)), new Promise((r) => proc.once('close', r))])
  }
  if (dead) return 0
  const closed = new Promise((r) => proc.once('close', r))
  proc.stdin.end()
  return (await closed) === 0 ? frames.length : 0
}

function sheet(title, shots) {
  const cell = (s) => `<figure><img src="shots/${s.file}"><figcaption><b>${s.label}</b> ${s.note}</figcaption></figure>`
  const runs = [...new Set(shots.map((s) => s.run))]
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;padding:24px;background:#0b0f14;color:#e6edf3;font:13px/1.4 system-ui,sans-serif}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:26px 0 10px;color:#7cff9b;letter-spacing:.08em}
.row{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:var(--w)}img{display:block;width:100%;border-radius:8px;border:1px solid #243041}figcaption{margin-top:5px;color:#8b98a8;font-size:11px}figcaption b{color:#e6edf3}
.phone{--w:198px}.desktop{--w:494px}</style>
<h1>${title}</h1><p>Every capture of the bot's runs, in order. Phone runs are 390x844, desktop runs 1440x900.</p>
${runs.map((r) => `<h2>${r}</h2><div class="row ${r.startsWith('390') ? 'phone' : 'desktop'}">${shots.filter((s) => s.run === r).map(cell).join('')}</div>`).join('\n')}`
}

// The contact sheets: the index page photographed a game at a time, so a
// sheet is one game read left to right, small enough to look at closely.
async function contactSheets(b, shots) {
  await b.send('Emulation.setEmulatedMedia', { features: [] })
  mkdirSync(join(OUT, 'contact-sheets'), { recursive: true })
  const runs = shots ? [...new Set(shots.map((s) => s.run))] : null
  await b.send('Emulation.setDeviceMetricsOverride', { width: 2200, height: 1200, deviceScaleFactor: 1, mobile: false })
  await b.send('Page.navigate', { url: pathToFileURL(join(OUT, 'index.html')).href })
  await waitFor(b, 'document.readyState === "complete" && [...document.images].every((i) => i.complete)', 120000)
  const names = runs ?? (await b.evaluate(`[...document.querySelectorAll('h2')].map((h) => h.textContent)`))
  for (const run of names) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 2200, height: 1200, deviceScaleFactor: 1, mobile: false })
    await b.evaluate(`(() => { for (const h of document.querySelectorAll('h2')) { const on = h.textContent === ${JSON.stringify(run)}; h.style.display = on ? '' : 'none'; h.nextElementSibling.style.display = on ? '' : 'none' } return true })()`)
    const size = await b.evaluate('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })')
    await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: Math.min(size.h, 16000), deviceScaleFactor: 1, mobile: false })
    await sleep(400)
    const png = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(join(OUT, 'contact-sheets', `${run}.png`), Buffer.from(png.data, 'base64'))
  }
}

const VIEWS = [
  [390, 844, 2, '390x844'],
  [1440, 900, 1, '1440x900'],
]
// The four players of the brief, and a fifth for Reduce Motion and Assist.
const GAMES = [
  { name: 'a-first-time-easy', label: 'First-time EASY (hands on)', what: 'a first visit: the briefing in the world, the guide, then a careful game on EASY with every gesture made by hand', fresh: true, seed: 3, scan: 'lens', place: 'smart', hands: true, fleet: true, respond: 'best', timing: 'aim', debris: 'burn', system: true },
  { name: 'b-daily-op', label: 'Daily Op (STANDARD, hands on)', what: 'the Daily Op from the title, on STANDARD, played carefully by hand, and shared', daily: true, seed: 5, scan: 'tap', place: 'smart', hands: true, respond: 'best', timing: 'aim', debris: 'burn' },
  { name: 'c-poor', label: 'Deliberately poor (STANDARD)', what: 'nothing scanned, nothing placed, every move ridden out, HOLD on the debris', difficulty: 'standard', seed: 20261110, scan: 'none', place: 'none', respond: 'ride', timing: 'none', debris: 'hold', reloadAt: 2 },
  { name: 'd-beginner', label: 'Beginner (EASY, taps only)', what: 'a beginner on EASY who only taps: scans the first signatures, places a piece that looks good, answers 2 moves in 3, taps the TAP button late or early', difficulty: 'easy', seed: 77, scan: 'second', place: 'random', respond: 'careless', timing: 'button', debris: 'coin', continueAt: 3, again: true },
]
const EXTRA = [{ name: 'e-reduced-assist', label: 'Reduce Motion and Assist (EASY, taps only)', what: 'Reduce Motion with Assist and low power: no camera travel, no timed tap, every action a plain activation', difficulty: 'easy', seed: 3, reduced: true, assist: true, lowPower: true, scan: 'tap', place: 'smart', respond: 'best', timing: 'none', debris: 'burn', views: ['390x844'] }]
async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.log('no Chrome found (set CHROME_PATH); the 3D bot did not run')
    process.exit(2)
  }
  mkdirSync(join(OUT, 'shots'), { recursive: true })
  if (flag('--sheets')) {
    // The sheets again, from the index a run already wrote.
    const b = await browser(chrome)
    try {
      await b.send('Page.enable')
      await contactSheets(b, null)
    } finally {
      b.close()
    }
    return
  }
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}/dark-constellation/`
  const b = await browser(chrome)
  const failures = []
  const errors = []
  const log = ['# Dark Constellation v2.0 R1: the 3D game, bot runs', '', `Build served from dist/. ${new Date().toISOString()}`]
  const shots = []
  const table = { games: [], fps: [] }
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
      for (const plan of [...GAMES, ...EXTRA]) {
        if (plan.views && !plan.views.includes(view[3])) continue
        if (only && !`${view[3]}_${plan.name}`.includes(only)) continue
        process.stdout.write(`[3d-bot] ${view[3]} ${plan.name} ... `)
        const f = await run(b, base, view, plan, log, shots, table)
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
        const frames = await record(b, ffmpeg, join(OUT, '390x844_full-game.webm'), () => run(b, base, VIEWS[0], { ...GAMES[0], name: 'video' }, [], film, { games: [], fps: [] }))
        for (const s of film) rmSync(join(OUT, 'shots', s.file), { force: true })
        console.log(`${frames} frames`)
        log.push(frames ? `\nVideo: 390x844_full-game.webm, game (a) whole at 390x844, ${frames} screencast frames at 30 a second.` : '\nThe video could not be encoded on this machine.')
      }
    }
    writeFileSync(join(OUT, 'index.html'), sheet('Dark Constellation v2.0 R1: the 3D game, every beat', shots))
    writeFileSync(join(OUT, 'playtest.json'), JSON.stringify(table, null, 1))
    await contactSheets(b, shots)
  } finally {
    b.close()
    server.close()
  }
  log.push('\n## Checks\n')
  log.push(errors.length ? errors.map((e) => `- ${e}`).join('\n') : '- No page error and no console error in any run.')
  log.push(failures.length ? failures.map((f) => `- FAIL ${f}`).join('\n') : '- Every button named, at least 44px, and on screen in every capture; every game reached its debrief.')
  log.push('\n## Playtest table\n')
  log.push('| game | grade | result | score | moves blocked | hits | best streak | time on the game clock | bot wall clock |')
  log.push('|---|---|---|---|---|---|---|---|---|')
  for (const g of table.games) log.push(`| ${g.run}: ${g.what} | ${g.grade} | ${g.head} | ${g.score} | ${g.blocks} | ${g.hits} | ${g.streak} | ${g.time} | ${g.seconds}s |`)
  log.push('\n## Frames\n')
  for (const f of table.fps) log.push(`- ${f.run}: ${f.fps} fps, ${f.calls} draw calls, ${f.triangles} triangles`)
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
