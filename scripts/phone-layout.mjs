#!/usr/bin/env node
// THE PHONE LAYOUT GUARDS. jsdom lays nothing out, so these drive a real
// headless Chrome over the built game: dist/ is served at the GitHub Pages
// base path and each check runs at phone sizes.
//
// REWRITTEN IN v2.0 R3 (Ken's ruling of 15 November 2026: the pixel board
// is retired). Through R2 this file held the pixel board, its briefing,
// its night and its debrief, about 2,000 lines of it; what it holds now is
// what ships. The 3D game's whole six nights are the bot's
// (scripts/game3d-bot.mjs), which is too long for the battery; this is the
// short pass the battery runs on every build.
//
// THE TITLE (from Ken's iPhone, 21 October 2026, and the R1 lesson that a
// layout which fits only in Apple's fonts does not fit): at 375x553 (an
// iPhone SE inside Safari's bars), 375x667 and 390x844,
//   TAGLINE: one line, never under 10px, as served and in a wide font.
//   IN BOUNDS: no text leaves the width and the page never scrolls
//   sideways, as served and in wide fonts; nothing but the tagline is
//   under 12px; every button is at least 44px tall.
//   PLAY ON THE FIRST SCREEN at 375x667 and 390x844, with no scroll.
//   SCROLL RESET: a screen opens at its top, whatever the last one's
//   scroll (LIBRARY from a scrolled title, and back).
//   SYSTEM IN BOUNDS: no text field under 16px (iOS Safari zooms the page
//   on focusing one, and stays zoomed), Difficulty in view as it opens,
//   and the dialog opaque to the bottom of the screen.
//
// THE READING ROOMS at 375x667: LIBRARY's two tabs, the scoreboard and the
// credits keep their text inside the width, as served and in wide fonts.
//
// THE GAME'S FIRST SCREENS, a first visit's PLAY, motion on and off, as
// served and with every face forced wide: on each beat of the briefing
// the way on is wholly on screen and the page does not scroll; on night
// 1's orders BEGIN is on screen, the tray shows whole pieces, no text is
// under 12px and nothing scrolls sideways. A Chrome with no WebGL (some CI
// runners) shows the game's own fallback instead: that is checked for its
// way back, and the rest is reported as not run, not as a failure.
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
  [375, 553],
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

// The GPU flags are the bot's: the game draws with WebGL, and a headless
// Chrome without them may refuse it.
//
// DC_SOFTWARE_GL=1 (v2.0 R4) asks Chrome to draw WebGL in software, for a
// machine with no GPU: a CI runner. Without it such a Chrome may refuse
// WebGL, the game shows its fallback, and this guard checks the title and
// the reading rooms and says the game's screens were not checked. With it
// the guard ran whole on a Mac in about 2 minutes against 47 seconds on
// the GPU. Off by default: it has not been run on the runner that builds
// main (.github/workflows/deploy.yml), and a slow software frame there is
// a timeout here.
export const SOFTWARE_GL = process.env.DC_SOFTWARE_GL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []
export async function browser(chrome) {
  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'dc-fit-'))
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--no-sandbox', '--enable-gpu', '--ignore-gpu-blocklist', ...SOFTWARE_GL, 'about:blank'], { stdio: 'ignore' })
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
// is left for about:blank first, so nothing it is still doing (a game's
// autosave on its next render) can write after the storage is cleared:
// clearing from inside the old page and reloading it raced, about one
// load in twenty, and left an autosave that resumed straight into a game
// with no PLAY (v1.3 R3).
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

// The title and the reading rooms take their faces from two variables; the
// game sets its own, so there every element is forced.
export const WIDE_FONTS = `:root { --font-sans: Verdana, 'DejaVu Sans', sans-serif !important; --font-mono: 'Courier New', 'DejaVu Sans Mono', monospace !important; } .t3-root, .t3-root * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }`
const widen = (b) => b.evaluate(`(() => { const s = document.createElement('style'); s.dataset.wide = '1'; s.textContent = ${JSON.stringify(WIDE_FONTS)}; document.head.appendChild(s); dispatchEvent(new Event('resize')); return true })()`)
const narrow = (b) => b.evaluate(`(() => { document.querySelector('style[data-wide]')?.remove(); dispatchEvent(new Event('resize')); return true })()`)
const click = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true })()`
const SIDEWAYS = 'document.documentElement.scrollWidth > innerWidth + 1'

async function fresh(b, url, [w, h], reduced = true, storage = {}) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 800 })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  return cleanLoad(b, url, storage)
}

// Small text and short targets under a root. The tagline fits itself to
// the width and has its own floor.
const SMALL = `((root, floor) => {
  const bad = []
  const seen = new Set()
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent.trim()
    const e = n.parentElement
    if (!t || !e || e.closest('[data-tagline], .t3-sr, .sr-only, [aria-hidden="true"]') || /^[●○◉?#·]+$/.test(t)) continue
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width < 1 || r.height < 1 || Number(cs.opacity) === 0) continue
    const size = parseFloat(cs.fontSize)
    if (size < floor - 0.1 && !seen.has(size + e.className)) { seen.add(size + e.className); bad.push('text at ' + size + 'px "' + t.slice(0, 24) + '"') }
  }
  for (const e of root.querySelectorAll('button, a[href]')) {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') continue
    // A signature's mark on a phone is drawn at 34px and touched at 44: its
    // own area reaches past its rim (v2.0 R4, game3d.css), and the reach counts.
    const reach = e.matches('.t3-contact') ? Math.max(0, -parseFloat(getComputedStyle(e, '::after').top) || 0) : 0
    if (r.height + reach * 2 < 43.5) bad.push('a target ' + Math.round(r.height) + 'px tall "' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) + '"')
  }
  return bad
})`

async function checkTitle(b, url, [w, h]) {
  const where = `${w}x${h}`
  if (!(await fresh(b, url, [w, h]))) return [`${where}: the title never showed PLAY`]
  await sleep(400)
  const failures = []
  // The tagline's width depends on the system font (SF, Roboto, DejaVu on
  // a CI runner), so it is checked as served and again in a deliberately
  // wide font, which the title must refit on a resize: one line, 10px or
  // more, whatever the font.
  const TAG = `(() => { const e = document.querySelector('[data-tagline]'); const cs = getComputedStyle(e); return { fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6, h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth } })()`
  for (const wide of [false, true]) {
    if (wide) await widen(b)
    await sleep(150)
    const as = wide ? ' in wide fonts' : ''
    const tag = await b.evaluate(TAG)
    if (tag.fs < 10) failures.push(`${where}: the tagline is ${tag.fs}px${as}, under 10`)
    if (tag.sw > tag.cw + 0.5 || tag.h > tag.lh * 1.5) failures.push(`${where}: the tagline does not fit one line${as} (${tag.sw} of ${tag.cw}px wide, ${Math.round(tag.h)}px tall)`)
    for (const x of await b.evaluate(`${OUT_OF_BOUNDS}(document.querySelector('[data-title]'))`)) failures.push(`${where}: the title${as}: ${x}`)
    if (await b.evaluate(SIDEWAYS)) failures.push(`${where}: the title scrolls sideways${as}`)
  }
  await narrow(b)
  for (const x of await b.evaluate(`${SMALL}(document.querySelector('[data-title]'), 12)`)) failures.push(`${where}: the title: ${x}`)
  // PLAY is on the first screen of a phone with its whole height to use.
  if (h >= 660) {
    const play = await b.evaluate('(() => { const r = document.querySelector("[data-play]").getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY } })()')
    if (play.top < 0 || play.bottom > h + 0.5) failures.push(`${where}: PLAY ends at ${Math.round(play.bottom)} of ${h}, off the first screen`)
  }

  // SCROLL RESET, from a scrolled title and from a scrolled LIBRARY.
  const back = `(() => { const x = [...document.querySelectorAll('button')].find((e) => /back to title/i.test(e.innerText)); if (!x) return false; window.scrollTo(0, document.documentElement.scrollHeight); x.click(); return true })()`
  await b.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector(\'[data-read="library"]\').click(); true')
  if (!(await waitFor(b, '[...document.querySelectorAll("button")].some((x) => /back to title/i.test(x.innerText))'))) return [...failures, `${where}: LIBRARY did not open`]
  await sleep(300)
  let y = await b.evaluate('Math.round(scrollY)')
  if (y !== 0) failures.push(`${where}: LIBRARY opened ${y}px down`)
  await b.evaluate(back)
  await waitFor(b, 'document.querySelector("[data-title]")')
  await sleep(300)
  y = await b.evaluate('Math.round(scrollY)')
  if (y !== 0) failures.push(`${where}: Back to title opened ${y}px down`)

  // SYSTEM stays in bounds, opaque and full height, with Difficulty in view.
  await b.evaluate('window.scrollTo(0, 400); document.querySelector("[data-title-system]").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[role=dialog] [data-system-control]")'))) return [...failures, `${where}: SYSTEM did not open`]
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
  // (rgba(), or color()/oklab() with a slash alpha from a colour mix).
  const alpha = /\/\s*([\d.]+)\)$/.exec(sys.bg)?.[1] ?? /^rgba\(.*,\s*([\d.]+)\)$/.exec(sys.bg)?.[1] ?? (sys.bg === 'transparent' ? '0' : '1')
  if (Number(alpha) < 1) failures.push(`${where}: title SYSTEM is see-through (${sys.bg})`)
  return failures
}

// LIBRARY's two tabs, the scoreboard and the credits, at one phone size.
async function checkReadingRooms(b, url, [w, h]) {
  const where = `${w}x${h}`
  const failures = []
  const room = async (name, open, ready) => {
    if (!(await fresh(b, url, [w, h]))) return failures.push(`${where}: the title never showed PLAY`)
    for (const step of open) {
      await b.evaluate(step)
      await sleep(350)
    }
    if (!(await waitFor(b, ready, 15000))) return failures.push(`${where}: ${name} did not open`)
    for (const wide of [false, true]) {
      if (wide) await widen(b)
      await sleep(250)
      const as = wide ? ' in wide fonts' : ''
      for (const x of await b.evaluate(`${OUT_OF_BOUNDS}(document.querySelector('[data-screen]'))`)) failures.push(`${where}: ${name}${as}: ${x}`)
      if (await b.evaluate(SIDEWAYS)) failures.push(`${where}: ${name} scrolls sideways${as}`)
    }
    return undefined
  }
  const backShown = '[...document.querySelectorAll("button")].some((x) => /back to title/i.test(x.innerText))'
  await room("LIBRARY's Field Library", [click('[data-read="library"]')], `${backShown} && document.querySelector('[data-screen="library"]').innerText.length > 400`)
  await room("LIBRARY's Glossary", [click('[data-read="library"]'), `(() => { const t = [...document.querySelectorAll('[data-screen="library"] button, [data-screen="library"] [role=tab]')].find((x) => /glossary/i.test(x.innerText)); if (!t) return false; t.click(); return true })()`], `${backShown} && /glossary/i.test(document.querySelector('[data-screen="library"]').innerText)`)
  await room('the scoreboard', [click('[data-title-system]'), click('[data-system-control="scoreboard"]')], `document.querySelector('[data-screen="scoreboard"]') && ${backShown}`)
  await room('the credits', [click('[data-title-system]'), click('[data-system-control="credits"]')], `document.querySelector('[data-screen="credits"]') && ${backShown}`)
  return failures
}

// The game's first screens: the briefing's beats, then night 1's orders.
let noWebGL = false
async function checkGame(b, url, [w, h], reduced, wide) {
  const where = `${w}x${h}, motion ${reduced ? 'off' : 'on'}${wide ? ', wide fonts' : ''}`
  if (!(await fresh(b, url, [w, h], reduced))) return [`${where}: the title never showed PLAY`]
  await b.evaluate(click('[data-play]'))
  if (!(await waitFor(b, 'document.querySelector(".t3-root")', 20000))) return [`${where}: PLAY did not open the game`]
  await sleep(600)
  if (await b.evaluate('!!document.querySelector(".t3-failed")')) {
    // No WebGL here: the game says so and shows the way back.
    noWebGL = true
    const ok = await b.evaluate('[...document.querySelectorAll(".t3-failed button")].some((x) => /title/i.test(x.innerText))')
    return ok ? [] : [`${where}: the game could not start the 3D view and offers no way back`]
  }
  if (wide) await widen(b)
  const failures = []
  if (!(await waitFor(b, 'document.querySelector("[data-t3-opening-next]")', 30000))) return [`${where}: a first PLAY did not open on the briefing`]
  // Up to 3 taps a beat: one may finish a line still being typed.
  for (let tap = 0; tap < 16; tap += 1) {
    // A first tap finishes a line that is still being typed.
    await sleep(reduced ? 250 : 500)
    const m = await b.evaluate(`(() => {
      const next = document.querySelector('[data-t3-opening-next]')
      if (!next) return null
      const r = next.getBoundingClientRect()
      const card = document.querySelector('[data-t3-card="opening"]')
      return { beat: card?.dataset.t3Beat, top: r.top, bottom: r.bottom, page: document.documentElement.scrollHeight > innerHeight + 1, sideways: ${SIDEWAYS}, bad: ${OUT_OF_BOUNDS}(card ?? document.body), go: /primary/.test(next.className) }
    })()`)
    if (!m) break
    if (m.top < 0 || m.bottom > h + 0.5) failures.push(`${where}: the briefing's way on ends at ${Math.round(m.bottom)} of ${h} on beat ${Number(m.beat) + 1}`)
    if (m.page) failures.push(`${where}: the page scrolls on briefing beat ${Number(m.beat) + 1}`)
    if (m.sideways) failures.push(`${where}: the briefing scrolls sideways on beat ${Number(m.beat) + 1}`)
    for (const x of m.bad) failures.push(`${where}: briefing beat ${Number(m.beat) + 1}: ${x}`)
    await b.evaluate(click('[data-t3-opening-next]'))
    if (m.go) break
  }
  if (!(await waitFor(b, 'document.querySelector("[data-t3-begin]")', 20000))) return [...failures, `${where}: the briefing did not hand over to night 1's orders`]
  await sleep(reduced ? 600 : 1600)
  const plan = await b.evaluate(`(() => {
    const root = document.querySelector('.t3-root')
    const begin = document.querySelector('[data-t3-begin]').getBoundingClientRect()
    const tray = document.querySelector('[data-t3-tray]')
    const tr = tray.getBoundingClientRect()
    const cut = [...tray.querySelectorAll('.t3-piece')].flatMap((p) => { const r = p.getBoundingClientRect(); const seen = Math.min(r.right, tr.right) - Math.max(r.left, tr.left); return seen > 2 && seen < r.width - 2 ? [p.textContent.trim().slice(0, 20)] : [] })
    const dock = document.querySelector('[data-t3-dock]').getBoundingClientRect()
    return { beginBottom: begin.bottom, beginRight: begin.right, cut, sideways: ${SIDEWAYS}, small: ${SMALL}(root, 12).filter((x) => !x.startsWith('a target') || !/\\.t3-tags/.test(x)), dock: dock.height / innerHeight, pieces: tray.querySelectorAll('.t3-piece').length }
  })()`)
  if (plan.beginBottom > h + 0.5 || plan.beginRight > w + 0.5) failures.push(`${where}: BEGIN ends at ${Math.round(plan.beginRight)},${Math.round(plan.beginBottom)} of ${w}x${h}`)
  for (const x of plan.cut) failures.push(`${where}: a tray piece is cut: ${x}`)
  if (plan.pieces < 3) failures.push(`${where}: the tray has ${plan.pieces} pieces`)
  if (plan.sideways) failures.push(`${where}: night 1's orders scroll sideways`)
  if (plan.dock > 0.74) failures.push(`${where}: the dock covers ${Math.round(plan.dock * 100)}% of the height`)
  for (const x of plan.small) failures.push(`${where}: night 1's orders: ${x}`)
  return failures
}

// The desktop's title: one screen, the menu beside or under the hero, and
// nothing off the side.
async function checkDesktop(b, url) {
  const where = '1440x900'
  if (!(await fresh(b, url, [1440, 900]))) return [`${where}: the title never showed PLAY`]
  await sleep(400)
  const failures = []
  for (const x of await b.evaluate(`${OUT_OF_BOUNDS}(document.querySelector('[data-title]'))`)) failures.push(`${where}: the title: ${x}`)
  if (await b.evaluate(SIDEWAYS)) failures.push(`${where}: the title scrolls sideways`)
  const play = await b.evaluate('(() => { const r = document.querySelector("[data-play]").getBoundingClientRect(); return r.bottom + scrollY })()')
  if (play > 900.5) failures.push(`${where}: PLAY ends at ${Math.round(play)} of 900, off the first screen`)
  return failures
}

export async function phoneLayout(chrome) {
  const server = await serve()
  const url = `http://127.0.0.1:${server.address().port}${BASE}`
  const b = await browser(chrome)
  try {
    const failures = []
    for (const vp of VIEWPORTS) failures.push(...(await checkTitle(b, url, vp)))
    failures.push(...(await checkDesktop(b, url)))
    failures.push(...(await checkReadingRooms(b, url, VIEWPORTS[1])))
    for (const vp of VIEWPORTS) {
      for (const [reduced, wide] of [
        [false, false],
        [true, true],
      ]) {
        failures.push(...(await checkGame(b, url, vp, reduced, wide)))
        if (noWebGL) break
      }
      if (noWebGL) break
    }
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
      const sizes = VIEWPORTS.map(([w, h]) => `${w}x${h}`).join(', ')
      console.log(`the title fits at ${sizes} and 1440x900 (tagline on one line, SYSTEM in bounds, screens open at the top), the reading rooms fit 375, ${noWebGL ? 'and this Chrome has no WebGL, so the game showed its fallback and its first screens were not checked' : "and the game's briefing and night 1's orders fit, motion on and off, as served and in wide fonts"}`)
      process.exit(0)
    })
    .catch((e) => {
      console.log(String(e?.message ?? e))
      process.exit(1)
    })
}
