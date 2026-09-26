#!/usr/bin/env node
// Validation battery (spec Section 11). Run: node scripts/battery.mjs
//
// Layers: typecheck + build (11.1), determinism (11.2) and content
// integrity (11.3) via vitest, the content link check (11.4, skips
// gracefully offline), and repo hygiene checks.
// The OPSEC content scan (11.5) is local-only and lives in scripts/hooks/pre-push;
// public CI never sees the deny-list.

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { measureBundle } from './bundle-budget.mjs'
import { runLinkCheck } from './link-check.mjs'

const failures = []
// Stamped before anything builds, so the bundle layer can tell a chunk
// this run produced from one an earlier build left behind.
const batteryStartedAt = Date.now()

function report(name, outcome) {
  console.log(outcome)
  if (outcome.startsWith('FAIL')) failures.push(name)
}

function run(name, fn) {
  process.stdout.write(`[battery] ${name} ... `)
  try {
    const result = fn()
    console.log(result === 'skip' ? 'SKIP' : 'OK')
  } catch (err) {
    console.log('FAIL')
    failures.push(name)
    if (err.stdout) process.stderr.write(String(err.stdout))
    if (err.stderr) process.stderr.write(String(err.stderr))
    if (!err.stdout && !err.stderr) console.error(String(err.message ?? err))
  }
}

const sh = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' })

run('typecheck + production build', () => {
  sh('npm run build')
})

// Bundle budget (game-feel brief section 8): everything the build emits,
// gzipped, under its thresholds. The INITIAL download is the entry script
// plus the stylesheet; DEFERRED is every chunk Rollup splits out, gated one
// chunk at a time since Ken's ruling of 2026-09-26 (brief v0.3 section 8),
// with the frame and its three.js under a ceiling of their own. The layer
// counted the entry script alone from Round 2 until Round 6, so both the
// stylesheet and a 129,274 byte split chunk shipped into a channel nothing
// measured.
// Measured with Node's zlib at its default level, so the number is
// reproducible from the battery alone; the baseline and budget live in
// tests/bundle-budget.json and any library addition records its delta.
run('bundle budget: everything that ships, under threshold (game-feel brief 8)', () => {
  // The layer's own logic lives in scripts/bundle-budget.mjs so the suite
  // can call it with fixtures; this is the wiring, and the numbers it
  // prints are the ones measured here.
  const budget = JSON.parse(readFileSync('tests/bundle-budget.json', 'utf8'))
  const { line } = measureBundle({ budget, startedAt: batteryStartedAt })
  process.stdout.write(`${line} ... `)
})

// The dev-only sound board must not reach players (game-feel brief section
// 7). App.tsx reaches it through a dynamic import behind import.meta.env
// .DEV, which folds to false in a production build so Rollup drops the
// import and emits no chunk. That is a claim about a bundler's behaviour
// under a specific config, which is exactly the kind of claim that stops
// being true quietly, so the built output is searched rather than trusted.
//
// The same layer holds the test-only dependency on the right side of the
// line: jsdom exists for the DOM suites and has no business in a bundle.
const DEV_ONLY_MARKERS = ['DC_DEV_SOUND_BOARD', 'Sound board (dev)']

function filesUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else out.push(full)
  }
  return out
}

run('dev-only sound board is excluded from the production build (brief 7)', () => {
  const hits = []
  for (const file of filesUnder('dist')) {
    if (!/\.(js|css|html|map)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const marker of DEV_ONLY_MARKERS) {
      if (text.includes(marker)) hits.push(`${file} carries "${marker}"`)
    }
  }
  if (hits.length) {
    throw new Error(`the dev sound board reached the production build:\n${hits.join('\n')}`)
  }
  // And the other half of the same sentence: the board is excluded, the
  // audio engine is not. A build that shipped neither would pass the
  // check above while shipping a silent game.
  const shipped = filesUnder('dist').filter((f) => f.endsWith('.js'))
  const anyAudio = shipped.some((f) => readFileSync(f, 'utf8').includes('dc-sound-effects'))
  if (!anyAudio) {
    throw new Error('no built chunk carries the audio preference key; the whole audio layer was tree-shaken away')
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  if (pkg.dependencies?.jsdom) {
    throw new Error('jsdom is a runtime dependency; it is the test environment and belongs in devDependencies')
  }
  if (!pkg.devDependencies?.jsdom) {
    throw new Error('jsdom is not in devDependencies; the DOM suites cannot run')
  }
})

// The zero-residual ledger sweep is the broadest correctness guard on the
// branch and the slowest test in the suite. Its duration is REPORTED here
// and never gated (brief v0.9 section 7): it belongs in the round report
// next to the bundle size, but a threshold on it would fail under load for
// the same reason its 5,000ms timeout did, which is to say exactly when
// multi-agent verification is running. The layer does fail if the sweep is
// missing from the run, so renaming or deleting it cannot quietly drop the
// number this line exists to publish.
const LEDGER_SWEEP_TEST = 'reproduces the after-state of every turn of every line, seed and difficulty with no settle beat'

run('vitest suites: determinism, content, persistence, readme, director, cues, reading diet, sound, music isolation (spec 11.2, 11.3; brief 8)', () => {
  const resultsPath = join(tmpdir(), `dc-battery-vitest-${process.pid}.json`)
  try {
    sh(`npx vitest run --reporter=default --reporter=json --outputFile.json=${JSON.stringify(resultsPath)}`)
    const results = JSON.parse(readFileSync(resultsPath, 'utf8'))
    const sweep = results.testResults
      .flatMap((file) => file.assertionResults ?? [])
      .find((test) => test.title === LEDGER_SWEEP_TEST)
    if (!sweep) {
      throw new Error(
        'the ledger sweep did not run under the name this layer reports; if it was renamed, update LEDGER_SWEEP_TEST',
      )
    }
    // Present is not the same as executed. A skipped test keeps its title
    // in the report and carries no duration at all, so the check above
    // passed and this line printed NaNms while the battery went green;
    // it.skip, it.todo and describe.skip on the block all reached it. A
    // five second test is the first thing anyone skips under pressure, and
    // this repo already normalises conditional skipping elsewhere.
    if (sweep.status !== 'passed' || !Number.isFinite(sweep.duration)) {
      throw new Error(
        `the ledger sweep did not run (status ${sweep.status}); the broadest correctness guard on the branch has to execute for this battery to be green`,
      )
    }
    process.stdout.write(`ledger sweep ${Math.round(sweep.duration)}ms (reported, not gated) ... `)
  } finally {
    rmSync(resultsPath, { force: true })
  }
})

const AUTHORED = /\.(md|ts|tsx|html|css|yml|yaml|json|mjs|sh|svg)$/
// Tracked plus untracked-but-not-ignored, so new files are covered before
// their first commit.
const trackedAuthoredFiles = () =>
  sh('git ls-files --cached --others --exclude-standard')
    .split('\n')
    .filter(Boolean)
    .filter((f) => AUTHORED.test(f) || f.startsWith('scripts/hooks/') || f === 'LICENSE')
    .filter((f) => f !== 'package-lock.json')

run('no em dashes in docs, code, or copy (spec 13.6)', () => {
  const hits = []
  for (const f of trackedAuthoredFiles()) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('\u{2014}')) hits.push(`${f}:${i + 1}`)
      })
  }
  if (hits.length) throw new Error(`em dash found:\n${hits.join('\n')}`)
})

run('.opsec-terms is not tracked (spec 11.5)', () => {
  if (sh('git ls-files').split('\n').includes('.opsec-terms')) {
    throw new Error('.opsec-terms is committed; that is the leak')
  }
})

run('pre-push OPSEC hook is active (local only)', () => {
  if (process.env.CI) return 'skip'
  let hooksPath = ''
  try {
    hooksPath = sh('git config core.hooksPath').trim()
  } catch {
    hooksPath = ''
  }
  if (hooksPath !== 'scripts/hooks') {
    throw new Error(`core.hooksPath is "${hooksPath || 'unset'}", expected scripts/hooks`)
  }
})

// Link check (spec 11.4): every URL in the content data resolves. Runs
// after the sync layers so a broken build fails first. Skips gracefully
// offline: if every URL fails at the network layer (no HTTP status at
// all), the environment has no route out and the layer reports SKIP.
// Any real HTTP error status is a broken link and fails the battery.

const LINK_TIMEOUT_MS = 20000
const LINK_CONCURRENCY = 6

function contentUrls() {
  const files = sh('git ls-files --cached --others --exclude-standard')
    .split('\n')
    .filter((f) => f.startsWith('src/content/') && f.endsWith('.ts'))
  const urls = new Set()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/[^\s'"`<>)\]]+/g)) {
      urls.add(m[0])
    }
  }
  return [...urls].sort()
}

// Node's fetch does not honor proxy environment variables; curl does. In
// proxied environments (corporate egress, cloud sandboxes) fall back to
// curl so the layer still checks links instead of misreading the proxy as
// an outage.
const curlAvailable = spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0
const useCurl = Boolean(process.env.HTTPS_PROXY) && curlAvailable

async function checkUrl(url) {
  if (useCurl) {
    const res = spawnSync(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', '--max-time', String(LINK_TIMEOUT_MS / 1000), url],
      { encoding: 'utf8' },
    )
    const status = Number.parseInt(res.stdout, 10)
    if (res.status !== 0 || !Number.isFinite(status) || status === 0) return { url, network: true }
    return { url, status }
  }
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
      headers: { 'user-agent': 'dark-constellation-battery/1.0 (content link check)' },
    })
    return { url, status: res.status }
  } catch {
    return { url, network: true }
  }
}

// A live third-party host can return a transient 429 or 5xx (rate limiting,
// a brief outage). Those are not broken links, so retry once before calling
// it: genuine 404s and persistent failures still fail the battery. The
// classification and the transport-level second pass live in
// scripts/link-check.mjs so the suite can drive them without a network.
async function checkUrlWithRetry(url) {
  const first = await checkUrl(url)
  if (!isTransientStatus(first)) return first
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  return checkUrl(url)
}

// atlas.mitre.org serves its technique pages as a client-rendered SPA and
// returns HTTP 404 status to non-browser fetchers for every deep link
// (verified 2026-07-12: curl with any user agent gets 404 on /techniques/*
// and even /matrices, while browsers render the real page; the site's own
// navigation links to these exact paths). The deep URLs are canonical and
// were content-verified by rendered fetch in the R3 verification round, so
// for this host a 404 is the expected non-browser status: the check
// instead requires the ATLAS origin itself to be reachable, and any
// non-404 error status still fails.
function isKnownSpaStatusArtifact(url, status) {
  return url.startsWith('https://atlas.mitre.org/') && status === 404
}

async function linkCheck() {
  const urls = contentUrls()
  // The pipeline lives in scripts/link-check.mjs so the suite can drive it
  // with fake requests. This function is now the wiring and the wording,
  // which is all a battery layer should be.
  const outcome = await runLinkCheck({
    urls,
    check: checkUrl,
    concurrency: LINK_CONCURRENCY,
    isKnownSpaStatusArtifact,
    originPrefix: 'https://atlas.mitre.org/',
    originUrl: 'https://atlas.mitre.org/',
  })
  if (outcome.reason === 'no-urls') return 'FAIL: no URLs found in src/content; the deck should carry sources'
  if (outcome.reason === 'origin') {
    return `FAIL: atlas.mitre.org origin returned HTTP ${outcome.origin.status}; ATLAS links cannot be presumed alive`
  }
  if (outcome.outcome === 'skip') return 'SKIP (offline: no URL reachable at the network layer)'
  if (outcome.outcome === 'fail') {
    const lines = [
      ...outcome.broken.map((r) => `  HTTP ${r.status}  ${r.url}`),
      ...outcome.unreachable.map((r) => `  unreachable  ${r.url}`),
    ]
    const count = outcome.broken.length + outcome.unreachable.length
    return `FAIL: ${count} of ${outcome.results.length} content link(s) did not resolve:\n${lines.join('\n')}`
  }
  return `OK (${outcome.results.length} links)`
}

process.stdout.write('[battery] content link check (spec 11.4) ... ')
report('content link check (spec 11.4)', await linkCheck())

if (failures.length) {
  console.error(`[battery] RED: ${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('[battery] green')
