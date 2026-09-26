// The screens that must not ride in the initial chunk (v1.2 R0, brief
// section 8).
//
// THE LIST IS NOT WRITTEN DOWN HERE. It is read out of App.tsx's own
// `lazy(() => import(...))` declarations, so a screen added to the split
// later is covered the moment it is declared, and one removed from the
// split stops being required. Restating the list would be the drift
// principle 17 names: two structures, one of them stale.
//
// WHAT IS ASSERTED, and why it is not "App.tsx has no static import". A
// static import in App.tsx is only the most obvious way to undo the split.
// The module lands in the initial chunk if ANYTHING the initial chunk
// reaches imports it statically: MainMenu naming Glossary for a link, a
// shared helper pulled out of FieldManual, a barrel file re-exporting the
// lot. So the check walks the static import graph from the real entry
// point, src/main.tsx, following only static imports, and fails if it
// arrives at a screen the split says should be lazy. The App.tsx case is
// then simply the first step of that walk, which is the mutation recorded
// in the round report.
//
// It reads source rather than the built output on purpose: the bundle
// layer already measures what ships, and this has to fail in the suite a
// developer runs before a build exists.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const APP = join(SRC, 'App.tsx')
const ENTRY = join(SRC, 'main.tsx')

// Every specifier App.tsx hands to React.lazy. The pattern is deliberately
// narrow: `lazy(() => import('./x'))` is the only shape the file uses, and
// a different shape should fail loudly here rather than pass quietly.
function lazySpecifiers(source: string): string[] {
  return [...source.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
}

// Static imports only: `import x from 'y'` and `import 'y'`, never
// `import('y')`, which is the whole point of the split. Type-only imports
// are dropped by the compiler and cost the bundle nothing, so they do not
// count as reaching a module.
//
// RE-EXPORTS TOO: `export { x } from 'y'`, `export * from 'y'` and
// `export * as ns from 'y'` pull 'y' into whatever imports the file, which
// is how a barrel carries a screen into the initial chunk. The header
// always claimed this case and the walk never followed it: a barrel line
// re-exporting Scoreboard, imported by MainMenu, stayed green. `export
// type ... from` is skipped for the same reason `import type` is. The
// pattern names the three re-export shapes rather than matching any
// `export ... from`, because `export` also opens every declaration in the
// tree and a loose match would run on into the next statement.
function staticImports(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/(^|\n)\s*import\s+([^'"]*?)from\s*['"]([^'"]+)['"]/g)) {
    if (/^\s*type\s/.test(m[2])) continue
    out.push(m[3])
  }
  for (const m of source.matchAll(/(^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[2])
  for (const m of source.matchAll(/(^|\n)\s*export\s+(type\s+)?(\*(\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[2]) continue
    out.push(m[5])
  }
  return out
}

// Resolve a relative specifier the way the bundler would, enough for this
// tree: extensionless files, .ts/.tsx, and directory index files.
function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate
      } catch {
        // A directory matched the bare path; keep looking at the others.
      }
    }
  }
  return null
}

// Everything the initial chunk reaches by static import, starting at the
// real entry point rather than at App.tsx.
function staticGraphFrom(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return
    seen.set(file, trail)
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      return
    }
    for (const spec of staticImports(source)) {
      const next = resolveLocal(file, spec)
      if (next) walk(next, [...trail, file])
    }
  }
  walk(entry, [])
  return seen
}

describe('the split screens stay out of the initial chunk (v1.2 R0)', () => {
  const appSource = readFileSync(APP, 'utf8')
  const lazySpecs = lazySpecifiers(appSource)

  it('finds the lazy declarations it derives everything else from', () => {
    // Without this the whole file passes vacuously the moment the regex
    // stops matching, which is exactly the shape of guard that reports a
    // split nobody has any more.
    // PINNED, not merely non-empty, and here is the mutation that earned
    // it. Deriving the required set from the declarations is right, and it
    // is blind in one direction: a screen converted BACK to a static
    // import leaves the lazy set at the same moment it enters the initial
    // chunk, so the check below has nothing to object to and passes. The
    // first attempt at proving this guard did exactly that and slept.
    // A count is a second structure: dropping one costs an edit here and a
    // sentence about why. Six was five plus the dev-only SoundBoard, which
    // is lazy too, behind an import.meta.env.DEV ternary that folds to
    // null in a production build. Seven since the Round 1 fix batch: the
    // Glossary joined the split once its overlay inside Game stopped
    // importing it statically, which is the trail this guard reported in
    // R0 when the declaration was tried too early.
    expect(lazySpecs.length, 'the split covers a different number of screens than it did; say why').toBe(7)
    for (const spec of lazySpecs) {
      expect(resolveLocal(APP, spec), `lazy import ${spec} resolves to no file`).toBeTruthy()
    }
  })

  it('never reaches a lazy screen by static import from the entry point', () => {
    const graph = staticGraphFrom(ENTRY)
    const offenders: string[] = []
    for (const spec of lazySpecs) {
      const target = resolveLocal(APP, spec)!
      const trail = graph.get(target)
      if (trail) {
        const via = [...trail.slice(1), target].map((f) => f.slice(SRC.length + 1)).join(' -> ')
        offenders.push(`${spec} is reachable statically: src/${via}`)
      }
    }
    expect(offenders.join('\n'), 'a screen the split makes lazy is in the initial chunk anyway').toBe('')
  })

  it('keeps the screens a session always needs in the initial chunk', () => {
    // The other direction. A split that lazily loaded the board would pass
    // the check above and be worse for every player, so the two screens
    // every session reaches are required to be static.
    const graph = staticGraphFrom(ENTRY)
    for (const required of ['./ui/Game', './ui/MainMenu']) {
      const target = resolveLocal(APP, required)!
      expect(graph.has(target), `${required} is no longer in the initial chunk`).toBe(true)
      expect(lazySpecs, `${required} was moved into the lazy set`).not.toContain(required)
    }
  })
})
