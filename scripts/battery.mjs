#!/usr/bin/env node
// Validation battery (spec Section 11). Run: node scripts/battery.mjs
//
// R0 scope: typecheck + build (11.1) plus repo hygiene checks.
// Determinism (11.2) and content integrity (11.3) arrive with the engine in R1.
// The link check (11.4) arrives in R3.
// The OPSEC content scan (11.5) is local-only and lives in scripts/hooks/pre-push;
// public CI never sees the deny-list.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const failures = []

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

const AUTHORED = /\.(md|ts|tsx|html|css|yml|yaml|json|mjs|sh)$/
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

if (failures.length) {
  console.error(`[battery] RED: ${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('[battery] green')
