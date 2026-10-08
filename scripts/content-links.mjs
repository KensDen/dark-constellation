#!/usr/bin/env node
// The content link check (spec 11.4), as its own process. Run by
// scripts/battery.mjs since v1.3 Round 0b, which hands this process, and
// no other, the extra certificate in scripts/link-check.mjs (EXTRA_CA)
// through NODE_EXTRA_CA_CERTS: Node reads that variable only at startup,
// so the battery's own process could not take it for one layer. Prints the
// layer's one-line outcome (OK, SKIP or FAIL first, as the battery's
// report() reads it), then the certificate line.

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  BOT_PROTECTED,
  EXTRA_CA,
  extraCaLine,
  isBotProtected,
  isExcused,
  isRunnerBlocked,
  loadedExtraCa,
  runLinkCheck,
  runnerBlockedWarning,
} from './link-check.mjs'

const sh = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' })

// Every URL in the content data resolves. Skips gracefully offline: if
// every URL fails at the network layer (no HTTP status at all), the
// environment has no route out and the layer reports SKIP. Any real HTTP
// error status is a broken link and fails the battery.

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

// What the layer excuses (the ATLAS SPA's 404s, and the pages listed as
// bot-protected) lives in scripts/link-check.mjs as isExcused, so the suite
// tests the same predicate this passes. What it only WARNS about (a page
// listed as blocking CI runners answering 403, timing out or refusing the
// connection) is isRunnerBlocked, passed the same way.

async function linkCheck() {
  const urls = contentUrls()
  // The pipeline lives in scripts/link-check.mjs so the suite can drive it
  // with fake requests. This function is now the wiring and the wording,
  // which is all a battery layer should be.
  const outcome = await runLinkCheck({
    urls,
    check: checkUrl,
    concurrency: LINK_CONCURRENCY,
    isKnownSpaStatusArtifact: isExcused,
    isWarnOnly: isRunnerBlocked,
    originPrefix: 'https://atlas.mitre.org/',
    originUrl: 'https://atlas.mitre.org/',
  })
  // Printed on a pass AND on a failure, so a warning is never hidden
  // behind a red line about something else.
  const warnings = (outcome.warned ?? []).map((r) => `\n  ${runnerBlockedWarning(r)}`).join('')
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
    return `FAIL: ${count} of ${outcome.results.length} content link(s) did not resolve:\n${lines.join('\n')}${warnings}`
  }
  // Name every page excused as bot-protected, and who checked it, so a
  // pass never hides one.
  const excused = outcome.results.filter((r) => !r.network && isBotProtected(r.url, r.status))
  const lines = excused.map((r) => {
    const entry = BOT_PROTECTED.find((e) => e.url === r.url)
    return `\n  allow-listed as bot-protected, HTTP ${r.status}: ${r.url}\n    checked ${entry.checked}, ${entry.how}`
  })
  return `OK (${outcome.results.length} links)${lines.join('')}${warnings}`
}

// Verification is never off here: the battery strips the switch from this
// process's environment, and this refuses to run if it is set anyway.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  console.log('FAIL: NODE_TLS_REJECT_UNAUTHORIZED is 0 in the link check, so a link could resolve without a verified certificate')
} else if (!useCurl && !loadedExtraCa()) {
  console.log(`FAIL: Node did not load the extra certificate (${EXTRA_CA.file}) from NODE_EXTRA_CA_CERTS, so the SPARTA links cannot verify`)
} else {
  const outcome = await linkCheck()
  // curl keeps its own trust store and never sees NODE_EXTRA_CA_CERTS.
  const transport = useCurl ? ' (Node fetch only; this run used curl through the proxy)' : ''
  console.log(`${outcome}\n  ${extraCaLine()}${transport}`)
}
