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
// through every kind of night card (the response, its result with the
// Dossier card's row open and with the FILED stamp, a block, a partial,
// an opportunity, the debris call and its result, every END OF TURN with
// its DETAILS shut and open, the last one's DEBRIEF), at 375x667, in DC
// Display as served and again with the sans and mono stacks forced wide.
// On every card no text leaves the width, no display-face label overflows
// its own box, the header is not cut, and the way on is wholly on screen.
// (v1.7 R1: the full-screen Dossier card is gone, so its labels are
// measured where they went, in the row on the result.)
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
// GUARD R5 (b), (d) and (e), ONE CRAWL UNDER REDUCED MOTION (v1.3 brief
// 8.3 and section 4): the title and its SYSTEM, the four briefing beats,
// the board, PROCURE, the board's SYSTEM, every card of a seeded night,
// END OF TURN, a won debrief, the Dossier with its cards open, LIBRARY's
// two tabs, the scoreboard and the credits, at 375x667 with reduced
// motion. On every screen:
//   (b) every element's computed animation and transition are none, and
//       no canvas draws while the screen sits still for a second;
//   (d) no text input, text area or select is under 16px;
//   (e) no retired word (section 4) in the text or the accessible names.
//
// GUARD R5 (c), THE DESKTOP BOARD, rewritten in v1.5 R2 (Ken's ruling of
// 24 October 2026: a full-width desktop layout in place of the centered
// phone column, the board, the night and the inspector side by side): at
// 1440x900 the board spans the screen with the playfield, the phone's
// column and PROCURE side by side, none overlapping, the playfield's
// layers stacked as bands with the tiles drawn bigger than a phone's, no
// paragraph wider than a readable line (640px), nothing outside the
// screen and no page scroll; and in the night the same three columns, the
// night's log in the side panel, with the playfield no wider or narrower
// than it was (the fresh-eyes review: it jumped wider as the night began).
//
// THE v1.6 R1 GUARDS, (a) to (f): the score's stills, its one colour, the
// block moment (the phone night's strike card until v1.7 R1), PROCURE's
// cards, the turn-1 board on both openings and one debrief shape (see
// v16Guards below). THE v1.6 R2 GUARDS, (g) to (m): the desktop log
// during the night, the desktop debrief's columns, desktop type, "more
// below" on a solid band, one HUD height, and the desktop's FIRST ORDERS
// above the dock (see desktopType below; (g), the strike card's outcome
// line and its night so far, left with the card in v1.7 R1). THE v1.6 R3
// GUARDS, (n) to (q), from Ken's phone playtest: no text-link controls, no
// nested scroll, the result card on one 390x844 screen, and the night's
// clocks (see r3Guards below). THE v1.6 R4 GUARDS, (t) to (w): PROCURE
// fits 390x844 with no cue, one way out of PROCURE, no cut-off card text,
// and END OF TURN fits (see r4Guards below).
//
// THE v1.7 R1 NIGHT (Ken's ruling of 9 November 2026: a decision in the
// night). The guards above that walk a night were rewritten for it, each
// where it stood: THE RESPONSE fits both phones with every answer and
// "Ride it out" on screen (walkNightFits), the result fits with its way
// on in view, the block moment stands under the asset strip and is over
// inside a second, nothing else in the night goes on by itself but the
// overlay and the FILED stamp (nightTiming), and END OF TURN fits shut,
// its DETAILS opening over a pinned BEGIN TURN (walkNightFits too). SKIP
// NIGHT, the phone's strike card, the full-screen Dossier card and the
// strike's 2.5 s hold are gone from the game, and their guards with them.
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
// orders each turn gives. Seed 32 with NIGHT_PLAN, its moves answered by
// NIGHT_TAP's rule, meets every card (the response, its result blocked,
// halved and hit, a block moment, the debris call and its result, an
// opportunity) and a won operation into DEBRIEF, on the campaign's
// other order (v1.6 R1: COLDVEIL opens on the other layers and works the
// ground before the conjunction). Seed 1 until v1.6 R1, when each seed
// began to play its own order; seed 24, with three defenses ordered on
// turn 2, until v1.4's one new defense a night.
export const NIGHT_SEED = 32
export const NIGHT_PLAN = { 1: ['antiJam'], 2: ['encryptedBackhaul'], 3: ['linkAuth'], 4: ['pntAuth'], 5: ['sensorFusion'], 6: ['groundZeroTrust'] }

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

// Which part of the night is on screen: a card waiting for a tap, or
// nothing to tap yet. Since v1.7 R1 that is the overlay, a block moment
// and the FILED stamp, which each go on by themselves (the stamp stands
// on its card, so it is looked for first); the full-screen Dossier card,
// 'intel' here until then, is gone.
export const NIGHT_STAGE = `(() => {
  if (document.querySelector('[data-filed-stamp]')) return 'busy'
  const c = document.querySelector('[data-night-card]')
  return c ? c.getAttribute('data-night-card') : (document.querySelector('[data-dock]') ? 'board' : 'busy')
})()`

// The night's tap for a stage. On THE RESPONSE (v1.7 R1) one fixed rule:
// the first answer the budget can meet, which is the strongest it offers,
// else "Ride it out" (the group's last button, never disabled). Then HOLD,
// FILE TO DOSSIER or CONTINUE, BEGIN. NIGHT_RIDE rides every move out in
// its place, the night as it played before there was an answer to give:
// with no defense ordered either, that is the game that is lost (answered
// by NIGHT_TAP's rule, a game with no orders at all is still won).
const nightTap = (respond) => `(() => {
  const pick = (s) => document.querySelector(s)
  const b = pick(${JSON.stringify(respond)}) || pick('[data-call="hold"]') || pick('[data-collect]') || pick('[data-continue]') || pick('[data-begin]')
  if (!b) return false
  b.click()
  return true
})()`
export const NIGHT_TAP = nightTap('[data-responses] button:not([disabled])')
export const NIGHT_RIDE = nightTap('button[data-response="ride"]')
// A game on orders answers its moves; a game on none rides them out.
const tapFor = (plan) => (Object.keys(plan).length ? NIGHT_TAP : NIGHT_RIDE)

// Every way the open card can fail to fit: text past the width, a
// display-face label or an answer wider than its box, a cut header, an
// answer under 44px, the way on below the screen (or, for "Ride it out",
// which stands in the card's body, below what the body shows unscrolled).
const NIGHT_FIT = `(() => {
  const root = document.querySelector('[data-night-card]')
  if (!root) return []
  const bad = ${OUT_OF_BOUNDS}(root)
  for (const e of root.querySelectorAll('.font-display, [data-card-head], [data-responses] button')) {
    if (e.getBoundingClientRect().width < 1) continue
    if (e.scrollWidth > e.clientWidth + 1) bad.push('"' + e.textContent.trim().slice(0, 32) + '" overflows its box (' + e.scrollWidth + ' of ' + e.clientWidth + 'px)')
  }
  for (const e of root.querySelectorAll('[data-responses] button')) {
    const tall = e.getBoundingClientRect().height
    if (tall < 44) bad.push('"' + e.textContent.trim().slice(0, 32) + '" is ' + Math.round(tall) + 'px tall, under 44')
  }
  const way = root.querySelector('[data-filed-stamp], [data-collect], [data-continue], [data-begin], [data-call="hold"], button[data-response="ride"]')
  const body = way && way.closest('[data-card-body]')
  const foot = body ? Math.min(innerHeight, body.getBoundingClientRect().bottom) : innerHeight
  if (way && way.getBoundingClientRect().bottom > foot + 0.5) bad.push('its way on ends at ' + Math.round(way.getBoundingClientRect().bottom) + ' of ' + Math.round(foot))
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  return bad
})()`
// What a card keeps one tap away (v1.7 R1): the Dossier card on a result,
// which was a screen of its own, and END OF TURN's DETAILS. Opened by its
// own summary, as a thumb would, and shut the same way.
const OPEN_MORE = `(() => {
  const d = document.querySelector('[data-night-card] details:not([open])')
  if (!d) return null
  d.querySelector('summary').click()
  return d.hasAttribute('data-dossier-row') ? 'dossier' : 'details'
})()`
const SHUT_MORE = `(() => { for (const d of document.querySelectorAll('[data-night-card] details[open]')) d.querySelector('summary').click(); return true })()`

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
      // The Dossier card's labels, in the row on the result since v1.7 R1,
      // and END OF TURN's DETAILS: open, they fit the width too, and the
      // way on stays on screen under them.
      const more = await b.evaluate(OPEN_MORE)
      if (more) {
        await sleep(80)
        seen.add(more)
        for (const x of await b.evaluate(NIGHT_FIT)) failures.push(`${where}: turn ${turn}, ${stage}, its ${more === 'dossier' ? 'Dossier card' : 'DETAILS'} open: ${x}`)
        await b.evaluate(SHUT_MORE)
        await sleep(40)
      }
      const last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
      await b.evaluate(NIGHT_TAP)
      // FILE TO DOSSIER leaves its FILED stamp where the button stood, for
      // half a second: measured while it stands.
      if (await b.evaluate('!!document.querySelector("[data-filed-stamp]")')) {
        seen.add('filed')
        for (const x of await b.evaluate(NIGHT_FIT)) failures.push(`${where}: turn ${turn}, ${stage}, FILED: ${x}`)
      }
      await sleep(120)
      if (last) return [...failures, ...['respond', 'hit', 'call', 'debris', 'opportunity', 'end'].filter((k) => !seen.has(k)).map((k) => `${where}: the run met no ${k} card`), ...[['dossier', 'opened no Dossier card on a result'], ['filed', 'saw no FILED stamp'], ['details', "opened no END OF TURN DETAILS"]].filter(([k]) => !seen.has(k)).map(([, what]) => `${where}: the run ${what}`)]
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

// Plays the operation on screen to its DEBRIEF, every card tapped through:
// its moves answered on a game with orders, ridden out on one with none.
async function playToDebrief(b, plan) {
  const tap = tapFor(plan)
  for (let turn = 1; turn <= 6; turn += 1) {
    await orderDefenses(b, plan[turn] ?? [])
    await b.evaluate(click('[data-execute]'))
    for (let steps = 0; steps < 40; steps += 1) {
      if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) return false
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage === 'board') break
      const last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
      await b.evaluate(tap)
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
  const hero = document.querySelector('[data-hero]')
  const lead = document.querySelector('[data-loss-lead]')
  return {
    bottom: first.bottom, top: first.top, vh: Math.min(innerHeight, bar.top), barBottom: bar.bottom, lead: !!lead, filed: document.querySelectorAll('[data-filed-card]').length,
    // One shape (v1.6 R1): where the hero stands, the tiles' order, and a
    // loss's lead under the hero.
    heroTop: hero ? Math.round(hero.getBoundingClientRect().top) : null,
    tiles: [...document.querySelectorAll('[data-stats] [data-stat]')].map((t) => t.getAttribute('data-stat')).join(','),
    leadUnder: !lead || (hero && lead.getBoundingClientRect().top >= hero.getBoundingClientRect().bottom - 0.5),
  }
})()`
// The won and lost debriefs' shapes, compared once both are measured.
const debriefShapes = {}

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
    if (m.heroTop === null) failures.push(`${where}: no hero`)
    if (!m.leadUnder) failures.push(`${where}: BIGGEST DROP stands above the hero`)
    if (!wide) debriefShapes[what] = { heroTop: m.heroTop, tiles: m.tiles }
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

// (b) Every element's motion, as computed, with the reduce rule in force.
const MOTION_ON = `(() => {
  const bad = []
  for (const e of document.querySelectorAll('*')) {
    const cs = getComputedStyle(e)
    const anim = cs.animationName !== 'none' && cs.animationDuration.split(',').some((d) => parseFloat(d) > 0)
    const trans = cs.transitionProperty !== 'none' && cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
    if (anim || trans) bad.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (anim ? ' animates (' + cs.animationName + ')' : ' transitions (' + cs.transitionProperty + ' ' + cs.transitionDuration + ')'))
  }
  const running = document.getAnimations().filter((a) => a.playState === 'running').length
  if (running) bad.push(running + ' animations running')
  return [...new Set(bad)].slice(0, 6)
})()`

// Canvas drawing counted from the first script on every page, so a field
// that keeps painting under reduced motion shows as draws while nothing
// happens.
const COUNT_DRAWS = `(() => {
  window.__dcDraws = 0
  const proto = CanvasRenderingContext2D.prototype
  for (const k of ['fillRect', 'clearRect', 'drawImage', 'putImageData']) {
    const f = proto[k]
    proto[k] = function (...a) { window.__dcDraws += 1; return f.apply(this, a) }
  }
})()`

// (d) Text fields at 16px or more (iOS Safari zooms the page on one under).
const SMALL_INPUTS = `(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea, select')]
  .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
  .map((e) => e.tagName.toLowerCase() + ' ' + (e.getAttribute('aria-label') || e.name || '') + ' at ' + getComputedStyle(e).fontSize))()`

// (e) The retired words (section 4), read from every text node apart and
// every accessible name. The deck's own names are fiction and content
// (the rideshare is a "Commercial rideshare slot"), and "Credits and
// license" and the credits screen's CREDITS heading are the credits, not
// money. Since R6 (Decisions Q13) the rideshare's blurb says "a seat on a
// rideshare manifest", so "manifest slot" is no longer exempt.
const RETIRED = [
  ['buy', '\\b(buy|buys|bought)\\b', 'i'],
  ['purchase', '\\bpurchas\\w*', 'i'],
  ['money', '\\bmoney\\b', 'i'],
  ['cart', '\\bcart\\b', 'i'],
  ['credits', '\\bcredits?\\b', 'i'],
  ['MAI', '\\bMAI\\b', ''],
  ['Mission Assurance Index', 'Mission Assurance Index', 'i'],
  ['RESOLVE', '\\bRESOLVE\\b', ''],
  ['END TURN', '\\bEND TURN\\b', 'i'],
  ['forecast', '\\bforecast\\b', 'i'],
  ['mitigated', '\\bmitigated\\b', 'i'],
  ['severity', '\\bseverity\\b', 'i'],
  ['aftermath', '\\baftermath\\b', 'i'],
  ['verdict', '\\bverdict\\b', 'i'],
  ['commendation', '\\bcommendation\\b', 'i'],
  ['INTEL ARCHIVE', 'INTEL ARCHIVE', 'i'],
  ['slot', '\\bslot\\b', 'i'],
  ['in this build', 'in this build', 'i'],
  ['score screen', 'score screen', 'i'],
  // R6 (Decisions Q6): "cost" as a verb, a bill, paid and charged, which
  // section 4 and Decisions Q25 A retired for game spending ("a cost" as a
  // noun stays allowed; an appropriations "funding bill" is legislation and
  // exempt below).
  ['cost (as a verb)', '\\b(costs|costing|costed)\\b|\\b(can|will|would|could|might|may|to|it|they|repairs) cost\\b', 'i'],
  ['bill', '\\bbills?\\b', 'i'],
  ['paid', '\\bpaid\\b', 'i'],
  ['charged', '\\bcharged\\b', 'i'],
]
const RETIRED_WORDS = `((names) => {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const parts = []
  while (walk.nextNode()) {
    const el = walk.currentNode.parentElement
    if (el && el.closest('script, style')) continue
    // The credits screen's own heading names the credits, not money.
    if (el && /^H[1-3]$/.test(el.tagName) && /^credits$/i.test((walk.currentNode.textContent || '').trim())) continue
    parts.push(walk.currentNode.textContent || '')
  }
  for (const e of document.querySelectorAll('[aria-label]')) parts.push(e.getAttribute('aria-label'))
  let text = parts.join(' ')
  for (const n of names) text = text.split(n).join(' ')
  text = text.replace(/credits and licen[cs]e/gi, ' ').replace(/funding bill/gi, ' ')
  const found = []
  for (const [word, re, flags] of ${JSON.stringify(RETIRED)}) {
    const m = new RegExp(re, flags).exec(text)
    if (m) found.push(word + ': "' + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\\s+/g, ' ') + '"')
  }
  return found
})`

// One screen of the crawl: (b), (d) and (e), with the screen sitting
// still for a second for the canvas count.
async function screenRules(b, where, names) {
  const failures = []
  await sleep(250)
  const before = await b.evaluate('window.__dcDraws')
  await sleep(1000)
  const draws = (await b.evaluate('window.__dcDraws')) - before
  if (draws > 0) failures.push(`${where}: a canvas drew ${draws} times while nothing happened, under reduced motion`)
  for (const x of await b.evaluate(MOTION_ON)) failures.push(`${where}: under reduced motion, ${x}`)
  for (const x of await b.evaluate(SMALL_INPUTS)) failures.push(`${where}: ${x}, under 16px`)
  for (const x of await b.evaluate(`${RETIRED_WORDS}(${JSON.stringify(names)})`)) failures.push(`${where}: retired word ${x}`)
  return failures
}

async function checkEveryScreen(b, url) {
  const [w, h] = VIEWPORTS[0]
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: COUNT_DRAWS })
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  if (!(await cleanLoad(b, url))) return ['every screen: the title never showed PLAY']
  // The deck's own names (events and their conditions), read from the
  // content source, so the crawl exempts exactly the fiction's words.
  const deck = ['threats.ts', 'opportunities.ts'].flatMap((f) =>
    [...readFileSync(join(process.cwd(), 'src', 'content', f), 'utf8').matchAll(/\bname:\s*'([^']+)'/g)].map((m) => m[1]),
  )
  const failures = []
  const go = async (where, js, ready) => {
    if (js) await b.evaluate(js)
    if (ready && !(await waitFor(b, ready, 10000))) {
      failures.push(`${where}: never opened`)
      return false
    }
    failures.push(...(await screenRules(b, where, deck)))
    return true
  }
  const back = `[...document.querySelectorAll('button')].find((x) => /^back to title$/i.test(x.innerText.trim())).click(); true`
  await go('the title', null, null)
  await go("the title's SYSTEM", click('[data-title-system]'), '!!document.querySelector("[role=dialog] [data-system-control]")')
  await b.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'DONE').click(); true`)
  // The briefing, every beat: a first PLAY goes through it.
  await b.evaluate(click('[data-play]'))
  for (let beat = 1; beat <= 4; beat += 1) {
    if (!(await go(`briefing beat ${beat}`, null, '!!document.querySelector("[data-briefing-next]")'))) break
    await b.evaluate(click('[data-briefing-next]'))
  }
  await go('the board, turn 1', null, '!!document.querySelector("[data-dock]")')
  await go('PROCURE', click('[data-action="procure"]'), '!!document.querySelector("[data-sheet=procure]")')
  await b.evaluate(click('[data-action="procure"]'))
  await go("the board's SYSTEM", click('button[aria-label="System"]'), '!!document.querySelector("[data-sheet=system]")')
  await b.evaluate(click('button[aria-label="System"]'))
  // A seeded night, every card, to the debrief.
  if (!(await startSeed(b, url, [w, h], true, NIGHT_SEED))) return [...failures, 'every screen: could not replay the seed']
  // The block moment (v1.7 R1) goes by itself inside a second, too short
  // for a screen's second of stillness: its motion and its words are read
  // while it stands, once a moment, and the crawl must meet one.
  let blocks = 0
  const opened = new Set()
  const nextStage = async (turn) => {
    let read = false
    for (const t0 = Date.now(); Date.now() - t0 < 8000; ) {
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage !== 'busy') return stage
      if (!read && (await b.evaluate('!!document.querySelector("[data-block-moment]")'))) {
        read = true
        blocks += 1
        for (const x of await b.evaluate(MOTION_ON)) failures.push(`turn ${turn}, a block moment: under reduced motion, ${x}`)
        for (const x of await b.evaluate(`${RETIRED_WORDS}(${JSON.stringify(deck)})`)) failures.push(`turn ${turn}, a block moment: retired word ${x}`)
      }
      await sleep(50)
    }
    return null
  }
  for (let turn = 1; turn <= 6; turn += 1) {
    await orderDefenses(b, NIGHT_PLAN[turn])
    await b.evaluate(click('[data-execute]'))
    let done = false
    for (let steps = 0; steps < 30 && !done; steps += 1) {
      const stage = await nextStage(turn)
      if (!stage) return [...failures, `turn ${turn}: the night stopped`]
      if (stage === 'board') break
      failures.push(...(await screenRules(b, `turn ${turn}, ${stage}`, deck)))
      // What the card keeps one tap away is a screen of its words too: the
      // Dossier card on a result, and END OF TURN's DETAILS (v1.7 R1).
      // Once each: the words are in the page shut or open, and (e) reads
      // them on every card; open, it is the motion of the opening that is new.
      const more = opened.size < 2 ? await b.evaluate(OPEN_MORE) : null
      if (more) {
        if (!opened.has(more)) failures.push(...(await screenRules(b, `turn ${turn}, ${stage}, its ${more === 'dossier' ? 'Dossier card' : 'DETAILS'} open`, deck)))
        opened.add(more)
        await b.evaluate(SHUT_MORE)
      }
      done = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
      await b.evaluate(NIGHT_TAP)
      await sleep(100)
    }
    if (done) break
  }
  if (blocks === 0) failures.push('every screen: the night met no block moment, so its stillness was not read')
  if (opened.size < 2) failures.push('every screen: the night opened no Dossier card or no DETAILS')
  await go('the debrief, won', null, '!!document.querySelector("[data-debrief]")')
  await go('the Dossier, over the debrief', click('[data-open-dossier]'), '!!document.querySelector("[data-dossier-overlay] [data-dossier]")')
  await b.evaluate(`(() => { document.querySelectorAll('[data-dossier-card][data-filed]').forEach((d) => (d.open = true)); return true })()`)
  failures.push(...(await screenRules(b, 'the Dossier, cards open', deck)))
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => /^back to debrief$/i.test(x.innerText.trim())).click(); true`)
  await b.evaluate(click('[data-title-screen]'))
  await waitFor(b, '!!document.querySelector("[data-title]")')
  await go("LIBRARY's Field Library", click('[data-read="library"]'), '!!document.querySelector("[data-field-library]")')
  await go("LIBRARY's Glossary", click('[data-tab="glossary"]'), '!!document.querySelector("[data-glossary]")')
  await b.evaluate(back)
  await waitFor(b, '!!document.querySelector("[data-title]")')
  await b.evaluate(click('[data-title-system]'))
  await go('the scoreboard', `setTimeout(() => document.querySelector('[data-system-control="scoreboard"]').click(), 50); true`, '!!document.querySelector("[data-scoreboard]")')
  await b.evaluate(back)
  await waitFor(b, '!!document.querySelector("[data-title]")')
  await b.evaluate(click('[data-title-system]'))
  await go('the credits', `setTimeout(() => document.querySelector('[data-system-control="credits"]').click(), 50); true`, '[...document.querySelectorAll("button")].some((x) => /back to title/i.test(x.innerText)) && !document.querySelector("[data-title]")')
  return failures
}

// (c) The desktop board.
const DESKTOP = `(() => {
  const vw = innerWidth
  const vh = innerHeight
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) } }
  const out = []
  for (const e of document.querySelectorAll('[data-board] *')) {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || e.closest('canvas')) continue
    if (r.left < -1 || r.right > vw + 1) out.push(e.tagName.toLowerCase() + ' ' + Math.round(r.left) + '..' + Math.round(r.right))
  }
  const wide = []
  for (const p of document.querySelectorAll('[data-board] p, [data-board] li')) {
    const r = p.getBoundingClientRect()
    if (r.width > 640 && (p.innerText || '').trim().length > 60) wide.push(Math.round(r.width) + 'px: ' + p.innerText.trim().slice(0, 40))
  }
  const art = document.querySelector('[data-strip] [data-art] svg')?.getBoundingClientRect().width ?? 0
  return {
    vw, vh, board: box('[data-board]'), field: box('[data-strip]'), play: box('[data-board-play]'), side: box('[data-sheet]'), log: !!document.querySelector('[data-sheet="log"]'),
    orbit: box('[data-layer="ORBIT"]'), air: box('[data-layer="AIR"]'), ground: box('[data-layer="GROUND"]'),
    out: out.slice(0, 4), wide: wide.slice(0, 4), art: Math.round(art),
    scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
  }
})()`

function sideBySide(where, cols, failures) {
  for (let i = 0; i < cols.length; i += 1) {
    const [name, c] = cols[i]
    if (!c) {
      failures.push(`${where}: no ${name}`)
      return
    }
    if (i > 0 && c.l < cols[i - 1][1].r - 1) failures.push(`${where}: the ${name} (${c.l}..${c.r}) overlaps the ${cols[i - 1][0]} (${cols[i - 1][1].l}..${cols[i - 1][1].r})`)
  }
}

async function checkDesktop(b, url) {
  const [w, h] = [1440, 900]
  const where = `${w}x${h}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1' }))) return [`${where}: the title never showed PLAY`]
  await b.evaluate(click('[data-play]'))
  if (!(await waitFor(b, '!!document.querySelector("[data-dock]") && !!document.querySelector("[data-tonight]")'))) return [`${where}: PLAY did not reach the board`]
  await sleep(400)
  const failures = []
  const m = await b.evaluate(DESKTOP)
  if (!m.board || m.board.w < 1100) failures.push(`${where}: the board is ${m.board?.w}px wide, still a phone column`)
  sideBySide(`${where}, deciding`, [['playfield', m.field], ["phone's column", m.play], ['PROCURE panel', m.side]], failures)
  if (m.orbit && m.air && m.ground && !(m.orbit.b <= m.air.t + 1 && m.air.b <= m.ground.t + 1)) failures.push(`${where}: the playfield's layers are not bands, orbit over air over ground`)
  if (m.art < 64) failures.push(`${where}: the strip's tiles are drawn ${m.art}px wide, no bigger than a phone's`)
  for (const x of m.out) failures.push(`${where}: ${x} leaves the screen`)
  for (const x of m.wide) failures.push(`${where}: a line ${x} is wider than a readable line`)
  if (m.scrollW > m.vw + 1 || m.scrollH > m.vh + 1) failures.push(`${where}: the page scrolls (${m.scrollW}x${m.scrollH})`)
  // The night: the playfield and the card side by side, the panel gone.
  await b.evaluate(click('[data-execute]'))
  if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy' && !!document.querySelector('[data-night-card]')`, 9000))) return [...failures, `${where}: the night's first card never showed`]
  await sleep(300)
  const n = await b.evaluate(DESKTOP)
  if (!n.log) failures.push(`${where}: the night's log is not in the side panel`)
  sideBySide(`${where}, the night`, [['playfield', n.field], ["night's column", n.play], ["night's log", n.side]], failures)
  if (n.field && m.field && Math.abs(n.field.w - m.field.w) > 2) failures.push(`${where}: the playfield is ${n.field.w}px wide in the night, ${m.field.w}px while deciding`)
  for (const x of n.wide) failures.push(`${where}, the night: a line ${x} is wider than a readable line`)
  for (const x of n.out) failures.push(`${where}, the night: ${x} leaves the screen`)
  return failures
}

// THE v1.6 R1 GUARDS (Ken's rulings of 26 October 2026).
//
// (a) THE SCORE NEVER PAINTS HALF A DIGIT: stills of the HUD every 25ms
// through a seeded night, motion on, at 375x667: while the night runs by
// itself (the overlay, a block moment) and for a second as each result
// lands, which is where the score rolls since v1.7 R1 (a hit has no
// strike before its card now). The moves are ridden out, so the score
// falls; the plan's defenses block the third night's. In no still does a
// digit of the score sit off its line, moved by a transform or faded, and
// some stills are taken mid-count, so the guard watched the roll.
// (b) ONE NEUTRAL COLOUR: through the same stills, and through the night
// again with motion off, the score's digits keep one colour, the budget's
// is that colour unless the budget is below zero, and only the delta chip
// beside the score is red (a fall) or green (NO LOSS).
// (c) THE BLOCK MOMENT (v1.7 R1; the strike's card until then, which left
// the game with the strike before a hit): at 375x667 and 390x844, motion
// on, each move a defense stops shows its close-up, BLOCKED, the move's
// name in the ink (a colour token once painted it near-black) and the
// streak, under the asset strip and wholly on screen, with no page scroll
// and the whole screen taking the tap that ends it; at 1440x900 the
// banner names the move and the night's log writes it.
// (d) PROCURE: at 375x667 and 390x844, as served and in wide fonts, empty
// and with tonight's order in, at least two whole cards show between the
// pinned rule and the footer, one green primary shows at most (none with
// nothing queued, CONFIRM N ORDERS with an order in), and no link-style
// "+ ADD", "defend ›" or "Expand full brief" is in the sheet.
// (e) THE TURN-1 BOARD ON BOTH OPENINGS: a seed that plays the campaign as
// written and one that opens on the other layers both fit 375x667 and
// 390x844 with no scroll, as served and in wide fonts.
// (f) ONE DEBRIEF SHAPE is held in checkDebrief: the hero at the same top,
// the tiles in one order, won and lost.
const SCORE_STILL = `(() => {
  const box = document.querySelector('[data-hud] [data-score] .tabular-nums')
  if (!box) return null
  const digits = [...box.querySelectorAll('[data-odo]')]
  const bad = []
  const tops = digits.map((d) => d.getBoundingClientRect().top)
  for (const d of digits) {
    const s = getComputedStyle(d)
    if (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)') bad.push('"' + d.textContent + '" moved (' + s.transform + ')')
    if (parseFloat(s.opacity) < 1) bad.push('"' + d.textContent + '" faded to ' + s.opacity)
    if (Math.abs(d.getBoundingClientRect().top - Math.min(...tops)) > 0.5) bad.push('"' + d.textContent + '" off its line')
  }
  const box2 = getComputedStyle(box)
  if (parseFloat(box2.opacity) < 1) bad.push('the score faded to ' + box2.opacity)
  const budget = document.querySelector('[data-hud] [aria-label^="BUDGET"]')
  const chip = document.querySelector('[data-mai-drop]')
  return {
    bad,
    text: box.textContent,
    target: box.getAttribute('aria-label'),
    color: box2.color,
    budget: budget ? { color: getComputedStyle(budget).color, value: Number(/BUDGET (-?\\d+)/.exec(budget.getAttribute('aria-label'))?.[1]) } : null,
    chip: chip ? { kind: chip.getAttribute('data-mai-drop'), color: getComputedStyle(chip).color } : null,
  }
})()`
const TOKEN_COLOR = (token) => `(() => { const e = document.createElement('i'); e.style.color = 'var(--dc-${token})'; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c })()`

async function scoreStills(b, url, reduced) {
  const where = `375x667, motion ${reduced ? 'off' : 'on'}`
  if (!(await startSeed(b, url, [375, 667], reduced, NIGHT_SEED))) return { failures: [`${where}: could not replay seed ${NIGHT_SEED}`] }
  const failures = []
  const colors = new Set()
  const chips = new Map()
  let stills = 0
  let midCount = 0
  const ink = await b.evaluate(TOKEN_COLOR('ink'))
  const hostile = await b.evaluate(TOKEN_COLOR('hostile'))
  const go = await b.evaluate(TOKEN_COLOR('go'))
  const sample = async (at) => {
    const m = await b.evaluate(SCORE_STILL)
    if (!m) return
    stills += 1
    if (m.text !== m.target.replace(/^[A-Z ]+ /, '')) midCount += 1
    for (const x of m.bad) failures.push(`${where}, ${at}: ${x}`)
    colors.add(m.color)
    if (m.budget && m.budget.color !== (m.budget.value < 0 ? hostile : ink)) failures.push(`${where}, ${at}: the budget is ${m.budget.color} at ${m.budget.value} CR`)
    if (m.chip) chips.set(m.chip.kind, m.chip.color)
  }
  for (let turn = 1; turn <= 3; turn += 1) {
    await orderDefenses(b, NIGHT_PLAN[turn])
    await b.evaluate(click('[data-execute]'))
    for (let steps = 0; steps < 30; steps += 1) {
      // Stills every 25ms while the night runs on its own.
      for (let t = 0; t < 120 && (await b.evaluate(NIGHT_STAGE)) === 'busy'; t += 1) {
        await sample(`turn ${turn}`)
        await sleep(25)
      }
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage === 'board') break
      // A result plays on the board as its card comes up (v1.7 R1): the
      // score counts down and the delta chip floats, for about a second.
      for (let t = 0; t < (stage === 'hit' ? 40 : 1); t += 1) {
        await sample(`turn ${turn}, ${stage}`)
        if (stage === 'hit') await sleep(25)
      }
      await b.evaluate(NIGHT_RIDE)
      await sleep(60)
    }
  }
  if (colors.size !== 1 || ![...colors][0] || [...colors][0] !== ink) failures.push(`${where}: the score's digits took ${[...colors].join(', ')}, not the ink ${ink} alone`)
  if (chips.get('fall') !== hostile) failures.push(`${where}: the delta chip on a fall is ${chips.get('fall') ?? 'never shown'}, not ${hostile}`)
  if (chips.get('held') !== go) failures.push(`${where}: the delta chip on a block is ${chips.get('held') ?? 'never shown'}, not ${go}`)
  return { failures, stills, midCount }
}

// The block moment as it stands, with the HUD over it and, on the desktop,
// the night's log beside it. Its parts are the banner's own children (the
// close-up, BLOCKED, the move's name, the streak); the line a screen reader
// hears is with them, out of sight.
const BLOCK_MOMENT = `(() => {
  const moving = document.querySelector('[data-sheet="log"] li[data-log="moving"]')
  const around = {
    hud: document.querySelector('[data-hud]')?.getBoundingClientRect().height ?? 0,
    streak: !!document.querySelector('[data-hud] [data-streak]'),
    // The desktop's log: its rows, and the move on its way.
    logRows: [...document.querySelectorAll('[data-sheet="log"] li[data-log]:not([data-log="moving"])')].map((e) => e.getAttribute('data-log')),
    logMoving: moving ? getComputedStyle(moving).color : null,
    page: document.documentElement.scrollHeight > innerHeight + 1,
  }
  const banner = document.querySelector('[data-block-moment]')
  if (!banner) return { ...around, banner: false }
  const parts = [...(banner.querySelector('[aria-hidden="true"]')?.children ?? [])].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 1 && r.height > 1)
  const name = banner.querySelector('[data-strike-name]')
  const tap = document.querySelector('[data-strike-tap]')?.getBoundingClientRect()
  return {
    ...around,
    banner: true,
    held: banner.getAttribute('data-strike-banner') === 'held',
    parts: parts.length,
    top: Math.min(...parts.map((r) => r.top)), bottom: Math.max(...parts.map((r) => r.bottom)),
    left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)),
    stripBottom: document.querySelector('[data-strip]')?.getBoundingClientRect().bottom ?? 0, vw: innerWidth, vh: innerHeight,
    name: name?.textContent ?? '',
    nameShown: !!name && getComputedStyle(name).display !== 'none' && name.getBoundingClientRect().height > 1,
    nameColor: name ? getComputedStyle(name).color : null,
    word: banner.querySelector('[data-strike-word]')?.textContent.trim() ?? '',
    line: banner.querySelector('[data-block-streak]')?.textContent.trim() ?? '',
    said: banner.querySelector('[role=status]')?.textContent.trim() ?? '',
    tap: !!tap && tap.left <= 0.5 && tap.top <= 0.5 && tap.right >= innerWidth - 0.5 && tap.bottom >= innerHeight - 0.5,
    bad: ${OUT_OF_BOUNDS}(banner),
  }
})()`

async function blockMoments(b, url, [w, h]) {
  const where = `${w}x${h}`
  const desktop = w >= 1100
  if (desktop) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  }
  if (!(await startSeedAt(b, url, [w, h], false, NIGHT_SEED, desktop))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  const failures = []
  const ink = await b.evaluate(TOKEN_COLOR('ink'))
  const muted = await b.evaluate(TOKEN_COLOR('muted'))
  // What the guard saw, so no check is vacuous.
  const moments = new Set()
  const landed = new Set()
  const rowsBefore = new Map()
  const huds = new Set()
  let streaks = 0
  let incoming = 0
  let answered = 0
  const around = (m) => {
    huds.add(Math.round(m.hud * 2) / 2)
    if (m.streak) streaks += 1
  }
  for (let turn = 1; turn <= 3; turn += 1) {
    await orderDefenses(b, NIGHT_PLAN[turn])
    await b.evaluate(click('[data-execute]'))
    for (let steps = 0; steps < 30; steps += 1) {
      for (let t = 0; t < 120 && (await b.evaluate(NIGHT_STAGE)) === 'busy'; t += 1) {
        const m = await b.evaluate(BLOCK_MOMENT)
        if (m.banner) {
          around(m)
          const at = `${where}, turn ${turn}, ${m.name || 'a block moment'}`
          const key = `${turn}:${m.name}`
          const first = !moments.has(key)
          moments.add(key)
          // Where it stands is read on every still; what it says, once.
          if (!desktop) {
            // GUARD v1.6 R2 (g): the banner stands under the asset strip,
            // however tall its chips have made it, and inside the screen.
            if (m.top < m.stripBottom - 0.5) failures.push(`${at}: the banner (top ${Math.round(m.top)}) is over the asset strip (bottom ${Math.round(m.stripBottom)})`)
            if (m.bottom > m.vh + 0.5) failures.push(`${at}: the banner ends at ${Math.round(m.bottom)} of ${m.vh}`)
            if (m.left < -0.5 || m.right > m.vw + 0.5) failures.push(`${at}: the banner runs ${Math.round(m.left)} to ${Math.round(m.right)} of ${m.vw} wide`)
          }
          if (first) {
            if (!m.held || m.word !== 'BLOCKED') failures.push(`${at}: the banner reads "${m.word}", not BLOCKED`)
            if (!m.nameShown || !m.name) failures.push(`${at}: the banner names no move`)
            if (m.nameColor !== ink) failures.push(`${at}: the move's name is ${m.nameColor}, not the ink ${ink}`)
            if (!/^×\d+ DEFENSE STREAK$/.test(m.line)) failures.push(`${at}: the streak's line reads "${m.line}"`)
            if (!m.said.includes(m.name)) failures.push(`${at}: the line a screen reader hears ("${m.said}") does not name the move`)
            if (m.parts < 4) failures.push(`${at}: ${m.parts} part(s) of the banner show, not the close-up, the word, the name and the streak`)
            if (!m.tap) failures.push(`${at}: the tap that ends it does not take the whole screen`)
            for (const x of m.bad) failures.push(`${at}: ${x}`)
          }
          if (m.page) failures.push(`${at}: the page scrolls`)
          if (desktop) {
            // GUARD v1.6 R2 (h): the log writes the move as it lands; until
            // then its row is INCOMING in the muted ink, never red.
            if (m.logMoving !== null) {
              if (m.logMoving !== muted) failures.push(`${at}: the INCOMING row is ${m.logMoving}, not the muted ${muted}`)
              rowsBefore.set(key, m.logRows.length)
            } else {
              const before = rowsBefore.get(key)
              if (before !== undefined && m.logRows.length !== before + 1) failures.push(`${at}: ${m.logRows.length} row(s) once it landed, ${before} while it locked on`)
              if (m.logRows.at(-1) !== 'blocked') failures.push(`${at}: the banner reads BLOCKED, the log's row ${m.logRows.at(-1)}`)
              else if (before !== undefined) landed.add(key)
            }
          }
        }
        await sleep(25)
      }
      const stage = await b.evaluate(NIGHT_STAGE)
      if (stage === 'board') break
      // The HUD over THE RESPONSE and its result, and on the desktop the
      // log beside them (v1.7 R1): the move waits as INCOMING, and its row
      // is written once it is answered.
      if (stage === 'respond' || stage === 'hit') {
        const m = await b.evaluate(BLOCK_MOMENT)
        around(m)
        if (desktop && stage === 'respond') {
          incoming += 1
          if (m.logMoving !== muted) failures.push(`${where}, turn ${turn}: a move waits for its answer and the log's INCOMING row is ${m.logMoving ?? 'not there'}, not the muted ${muted}`)
        }
        if (desktop && stage === 'hit') {
          if (m.logMoving !== null) failures.push(`${where}, turn ${turn}: the log still says INCOMING beside a result`)
          else if (!['blocked', 'partial', 'halved', 'hit'].includes(m.logRows.at(-1))) failures.push(`${where}, turn ${turn}: the log's row beside a result is ${m.logRows.at(-1)}`)
          else answered += 1
        }
      }
      await b.evaluate(NIGHT_TAP)
      await sleep(60)
    }
  }
  if (moments.size < 2) failures.push(`${where}: only ${moments.size} block moment(s) seen in three nights`)
  // GUARD v1.6 R2 (l): the HUD keeps one height through the night's moves,
  // the defense streak's chip arriving among them (the round's fresh eyes,
  // G17: it grew about 7px, and the board under it moved).
  if (huds.size > 1) failures.push(`${where}: the HUD took ${[...huds].sort((a, z) => a - z).join(', ')}px through three nights' moves`)
  if (streaks === 0) failures.push(`${where}: no move showed the defense streak, so the HUD's height was not tested with it`)
  if (desktop && landed.size < 2) failures.push(`${where}: the log wrote ${landed.size} blocked move(s) as they landed, of ${moments.size} block moments seen`)
  if (desktop && (incoming < 2 || answered < 2)) failures.push(`${where}: the log was read beside ${incoming} response(s) and ${answered} result(s), so its rows there were not tested`)
  return failures
}

async function startSeedAt(b, url, [w, h], reduced, seed, desktop) {
  if (!desktop) return startSeed(b, url, [w, h], reduced, seed)
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1', 'dc-difficulty': 'standard' }))) return false
  await b.evaluate(click('[data-title-system]'))
  if (!(await waitFor(b, 'document.querySelector(\'[data-system-control="replay"] input\')'))) return false
  await b.evaluate(`(() => {
    const i = document.querySelector('[data-system-control="replay"] input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(seed))})
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(100)
  await b.evaluate(click('[data-system-control="replay"] button'))
  return waitFor(b, 'document.querySelector("[data-dock]")')
}

const PROCURE_FIT = `(() => {
  const sheet = document.querySelector('[data-sheet=procure]')
  const body = sheet.querySelector('[data-procure-body]').getBoundingClientRect()
  const cards = [...sheet.querySelectorAll('[data-procure-body] li > button')]
  const whole = cards.filter((c) => { const r = c.getBoundingClientRect(); return r.height > 1 && r.top >= body.top - 0.5 && r.bottom <= body.bottom + 0.5 }).length
  const probe = document.createElement('i'); probe.className = 'bg-dc-go'; document.body.appendChild(probe)
  const go = getComputedStyle(probe).backgroundColor; probe.remove()
  const greens = [...document.querySelectorAll('button')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 40 && r.height > 30 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(x).backgroundColor === go }).map((x) => x.innerText.trim())
  const text = sheet.innerText
  // The band must be the panel's own colour, solid: compared with a probe
  // painted in it, so a see-through tint in any colour syntax differs.
  const cue = sheet.querySelector('[data-scroll-cue] p')
  const panel = document.createElement('i'); panel.className = 'bg-dc-panel'; document.body.appendChild(panel)
  const solid = getComputedStyle(panel).backgroundColor; panel.remove()
  return { whole, greens, links: ['+ ADD', 'defend ›', 'Expand full brief'].filter((l) => text.includes(l)), page: document.documentElement.scrollHeight > innerHeight + 1, bad: ${OUT_OF_BOUNDS}(sheet), cue: cue ? getComputedStyle(cue).backgroundColor : null, solid }
})()`

async function procureCards(b, url, [w, h], wideFonts) {
  const where = `${w}x${h}${wideFonts ? ', wide fonts' : ''}`
  if (!(await startSeed(b, url, [w, h], true, NIGHT_SEED))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  if (wideFonts) await wideFontsOn(b)
  const failures = []
  let cues = 0
  for (const state of ['empty', "with tonight's order"]) {
    await b.evaluate(click('[data-action="procure"]'))
    if (!(await waitFor(b, 'document.querySelector("[data-sheet=procure]")'))) return [`${where}: PROCURE did not open`]
    if (state !== 'empty') await b.evaluate(click('[data-procure-defense="antiJam"]'))
    await sleep(250)
    const m = await b.evaluate(PROCURE_FIT)
    const at = `${where}, PROCURE ${state}`
    if (m.whole < 2) failures.push(`${at}: ${m.whole} whole card(s) under the pinned rule and over the footer`)
    // At most one: with nothing queued, none (the dock's PROCURE would open
    // what is open); with an order in, CONFIRM N ORDERS alone.
    if (m.greens.length > 1 || (state !== 'empty' && m.greens.length !== 1)) failures.push(`${at}: ${m.greens.length} green primaries (${m.greens.join(', ')})`)
    for (const l of m.links) failures.push(`${at}: link-style "${l}"`)
    if (m.page) failures.push(`${at}: the page scrolls`)
    for (const x of m.bad) failures.push(`${at}: ${x}`)
    // GUARD v1.6 R2 (k): "more below" stands on a solid band, so nothing
    // half-faded shows through its words (R1's fresh eyes, F16).
    if (m.cue !== null) {
      cues += 1
      if (m.cue !== m.solid) failures.push(`${at}: "more below" stands on ${m.cue}, not the panel's solid ${m.solid}`)
    }
    await b.evaluate(click('[data-confirm]'))
    await sleep(150)
  }
  await wideFontsOff(b)
  if (cues === 0 && h < 700) failures.push(`${where}: PROCURE never showed "more below", so its band was not tested`)
  return failures
}

const BOARD_FIT = `(() => {
  const body = document.querySelector('[data-board-body]')
  const dock = document.querySelector('[data-dock]').getBoundingClientRect()
  return { page: document.documentElement.scrollHeight > innerHeight + 1, body: [body.scrollHeight, body.clientHeight], dockBottom: dock.bottom, vh: innerHeight, opening: [...document.querySelectorAll('[data-move]')].map((m) => m.getAttribute('data-move')).join(' ') }
})()`

async function openingBoards(b, url, [w, h], wideFonts) {
  const failures = []
  // Seed 2 plays the campaign as written; seed 1 opens on the other
  // layers (src/engine/campaign.ts).
  for (const [seed, want] of [[2, 'uplink-jamming gnss-spoofing'], [1, 'pnt-jamming time-spoof']]) {
    const where = `${w}x${h}, seed ${seed}${wideFonts ? ', wide fonts' : ''}`
    if (!(await startSeed(b, url, [w, h], true, seed))) return [`${where}: could not replay the seed`]
    if (wideFonts) await wideFontsOn(b)
    await sleep(300)
    const m = await b.evaluate(BOARD_FIT)
    if (m.opening !== want) failures.push(`${where}: turn 1 opens on ${m.opening}, not ${want}`)
    if (m.page) failures.push(`${where}: the page scrolls`)
    if (m.body[0] > m.body[1] + 1) failures.push(`${where}: the turn-1 board scrolls (${m.body[0]} of ${m.body[1]}px)`)
    if (m.dockBottom > m.vh + 0.5) failures.push(`${where}: the dock ends at ${Math.round(m.dockBottom)} of ${m.vh}`)
    await wideFontsOff(b)
  }
  return failures
}

// THE v1.6 R2 GUARDS (R1's fresh eyes, the round's section 2).
//
// (g) UNDER THE ASSET STRIP, in blockMoments: the banner stands under the
// strip, however tall its chips have made it. (The rest of (g), the
// strike card's outcome line from 390 wide and the night so far under it,
// left the game with the card in v1.7 R1: the night so far is END OF
// TURN's DETAILS now, measured open in walkNightFits.)
// (h) THE DESKTOP LOG DURING THE NIGHT, in blockMoments: while a blocked
// move locks on, its row is INCOMING in the muted ink; once it lands, one
// more row is written, BLOCKED as the banner reads. Since v1.7 R1 a move
// that waits for its answer is INCOMING the same way, and its row is
// written beside its result.
// (i) THE DESKTOP DEBRIEF'S COLUMNS: at 1440x900 the won debrief's left
// column runs on under FILED THIS GAME with no hole (the gap is the
// grid's 12px), and the right column starts level with the first screen.
// (j) DESKTOP TYPE: at 1440x900, deciding with PROCURE open beside the
// board and during the night, no text in the HUD, the middle column, the
// dock or the side panel is set under 12px.
// (k) "MORE BELOW" ON A SOLID BAND, in procureCards: when PROCURE shows
// the cue, its band is opaque.
// (l) ONE HUD HEIGHT, in blockMoments: through every block moment,
// response and result of three nights, phone and desktop, the streak's
// chip among them, the HUD keeps one height. (m) FIRST ORDERS WHOLE ON
// THE DESKTOP: see desktopOrders.
const SMALL_TEXT = `(() => [...document.querySelectorAll('[data-hud] *, [data-board-play] *, [data-dock] *, [data-sheet] *')].filter((e) => {
  const r = e.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  return own && parseFloat(getComputedStyle(e).fontSize) < 12
}).map((e) => e.tagName.toLowerCase() + ' ' + getComputedStyle(e).fontSize + ' "' + e.textContent.trim().slice(0, 28) + '"'))()`

const DEBRIEF_COLUMNS = `(() => {
  const r = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null
  const first = r('[data-debrief-first]')
  const turns = r('[data-turns]')
  const right = r('[data-debrief-col="right"]')
  return first && turns && right ? { firstBottom: first.bottom, firstTop: first.top, turnsTop: turns.top, rightTop: right.top, rightLeft: right.left, firstRight: first.right } : null
})()`

async function desktopType(b, url) {
  const [w, h] = [1440, 900]
  const where = `${w}x${h}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  if (!(await startSeedAt(b, url, [w, h], true, NIGHT_SEED, true))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  await sleep(300)
  const failures = []
  // Not vacuous: the desktop board is the three-column one.
  if (!(await b.evaluate('matchMedia("(min-width: 1100px) and (min-height: 600px)").matches'))) return [`${where}: not the desktop board`]
  for (const x of await b.evaluate(SMALL_TEXT)) failures.push(`${where}, deciding: ${x} is under 12px`)
  await orderDefenses(b, NIGHT_PLAN[1])
  await b.evaluate(click('[data-execute]'))
  if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy' && !!document.querySelector('[data-night-card]')`, 9000))) return [...failures, `${where}: the night's first card never showed`]
  await sleep(300)
  for (const x of await b.evaluate(SMALL_TEXT)) failures.push(`${where}, the night: ${x} is under 12px`)
  return failures
}

// (m) FIRST ORDERS WHOLE ON THE DESKTOP: at 1440x900, turn 1 on both
// openings, with the full brief open, the middle column does not scroll
// and FIRST ORDERS ends above the dock (the round's fresh eyes, G13).
const DESKTOP_ORDERS = `(() => {
  const col = document.querySelector('[data-board-play]')
  const orders = document.querySelector('[data-orders]')?.getBoundingClientRect()
  const dock = document.querySelector('[data-dock]')?.getBoundingClientRect()
  return { over: col.scrollHeight - col.clientHeight, ordersBottom: orders?.bottom ?? null, dockTop: dock?.top ?? 0, colBottom: col.getBoundingClientRect().bottom }
})()`

async function desktopOrders(b, url) {
  const [w, h] = [1440, 900]
  const failures = []
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  for (const seed of [2, 32]) {
    const where = `${w}x${h}, seed ${seed}, turn 1`
    if (!(await startSeedAt(b, url, [w, h], true, seed, true))) return [`${where}: could not replay the seed`]
    // The full brief is a sheet since v1.6 R3 and stays shut until its
    // icon is tapped, so the column holds TONIGHT and the coach alone.
    await sleep(400)
    const m = await b.evaluate(DESKTOP_ORDERS)
    if (m.ordersBottom === null) failures.push(`${where}: no FIRST ORDERS`)
    else if (m.ordersBottom > Math.min(m.dockTop, m.colBottom) + 0.5) failures.push(`${where}: FIRST ORDERS ends at ${Math.round(m.ordersBottom)}, under the dock at ${Math.round(m.dockTop)}`)
    if (m.over > 1) failures.push(`${where}: the middle column scrolls (${m.over}px over)`)
  }
  return failures
}

async function desktopDebrief(b, url) {
  const [w, h] = [1440, 900]
  const where = `${w}x${h}, won debrief`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  if (!(await startSeedAt(b, url, [w, h], true, NIGHT_SEED, true))) return [`${where}: could not replay seed ${NIGHT_SEED}`]
  if (!(await playToDebrief(b, NIGHT_PLAN))) return [`${where}: the operation never reached its debrief`]
  if (!(await waitFor(b, '!!document.querySelector("[data-turns]")', 8000))) return [`${where}: the lower sections never arrived`]
  await sleep(300)
  const m = await b.evaluate(DEBRIEF_COLUMNS)
  if (!m) return [`${where}: the columns could not be measured`]
  const failures = []
  const gap = Math.round(m.turnsTop - m.firstBottom)
  if (gap > 16 || gap < 0) failures.push(`${where}: TURN BY TURN starts ${gap}px under FILED THIS GAME, not the grid's 12px`)
  if (Math.abs(m.rightTop - m.firstTop) > 2) failures.push(`${where}: the right column starts at ${Math.round(m.rightTop)}, the first screen at ${Math.round(m.firstTop)}`)
  if (m.rightLeft < m.firstRight) failures.push(`${where}: the columns overlap`)
  return failures
}


// THE v1.6 R3 GUARDS (Ken's phone playtest of 27 October 2026), (n) to (q).
// (n) NO TEXT-LINK CONTROLS on the board, PROCURE, the night or the
// debrief: no control whose words carry a "›", and none drawn as bare
// link-blue text (no border, no fill, no icon). (o) NO PANEL SCROLLS INSIDE
// A SCROLLING ONE, on every screen of the sweep. (p) THE RESULT CARD FITS
// 390x844: every result card of two campaigns' nights, won and lost, with
// no scroll and no "more below"; and since v1.7 R1 THE RESPONSE fits
// 390x844 and 375x667, every answer and "Ride it out" in view unscrolled,
// for every threat that can be answered and for a chained move with two
// answers, the tallest there is, and on both the result's way on is on
// screen, its Dossier card shut or open. (q) THE NIGHT'S CLOCKS, rewritten
// in v1.7 R1 (until then: a strike holds at least 2 seconds unless tapped,
// and SKIP NIGHT plays no more strikes; the hold and SKIP NIGHT are gone):
// a block moment is over inside a second by itself and at once on a tap,
// the FILED stamp and the overlay leave by themselves, every card waits
// (watched for 3 seconds, longer than the old hold), and nothing the night
// lost is ever on screen.
const TEXT_LINKS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }
  const probe = document.createElement('span'); probe.className = 'text-dc-friendly'; document.body.appendChild(probe)
  const blue = getComputedStyle(probe).color; probe.remove()
  const clear = (c) => !c || c === 'transparent' || /rgba\\([^)]*,\\s*0\\)$/.test(c) || /\\/ 0\\)$/.test(c)
  const out = []
  for (const e of document.querySelectorAll('button, a[href], summary, [role=button]')) {
    if (!vis(e)) continue
    const t = (e.innerText || '').trim().replace(/\\s+/g, ' ')
    const st = getComputedStyle(e)
    // A key's border may be on the box inside its 44px hit area (SYSTEM's).
    const bordered = [e, ...e.querySelectorAll('*')].some((x) => { const xs = getComputedStyle(x); return ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(xs['border' + k + 'Width']) > 0 && !clear(xs['border' + k + 'Color'])) })
    const iconic = !!e.querySelector('svg, canvas, img')
    const blueWords = [e, ...e.querySelectorAll('*')].some((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(x).color === blue)
    if (t.includes('›')) out.push('chevron: ' + t.slice(0, 60))
    else if (blueWords && !bordered && clear(st.backgroundColor) && !iconic) out.push('link-blue: ' + t.slice(0, 60))
  }
  return out
})()`
const NESTED_SCROLL = `(() => {
  const scrolls = (e) => { const st = getComputedStyle(e); return ['auto', 'scroll'].includes(st.overflowY) && e.scrollHeight > e.clientHeight + 2 }
  const pageScrolls = document.documentElement.scrollHeight > innerHeight + 1
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (e.tagName === 'TEXTAREA' || !scrolls(e) || e.closest('details:not([open])')) continue
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    let outer = null
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (scrolls(p)) { outer = p; break }
    const fixed = !!e.closest('[role=dialog], [data-sheet]') || getComputedStyle(e).position === 'fixed'
    const name = (x) => [...x.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name).join(' ') || x.tagName.toLowerCase()
    if (outer) out.push(name(e) + ' scrolls inside ' + name(outer))
    else if (pageScrolls && !fixed) out.push(name(e) + ' scrolls inside the scrolling page')
  }
  return out
})()`
async function screenAudit(b, where, failures, { links = true } = {}) {
  await sleep(250)
  if (links) for (const l of await b.evaluate(TEXT_LINKS)) failures.push(`${where}: a text-link control (${l})`)
  for (const n of await b.evaluate(NESTED_SCROLL)) failures.push(`${where}: ${n}`)
}

async function r3Screens(b, url, [w, h]) {
  const failures = []
  const desktop = w >= 1100
  const tag = `${w}x${h}`
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !desktop })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  // The title, its SYSTEM, the Dossier and the Library: nested scroll.
  if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1' }))) return [`${tag}: no title`]
  await screenAudit(b, `${tag} title`, failures, { links: false })
  await b.evaluate(click('[data-title-system]'))
  await sleep(300)
  await screenAudit(b, `${tag} title SYSTEM`, failures, { links: false })
  for (const room of ['dossier', 'library']) {
    if (!(await cleanLoad(b, url, { 'dc-intro-seen': '1' }))) return [`${tag}: no title`]
    await b.evaluate(click(`[data-read="${room}"]`))
    await waitFor(b, `!!document.querySelector('[data-${room}]')`)
    await screenAudit(b, `${tag} ${room}`, failures, { links: false })
  }
  // A game on seed 32 to its won debrief, and seed 2 lost: every board,
  // PROCURE, the full brief, SYSTEM, every night card, both debriefs.
  for (const [seed, plan, what] of [[32, NIGHT_PLAN, 'won'], [2, {}, 'lost']]) {
    if (!(await startSeedAt(b, url, [w, h], true, seed, desktop))) return [`${tag}, seed ${seed}: could not replay the seed`]
    for (let turn = 1; turn <= 6; turn += 1) {
      const at = `${tag}, seed ${seed}, turn ${turn}`
      await sleep(250)
      await screenAudit(b, `${at} board`, failures)
      if (turn === 1) {
        await b.evaluate(click('[data-full-brief]'))
        await waitFor(b, '!!document.querySelector("[data-sheet=brief]")')
        await screenAudit(b, `${at} full brief`, failures)
        await b.evaluate(click('button[aria-label="System"]'))
        await sleep(250)
        await screenAudit(b, `${at} SYSTEM`, failures)
        await b.evaluate(click('button[aria-label="System"]'))
        await sleep(150)
      }
      if (!desktop) {
        await b.evaluate(click('[data-action="procure"]'))
        await waitFor(b, '!!document.querySelector("[data-sheet=procure]")')
        await screenAudit(b, `${at} PROCURE`, failures)
        await b.evaluate(click('[data-action="procure"]'))
        await sleep(150)
      }
      await orderDefenses(b, plan[turn] ?? [])
      if (!desktop) await b.evaluate(`(() => { if (document.querySelector('[data-sheet=procure]')) document.querySelector('[data-action="procure"]').click(); return true })()`)
      await b.evaluate(click('[data-execute]'))
      let last = false
      for (let steps = 0; steps < 40; steps += 1) {
        if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) return [...failures, `${at}: the night stopped`]
        const stage = await b.evaluate(NIGHT_STAGE)
        if (stage === 'board') break
        await screenAudit(b, `${at} night ${stage}`, failures)
        last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
        await b.evaluate(tapFor(plan))
        await sleep(80)
        if (last) break
      }
      if (last) break
    }
    if (!(await waitFor(b, '!!document.querySelector("[data-debrief]")', 8000))) return [...failures, `${tag}, seed ${seed}: no ${what} debrief`]
    await sleep(500)
    await screenAudit(b, `${tag} ${what} debrief`, failures)
    await b.evaluate('(() => { const s = document.querySelector("[data-debrief-screen]") || document.scrollingElement; s.scrollTop = s.scrollHeight; scrollTo(0, document.body.scrollHeight); return true })()')
    await screenAudit(b, `${tag} ${what} debrief, its foot`, failures)
  }
  return failures
}

// (p) Every result card's measure: its body scrolls by how much, "more
// below", the page, and its way on under the screen's foot.
const HIT_CARD_FIT = `(() => {
  const c = document.querySelector('[data-night-card="hit"], [data-night-card="debris"]')
  if (!c) return null
  const body = c.querySelector('[data-card-body]')
  const foot = c.querySelector('footer').getBoundingClientRect()
  const way = c.querySelector('[data-collect], [data-continue]')?.getBoundingClientRect()
  return { over: body.scrollHeight - body.clientHeight, more: !!c.querySelector('[data-more]'), page: document.documentElement.scrollHeight > innerHeight + 1, footBottom: foot.bottom, wayTop: way?.top ?? -1, wayBottom: way?.bottom ?? -1, vh: innerHeight, name: (c.querySelector('[data-move-name], h3') || {}).textContent }
})()`
// (p) THE RESPONSE's measure (v1.7 R1): every answer and "Ride it out"
// stand in the card's foot, pinned and inside the screen, each at
// least 44px tall, its words inside its own box and inside the width; the
// body does not scroll, the card does not say "more below", and the
// budget's line under it is on screen. `slack` is the room left under
// "Ride it out"; `chain` is the tag a chained move adds.
const RESPONSE_FIT = `(() => {
  const c = document.querySelector('[data-night-card="respond"]')
  if (!c) return null
  const body = c.querySelector('[data-card-body]')
  const box = body.getBoundingClientRect()
  const foot = c.querySelector('footer').getBoundingClientRect()
  const limit = innerHeight
  const buttons = [...c.querySelectorAll('[data-responses] button')]
  const bad = ${OUT_OF_BOUNDS}(c)
  for (const e of buttons) {
    const r = e.getBoundingClientRect()
    const says = '"' + e.innerText.trim().split('\\n')[0].slice(0, 44) + '"'
    if (r.height < 44) bad.push(says + ' is ' + Math.round(r.height) + 'px tall, under 44')
    if (r.top < foot.top - 0.5 || r.bottom > limit + 0.5) bad.push(says + ' stands at ' + Math.round(r.top) + ' to ' + Math.round(r.bottom) + ', and the card shows ' + Math.round(box.top) + ' to ' + Math.round(limit) + ' until it is scrolled')
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) bad.push(says + ' overflows its button (' + e.scrollWidth + 'x' + e.scrollHeight + ' in ' + e.clientWidth + 'x' + e.clientHeight + 'px)')
    // Every line of its words inside the button, so none is clipped.
    for (const x of e.querySelectorAll('*')) {
      if (![...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const rg = document.createRange(); rg.selectNodeContents(x)
      if ([...rg.getClientRects()].some((q) => q.width >= 1 && (q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5))) { bad.push(says + ': "' + x.textContent.trim().slice(0, 30) + '" leaves its button'); break }
    }
  }
  const last = buttons.at(-1)
  return {
    name: c.querySelector('[data-move-name]')?.textContent ?? '',
    options: buttons.length - 1,
    ride: !!last && last.getAttribute('data-response') === 'ride',
    chain: !!c.querySelector('[data-chain-tag]'),
    over: body.scrollHeight - body.clientHeight, more: !!c.querySelector('[data-more]'), page: document.documentElement.scrollHeight > innerHeight + 1,
    footBottom: foot.bottom, vh: innerHeight, slack: last ? Math.round(limit - last.getBoundingClientRect().bottom) : 0, bad,
  }
})()`
// (w) END OF TURN at 390x844 and 375x667 (the shorter phone since v1.7
// R1, when the card came down to two figures and a line): shut, its body
// neither scrolls nor says "more below", and its panels' text is whole,
// on every turn of a won and a lost game, as served and in the wide
// fonts. With DETAILS open (v1.7 R1) every line behind the two figures
// shows, none past the width; BEGIN TURN stays where it stood, wholly on
// screen, and the page does not scroll: the card's body takes the scroll.
const END_FIT = `(() => {
  const c = document.querySelector('[data-night-card="end"]')
  const body = c.querySelector('[data-card-body]')
  const foot = c.querySelector('footer').getBoundingClientRect()
  const begin = c.querySelector('[data-begin]').getBoundingClientRect()
  const details = c.querySelector('[data-end-details]')
  const bad = details.open ? ${OUT_OF_BOUNDS}(c) : []
  if (details.open) for (const e of details.querySelectorAll('dt, dd, li, p')) if (e.getBoundingClientRect().width >= 1 && e.scrollWidth > e.clientWidth + 1) bad.push('"' + e.textContent.trim().slice(0, 32) + '" overflows its box (' + e.scrollWidth + ' of ' + e.clientWidth + 'px)')
  return {
    over: body.scrollHeight - body.clientHeight, more: !!c.querySelector('[data-more]'),
    page: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
    beginTop: begin.top, beginBottom: begin.bottom, footBottom: foot.bottom, vh: innerHeight,
    open: details.open, rows: [...details.querySelectorAll('[data-score-row], [data-ledger-row]')].filter((e) => e.getBoundingClientRect().height > 1).length,
    scrolls: getComputedStyle(body).overflowY, bad,
  }
})()`
// The games (p) and (w) walk, once for both, each as served and in the
// wide fonts. At 390x844: two campaigns with and without orders, as before
// v1.7 R1, and seed 4 with none, whose fourth night chains a two-answer
// move under the tallest asset strip. At 375x667: three games with no
// orders and every move ridden out, which between them meet all but one
// of the threats that can be answered (and both chained two-answer moves,
// seeds 4, 6 and 10), and the plan's game, which meets the last and the
// answers once the night's one response is used. A game with no orders
// is lost and a game on the plan is won, so (w) has both.
const FIT_GAMES = [
  [[390, 844], [[2, {}], [2, NIGHT_PLAN], [32, {}], [32, NIGHT_PLAN], [7, NIGHT_PLAN], [4, {}]]],
  [[375, 667], [[6, {}], [4, {}], [10, {}], [32, NIGHT_PLAN]]],
]
// The room left under "Ride it out" on the tightest response card met, by
// screen and font, for the run's last line.
export const responseSlack = {}
// One walk measures the response and the result for (p) and END OF TURN
// for (w), whichever of r3Guards and r4Guards asks first.
let nightFitsWalk = null
const nightFits = (b, url) => (nightFitsWalk ??= walkNightFits(b, url))
async function walkNightFits(b, url) {
  const failures = []
  const end = []
  // How many threats can be answered: every one with responses in the deck.
  const threats = (readFileSync(join(process.cwd(), 'src', 'content', 'threats.ts'), 'utf8').match(/\bresponses:\s*\[/g) ?? []).length
  for (const [[w, h], games] of FIT_GAMES) {
    let cards = 0
    let chained = 0
    let ends = 0
    let scrolled = 0
    const met = new Set()
    for (const [seed, plan] of games) {
      for (const wide of [false, true]) {
        if (!(await startSeed(b, url, [w, h], true, seed))) return { cards: [...failures, `${w}x${h}, seed ${seed}: could not replay the seed`], end }
        if (wide) await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); return document.fonts.ready.then(() => true) })()`)
        const tap = tapFor(plan)
        for (let turn = 1; turn <= 6; turn += 1) {
          await orderDefenses(b, plan[turn] ?? [])
          await b.evaluate(`(() => { if (document.querySelector('[data-sheet=procure]')) document.querySelector('[data-action="procure"]').click(); return true })()`)
          await b.evaluate(click('[data-execute]'))
          let last = false
          for (let steps = 0; steps < 40; steps += 1) {
            if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) return { cards: [...failures, `${w}x${h}, seed ${seed}, turn ${turn}: the night stopped`], end }
            const stage = await b.evaluate(NIGHT_STAGE)
            if (stage === 'board') break
            const at = `${w}x${h}${wide ? ' wide fonts' : ''}, seed ${seed} ${Object.keys(plan).length ? 'on the plan, answered' : 'with no orders, ridden out'}, turn ${turn}`
            if (stage === 'end') {
              await sleep(120)
              ends += 1
              const where = `${at}, END OF TURN`
              const m = await b.evaluate(END_FIT)
              if (m.over > 1) end.push(`${where}: scrolls ${m.over}px`)
              if (m.more) end.push(`${where}: says "more below"`)
              if (m.page) end.push(`${where}: the page scrolls`)
              if (m.beginTop < 0 || m.beginBottom > m.vh + 0.5) end.push(`${where}: its way on stands at ${Math.round(m.beginTop)} to ${Math.round(m.beginBottom)} of ${m.vh}`)
              for (const c of await b.evaluate(`${CARD_CUT}(${JSON.stringify('[data-score-lines], [data-ledger]')})`)) end.push(`${where}: text cut in its panel (${c})`)
              // DETAILS, opened by its own summary.
              if ((await b.evaluate(OPEN_MORE)) !== 'details') end.push(`${where}: no DETAILS to open`)
              else {
                await sleep(100)
                const o = await b.evaluate(END_FIT)
                const open = `${where}, DETAILS open`
                if (!o.open || o.rows < 4) end.push(`${open}: ${o.rows} of its lines show`)
                if (o.page) end.push(`${open}: the page scrolls`)
                if (Math.abs(o.beginTop - m.beginTop) > 0.5 || o.beginBottom > o.vh + 0.5 || o.footBottom > o.vh + 0.5) end.push(`${open}: its way on moved from ${Math.round(m.beginTop)} to ${Math.round(o.beginTop)}, ending at ${Math.round(o.beginBottom)} of ${o.vh}`)
                if (o.over > 1 && !['auto', 'scroll'].includes(o.scrolls)) end.push(`${open}: ${o.over}px of it cannot be reached (the body's overflow is ${o.scrolls})`)
                if (o.over > 1) scrolled += 1
                for (const x of o.bad) end.push(`${open}: ${x}`)
                await b.evaluate(SHUT_MORE)
                await sleep(40)
              }
            }
            if (stage === 'respond') {
              await sleep(120)
              const m = await b.evaluate(RESPONSE_FIT)
              const where = `${at}, the response to ${m.name}`
              met.add(m.name)
              if (m.chain && m.options >= 2) chained += 1
              const key = `${w}x${h}${wide ? ' wide' : ''}`
              responseSlack[key] = Math.min(responseSlack[key] ?? Infinity, m.slack)
              if (!m.ride) failures.push(`${where}: "Ride it out" is not its last answer`)
              if (m.over > 1) failures.push(`${where}: the card scrolls ${m.over}px`)
              if (m.more) failures.push(`${where}: the card says "more below"`)
              if (m.page) failures.push(`${where}: the page scrolls`)
              if (m.footBottom > m.vh + 0.5) failures.push(`${where}: the budget's line ends at ${Math.round(m.footBottom)}, under ${m.vh}`)
              for (const x of m.bad) failures.push(`${where}: ${x}`)
            }
            if (stage === 'hit' || stage === 'debris') {
              await sleep(120)
              const m = await b.evaluate(HIT_CARD_FIT)
              if (stage === 'hit') cards += 1
              const where = `${at}, ${m.name}`
              // One screen at 390x844; on the shorter phone the body may
              // scroll, under a way on that is pinned and on screen.
              if (h >= 844 && stage === 'hit') {
                if (m.over > 1) failures.push(`${where}: the result card scrolls ${m.over}px`)
                if (m.more) failures.push(`${where}: the result card says "more below"`)
              }
              if (m.page) failures.push(`${where}: the page scrolls`)
              if (m.footBottom > m.vh + 0.5 || m.wayTop < 0 || m.wayBottom > m.vh + 0.5) failures.push(`${where}: its way on stands at ${Math.round(m.wayTop)} to ${Math.round(m.wayBottom)}, the card's foot at ${Math.round(m.footBottom)}, of ${m.vh}`)
              // The Dossier card opens in the result (v1.7 R1): the body
              // takes the scroll, and the way on stays where it was.
              if (await b.evaluate(OPEN_MORE)) {
                await sleep(60)
                const o = await b.evaluate(HIT_CARD_FIT)
                if (o.page) failures.push(`${where}, its Dossier card open: the page scrolls`)
                if (Math.abs(o.wayTop - m.wayTop) > 0.5 || o.wayBottom > o.vh + 0.5) failures.push(`${where}, its Dossier card open: its way on moved from ${Math.round(m.wayTop)} to ${Math.round(o.wayTop)} of ${o.vh}`)
                await b.evaluate(SHUT_MORE)
              }
            }
            last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
            await b.evaluate(tap)
            await sleep(60)
            if (last) break
          }
          if (last) break
        }
      }
    }
    if (h >= 844 && cards < 40) failures.push(`${w}x${h}: only ${cards} result cards were measured`)
    if (chained === 0) failures.push(`${w}x${h}: no response card had two answers and the chain's line, so the tallest was not measured`)
    if (h < 844 && met.size < threats) failures.push(`${w}x${h}: the response cards of ${met.size} of the ${threats} threats that can be answered were measured (${[...met].sort().join(', ')})`)
    if (ends < 20) end.push(`${w}x${h}: only ${ends} END OF TURN cards were measured`)
    // Not vacuous: on the shorter phone the open DETAILS is longer than
    // the card, so the pinned way on was tested against a body that scrolls.
    if (h < 700 && scrolled === 0) end.push(`${w}x${h}: DETAILS never ran past the card, so the pinned BEGIN TURN was not tested`)
  }
  return { cards: failures, end }
}

// (q) The night's clocks, read in the page: when each thing that goes on
// by itself came and went (a block moment, the FILED stamp, the overlay),
// by a MutationObserver, so a poll's gaps cannot hide a short one; and
// whether anything the game no longer has was ever on screen.
const WATCH_NIGHT = `(() => {
  const kinds = { block: '[data-block-moment]', filed: '[data-filed-stamp]', moving: '[data-moving]' }
  const gone = ['[data-skip-night]', '[data-strike-card]', '[data-intel-file]', '[data-file-it]', '[data-end-help]']
  window.__night = { seen: [], gone: [] }
  const on = {}
  const look = () => {
    const now = performance.now()
    for (const kind of Object.keys(kinds)) {
      const e = document.querySelector(kinds[kind])
      // Two block moments in a row are two elements: each has its own time.
      if (on[kind] && on[kind].e !== e) { on[kind].at.end = now; on[kind] = null }
      if (e && !on[kind]) { on[kind] = { e, at: { kind, start: now } }; window.__night.seen.push(on[kind].at) }
    }
    for (const sel of gone) if (document.querySelector(sel) && !window.__night.gone.includes(sel)) window.__night.gone.push(sel)
  }
  new MutationObserver(look).observe(document.body, { childList: true, subtree: true })
  look()
  return true
})()`
// What a waiting card is, to tell whether it changed: its kind, its
// subject and its ways on.
const NIGHT_CARD = `(() => {
  const c = document.querySelector('[data-night-card]')
  if (!c) return null
  return [c.getAttribute('data-night-card'), (c.querySelector('[data-move-name], h3') || {}).textContent || '', [...c.querySelectorAll('footer button, footer [data-filed-stamp], [data-responses] button')].map((x) => x.innerText.trim().split('\\n')[0]).join(' / ')].join(' | ')
})()`
// How long a waiting card is watched: longer than the 2.5 s a strike held
// before its card came up by itself, until v1.7 R1.
const WAITS_MS = 3000
// A block moment is BLOCK_MS (950) on the game's clock. The quickest one
// of a run must be inside the second; a late timer on a loaded runner may
// carry another a little past it, never as far as a hold.
const BLOCK_LIMIT_MS = 1000
const BLOCK_LATE_MS = 1250
async function nightTiming(b, url) {
  const failures = []
  for (const [w, h] of [[375, 667], [390, 844]]) {
    const tag = `${w}x${h}`
    if (!(await startSeed(b, url, [w, h], false, NIGHT_SEED))) return [`${tag}: could not replay the seed`]
    await b.evaluate(WATCH_NIGHT)
    let waited = 0
    let tapped = 0
    for (let turn = 1; turn <= 6; turn += 1) {
      await orderDefenses(b, NIGHT_PLAN[turn])
      await b.evaluate(`(() => { if (document.querySelector('[data-sheet=procure]')) document.querySelector('[data-action="procure"]').click(); return true })()`)
      await b.evaluate(click('[data-execute]'))
      let last = false
      for (let steps = 0; steps < 40 && !last; steps += 1) {
        // Until a card waits. On the last night a block moment is tapped
        // as it stands: the tap ends it at once.
        let stage = 'busy'
        for (const t0 = Date.now(); stage === 'busy' && Date.now() - t0 < 12000; ) {
          if (turn === 6 && (await b.evaluate('!!document.querySelector("[data-block-moment]") && !!document.querySelector("[data-strike-tap]")'))) {
            await sleep(300)
            const t1 = await b.evaluate('performance.now()')
            if (await b.evaluate(click('[data-strike-tap]'))) {
              if (!(await waitFor(b, '!document.querySelector("[data-block-moment]")', 2000))) failures.push(`${tag}, turn ${turn}: a tap did not end the block moment`)
              else {
                const stood = await b.evaluate(`Math.round(performance.now() - ${t1})`)
                if (stood > 400) failures.push(`${tag}, turn ${turn}: the block moment stood ${stood}ms after its tap`)
                tapped += 1
              }
            }
          }
          stage = await b.evaluate(NIGHT_STAGE)
          if (stage === 'busy') await sleep(40)
        }
        if (stage === 'busy') return [...failures, `${tag}, turn ${turn}: the night stopped`]
        if (stage === 'board') break
        // Nights 1 and 3, untapped: every card is still there, and still
        // the same card, three seconds on.
        if (turn === 1 || turn === 3) {
          const card = await b.evaluate(NIGHT_CARD)
          await sleep(WAITS_MS)
          const still = await b.evaluate(NIGHT_CARD)
          waited += 1
          if (still !== card) failures.push(`${tag}, turn ${turn}: "${card}" went on by itself inside ${WAITS_MS / 1000} seconds, to ${still === null ? 'no card' : `"${still}"`}`)
        }
        last = stage === 'end' && (await b.evaluate('document.querySelector("[data-begin]").innerText.trim()')) === 'DEBRIEF'
        if (!last) await b.evaluate(NIGHT_TAP)
        await sleep(80)
      }
      if (last) break
    }
    const night = await b.evaluate('({ seen: window.__night.seen.map((x) => ({ kind: x.kind, ms: x.end ? Math.round(x.end - x.start) : null })), gone: window.__night.gone })')
    const took = (kind) => night.seen.filter((x) => x.kind === kind).map((x) => x.ms)
    // The block moments of nights 1 to 5 ran untapped (the last night's
    // is the tapped one, and the shortest by far).
    const blocks = took('block').filter((ms) => ms === null || ms > 500)
    if (blocks.length < 2) failures.push(`${tag}: ${blocks.length} block moment(s) ran untapped, so its clock was not read`)
    if (blocks.some((ms) => ms === null)) failures.push(`${tag}: a block moment never ended`)
    else if (blocks.length) {
      if (Math.min(...blocks) > BLOCK_LIMIT_MS) failures.push(`${tag}: the quickest block moment stood ${Math.min(...blocks)}ms, over a second`)
      for (const ms of blocks) if (ms > BLOCK_LATE_MS) failures.push(`${tag}: a block moment stood ${ms}ms`)
    }
    const stamps = took('filed')
    if (!stamps.length) failures.push(`${tag}: no FILED stamp was seen`)
    for (const ms of stamps) if (ms === null || ms > 1000) failures.push(`${tag}: a FILED stamp ${ms === null ? 'never left' : `stood ${ms}ms`}, and the night goes on by itself after about half a second`)
    const overlays = took('moving')
    if (!overlays.length) failures.push(`${tag}: no COLDVEIL IS MOVING overlay was seen with motion on`)
    for (const ms of overlays) if (ms === null || ms > 1100) failures.push(`${tag}: the overlay ${ms === null ? 'never left' : `stood ${ms}ms`}, not its 750`)
    if (waited < 5) failures.push(`${tag}: only ${waited} waiting card(s) were watched`)
    if (!tapped) failures.push(`${tag}: no block moment was tapped, so the tap was not measured`)
    // What v1.7 R1 took out of the night stays out of it.
    for (const sel of night.gone) failures.push(`${tag}: ${sel} was on screen during the night`)
  }
  return failures
}

export async function r3Guards(b, url) {
  const failures = []
  for (const vp of [[375, 667], [1440, 900]]) failures.push(...(await r3Screens(b, url, vp)))
  failures.push(...(await nightFits(b, url)).cards)
  failures.push(...(await nightTiming(b, url)))
  return failures
}


// THE v1.6 R4 GUARDS (Ken's rulings of 27 October 2026 on R3), (t) to (w).
// (t) PROCURE FITS 390x844 WITH NO CUE: empty (its first opening, its "?"
// open, and after), with an order, capped, and on a later night, as
// served and in the wide fonts. (u) ONE WAY OUT OF PROCURE: on a phone the
// one control that leaves it is the dock's BACK TO BOARD (hit-tested, so
// the covered backdrop does not count), and no button inside it reads
// PROCURE; on the desktop, where it stands open, none. (v) NO CUT-OFF CARD
// TEXT: every line of PROCURE's tiles, END OF TURN's panels and the
// debrief's tiles inside its card. (w) END OF TURN FITS on every turn of
// two games, at 390x844 and, since v1.7 R1, at 375x667 too, and its
// DETAILS open over a pinned BEGIN TURN. The coach once per device is
// (x), in tests/playtest-r4.dom.spec.tsx.
const LOADOUT_FIT = `(() => {
  const body = document.querySelector('[data-procure-body]')
  if (!body) return null
  return { over: body.scrollHeight - body.clientHeight, cue: !!document.querySelector('[data-sheet=procure] [data-scroll-cue]'), page: document.documentElement.scrollHeight > innerHeight + 1 }
})()`
const PROCURE_EXITS = `(() => {
  const hit = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2; const at = document.elementFromPoint(x, y); return !!at && (at === e || e.contains(at)) }
  const words = (e) => ((e.innerText || '').trim() || (e.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ')
  // A control's words or its accessible name: a key drawn as an X says
  // what it does to a screen reader alone.
  const says = (e, re) => re.test(words(e)) || re.test((e.getAttribute('aria-label') || '').trim())
  const all = [...document.querySelectorAll('button')].filter(hit)
  return {
    exits: all.filter((e) => says(e, /^(back to board|close|done|confirm|✕|x$)/i)).map(words),
    procure: all.filter((e) => says(e, /^procure$|^procure\\b(?! works)/i)).map(words),
  }
})()`
const CARD_CUT = `((sel) => {
  const out = []
  for (const card of document.querySelectorAll(sel)) {
    const c = card.getBoundingClientRect()
    if (c.width < 1 || c.height < 1) continue
    for (const e of card.querySelectorAll('*')) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      if (getComputedStyle(e).position === 'absolute' && e.classList.contains('sr-only')) continue
      const rg = document.createRange(); rg.selectNodeContents(e)
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue
        if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) { out.push(e.textContent.trim().slice(0, 40)); break }
      }
    }
    // A card the screen cuts: past the bottom of its scroll area or the viewport.
    let box = card.parentElement
    while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement
    const limit = box ? Math.min(box.getBoundingClientRect().bottom, innerHeight) : innerHeight
    if (c.bottom > limit + 0.5 && c.top < limit) out.push('card cut at the edge: ' + card.textContent.trim().slice(0, 40))
  }
  return [...new Set(out)]
})`
const R4_CARDS = '[data-sheet=procure] li > button, [data-sheet=procure] li[data-procure-intel], [data-score-lines], [data-ledger], [data-stat]'
async function procureLoadout(b, url) {
  const failures = []
  const closeIt = `(() => { if (document.querySelector('[data-sheet=procure]') && innerWidth < 1100) document.querySelector('[data-action="procure"]').click(); return true })()`
  for (const [w, h] of [[390, 844], [375, 667], [1440, 900]]) {
    const desktop = w >= 1100
    for (const wideFonts of desktop ? [false] : [false, true]) {
      for (const seed of [32, 2]) {
        const tag = `${w}x${h}${wideFonts ? ' wide fonts' : ''}, seed ${seed}`
        // The desktop's replay sets no size of its own.
        if (desktop) {
          await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
          await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
        }
        if (!(await startSeedAt(b, url, [w, h], true, seed, desktop))) return [`${tag}: could not replay the seed`]
        if (wideFonts) await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); return document.fonts.ready.then(() => true) })()`)
        const look = async (where) => {
          await sleep(150)
          const at = `${tag}, ${where}`
          if (w === 390) {
            const m = await b.evaluate(LOADOUT_FIT)
            if (!m) failures.push(`${at}: PROCURE is not open`)
            else {
              if (m.over > 1) failures.push(`${at}: PROCURE scrolls ${m.over}px`)
              if (m.cue) failures.push(`${at}: PROCURE says "more below"`)
            }
            for (const c of await b.evaluate(`${CARD_CUT}(${JSON.stringify(R4_CARDS)})`)) failures.push(`${at}: text cut in its card (${c})`)
          }
          const x = await b.evaluate(PROCURE_EXITS)
          if (desktop) {
            if (x.exits.length) failures.push(`${at}: the open PROCURE has a way out on the desktop: ${x.exits.join(', ')}`)
          } else if (x.exits.length !== 1 || !/^BACK TO BOARD/.test(x.exits[0])) failures.push(`${at}: PROCURE's ways out are ${JSON.stringify(x.exits)}, not the dock's BACK TO BOARD alone`)
          if (x.procure.length) failures.push(`${at}: a PROCURE button inside PROCURE (${x.procure.join(', ')})`)
        }
        const open = async () => {
          if (!desktop) await b.evaluate(`(() => { if (!document.querySelector('[data-sheet=procure]')) document.querySelector('[data-action="procure"]').click(); return true })()`)
          await waitFor(b, '!!document.querySelector("[data-sheet=procure]")')
        }
        await open()
        await look('turn 1, its first opening')
        await b.evaluate(`(() => { const h = document.querySelector('[data-procure-help="open"]'); if (h) h.click(); return true })()`)
        await look('turn 1, empty')
        await b.evaluate(click('[data-procure-kind="drone"]'))
        await look('turn 1, with an order')
        await b.evaluate(click('[data-procure-defense="antiJam"]'))
        await look('turn 1, capped')
        // On to turn 4: three nights with a defense each.
        await b.evaluate(closeIt)
        for (const [turn, ids] of [[1, []], [2, ['encryptedBackhaul']], [3, ['linkAuth']]]) {
          if (turn > 1) await orderDefenses(b, ids)
          await b.evaluate(closeIt)
          await b.evaluate(click('[data-execute]'))
          for (let k = 0; k < 40; k += 1) {
            if (!(await waitFor(b, `${NIGHT_STAGE} !== 'busy'`, 8000))) break
            const stage = await b.evaluate(NIGHT_STAGE)
            if (stage === 'board') break
            await b.evaluate(NIGHT_TAP)
            await sleep(50)
          }
        }
        if (!(await waitFor(b, '!!document.querySelector("[data-execute]")', 8000))) {
          failures.push(`${tag}: never reached turn 4`)
          continue
        }
        await open()
        await look('turn 4, empty')
        await b.evaluate(`(() => { const e = [...document.querySelectorAll('[data-procure-defense]')].find((x) => !x.disabled); if (e) e.click(); return true })()`)
        await look('turn 4, capped')
      }
    }
  }
  return failures
}

export async function r4Guards(b, url) {
  return [...(await procureLoadout(b, url)), ...(await nightFits(b, url)).end]
}

export async function v16Guards(b, url) {
  const failures = []
  const on = await scoreStills(b, url, false)
  failures.push(...on.failures)
  if ((on.stills ?? 0) < 40 || (on.midCount ?? 0) < 3) failures.push(`375x667: ${on.stills} stills, ${on.midCount} mid-count, so the roll was not watched`)
  failures.push(...(await scoreStills(b, url, true)).failures)
  for (const vp of VIEWPORTS) failures.push(...(await blockMoments(b, url, vp)))
  failures.push(...(await blockMoments(b, url, [1440, 900])))
  for (const vp of VIEWPORTS) for (const wide of [false, true]) failures.push(...(await procureCards(b, url, vp, wide)), ...(await openingBoards(b, url, vp, wide)))
  failures.push(...(await desktopType(b, url)), ...(await desktopDebrief(b, url)), ...(await desktopOrders(b, url)))
  return failures
}

export async function phoneLayout(chrome) {
  const server = await serve()
  const url = `http://127.0.0.1:${server.address().port}${BASE}`
  const b = await browser(chrome)
  try {
    const failures = []
    // PHONE_LAYOUT_ONLY=v16 runs the v1.6 guards alone, R1's and R2's
    // (with the debrief's, which hold its shape), for a mutation run.
    // PHONE_LAYOUT_ONLY=r3 runs the v1.6 R3 guards alone, for a mutation run.
    if (process.env.PHONE_LAYOUT_ONLY === 'r3') return await r3Guards(b, url)
    // PHONE_LAYOUT_ONLY=r4 runs the v1.6 R4 guards alone, for a mutation run.
    if (process.env.PHONE_LAYOUT_ONLY === 'r4') return await r4Guards(b, url)
    if (process.env.PHONE_LAYOUT_ONLY === 'v16') {
      failures.push(...(await v16Guards(b, url)))
      failures.push(...(await checkDebrief(b, url, VIEWPORTS[0], NIGHT_PLAN, 'won')), ...(await checkDebrief(b, url, VIEWPORTS[0], {}, 'lost')))
      const { won, lost } = debriefShapes
      if (!won || !lost || won.heroTop !== lost.heroTop) failures.push(`375x667: the won hero stands at ${won?.heroTop}, the lost at ${lost?.heroTop}`)
      if (!won || !lost || won.tiles !== lost.tiles) failures.push(`375x667: the tiles run ${won?.tiles} won and ${lost?.tiles} lost`)
      return failures
    }
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) failures.push(...(await check(b, url, vp, reduced)))
    for (const vp of VIEWPORTS) failures.push(...(await checkTitle(b, url, vp)), ...(await checkBoardSystem(b, url, vp)))
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) for (const wide of [false, true]) failures.push(...(await checkBoard(b, url, vp, reduced, wide)))
    for (const wide of [false, true]) failures.push(...(await checkNight(b, url, VIEWPORTS[0], wide)))
    // A first game, won on NIGHT_PLAN and lost on no orders at all.
    failures.push(...(await checkDebrief(b, url, VIEWPORTS[0], NIGHT_PLAN, 'won')), ...(await checkDebrief(b, url, VIEWPORTS[0], {}, 'lost')))
    // GUARD v1.6 (f): one debrief shape, the hero in the same place and
    // the tiles in one order, won and lost.
    const { won, lost } = debriefShapes
    if (!won || !lost || won.heroTop !== lost.heroTop) failures.push(`375x667: the won hero stands at ${won?.heroTop}, the lost at ${lost?.heroTop}`)
    if (!won || !lost || won.tiles !== lost.tiles) failures.push(`375x667: the tiles run ${won?.tiles} won and ${lost?.tiles} lost`)
    failures.push(...(await checkReadingRooms(b, url, VIEWPORTS[0])))
    failures.push(...(await checkDesktop(b, url)))
    failures.push(...(await v16Guards(b, url)))
    failures.push(...(await r3Guards(b, url)))
    failures.push(...(await r4Guards(b, url)))
    failures.push(...(await checkEveryScreen(b, url)))
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
      console.log(`briefing fits, board fits, SYSTEM in bounds, screens open at the top, tagline on one line, at ${VIEWPORTS.map(([w, h]) => `${w}x${h}`).join(' and ')}; the night's cards fit 375, the debrief's first screen fits 375x667, one shape won and lost, and the R4 screens' labels fit 375, as served and in wide fonts; the desktop board is three columns, the night too, with its log; the score paints whole digits in one colour, each block moment stands under the asset strip and on screen, PROCURE shows two whole cards and one green primary, and both openings' boards fit; the desktop log writes each move as it lands, the desktop debrief's columns run from the top, desktop text is 12px or more, "more below" stands on a solid band, the HUD keeps one height through a streak, and the desktop's FIRST ORDERS stays whole above the dock; the response fits both phones with every answer and "Ride it out" in view (${Object.entries(responseSlack).map(([k, v]) => `${v}px to spare at ${k}`).join(', ')}), the result's way on stays on screen, a block moment is over inside a second, nothing else in the night goes on by itself but the overlay and the FILED stamp, and END OF TURN fits with BEGIN TURN pinned under its DETAILS; every screen is still under reduced motion, with no small input and no retired word`)
      process.exit(0)
    })
    .catch((e) => {
      console.log(String(e?.message ?? e))
      process.exit(1)
    })
}
