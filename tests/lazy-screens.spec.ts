// The screens that must not ride in the initial chunk (v1.2 R0, brief
// section 8). Since v2.0 R3 the game is the 3D game alone: the pixel
// board, its briefing, its Dossier and their guards here left with it,
// and the last block holds that nothing on the branch still points at one.
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
// shared helper pulled out of Credits, a barrel file re-exporting the
// lot. So the check walks the static import graph from the real entry
// point, src/main.tsx, following only static imports, and fails if it
// arrives at a screen the split says should be lazy. The App.tsx case is
// then simply the first step of that walk, which is the mutation recorded
// in the round report.
//
// It reads source rather than the built output on purpose: the bundle
// layer already measures what ships, and this has to fail in the suite a
// developer runs before a build exists.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
    // PINNED, not merely non-empty: deriving the required set from the
    // declarations is blind in one direction. A screen converted BACK to
    // a static import leaves the lazy set at the same moment it enters the
    // initial chunk, so the check below has nothing to object to. A count
    // is a second structure: dropping one costs an edit here and a
    // sentence about why.
    // Six since v2.0 R3: the credits, the terminal chrome that frames
    // them, the scoreboard, LIBRARY, the 3D game, and the dev-only sound
    // board (behind an import.meta.env.DEV ternary that folds to null in a
    // production build). Eight through R2: the pixel briefing
    // (./ui/IntroSequence) and the pixel Dossier (./ui/Dossier) went with
    // the pixel board, whose own module was fetched by ./ui/classic.
    expect(lazySpecs, 'the 3D game is no longer a lazy screen of the shell').toContain('./ui/three/Game3D')
    expect(lazySpecs.length, 'the split covers a different number of screens than it did; say why').toBe(6)
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

  it('keeps the screen a session always needs in the initial chunk', () => {
    // The title is the first thing anyone sees, so it is static on purpose.
    const graph = staticGraphFrom(ENTRY)
    expect(graph.has(resolveLocal(APP, './ui/Title')!), 'the title is no longer in the first download').toBe(true)
  })
})

describe('three.js and the theater stay out of the first download (v2.0 R1; the title in 3D since v2.0 R3)', () => {
  // The title's hero is the live theater, the game's own world. It and the
  // three.js under it are the largest things the game ships, so the title
  // asks for them after its first paint and nothing the entry reaches may
  // import them statically.
  const TITLE = join(SRC, 'ui', 'Title.tsx')
  const WORLD = join(SRC, 'ui', 'TitleWorld.tsx')
  const graph = staticGraphFrom(ENTRY)

  it('declares the title\'s world lazily, and it is where the title reaches the theater', () => {
    expect(lazySpecifiers(readFileSync(TITLE, 'utf8')), "the title's lazy set changed; say why").toEqual(['./TitleWorld'])
    expect(graph.has(WORLD), 'the title imports its world statically').toBe(false)
    expect(staticGraphFrom(WORLD).has(join(SRC, 'ui', 'three', 'world.ts')), "the title's world is no longer the game's own").toBe(true)
  })

  it('never reaches three.js, the theater or the game by static import from the entry point', () => {
    const offenders: string[] = []
    for (const [file, trail] of graph) {
      const rel = file.slice(SRC.length + 1)
      if (/^ui\/three\/(theater|world|signatures|Game3D|cards3d|rooms3d|opening3d|glyphs)\./.test(rel)) offenders.push(`src/${rel} via ${trail.map((f) => f.slice(SRC.length + 1)).join(' -> ')}`)
      let source = ''
      try {
        source = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      if (staticImports(source).some((spec) => spec === 'three' || spec.startsWith('three/'))) offenders.push(`src/${rel} imports three.js`)
    }
    expect(offenders.join('\n'), 'three.js or the theater is in the first download').toBe('')
    // Not vacuous: the walk is real, and the game does import three.js.
    expect(graph.size).toBeGreaterThan(20)
    expect(staticImports(readFileSync(join(SRC, 'ui', 'three', 'theater.ts'), 'utf8')).some((spec) => spec.startsWith('three'))).toBe(true)
  })
})

describe("the game's rooms load beside it, in a chunk of their own (v2.0 R3)", () => {
  // The debrief, the after-action replay, the Dossier and SYSTEM
  // (./rooms3d) are asked for as the game mounts and never imported
  // statically by it: a night is played without any of them, and their
  // styles are a stylesheet of their own, which is what gave the game's
  // stylesheet its room back under the 10,000 byte cap.
  const GAME = join(SRC, 'ui', 'three', 'Game3D.tsx')
  const ROOMS = join(SRC, 'ui', 'three', 'rooms3d.tsx')

  it('reaches the rooms by dynamic import only', () => {
    const source = readFileSync(GAME, 'utf8')
    expect(source, 'the game no longer asks for its rooms').toMatch(/import\(\s*'\.\/rooms3d'\s*\)/)
    const trail = staticGraphFrom(GAME).get(ROOMS)
    expect(trail?.map((f) => f.slice(SRC.length + 1)).join(' -> ') ?? '', 'the rooms are reachable statically from the game').toBe('')
  })

  it("keeps the rooms' stylesheet with the rooms, and the game's with the game", () => {
    const importsOf = (file: string) => staticImports(readFileSync(file, 'utf8')).filter((spec) => spec.endsWith('.css'))
    expect(importsOf(ROOMS)).toEqual(['./rooms3d.css'])
    expect(importsOf(GAME)).toEqual(['./game3d.css'])
    // A class the rooms' sheet styles is one the rooms draw: a rule for a
    // class only the game uses belongs in the game's sheet.
    const rooms = readFileSync(ROOMS, 'utf8')
    const stray = [...new Set([...readFileSync(join(SRC, 'ui', 'three', 'rooms3d.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(t3-[a-z0-9-]+)/g)].map((m) => m[1]))].filter((c) => !rooms.includes(c))
    expect(stray.filter((c) => !['t3-root', 't3-wide', 't3-btn', 't3-choice', 't3-choices', 't3-card', 't3-row', 't3-hint', 't3-primary', 't3-ok', 't3-warn', 't3-bad', 't3-blocked', 't3-halved', 't3-partial', 't3-hit', 't3-roomonly'].includes(c)), 'the rooms sheet styles a class the rooms never draw').toEqual([])
  })
})

describe("the Field Library's list and pairings stay out of the first download (v1.2 R5b)", () => {
  // The list is the largest single piece of content after the deck, and
  // most sessions never open LIBRARY. It is reached from the library
  // screen, which is itself lazy.
  const LIBRARY = join(SRC, 'ui', 'Library.tsx')
  const DATA = join(SRC, 'content', 'fieldLibraryData.ts')

  it('reaches them from the library screen and never from the entry point', () => {
    expect(lazySpecifiers(readFileSync(LIBRARY, 'utf8')).sort(), "LIBRARY's lazy set changed; say why").toEqual(['./FieldLibrary', './Glossary'])
    const graph = staticGraphFrom(ENTRY)
    for (const file of [DATA, join(SRC, 'ui', 'FieldLibrary.tsx'), join(SRC, 'ui', 'Glossary.tsx')]) {
      expect(graph.get(file)?.map((f) => f.slice(SRC.length + 1)).join(' -> ') ?? '', `${file.slice(SRC.length + 1)} is in the first download`).toBe('')
    }
    expect(staticGraphFrom(join(SRC, 'ui', 'FieldLibrary.tsx')).has(DATA), 'the Field Library no longer carries its own list').toBe(true)
  })
})

describe('the pixel board is retired on this branch (v2.0 R3, Ken\'s ruling of 15 November 2026)', () => {
  // The 3D game is the only game here. The pixel game is kept as it was on
  // main, v1.7/r1 and exp/3d-slice; on this branch nothing may route to
  // it, link to it, or carry its switch.
  const ROOT = join(SRC, '..')
  const walkFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(join(dir, e.name)) : [join(dir, e.name)]))
  const shipped = [...walkFiles(SRC).filter((f) => /\.(ts|tsx|css|html)$/.test(f)), join(ROOT, 'index.html')]

  it('has no address, link or switch to a pixel mode anywhere it ships', () => {
    const hits: string[] = []
    for (const file of shipped) {
      const source = readFileSync(file, 'utf8')
      source.split('\n').forEach((line, i) => {
        if (/view=classic|classicView|loadClassic|classicGame/.test(line)) hits.push(`${file.slice(ROOT.length + 1)}:${i + 1}`)
      })
    }
    expect(hits.join('\n'), 'something still points at the pixel board').toBe('')
  })

  it('has none of the pixel board\'s screens left to route to, and no rule switch in the engine', () => {
    for (const gone of ['ui/Game.tsx', 'ui/classic.ts', 'ui/IntroSequence.tsx', 'ui/Dossier.tsx', 'ui/Debrief.tsx', 'ui/board/Playfield.tsx', 'ui/board/Procure.tsx', 'ui/night/Night.tsx']) {
      expect(existsSync(join(SRC, gone)), `src/${gone} is back`).toBe(false)
    }
    const types = readFileSync(join(SRC, 'engine', 'types.ts'), 'utf8')
    expect(types, 'GameState carries a rule switch again').not.toMatch(/\bwatch\??:\s*Watch\b/)
    expect(readFileSync(join(SRC, 'engine', 'reducer.ts'), 'utf8')).not.toMatch(/state\.watch\b/)
    // The README sends no one to a pixel mode on this branch.
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8')).not.toMatch(/view=classic/)
  })

  it('opens every way into a game on the 3D game', () => {
    const app = readFileSync(APP, 'utf8')
    expect(app).toMatch(/type Screen = 'title' \| 'game3d' \|/)
    expect(app, 'the shell names a screen for a board').not.toMatch(/'game'\s*[|)]/)
  })
})
