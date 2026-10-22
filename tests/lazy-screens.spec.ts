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
    // R0 when the declaration was tried too early. Eight since v1.2 R5b:
    // the FIELD LIBRARY, a reading room most sessions never enter, in the
    // menu's INTEL ARCHIVE (brief 7.3: lazy-loaded, its own chunk). Six
    // since v1.3 Round 0: the FIELD MANUAL and HOW TO PLAY screens were
    // deleted with their menu entries (v1.3 brief 5.1, critique rows M5
    // and M20: the briefing teaches the rules), so their two declarations
    // went with the files rather than turning static. Seven since the
    // v1.3 R1 fixes: the TERMINAL CHROME, which frames only the reference
    // screens and so travels with them, moved out to keep INITIAL under
    // 155,000 when the title's fixes landed. Still seven since v1.3 R4,
    // with two changed: the Field Library and the Glossary left App for
    // LIBRARY (./ui/Library, which loads each as a tab), and the COLDVEIL
    // Dossier (./ui/Dossier, brief 5.7) took the Glossary's old place
    // behind the title's DOSSIER.
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
    // Since v1.3 R1 the title replaced the menu as the other one.
    for (const required of ['./ui/Game', './ui/Title']) {
      const target = resolveLocal(APP, required)!
      expect(graph.has(target), `${required} is no longer in the initial chunk`).toBe(true)
      expect(lazySpecs, `${required} was moved into the lazy set`).not.toContain(required)
    }
  })
})

describe("Game's own overlays stay out of the initial chunk (v1.2 R3)", () => {
  // Game declares lazy modules of its own, for the overlays it opens in
  // place: the Glossary and, since R3, the intel card (the three.js frame
  // moved to the title with the start screen's retirement in v1.3 R1)
  // (brief section 8: loaded on first open, so the first download grows as
  // little as it can). App's declarations above do not include them, so
  // they are read here from Game.tsx, pinned by count for the same reason,
  // and walked the same way.
  const GAME = join(SRC, 'ui', 'Game.tsx')
  const gameSpecs = lazySpecifiers(readFileSync(GAME, 'utf8'))

  it('finds them, and none is reachable by static import from the entry point', () => {
    // Four since v1.2 R5: the score screen joined them. It replaces the
    // end-of-run report, which every finished campaign reaches and no turn
    // of play needs, so it arrives in its own chunk when a campaign ends
    // (brief 7.2); the save code and the ways out stay static in Game.
    // Five since v1.2 R5b: the Field Library, which an event card's "learn
    // more" opens over the board at that threat's entries. The same module
    // as App's FIELD LIBRARY screen, so the same chunk.
    // Six since v1.2 R6: the wide board's columns, the ops log and the
    // inspector, which only a screen 1024 wide and up fetches (brief 4.6
    // and 8: "Round 6 loads its desktop layout only on wide screens").
    // Five since v1.3 R1: the three.js constellation frame left Game with
    // the start screen and is the title's now (Ken, 21 October 2026).
    // Still five since v1.3 R4: the debrief (./Debrief, brief 5.6) replaced
    // the score screen in the same place.
    expect(gameSpecs.length, "Game's lazy set changed size; say why").toBe(5)
    const graph = staticGraphFrom(ENTRY)
    const offenders: string[] = []
    for (const spec of gameSpecs) {
      const target = resolveLocal(GAME, spec)
      expect(target, `lazy import ${spec} resolves to no file`).toBeTruthy()
      const trail = graph.get(target!)
      if (trail) offenders.push(`${spec} is reachable statically: ${[...trail.slice(1), target!].map((f) => f.slice(SRC.length + 1)).join(' -> ')}`)
    }
    expect(offenders.join('\n'), 'an overlay Game loads on demand is in the initial chunk anyway').toBe('')
    expect(gameSpecs).toContain('./board/IntelCard')
    expect(gameSpecs).toContain('./Debrief')
    expect(gameSpecs).toContain('./FieldLibrary')
    expect(gameSpecs).toContain('./board/WideBoard')
  })
})

describe("the title's constellation frame stays out of the first download (v1.3 R1)", () => {
  // The three.js frame the retired start screen showed moved to the title,
  // under the READ row (Ken, 21 October 2026). It is lazy there, as it was
  // in Game: decoration nobody waits on.
  // Since the v1.3 R1 fixes the frame sits one step further out: the
  // title loads its decoration (the ripple band, the key art and the frame
  // loader) as ./TitleArt, which loads the frame. Neither is in the first
  // download.
  const TITLE = join(SRC, 'ui', 'Title.tsx')
  const ART = join(SRC, 'ui', 'TitleArt.tsx')
  const titleSpecs = lazySpecifiers(readFileSync(TITLE, 'utf8'))
  const artSpecs = lazySpecifiers(readFileSync(ART, 'utf8'))

  it('declares the frame lazily, and nothing reaches it statically from the entry point', () => {
    expect(titleSpecs, "the title's lazy set changed; say why").toEqual(['./TitleArt'])
    expect(artSpecs, "the title art's lazy set changed; say why").toEqual(['./Constellation'])
    const art = resolveLocal(TITLE, './TitleArt')!
    const frame = resolveLocal(ART, './Constellation')!
    expect(art, 'the title art resolves to no file').toBeTruthy()
    expect(frame, 'the frame resolves to no file').toBeTruthy()
    const graph = staticGraphFrom(ENTRY)
    expect(graph.has(art), "the title's decoration is in the first download").toBe(false)
    expect(graph.has(frame), 'the three.js frame is in the first download').toBe(false)
  })
})

describe("the wide board's own modules stay out of the first download (v1.2 R6)", () => {
  const WIDE = join(SRC, 'ui', 'board', 'WideBoard.tsx')
  const own = ['ui/board/wide.ts', 'ui/board/wide.css'].map((f) => join(SRC, f))

  it('reaches them from the wide board and never from the entry point', () => {
    const fromWide = staticGraphFrom(WIDE)
    for (const f of own) expect(fromWide.has(f), `the wide board no longer reaches ${f.slice(SRC.length + 1)}`).toBe(true)
    const graph = staticGraphFrom(ENTRY)
    const offenders = [WIDE, ...own]
      .filter((f) => graph.has(f))
      .map((f) => `${f.slice(SRC.length + 1)} is reachable statically: ${[...graph.get(f)!.slice(1), f].map((x) => x.slice(SRC.length + 1)).join(' -> ')}`)
    expect(offenders.join('\n'), "the wide board is in the first download").toBe('')
  })
})

describe("the Field Library's list and pairings stay out of the first download (v1.2 R5b)", () => {
  // The event card's "learn more" shows for every threat without knowing
  // the pairings (validation guarantees every threat has one), and the
  // menu's FILED counter arrives by dynamic import. So the list, its
  // schema and the FILED logic ride with the library: reachable from the
  // library screen, never from the entry. The walk follows static imports
  // only, which is what puts a module in the first download.
  const LIBRARY = join(SRC, 'ui', 'FieldLibrary.tsx')
  const own = ['content/fieldLibrary.ts', 'content/fieldLibraryData.ts', 'content/librarySchema.ts', 'ui/libraryProgress.ts', 'ui/library.css'].map((f) =>
    join(SRC, f),
  )

  it('reaches them from the library screen and never from the entry point', () => {
    const fromLibrary = staticGraphFrom(LIBRARY)
    for (const f of own) expect(fromLibrary.has(f), `the library no longer reaches ${f.slice(SRC.length + 1)}`).toBe(true)
    const graph = staticGraphFrom(ENTRY)
    const offenders = own
      .filter((f) => graph.has(f))
      .map((f) => `${f.slice(SRC.length + 1)} is reachable statically: ${[...graph.get(f)!.slice(1), f].map((x) => x.slice(SRC.length + 1)).join(' -> ')}`)
    expect(offenders.join('\n'), "the library's list is in the first download").toBe('')
  })

  // The menu's FILED counter left with the menu in v1.3 R1 (M1); the
  // title's GOAL 2 counts the Dossier (src/persistence/dossier.ts) and
  // reads nothing of the library.
})

describe('the debrief, the Dossier and LIBRARY carry their own weight (v1.3 R4)', () => {
  // The debrief is lazy in Game (above), and replaced the v1.2 score screen
  // and its threats-faced study guide there. It declares one lazy module
  // of its own, the Dossier it opens over itself; the Dossier declares the
  // Field Library its LEARN MORE opens; LIBRARY declares its two tabs.
  // None of those blocks above reads these, so they are read here, pinned,
  // and walked the same way: a static import of any would still be out of
  // the first download, only inside another screen's chunk.
  const DEBRIEF = join(SRC, 'ui', 'Debrief.tsx')
  const DOSSIER = join(SRC, 'ui', 'Dossier.tsx')
  const LIBRARY = join(SRC, 'ui', 'Library.tsx')

  it('finds their lazy modules, and nothing reaches them statically', () => {
    expect(lazySpecifiers(readFileSync(DEBRIEF, 'utf8')), "the debrief's lazy set changed; say why").toEqual(['./Dossier'])
    expect(lazySpecifiers(readFileSync(DOSSIER, 'utf8')), "the Dossier's lazy set changed; say why").toEqual(['./FieldLibrary'])
    expect(lazySpecifiers(readFileSync(LIBRARY, 'utf8')), "LIBRARY's lazy set changed; say why").toEqual(['./FieldLibrary', './Glossary'])
    const pairs = [
      [DEBRIEF, DOSSIER],
      [DOSSIER, join(SRC, 'ui', 'FieldLibrary.tsx')],
      [LIBRARY, join(SRC, 'ui', 'FieldLibrary.tsx')],
      [LIBRARY, join(SRC, 'ui', 'Glossary.tsx')],
    ] as const
    for (const [from, target] of pairs) {
      for (const [name, graph] of [
        ['main.tsx', staticGraphFrom(ENTRY)],
        [from.slice(SRC.length + 1), staticGraphFrom(from)],
      ] as const) {
        const trail = graph.get(target)
        expect(trail && [...trail, target].map((f) => f.slice(SRC.length + 1)).join(' -> '), `${target.slice(SRC.length + 1)} is static from ${name}`).toBeUndefined()
      }
    }
  })

  it('keeps what only the debrief needs out of the first download', () => {
    // What the debrief reads to grade a run, read it back and share it:
    // the grade and the strip, its model, the share text, its timing and
    // its stylesheet. The positive control first: the debrief's own walk
    // reaches every one, so a pass below is not a walk that found nothing.
    const own = ['engine/grade.ts', 'ui/debriefModel.ts', 'ui/reportCard.ts', 'ui/debriefMotion.ts', 'ui/debrief.css'].map((f) => join(SRC, f))
    const fromDebrief = staticGraphFrom(DEBRIEF)
    for (const f of own) expect(fromDebrief.has(f), `the debrief no longer reaches ${f.slice(SRC.length + 1)}`).toBe(true)
    const graph = staticGraphFrom(ENTRY)
    const offenders = own
      .filter((f) => graph.has(f))
      .map((f) => `${f.slice(SRC.length + 1)} is reachable statically: ${[...graph.get(f)!.slice(1), f].map((x) => x.slice(SRC.length + 1)).join(' -> ')}`)
    expect(offenders.join('\n'), "the debrief's own modules are in the initial chunk").toBe('')
  })
})

describe("the cold open's own art stays in its chunk (v1.2 R4)", () => {
  // The cold open reuses the board's backdrops and sprites, which the
  // first download already carries, and adds only what the board never
  // needed: the watch officer, the disaster zone, the four scenes and its
  // stylesheet (brief 6 and section 8). Those arrive with the cold open or
  // not at all. They are found by walking IntroSequence rather than listed
  // here: every module it reaches whose name says it is the cold open's.
  const INTRO = join(SRC, 'ui', 'IntroSequence.tsx')
  // Since v1.3 R1 the briefing's scenes are canvas drawings in
  // briefingScenes.ts, so the walk keeps them by that name too.
  const own = [...staticGraphFrom(INTRO).keys()].filter((f) => /cold ?open|briefing/i.test(f.slice(SRC.length)))

  it('finds them through the cold open, the officer among them', () => {
    // The positive control: the walk reaches the sprite data, so a pass
    // below is not a walk that found nothing.
    expect(own.map((f) => f.slice(SRC.length + 1))).toContain(join('ui', 'sprites', 'coldOpen.ts'))
    expect(own.map((f) => f.slice(SRC.length + 1))).toContain(join('ui', 'briefingScenes.ts'))
    // Three since v1.3 R1: the slide data, the officer's sprites and the
    // canvas scenes (the SVG scene component and its stylesheet were
    // deleted with the canvas port).
    expect(own.length, 'the briefing reaches fewer of its own modules than it has').toBeGreaterThanOrEqual(3)
  })

  it('never reaches one of them by static import from the entry point', () => {
    const graph = staticGraphFrom(ENTRY)
    const offenders = own
      .filter((f) => graph.has(f))
      .map((f) => `${f.slice(SRC.length + 1)} is reachable statically: ${[...graph.get(f)!.slice(1), f].map((x) => x.slice(SRC.length + 1)).join(' -> ')}`)
    expect(offenders.join('\n'), "the cold open's art is in the initial chunk").toBe('')
  })

  it("never pulls the cold open's stylesheet into the initial one through a CSS @import", () => {
    // The walk above reads JS imports. A stylesheet the entry loads can
    // bring another in by @import, and that one then ships in the initial
    // CSS whatever the JS graph says.
    const sheets = [...staticGraphFrom(ENTRY).keys()].filter((f) => f.endsWith('.css'))
    expect(sheets.length, 'the entry loads no stylesheet, so this walks nothing').toBeGreaterThan(0)
    const seen = new Set<string>()
    const offenders: string[] = []
    const walk = (sheet: string) => {
      if (seen.has(sheet)) return
      seen.add(sheet)
      for (const [, spec] of readFileSync(sheet, 'utf8').matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) {
        const target = resolveLocal(sheet, spec)
        if (!target) continue
        if (own.includes(target)) offenders.push(`${sheet.slice(SRC.length + 1)} @imports ${target.slice(SRC.length + 1)}`)
        walk(target)
      }
    }
    sheets.forEach(walk)
    expect(offenders.join('\n'), "the cold open's stylesheet is in the initial CSS").toBe('')
  })
})
