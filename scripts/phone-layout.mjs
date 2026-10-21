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
//   The difficulty chip opens it with the Difficulty row in view.
//   SCROLL RESET: a screen opens at its top, whatever the last one's
//   scroll (DOSSIER from a scrolled title; Back to title from a scrolled
//   Glossary).
//   TAGLINE: one line, never under 10px.
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

function serve() {
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

async function browser(chrome) {
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

async function waitFor(b, expression, ms = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await b.evaluate(`!!(${expression})`).catch(() => false)) return true
    await sleep(100)
  }
  return false
}

// One viewport, one motion mode: every beat's measurements, or a failure.
async function check(b, url, [w, h], reduced) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  await b.send('Page.navigate', { url })
  await waitFor(b, 'document.readyState === "complete"')
  await b.evaluate('localStorage.clear(); location.reload(); true')
  await sleep(500)
  if (!(await waitFor(b, 'document.querySelector("[data-play]")'))) return [`${w}x${h}: the title never showed PLAY`]
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
const OUT_OF_BOUNDS = `((root) => {
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
  await b.send('Page.navigate', { url })
  await waitFor(b, 'document.readyState === "complete"')
  await b.evaluate('localStorage.clear(); location.reload(); true')
  await sleep(500)
  return waitFor(b, 'document.querySelector("[data-play]")')
}

async function checkTitle(b, url, [w, h]) {
  const where = `${w}x${h}`
  if (!(await fresh(b, url, [w, h]))) return [`${where}: the title never showed PLAY`]
  const failures = []
  const tag = await b.evaluate(`(() => { const e = document.querySelector('[data-tagline]'); const cs = getComputedStyle(e); return { fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6, h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth } })()`)
  if (tag.fs < 10) failures.push(`${where}: the tagline is ${tag.fs}px, under 10`)
  if (tag.sw > tag.cw + 0.5 || tag.h > tag.lh * 1.5) failures.push(`${where}: the tagline does not fit one line (${tag.sw} of ${tag.cw}px wide, ${Math.round(tag.h)}px tall)`)

  // SCROLL RESET, from a scrolled title and from a scrolled Glossary.
  await b.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector(\'[data-read="dossier"]\').click(); true')
  // The Glossary is a lazy chunk: wait for its Back button, not the shell.
  if (!(await waitFor(b, '[...document.querySelectorAll("button")].some((x) => /back to title/i.test(x.innerText))'))) return [...failures, `${where}: DOSSIER did not open the Glossary`]
  await sleep(300)
  let y = await b.evaluate('Math.round(scrollY + document.querySelector("[data-screen]").scrollTop)')
  if (y !== 0) failures.push(`${where}: DOSSIER opened ${y}px down`)
  await b.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); [...document.querySelectorAll("button")].find((x) => /back to title/i.test(x.innerText)).click(); true')
  await waitFor(b, 'document.querySelector("[data-title]")')
  await sleep(300)
  y = await b.evaluate('Math.round(scrollY + document.querySelector("[data-screen]").scrollTop)')
  if (y !== 0) failures.push(`${where}: Back to title opened ${y}px down`)

  // The chip opens SYSTEM at Difficulty; SYSTEM stays in bounds, opaque
  // and full height.
  await b.evaluate('window.scrollTo(0, 400); document.querySelector("[data-difficulty-chip]").click(); true')
  if (!(await waitFor(b, 'document.querySelector("[role=dialog]")'))) return [...failures, `${where}: the chip did not open SYSTEM`]
  await sleep(300)
  const sys = await b.evaluate(`(() => {
    const d = document.querySelector('[role=dialog]')
    const row = d.querySelector('[data-system-control="difficulty"]').getBoundingClientRect()
    const panel = d.firstElementChild.getBoundingClientRect()
    return { bad: ${OUT_OF_BOUNDS}(d), rowTop: row.top, rowBottom: row.bottom, panelBottom: panel.bottom, bg: getComputedStyle(d).backgroundColor }
  })()`)
  for (const x of sys.bad) failures.push(`${where}: title SYSTEM: ${x}`)
  if (sys.rowTop < 0 || sys.rowBottom > h) failures.push(`${where}: the chip opened SYSTEM without Difficulty in view`)
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

export async function phoneLayout(chrome) {
  const server = await serve()
  const url = `http://127.0.0.1:${server.address().port}${BASE}`
  const b = await browser(chrome)
  try {
    const failures = []
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) failures.push(...(await check(b, url, vp, reduced)))
    for (const vp of VIEWPORTS) failures.push(...(await checkTitle(b, url, vp)), ...(await checkBoardSystem(b, url, vp)))
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
      console.log(`briefing fits, SYSTEM in bounds, screens open at the top, tagline on one line, at ${VIEWPORTS.map(([w, h]) => `${w}x${h}`).join(' and ')}`)
      process.exit(0)
    })
    .catch((e) => {
      console.log(String(e?.message ?? e))
      process.exit(1)
    })
}
