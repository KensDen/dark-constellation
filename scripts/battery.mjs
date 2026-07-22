#!/usr/bin/env node
// Validation battery (spec Section 11). Run: node scripts/battery.mjs
//
// Layers: typecheck + build (11.1), determinism (11.2) and content
// integrity (11.3) via vitest, the content link check (11.4, skips
// gracefully offline), and repo hygiene checks.
// The OPSEC content scan (11.5) is local-only and lives in scripts/hooks/pre-push;
// public CI never sees the deny-list.

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const failures = []

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

run('determinism + content integrity tests (spec 11.2, 11.3)', () => {
  sh('npx vitest run')
})

const AUTHORED = /\.(md|ts|tsx|html|css|yml|yaml|json|mjs|sh|svg)$/
// Tracked plus untracked-but-not-ignored, so new files are covered before
// their first commit.
const trackedAuthoredFiles = () =>
  sh('git ls-files --cached --others --exclude-standard')
    .split('\n')
    .filter(Boolean)
    .filter((f) => AUTHORED.test(f) || f.startsWith('scripts/hooks/'))
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
  if (urls.length === 0) return `FAIL: no URLs found in src/content; the deck should carry sources`
  if (urls.some((u) => u.startsWith('https://atlas.mitre.org/'))) {
    const origin = await checkUrl('https://atlas.mitre.org/')
    if (!origin.network && (origin.status < 200 || origin.status >= 400)) {
      return `FAIL: atlas.mitre.org origin returned HTTP ${origin.status}; ATLAS links cannot be presumed alive`
    }
  }
  const results = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: LINK_CONCURRENCY }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor]
        cursor += 1
        results.push(await checkUrl(url))
      }
    }),
  )
  const broken = results.filter(
    (r) => !r.network && (r.status < 200 || r.status >= 400) && !isKnownSpaStatusArtifact(r.url, r.status),
  )
  const unreachable = results.filter((r) => r.network)
  if (unreachable.length === results.length) return 'SKIP (offline: no URL reachable at the network layer)'
  if (broken.length || unreachable.length) {
    const lines = [
      ...broken.map((r) => `  HTTP ${r.status}  ${r.url}`),
      ...unreachable.map((r) => `  unreachable  ${r.url}`),
    ]
    return `FAIL: ${broken.length + unreachable.length} of ${results.length} content link(s) did not resolve:\n${lines.join('\n')}`
  }
  return `OK (${results.length} links)`
}

process.stdout.write('[battery] content link check (spec 11.4) ... ')
report('content link check (spec 11.4)', await linkCheck())

if (failures.length) {
  console.error(`[battery] RED: ${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('[battery] green')
