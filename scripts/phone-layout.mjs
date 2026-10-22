#!/usr/bin/env node
// THE PHONE LAYOUT GUARDS. jsdom lays nothing out, so these drive a real
// headless Chrome over the built game: dist/ is served at the GitHub Pages
// base path and each check runs at 375x667 and 390x844.
//
// GUARD R1 (c), THE BRIEFING FITS ONE PHONE SCREEN (v1.3 R1, brief 5.2:
// "CONTINUE never needs a scroll", Ken, 6 October): a first visit, PLAY,
// and on every beat the button is wholly on screen, the line ends above
// it, and neither the page nor the briefing scrolls; motion on and off,
// since the two paths render differently.
//
// The v1.3 R1 fixes (Ken's iPhone, 21 October 2026) add:
//   SYSTEM IN BOUNDS: on the title's SYSTEM and the board's, no text box
//   starts left of x=0 or ends past the viewport, no text field is under
//   16px (iOS Safari zooms the page on focusing one, and stays zoomed),
//   and the title's SYSTEM is opaque and reaches the bottom of the screen.
//   SCROLL RESET: a screen opens at its top, whatever the last one's
//   scroll (DOSSIER from a scrolled title; Back to title from a scrolled
//   Glossary).
//   TAGLINE: one line, never under 10px.
//
// GUARD R2 (a), THE BOARD FITS (v1.3 brief 5.3: "no page scroll on the
// starter fleet at 375 x 667"): on turn 1 of a first game, at 375x667 and
// 390x844, motion on and off, nothing scrolls, neither the page nor the
// board's body, the dock is wholly on screen and no text leaves the width.
// Checked as served and again with the sans and mono stacks forced to wide
// fallbacks (Verdana or DejaVu Sans, Courier New or DejaVu Sans Mono): the
// CI runner has no SF or Menlo, and a board that fits only in Apple's
// fonts does not fit (the R1 lesson).
//
// GUARD R3 (fit), THE NIGHT'S LABELS FIT 375 (v1.3 brief 8.5: "check
// every label in section 5 at 375 wide"): one seeded operation played
// through every kind of night card (a hit and its intel card, a block, a
// partial, an opportunity, the debris call and its result, every END OF
// TURN, the last one's DEBRIEF), at 375x667, in DC Display as served and
// again with the sans and mono stacks forced wide. On every card no text
// leaves the width, no display-face label overflows its own box, the
// header is not cut, and the way on is wholly on screen.
//
// GUARD R4 (a), THE DEBRIEF'S FIRST SCREEN FITS (v1.3 brief 5.6, the
// designer call ratified 5 October: "the debrief fits one screen before
// its detail sections"): a first game on a clean device, played through
// to DEBRIEF, won and lost (a loss adds its lead line, and a first game
// files the most cards), at 375x667: the eyebrow, the grade block, the
// lead, the six stats and FILED THIS GAME end above the bottom of the
// screen with nothing scrolled, as served and in wide fonts.
//
// R4 LABELS (brief 8.5, the R4 prompt's font rule): on the debrief, the
// Dossier with a card open, LIBRARY's two tabs, the scoreboard and the
// title with a Daily Op done, at 375 as served and in wide fonts, no text
// leaves the width and no display-face label or button overflows its box.
//
// Exit codes: 0 pass, 1 fail, 2 skipped (no Chrome on this machine). The
// battery runs it after the build. GitHub's ubuntu-24.04 runner has
// google-chrome on its path; CHROME_PATH names another.
//
// Node's own WebSocket and http only; a throwaway profile; GET only.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'

export const VIEWPORTS = [
  [375, 667],
  [390, 844],
]
const BASE = '/dark-constellation/'
const DIST = join(process.cwd(), 'dist')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function findChrome(env = process.env) {
  const candidates = [
    env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find((c) => existsSync(c)) ?? null
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' }

export function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://x')
      let rel = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : null
      if (rel === null) return res.writeHead(404).end()
      if (rel === '' || rel.endsWith('/')) rel += 'index.html'
      const file = normalize(join(DIST, rel))
      if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end()
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function freePort() {
  const s = createServer()
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  const port = s.address().port
  await new Promise((r) => s.close(r))
  return port
}

export async function browser(chrome) {
  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'dc-fit-'))
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--no-sandbox', 'about:blank'], { stdio: 'ignore' })
  let list
  for (let i = 0; i < 300 && !list; i += 1) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    } catch {
      await sleep(100)
    }
  }
  if (!list) throw new Error('Chrome did not start')
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(JSON.stringify(msg.error)))
      else res(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      id += 1
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })
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
      // a locked profile is the OS's to clean
    }
  }
  return { send, evaluate, close }
}

export async function waitFor(b, expression, ms = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await b.evaluate(`!!(${expression})`).catch(() => false)) return true
    await sleep(100)
  }
  return false
}

// A CLEAN LOAD of the title, with storage set as given. The page before
// is left for about:blank first, so nothing it is still doing (a board's
// autosave on its next render) can write after the storage is cleared:
// clearing from inside the old page and reloading it raced, about one
// load in twenty, and left an autosave that resumed straight into a game
// with no PLAY (v1.3 R3; the Page.reload retry R2 added could not help,
// since it reloaded into the same autosave).
export async function cleanLoad(b, url, storage = {}) {
  await b.send('Page.navigate', { url: 'about:blank' })
  await waitFor(b, 'location.href === "about:blank" && document.readyState === "complete"')
  await b.send('Storage.clearDataForOrigin', { origin: new URL(url).origin, storageTypes: 'local_storage' })
  await b.send('Page.navigate', { url })
  if (!(await waitFor(b, 'document.readyState === "complete" && !!document.querySelector("[data-play]")', 15000))) return false
  const keys = Object.entries(storage)
  if (!keys.length) return true
  // The title writes nothing, so storage set here is what the reload reads.
  await b.evaluate(`${keys.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} location.reload(); true`)
  await sleep(300)
  return waitFor(b, 'document.readyState === "complete" && !!document.querySelector("[data-play]")', 15000)
}

// One viewport, one motion mode: every beat's measurements, or a failure.
async function check(b, url, [w, h], reduced) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  if (!(await cleanLoad(b, url))) return [`${w}x${h}: the title never showed PLAY`]
  await b.evaluate('document.querySelector("[data-play]").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[data-briefing-next]")'))) return [`${w}x${h}: PLAY did not open the briefing`]
  const failures = []
  for (let beat = 1; ; beat += 1) {
    await sleep(reduced ? 150 : 700)
    const m = await b.evaluate(`(() => {
      const main = document.querySelector('[data-briefing]')
      const btn = document.querySelector('[data-briefing-next]').getBoundingClientRect()
      const text = document.querySelector('[data-briefing-text]').getBoundingClientRect()
      return {
        label: document.querySelector('[data-briefing-next]').innerText.trim(),
        btnTop: btn.top, btnBottom: btn.bottom, textBottom: text.bottom, vh: innerHeight,
        pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
        mainScrolls: main.scrollHeight > main.clientHeight + 1,
      }
    })()`)
    const where = `${w}x${h}, motion ${reduced ? 'off' : 'on'}, beat ${beat}`
    if (m.btnTop < 0 || m.btnBottom > m.vh + 0.5) failures.push(`${where}: ${m.label} is off screen (${Math.round(m.btnTop)} to ${Math.round(m.btnBottom)} of ${m.vh})`)
    if (m.textBottom > m.btnTop + 0.5) failures.push(`${where}: the line runs under ${m.label}`)
    if (m.pageScrolls) failures.push(`${where}: the page scrolls`)
    if (m.mainScrolls) failures.push(`${where}: the briefing scrolls`)
    if (m.label !== 'CONTINUE') break
    if (beat > 12) {
      failures.push(`${where}: no last beat`)
      break
    }
    await b.evaluate('document.querySelector("[data-briefing-next]").click(); true')
  }
  return failures
}

// Every visible element under root with text of its own that leaves the
// viewport sideways, and every text field under 16px.
export const OUT_OF_BOUNDS = `((root) => {
  const bad = []
  for (const e of root.querySelectorAll('*')) {
    const r = e.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) continue
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (own && (r.left < -0.5 || r.right > innerWidth + 0.5)) bad.push(e.tagName + ' "' + e.textContent.trim().slice(0, 24) + '" ' + Math.round(r.left) + '..' + Math.round(r.right))
    if ((e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && parseFloat(getComputedStyle(e).fontSize) < 16) bad.push(e.tagName + ' font ' + getComputedStyle(e).fontSize + ' (iOS zooms under 16px)')
  }
  return bad
})`

async function fresh(b, url, [w, h]) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  return cleanLoad(b, url)
}

async function checkTitle(b, url, [w, h]) {
  const where = `${w}x${h}`
  if (!(await fresh(b, url, [w, h]))) return [`${where}: the title never showed PLAY`]
  const failures = []
  // The tagline's width depends on the system font (SF, Roboto, DejaVu on
  // a CI runner), so it is checked as served and again in a deliberately
  // wide font, which the title must refit on a resize: one line, 10px or
  // more, whatever the font.
  const TAG = `(() => { const e = document.querySelector('[data-tagline]'); const cs = getComputedStyle(e); return { fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6, h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth } })()`
  for (const font of [null, 'Verdana, "DejaVu Sans", sans-serif']) {
    if (font) await b.evaluate(`document.querySelector('[data-tagline]').style.fontFamily = ${JSON.stringify(font)}; dispatchEvent(new Event('resize')); true`)
    const tag = await b.evaluate(TAG)
    const as = font ? ' in a wide font' : ''
    if (tag.fs < 10) failures.push(`${where}: the tagline is ${tag.fs}px${as}, under 10`)
    if (tag.sw > tag.cw + 0.5 || tag.h > tag.lh * 1.5) failures.push(`${where}: the tagline does not fit one line${as} (${tag.sw} of ${tag.cw}px wide, ${Math.round(tag.h)}px tall)`)
  }
  await b.evaluate(`document.querySelector('[data-tagline]').style.fontFamily = ''; dispatchEvent(new Event('resize')); true`)

  // SCROLL RESET, from a scrolled title and from a scrolled Dossier (the
  // Glossary's until v1.3 R4, when DOSSIER opened the Dossier).
  await b.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector(\'[data-read="dossier"]\').click(); true')
  // The Dossier is a lazy chunk: wait for its Back button, not the shell.
  if (!(await waitFor(b, '!!document.querySelector("[data-dossier]") && [...document.querySelectorAll("button")].some((x) => /back to title/i.test(x.innerText))'))) return [...failures, `${where}: DOSSIER did not open the Dossier`]
  await sleep(300)
  let y = await b.evaluate('Math.round(scrollY + document.querySelector("[data-screen]").scrollTop)')
  if (y !== 0) failures.push(`${where}: DOSSIER opened ${y}px down`)
  await b.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); [...document.querySelectorAll("button")].find((x) => /back to title/i.test(x.innerText)).click(); true')
  await waitFor(b, 'document.querySelector("[data-title]")')
  await sleep(300)
  y = await b.evaluate('Math.round(scrollY + document.querySelector("[data-screen]").scrollTop)')
  if (y !== 0) failures.push(`${where}: Back to title opened ${y}px down`)

  // SYSTEM stays in bounds, opaque and full height, with Difficulty in
  // view. (The difficulty chip that opened it there left the title in v1.3
  // R2: Ken's R1 phone pass, item 12.)
  await b.evaluate('window.scrollTo(0, 400); [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-haspopup") === "dialog" && x.innerText.trim() === "SYSTEM").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[role=dialog]")'))) return [...failures, `${where}: SYSTEM did not open`]
  await sleep(300)
  const sys = await b.evaluate(`(() => {
    const d = document.querySelector('[role=dialog]')
    const row = d.querySelector('[data-system-control="difficulty"]').getBoundingClientRect()
    const panel = d.firstElementChild.getBoundingClientRect()
    return { bad: ${OUT_OF_BOUNDS}(d), rowTop: row.top, rowBottom: row.bottom, panelBottom: panel.bottom, bg: getComputedStyle(d).backgroundColor }
  })()`)
  for (const x of sys.bad) failures.push(`${where}: title SYSTEM: ${x}`)
  if (sys.rowTop < 0 || sys.rowBottom > h) failures.push(`${where}: SYSTEM opened without Difficulty in view`)
  if (sys.panelBottom < h - 1) failures.push(`${where}: title SYSTEM ends at ${Math.round(sys.panelBottom)} of ${h}`)
  // Opaque: no alpha under 1, whichever colour syntax the browser reports
  // (rgba(), or color()/oklab() with a slash alpha from Tailwind's mixes).
  const alpha = /\/\s*([\d.]+)\)$/.exec(sys.bg)?.[1] ?? /^rgba\(.*,\s*([\d.]+)\)$/.exec(sys.bg)?.[1] ?? (sys.bg === 'transparent' ? '0' : '1')
  if (Number(alpha) < 1) failures.push(`${where}: title SYSTEM is see-through (${sys.bg})`)
  return failures
}

// The board's SYSTEM: a first PLAY, SKIP the briefing, open SYSTEM.
async function checkBoardSystem(b, url, [w, h]) {
  const where = `${w}x${h}`
  if (!(await fresh(b, url, [w, h]))) return [`${where}: the title never showed PLAY`]
  await b.evaluate('document.querySelector("[data-play]").click(); true')
  await waitFor(b, 'document.querySelector("[data-briefing-next]")')
  await b.evaluate('[...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "SKIP").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[data-board]")'))) return [`${where}: SKIP did not reach the board`]
  await sleep(500)
  await b.evaluate('document.querySelector(\'button[aria-label="System"]\').click(); true')
  if (!(await waitFor(b, 'document.querySelector("[data-sheet=system]")'))) return [`${where}: the board's SYSTEM did not open`]
  await sleep(400)
  const bad = await b.evaluate(`${OUT_OF_BOUNDS}(document.querySelector('[data-sheet=system]'))`)
  return bad.map((x) => `${where}: board SYSTEM: ${x}`)
}

export const WIDE_FONTS = `:root { --font-sans: Verdana, 'DejaVu Sans', sans-serif !important; --font-mono: 'Courier New', 'DejaVu Sans Mono', monospace !important; }`

async function checkBoard(b, url, [w, h], reduced, wideFonts) {
  const where = `${w}x${h}, motion ${reduced ? 'off' : 'on'}${wideFonts ? ', wide fonts' : ''}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1' }))) return [`${where}: the title never showed PLAY`]
  await b.evaluate('document.querySelector("[data-play]").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[data-dock]") && document.querySelector("[data-tonight]")'))) return [`${where}: PLAY did not reach the board`]
  if (wideFonts) await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); return true })()`)
  await sleep(reduced ? 300 : 900)
  const m = await b.evaluate(`(() => {
    const body = document.querySelector('[data-board-body]')
    const dock = document.querySelector('[data-dock]').getBoundingClientRect()
    return {
      page: document.documentElement.scrollHeight > innerHeight + 1,
      body: [body.scrollHeight, body.clientHeight],
      dockBottom: dock.bottom, vh: innerHeight,
      orders: !!document.querySelector('[data-orders]'),
      bad: ${OUT_OF_BOUNDS}(document.querySelector('[data-board]')),
    }
  })()`)
  const failures = []
  if (m.page) failures.push(`${where}: the page scrolls`)
  if (m.body[0] > m.body[1] + 1) failures.push(`${where}: the board scrolls (${m.body[0]} of ${m.body[1]}px)`)
  if (m.dockBottom > m.vh + 0.5) failures.push(`${where}: the dock ends at ${Math.round(m.dockBottom)} of ${m.vh}`)
  if (!m.orders) failures.push(`${where}: no FIRST ORDERS on turn 1`)
  for (const x of m.bad) failures.push(`${where}: ${x}`)
  return failures
}

// THE NIGHT, DRIVEN (GUARD R3 (fit), and the R3 captures): a seeded
// operation on STANDARD, replayed through SYSTEM's Replay a seed, with the
// orders each turn gives. Seed 24 with NIGHT_PLAN meets every card: a hit
// and its intel card on turn 1, a block on turn 2, a partial and an
// opportunity on turn 3, the debris call on turn 4, and a won operation
// into DEBRIEF on turn 6.
export const NIGHT_SEED = 24
export const NIGHT_PLAN = { 1: [], 2: ['antiJam', 'pntAuth', 'groundZeroTrust'], 3: ['linkAuth'], 4: [], 5: [], 6: [] }

const click = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true })()`

export async function startSeed(b, url, [w, h], reduced, seed) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1', 'dc-difficulty': 'standard' }))) return false
  await b.evaluate(click('[data-play]'))
  if (!(await waitFor(b, 'document.querySelector("[data-dock]")'))) return false
  await b.evaluate(click('button[aria-label="System"]'))
  if (!(await waitFor(b, 'document.querySelector(\'[data-system-control="replay"] input\')'))) return false
  await b.evaluate(`(() => {
    const i = document.querySelector('[data-system-control="replay"] input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(seed))})
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(100)
  await b.evaluate(click('[data-system-control="replay"] button'))
  return waitFor(b, 'document.querySelector("[data-dock]") && !document.querySelector("[data-sheet=system]")')
}

export async function orderDefenses(b, ids) {
  if (!ids.length) return
  await b.evaluate(click('[data-action="procure"]'))
  await waitFor(b, 'document.querySelector("[data-sheet=procure]")')
  for (const id of ids) await b.evaluate(click(`[data-procure-defense="${id}"]`))
  await b.evaluate(click('[data-confirm]'))
  await sleep(150)
}

// Which part of the night is on screen: a card waiting for a tap, the
// intel card, or nothing yet (the overlay or a strike).
export const NIGHT_STAGE = `(() => {
  if (document.querySelector('[data-intel-file]')) return 'intel'
  const c = document.querySelector('[data-night-card]')
  return c ? c.getAttribute('data-night-card') : (document.querySelector('[data-dock]') ? 'board' : 'busy')
})()`

// The night's tap for a stage: FILE IT, COLLECT or CONTINUE, HOLD, BEGIN.
export const NIGHT_TAP = `(() => {
  const pick = (s) => document.querySelector(s)
  const b = pick('[data-file-it]') || pick('[data-call="hold"]') || pick('[data-collect]') || pick('[data-continue]') || pick('[data-begin]')
  if (!b) return false
  b.click()
  return true
})()`

// Every way the open card can fail to fit: text past the width, a
// display-face label wider than its box, a cut header, the way on below
// the screen.
const NIGHT_FIT = `(() => {
  const root = document.querySelector('[data-intel-file]') || document.querySelector('[data-night-card]')
  const bad = ${OUT_OF_BOUNDS}(root)
  for (const e of root.querySelectorAll('.font-display, [data-card-head]')) {
    if (e.getBoundingClientRect().width < 1) continue
    if (e.scrollWidth > e.clientWidth + 1) bad.push('"' + e.textContent.trim().slice(0, 32) + '" overflows its box (' + e.scrollWidth + ' of ' + e.clientWidth + 'px)')
  }
  const way = root.querySelector('[data-file-it], [data-collect], [data-continue], [data-begin], [data-call="hold"]')
  if (way && way.getBoundingClientRect().bottom > innerHeight + 0.5) bad.push('its way on ends at ' + Math.round(way.getBoundingClientRect().bottom) + ' of ' + innerHeight)
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  return bad
})()`

async function checkNight(b, url, [w, h], wideFonts) {
  const where = `${w}x${h}${wideFonts ? ', wide fonts' : ''}`
  if (!(await startSeed(b, url, [w, h], true, NIGHT_SEED))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  if (wideFonts) await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); return true })()`)
  const failures = []
  const seen = new Set()
  for (let turn = 1; turn <= 6; turn += 1) {
    await orderDefenses(b, NIGHT_PLAN[turn])
    await b.evaluate(click('[data-execute]'))
    for (let steps = 0; steps < 30; steps += 1) {
      if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) {
        failures.push(`${where}: turn ${turn}: the night stopped`)
        return failures
      }
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage === 'board') break
      await sleep(80)
      seen.add(stage)
      for (const x of await b.evaluate(NIGHT_FIT)) failures.push(`${where}: turn ${turn}, ${stage}: ${x}`)
      const last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
      await b.evaluate(NIGHT_TAP)
      await sleep(120)
      if (last) return [...failures, ...['hit', 'intel', 'call', 'debris', 'opportunity', 'end'].filter((k) => !seen.has(k)).map((k) => `${where}: the run met no ${k} card`)]
    }
  }
  return [...failures, `${where}: turn 6 did not reach DEBRIEF`]
}

// Every way a screen's labels can fail at 375: text past the width, and a
// display-face label or a button wider than its own box.
const LABELS_FIT = `((root) => {
  const bad = ${OUT_OF_BOUNDS}(root)
  for (const e of root.querySelectorAll('.font-display, button')) {
    if (e.getBoundingClientRect().width < 1) continue
    if (e.scrollWidth > e.clientWidth + 1) bad.push('"' + e.textContent.trim().slice(0, 32) + '" overflows its box (' + e.scrollWidth + ' of ' + e.clientWidth + 'px)')
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  return bad
})`
const wideFontsOn = (b) => b.evaluate(`(() => { const s = document.createElement('style'); s.setAttribute('data-wide-fonts', ''); s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); return true })()`)
const wideFontsOff = (b) => b.evaluate(`(() => { document.querySelectorAll('style[data-wide-fonts]').forEach((s) => s.remove()); return true })()`)

// Plays the operation on screen to its DEBRIEF, every card tapped through.
async function playToDebrief(b, plan) {
  for (let turn = 1; turn <= 6; turn += 1) {
    await orderDefenses(b, plan[turn] ?? [])
    await b.evaluate(click('[data-execute]'))
    for (let steps = 0; steps < 40; steps += 1) {
      if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) return false
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage === 'board') break
      const last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
      await b.evaluate(NIGHT_TAP)
      await sleep(60)
      if (last) return waitFor(b, 'document.querySelector("[data-debrief]")', 8000)
    }
  }
  return false
}

// The first screen's block, measured with nothing scrolled, against the
// top of the bar pinned under the thumb (SHARE and PLAY AGAIN).
const FIRST_SCREEN = `(() => {
  const s = document.querySelector('[data-screen]')
  s.scrollTop = 0
  window.scrollTo(0, 0)
  const first = document.querySelector('[data-debrief-first]').getBoundingClientRect()
  const bar = document.querySelector('[data-debrief-bar]').getBoundingClientRect()
  return { bottom: first.bottom, top: first.top, vh: Math.min(innerHeight, bar.top), barBottom: bar.bottom, lead: !!document.querySelector('[data-loss-lead]'), filed: document.querySelectorAll('[data-filed-card]').length }
})()`

async function checkDebrief(b, url, [w, h], plan, what) {
  const where = `${w}x${h}, ${what}`
  if (!(await startSeed(b, url, [w, h], true, NIGHT_SEED))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  if (!(await playToDebrief(b, plan))) return [`${where}: the operation never reached its debrief`]
  await sleep(300)
  const failures = []
  for (const wide of [false, true]) {
    if (wide) await wideFontsOn(b)
    await sleep(150)
    const m = await b.evaluate(FIRST_SCREEN)
    const as = wide ? ', wide fonts' : ''
    if (m.bottom > m.vh + 0.5) failures.push(`${where}${as}: the first screen ends at ${Math.round(m.bottom)}, under the bar at ${Math.round(m.vh)}`)
    if (m.barBottom > h + 0.5) failures.push(`${where}${as}: PLAY AGAIN's bar ends at ${Math.round(m.barBottom)} of ${h}, off the screen`)
    if (what === 'lost' && !m.lead) failures.push(`${where}: a loss shows no lead line`)
    if (m.filed === 0) failures.push(`${where}: a first game filed no card, so the list is not measured`)
    for (const x of await b.evaluate(`${LABELS_FIT}(document.querySelector('[data-debrief-screen]'))`)) failures.push(`${where}${as}: ${x}`)
  }
  await wideFontsOff(b)
  return failures
}

// The reading rooms and the records, with a device's worth of records in
// them: seven cards filed, today's Daily Op done after yesterday's, and a
// practice run on the scoreboard.
async function checkReadingRooms(b, url, [w, h]) {
  const where = `${w}x${h}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1' }))) return [`${where}: the title never showed PLAY`]
  await b.evaluate(`(() => {
    const key = (d) => String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12)
    localStorage.setItem('dc-daily', JSON.stringify({
      [key(yesterday)]: { n: 26, seed: 11, outcome: 'won', mai: 78.1, bonus: 1.5, turns: 6, recordedAt: yesterday.toISOString() },
      [key(today)]: { n: 27, seed: 12, outcome: 'lost', lossReason: 'belowThreshold', mai: 64.3, turns: 6, recordedAt: today.toISOString() },
    }))
    localStorage.setItem('dc-scores', JSON.stringify([{ outcome: 'won', mai: 82.4, seed: 5, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'standard', bonus: 2, recordedAt: today.toISOString() }]))
    localStorage.setItem('dc-dossier', JSON.stringify(['uplink-jamming', 'gnss-spoofing', 'pnt-jamming', 'ops-phishing', 'lidar-dazzle', 'ground-ransomware', 'blackout-chain']))
    location.reload()
    return true
  })()`)
  await sleep(300)
  if (!(await waitFor(b, 'document.querySelector("[data-daily-countdown]")', 15000))) return [`${where}: the title shows no countdown with today's Daily Op done`]
  const failures = []
  const screens = [
    ['the title with a Daily Op done', null, '[data-title]'],
    ['the Dossier with a card open', `document.querySelector('[data-read="dossier"]').click(); true`, '[data-dossier]', `(() => { document.querySelector('[data-dossier-card][data-filed]').open = true; return true })()`],
    ["LIBRARY's Field Library", `[...document.querySelectorAll('button')].find((x) => /back to title/i.test(x.innerText)).click(); setTimeout(() => document.querySelector('[data-read="library"]').click(), 50); true`, '[data-field-library]'],
    ["LIBRARY's Glossary", `document.querySelector('[data-tab="glossary"]').click(); true`, '[data-glossary]'],
    ['the scoreboard', `[...document.querySelectorAll('button')].find((x) => /back to title/i.test(x.innerText)).click(); setTimeout(() => { document.querySelector('[data-title-system]').click(); setTimeout(() => document.querySelector('[data-system-control="scoreboard"]').click(), 50) }, 50); true`, '[data-scoreboard]'],
  ]
  for (const [name, go, ready, then] of screens) {
    if (go) await b.evaluate(go)
    if (!(await waitFor(b, `!!document.querySelector('${ready}')`, 8000))) {
      failures.push(`${where}: ${name} never opened`)
      break
    }
    if (then) await b.evaluate(then)
    await sleep(200)
    for (const wide of [false, true]) {
      if (wide) await wideFontsOn(b)
      await sleep(100)
      for (const x of await b.evaluate(`${LABELS_FIT}(document.querySelector('[data-screen]'))`)) failures.push(`${where}, ${name}${wide ? ', wide fonts' : ''}: ${x}`)
      await wideFontsOff(b)
    }
  }
  return failures
}

export async function phoneLayout(chrome) {
  const server = await serve()
  const url = `http://127.0.0.1:${server.address().port}${BASE}`
  const b = await browser(chrome)
  try {
    const failures = []
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) failures.push(...(await check(b, url, vp, reduced)))
    for (const vp of VIEWPORTS) failures.push(...(await checkTitle(b, url, vp)), ...(await checkBoardSystem(b, url, vp)))
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) for (const wide of [false, true]) failures.push(...(await checkBoard(b, url, vp, reduced, wide)))
    for (const wide of [false, true]) failures.push(...(await checkNight(b, url, VIEWPORTS[0], wide)))
    // A first game, won on NIGHT_PLAN and lost on no orders at all.
    failures.push(...(await checkDebrief(b, url, VIEWPORTS[0], NIGHT_PLAN, 'won')), ...(await checkDebrief(b, url, VIEWPORTS[0], {}, 'lost')))
    failures.push(...(await checkReadingRooms(b, url, VIEWPORTS[0])))
    return failures
  } finally {
    b.close()
    server.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chrome = findChrome()
  if (!chrome) {
    console.log('no Chrome found (set CHROME_PATH); the fit guard did not run')
    process.exit(2)
  }
  if (!existsSync(join(DIST, 'index.html'))) {
    console.log('no build in dist/; run the build first')
    process.exit(1)
  }
  phoneLayout(chrome)
    .then((failures) => {
      if (failures.length) {
        console.log(failures.join('\n'))
        process.exit(1)
      }
      console.log(`briefing fits, board fits, SYSTEM in bounds, screens open at the top, tagline on one line, at ${VIEWPORTS.map(([w, h]) => `${w}x${h}`).join(' and ')}; the night's cards fit 375, the debrief's first screen fits 375x667, and the R4 screens' labels fit 375, as served and in wide fonts`)
      process.exit(0)
    })
    .catch((e) => {
      console.log(String(e?.message ?? e))
      process.exit(1)
    })
}
