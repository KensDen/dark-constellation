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
import { runLinkCheckProcess } from './link-check.mjs'

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
// gzipped, under its thresholds. The INITIAL download is the entry script,
// the stylesheet and every chunk they load statically (since v1.2 Round
// 4b, which counted the preloaded config chunk); DEFERRED is every chunk
// Rollup splits out and only a dynamic import reaches, gated one
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

// THE COPY-STYLE GATE, widened in the QC gauntlet (Q28, 21 October 2026).
// It looked for U+2014 only, and only in some file types, so an en dash
// anywhere, or any dash in a .txt or .js file or in the built bundle, would
// have passed. It now covers every dash-like code point and the HTML
// entities for the two dashes, in every tracked text file (binary files,
// those holding a NUL byte, are skipped) and in dist/ after the build,
// where JavaScript escapes of the two dashes count too.
const DASHES = [
  ['em dash', /\u{2014}/u],
  ['en dash', /\u{2013}/u],
  ['figure dash', /\u{2012}/u],
  ['horizontal bar', /\u{2015}/u],
  ['minus sign', /\u{2212}/u],
  ['dash entity', /&(mdash|ndash|#8212|#8211|#x2014|#x2013);/i],
]
const BUILT_ESCAPES = [['escaped dash', /\\u(2014|2013|\{2014\}|\{2013\})/i]]
// Tracked plus untracked-but-not-ignored, so new files are covered before
// their first commit. .opsec-terms is ignored, so it is never read here.
const trackedTextFiles = () =>
  sh('git ls-files --cached --others --exclude-standard')
    .split('\n')
    .filter(Boolean)
    .filter((f) => f !== '.opsec-terms')

function dashHits(file, text, patterns) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of patterns) if (re.test(line)) hits.push(`${file}:${i + 1} (${name})`)
  })
  return hits
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

run('no em or en dashes in the tree or the build (spec 13.6)', () => {
  const hits = []
  for (const f of trackedTextFiles()) {
    let buf
    try {
      buf = readFileSync(f)
    } catch {
      continue
    }
    if (buf.includes(0)) continue
    hits.push(...dashHits(f, buf.toString('utf8'), DASHES))
  }
  for (const f of walk('dist')) {
    const buf = readFileSync(f)
    if (buf.includes(0)) continue
    hits.push(...dashHits(f, buf.toString('utf8'), [...DASHES, ...BUILT_ESCAPES]))
  }
  if (hits.length) throw new Error(`dash found:\n${hits.join('\n')}`)
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
//
// Since v1.3 Round 0b the layer runs in a process of its own,
// scripts/content-links.mjs, so the extra certificate sparta.aerospace.org
// leaves out (scripts/link-check.mjs, EXTRA_CA) reaches the link check and
// nothing else. runLinkCheckProcess (scripts/link-check.mjs) refuses a file
// that is not the pinned one and strips any switch that would turn
// verification off.

process.stdout.write('[battery] content link check (spec 11.4) ... ')
report('content link check (spec 11.4)', runLinkCheckProcess(process.cwd(), process.env, spawnSync))

if (failures.length) {
  console.error(`[battery] RED: ${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('[battery] green')
