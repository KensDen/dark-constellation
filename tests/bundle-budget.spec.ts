// The bundle budget's arithmetic and the shape of its record.
//
// ROUND 6 EXTENDED IT TO THE CSS CHUNK. The budget counted only the main
// JS chunk from Round 2 onward, so every visual round shipped into an
// unmetered channel and the headroom everyone reasoned from was 11,485
// when the honest figure was 4,828. These tests hold the new shape: a
// visitor downloads both files, so both count, and growing EITHER one has
// to move the reported number.
//
// Round 2 flagged the recorded headroom as a hand-maintained number with
// nothing computing or checking it. Round 4c is the first time it actually
// went wrong: the battery printed budget minus the recorded BASELINE, a
// fact about the previous round's build, and the report carried that stale
// figure in two places while the bundle had grown 58 bytes past it. The
// field is gone now and the number is derived from the chunk the battery
// measures, so these tests hold that shape rather than the old value.

import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { headroomFor, measureBundle } from '../scripts/bundle-budget.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const budget = JSON.parse(readFileSync(join(ROOT, 'tests', 'bundle-budget.json'), 'utf8'))

describe('bundle budget', () => {
  it('derives headroom from the chunk that was measured, not from the baseline', () => {
    expect(headroomFor(124237, 140000)).toBe(15763)
    // The distinction that matters: once a round grows the bundle past its
    // recorded baseline, the two answers differ, and the one a reader acts
    // on is the one about the build in front of them.
    const measured = budget.baselineGzipBytes + 58
    expect(headroomFor(measured, budget.budgetGzipBytes)).toBe(budget.budgetGzipBytes - measured)
    expect(headroomFor(measured, budget.budgetGzipBytes)).not.toBe(
      budget.budgetGzipBytes - budget.baselineGzipBytes,
    )
    // A bundle over budget reports negative room rather than clamping,
    // because the battery's own threshold check is what fails on it.
    expect(headroomFor(budget.budgetGzipBytes + 100, budget.budgetGzipBytes)).toBe(-100)
  })

  it('moves when EITHER shipped chunk grows, which is the whole of the correction', () => {
    // THE ROUND'S CENTRAL CLAIM. The budget names what a visitor
    // downloads, and a visitor downloads both files. Measured from the
    // built output rather than from the arithmetic, because the defect was
    // never in the arithmetic: it was that one of the two shipped assets
    // was not being read at all.
    const dir = mkdtempSync(join(tmpdir(), 'dc-both-'))
    const js = 'x'.repeat(40_000) + Math.random()
    const css = 'y'.repeat(9_000) + Math.random()
    writeFileSync(join(dir, 'index-a.js'), js)
    writeFileSync(join(dir, 'index-a.css'), css)
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const base = measureBundle({ budget: cap, dir, startedAt: 0 })

    // Grow the STYLESHEET. This is the byte that went uncounted for four
    // rounds, so it is the one that has to move the number.
    writeFileSync(join(dir, 'index-a.css'), css + 'z'.repeat(4_000))
    const fatCss = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(fatCss.gz, 'growing the stylesheet did not move the reported figure').toBeGreaterThan(base.gz)
    expect(fatCss.cssGz).toBeGreaterThan(base.cssGz)
    expect(fatCss.jsGz, 'growing the stylesheet moved the JS figure').toBe(base.jsGz)

    // And the POSITIVE CONTROL, which is what stops the check above being
    // satisfied by a number that moves for any reason: growing the SCRIPT
    // moves it too, and moves the other half of the pair.
    writeFileSync(join(dir, 'index-a.css'), css)
    writeFileSync(join(dir, 'index-a.js'), js + 'z'.repeat(4_000))
    const fatJs = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(fatJs.gz, 'growing the script did not move the reported figure').toBeGreaterThan(base.gz)
    expect(fatJs.jsGz).toBeGreaterThan(base.jsGz)
    expect(fatJs.cssGz, 'growing the script moved the CSS figure').toBe(base.cssGz)

    // The total is the sum of what ships, not one of its parts.
    expect(base.gz).toBe(base.jsGz + base.cssGz)
    expect(base.cssGz, 'the stylesheet measured as nothing, so the sum proves nothing').toBeGreaterThan(0)

    rmSync(dir, { recursive: true, force: true })
  })

  it('counts the stylesheet against the threshold, not just in the report', () => {
    // Reporting the combined figure while gating on the JS alone would be
    // the same defect wearing the correction's clothes.
    const dir = mkdtempSync(join(tmpdir(), 'dc-gate-'))
    writeFileSync(join(dir, 'index-b.js'), 'x'.repeat(200))
    writeFileSync(join(dir, 'index-b.css'), 'y'.repeat(200))
    const under = measureBundle({ budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }, dir, startedAt: 0 })
    // A threshold set between the JS alone and the combined total: it
    // passes on one reading and fails on the other, which is exactly the
    // discrimination this test needs to be standing on.
    const between = under.jsGz + Math.floor(under.cssGz / 2)
    expect(between, 'the two chunks are too close for this to discriminate').toBeGreaterThan(under.jsGz)
    expect(between).toBeLessThan(under.gz)
    expect(() =>
      measureBundle({ budget: { baselineGzipBytes: 1, budgetGzipBytes: between, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }, dir, startedAt: 0 }),
    ).toThrow(/over the/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a stale stylesheet against a fresh script', () => {
    // The staleness check walks BOTH chunks. Checking only the JS would
    // let last round's stylesheet be measured against this round's script,
    // which is a wrong number reported confidently, and that is the whole
    // class this layer exists to prevent. A mutation narrowing the loop to
    // the JS slept through the suite, because the only staleness test made
    // both files old at once.
    const dir = mkdtempSync(join(tmpdir(), 'dc-stale-'))
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    // Stamped BEFORE the writes, which is the order the battery uses: it
    // records the time it started and then builds. Stamping after them
    // makes the control flake on filesystem mtime granularity.
    const startedAt = Date.now() - 1_000
    writeFileSync(join(dir, 'index-c.js'), 'x'.repeat(1_000))
    writeFileSync(join(dir, 'index-c.css'), 'y'.repeat(1_000))
    // Both fresh: this passes, which is the control. Without it, the
    // throw below could be caused by anything.
    expect(() => measureBundle({ budget: cap, dir, startedAt })).not.toThrow()

    // Backdate ONLY the stylesheet.
    const old = new Date(startedAt - 60_000)
    utimesSync(join(dir, 'index-c.css'), old, old)
    expect(() => measureBundle({ budget: cap, dir, startedAt }), 'a stale stylesheet was measured as fresh').toThrow(
      /index-c\.css predates this battery run/,
    )

    // And the mirror, so the check is not simply throwing on every file:
    // fresh CSS against a stale script names the script.
    writeFileSync(join(dir, 'index-c.css'), 'y'.repeat(1_000))
    utimesSync(join(dir, 'index-c.js'), old, old)
    expect(() => measureBundle({ budget: cap, dir, startedAt })).toThrow(/index-c\.js predates this battery run/)

    // And a stale DEFERRED chunk, which is the same defect one file
    // further out: the split chunk is 129,274 bytes of the real build, so
    // measuring last round's copy of it against this round's entry is a
    // wrong number reported confidently. Narrowing the walk back to the
    // two named chunks slept through the suite until this was added.
    writeFileSync(join(dir, 'index-c.js'), 'x'.repeat(1_000))
    writeFileSync(join(dir, 'Split-Zz9.js'), 'z'.repeat(1_000))
    expect(() => measureBundle({ budget: cap, dir, startedAt }), 'a fresh build was refused').not.toThrow()
    utimesSync(join(dir, 'Split-Zz9.js'), old, old)
    expect(
      () => measureBundle({ budget: cap, dir, startedAt }),
      'a stale split chunk was measured as fresh',
    ).toThrow(/Split-Zz9\.js predates this battery run/)

    rmSync(dir, { recursive: true, force: true })
  })

  it('counts a split chunk it has never heard of', () => {
    // THE DEFECT THIS ROUND'S FIRST CORRECTION STILL HAD. Both patterns
    // were anchored to the entry chunk's name, so Rollup's lazily split
    // frame, which carries three.js, contributed nothing and did not even
    // make the chunk count wrong. It is 129,274 bytes gzipped, almost the
    // whole of the rest of the game, and no budget had ever seen it.
    //
    // The layer enumerates the directory and subtracts the two it knows,
    // so a chunk nobody anticipated is counted rather than ignored. This
    // test uses a name the layer has no pattern for, which is the point.
    const dir = mkdtempSync(join(tmpdir(), 'dc-split-'))
    const startedAt = Date.now() - 1_000
    writeFileSync(join(dir, 'index-d.js'), 'x'.repeat(20_000))
    writeFileSync(join(dir, 'index-d.css'), 'y'.repeat(2_000))
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const alone = measureBundle({ budget: cap, dir, startedAt })
    expect(alone.deferredGz, 'a build with no split chunk reported deferred bytes').toBe(0)
    expect(alone.deferred).toEqual([])

    // A chunk under a name nothing matches.
    writeFileSync(join(dir, 'Constellation-Xy1.js'), 'z'.repeat(30_000))
    const split = measureBundle({ budget: cap, dir, startedAt })
    expect(split.deferredGz, 'the split chunk was not counted').toBeGreaterThan(0)
    expect(split.deferred, 'the split chunk was not named').toEqual(['Constellation-Xy1.js'])
    // And it did NOT quietly land in the initial figure either, which
    // would be the opposite error: the initial download is what it was.
    expect(split.gz, 'the split chunk was folded into the initial figure').toBe(alone.gz)
    expect(split.line).toContain('deferred ' + split.deferredGz)

    rmSync(dir, { recursive: true, force: true })
  })

  it('gates the deferred chunks rather than only reporting them', () => {
    // Reporting a number while gating on nothing is how the stylesheet
    // went unmetered for four rounds; the same mistake one file out.
    const dir = mkdtempSync(join(tmpdir(), 'dc-gate2-'))
    const startedAt = Date.now() - 1_000
    writeFileSync(join(dir, 'index-e.js'), 'x'.repeat(2_000))
    writeFileSync(join(dir, 'index-e.css'), 'y'.repeat(200))
    writeFileSync(join(dir, 'Heavy-Ab2.js'), 'z'.repeat(40_000))
    const generous = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const under = measureBundle({ budget: generous, dir, startedAt })
    expect(under.deferredGz).toBeGreaterThan(0)
    // A deferred budget below what is there fails, while the initial
    // budget stays generous: so the throw is about the deferred chunk and
    // not about the entry.
    expect(() =>
      measureBundle({ budget: { ...generous, deferredBudgetGzipBytes: under.deferredGz - 1 }, dir, startedAt }),
    ).toThrow(/deferred chunks are/)
    // The control: one byte more and it passes, so the gate is on the
    // measured size rather than on the chunk existing at all.
    expect(() =>
      measureBundle({ budget: { ...generous, deferredBudgetGzipBytes: under.deferredGz }, dir, startedAt }),
    ).not.toThrow()
    // And a missing deferred budget is an error, not an open door.
    expect(() =>
      measureBundle({ budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000 }, dir, startedAt }),
    ).toThrow(/records no deferredBudgetGzipBytes/)
    rmSync(dir, { recursive: true, force: true })
  })

  // ROUND 6B, the third correction to this layer and the second one found
  // in its own predecessor. 6a enumerated the DIRECTORY but declared the
  // EXTENSIONS, so images, fonts and SVGs fell through a js-or-css filter,
  // and it read one directory rather than walking the tree, so the dist
  // root's own files were invisible as well. 813,681 raw bytes in twelve
  // files against 266,012 gzipped of code.
  it('counts a file whose extension it has never heard of', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-static-'))
    writeFileSync(join(dir, 'index-c.js'), 'x'.repeat(400))
    writeFileSync(join(dir, 'index-c.css'), 'y'.repeat(400))
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const before = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(before.staticBytes).toBe(0)

    // A format this layer was never told about. Two of them, because the
    // real build ships webp, jpg, woff2 and svg and the point is that the
    // list is not the mechanism.
    writeFileSync(join(dir, 'hero.webp'), Buffer.alloc(5_000, 7))
    writeFileSync(join(dir, 'display.woff2'), Buffer.alloc(3_000, 9))
    const after = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(after.staticBytes, 'a webp and a woff2 counted as nothing').toBe(8_000)
    expect(after.staticFiles.sort()).toEqual(['display.woff2', 'hero.webp'])
    // And they did not leak into the code figures.
    expect(after.gz).toBe(before.gz)
    expect(after.deferredGz).toBe(before.deferredGz)
    rmSync(dir, { recursive: true, force: true })
  })

  it('walks the build tree rather than one directory', () => {
    // The dist root carries index.html, the legal texts and three images
    // that Vite copies out of public/. Round 6a read dist/assets only, so
    // 285,956 bytes sat one directory up from everything it looked at.
    const dir = mkdtempSync(join(tmpdir(), 'dc-tree-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'index-d.js'), 'x'.repeat(400))
    writeFileSync(join(dir, 'assets', 'index-d.css'), 'y'.repeat(400))
    writeFileSync(join(dir, 'og-image.jpg'), Buffer.alloc(2_000, 3))
    mkdirSync(join(dir, 'legal'))
    writeFileSync(join(dir, 'legal', 'OFL.txt'), 'z'.repeat(1_000))
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const result = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(result.staticBytes, 'a file outside assets/ counted as nothing').toBe(3_000)
    expect(result.staticFiles.sort()).toEqual(['legal/OFL.txt', 'og-image.jpg'])
    // The entry chunks were still found, one directory down.
    expect(result.jsGz).toBeGreaterThan(0)
    expect(result.cssGz).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('gates the static files rather than only reporting them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-static-gate-'))
    writeFileSync(join(dir, 'index-e.js'), 'x'.repeat(400))
    writeFileSync(join(dir, 'index-e.css'), 'y'.repeat(400))
    writeFileSync(join(dir, 'backdrop.webp'), Buffer.alloc(6_000, 1))
    const generous = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const under = measureBundle({ budget: generous, dir, startedAt: 0 })
    expect(under.staticBytes).toBe(6_000)

    expect(() => measureBundle({ budget: { ...generous, staticBudgetBytes: under.staticBytes - 1 }, dir, startedAt: 0 })).toThrow(
      /over the/,
    )
    // The positive control for the line above: exactly at the budget is
    // fine, so the throw is about the threshold and not about the group
    // existing at all.
    expect(() => measureBundle({ budget: { ...generous, staticBudgetBytes: under.staticBytes }, dir, startedAt: 0 })).not.toThrow()
    // And a missing budget is refused rather than defaulted, which is the
    // unmetered channel with an extra step.
    const { staticBudgetBytes: _drop, ...noStatic } = generous
    expect(() => measureBundle({ budget: noStatic, dir, startedAt: 0 })).toThrow(/records no staticBudgetBytes/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('measures static files raw, because they do not compress', () => {
    // Already-compressed media gzips to MORE than it is: the real build's
    // defeat-sphere.webp gzips 58 bytes larger than the file. Reporting a
    // gzipped figure for it would be a number the wire never carries.
    const dir = mkdtempSync(join(tmpdir(), 'dc-raw-'))
    writeFileSync(join(dir, 'index-f.js'), 'x'.repeat(400))
    writeFileSync(join(dir, 'index-f.css'), 'y'.repeat(400))
    // Incompressible bytes, which is what an encoded image looks like.
    // randomBytes rather than an arithmetic pattern: the first version of
    // this fixture used (i * 2654435761) % 251, which loses precision in a
    // double and repeats, so it gzipped to 431 bytes from 20,000 and stood
    // for nothing. The assertion below is what caught it, which is why it
    // is here rather than in a comment.
    const noise = randomBytes(20_000)
    writeFileSync(join(dir, 'noise.webp'), noise)
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const result = measureBundle({ budget: cap, dir, startedAt: 0 })
    expect(result.staticBytes, 'static was not measured at its real size').toBe(noise.length)
    expect(gzipSync(noise).length, 'this fixture compresses, so it does not stand for an image').toBeGreaterThanOrEqual(
      noise.length,
    )
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a stale static file against fresh code', () => {
    // The staleness loop covers all three groups. A stale backdrop
    // measured against a fresh script is the stale-stylesheet defect two
    // files further out, and both of the earlier versions of this loop
    // slept through exactly that mutation.
    const dir = mkdtempSync(join(tmpdir(), 'dc-static-stale-'))
    // One second of margin, like every other staleness fixture in this
    // file. Linux stamps files from a coarser clock than Date.now() reads,
    // so a file written right after the reading can carry an mtime a few
    // milliseconds before it; without the margin this test refused its own
    // fresh index-g.js on the CI runner while passing on APFS.
    const startedAt = Date.now() - 1_000
    writeFileSync(join(dir, 'index-g.js'), 'x'.repeat(400))
    writeFileSync(join(dir, 'index-g.css'), 'y'.repeat(400))
    writeFileSync(join(dir, 'old.webp'), Buffer.alloc(1_000, 2))
    const old = (startedAt - 60_000) / 1000
    utimesSync(join(dir, 'old.webp'), old, old)
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    expect(() => measureBundle({ budget: cap, dir, startedAt })).toThrow(/old\.webp predates this battery run/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('touches no filesystem when the caller supplies the file list', () => {
    // The default parameters used to chain: `emitted = emittedFiles(dir)`
    // ran for every caller that did not pass `emitted`, including one that
    // passed its own allChunks and never wanted the disk read, so a
    // reading could be assembled from two different builds. `dir` here
    // does not exist, which is the only way to prove nothing scanned it.
    const cap = { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }
    const result = measureBundle({
      budget: cap,
      dir: join(tmpdir(), 'dc-does-not-exist-' + Math.random().toString(36).slice(2)),
      emitted: ['index-x.js', 'index-x.css', 'art/hero.webp'],
      gzipOf: (f) => (f.endsWith('.js') ? 100 : 20),
      rawOf: () => 5_000,
      mtimeOf: () => Date.now() + 1000,
      startedAt: Date.now(),
    })
    expect(result.jsGz).toBe(100)
    expect(result.cssGz).toBe(20)
    expect(result.staticBytes).toBe(5_000)
    expect(result.staticFiles).toEqual(['art/hero.webp'])
  })

  it('records no headroom of its own', () => {
    // Nothing to go stale, which is the whole of the fix: the battery
    // throws if this field comes back.
    expect(Object.keys(budget)).not.toContain('headroomGzipBytes')
    expect(budget.baselineGzipBytes).toBeGreaterThan(0)
    expect(budget.budgetGzipBytes).toBeGreaterThan(budget.baselineGzipBytes)
  })

  it('measures the chunk in front of it, which is the call site the defect was in', () => {
    // Guarding headroomFor alone was the weak form: a call site passing the
    // baseline instead of the measured size went straight through it. This
    // drives the layer the battery actually runs.
    const budget = { baselineGzipBytes: 124237, budgetGzipBytes: 140000, deferredBudgetGzipBytes: 1_000_000, staticBudgetBytes: 10_000_000 }
    const grown = measureBundle({
      budget,
      allChunks: ['index-abc.js', 'index-abc.css'], jsChunks: ['index-abc.js'], cssChunks: ['index-abc.css'],
      gzipOf: (c: string) => (c.endsWith('.css') ? 0 : 124237 + 58),
      mtimeOf: () => 1000,
      startedAt: 0,
    })
    expect(grown.headroom, 'headroom followed the baseline rather than the chunk').toBe(140000 - (124237 + 58))
    expect(grown.line).toContain('headroom ' + (140000 - (124237 + 58)))
    expect(grown.line).toContain('+58')
    // A shrinking round reports more room, not less.
    const shrunk = measureBundle({
      budget,
      allChunks: ['index-abc.js', 'index-abc.css'], jsChunks: ['index-abc.js'], cssChunks: ['index-abc.css'],
      gzipOf: (c: string) => (c.endsWith('.css') ? 0 : 124237 - 100),
      mtimeOf: () => 1000,
      startedAt: 0,
    })
    expect(shrunk.headroom).toBe(140000 - (124237 - 100))
    expect(shrunk.line).toContain('-100')
  })

  it('refuses the conditions the battery exists to catch', () => {
    const budget = { baselineGzipBytes: 124237, budgetGzipBytes: 140000, deferredBudgetGzipBytes: 1_000_000, staticBudgetBytes: 10_000_000 }
    const call = (over: Record<string, unknown>) =>
      measureBundle({ budget, allChunks: ['index-abc.js', 'index-abc.css'], jsChunks: ['index-abc.js'], cssChunks: ['index-abc.css'], gzipOf: (c: string) => (c.endsWith('.css') ? 0 : 124237), mtimeOf: () => 1000, startedAt: 0, ...over })
    // A written headroom, the thing this round removed.
    expect(() => call({ budget: { ...budget, headroomGzipBytes: 15763 } })).toThrow(/records a headroom/)
    // A chunk older than the run measuring it.
    expect(() => call({ startedAt: 5000 })).toThrow(/stale/)
    // No chunk, or more than one.
    expect(() => call({ jsChunks: [] })).toThrow(/expected one main JS chunk/)
    expect(() => call({ jsChunks: ['a.js', 'b.js'] })).toThrow(/expected one main JS chunk/)
    // The CSS chunk is required too. Treating it as optional would let a
    // build that stopped emitting it measure smaller and pass, which is
    // the unmetered channel again with an extra step.
    expect(() => call({ cssChunks: [] })).toThrow(/expected one main CSS chunk/)
    expect(() => call({ cssChunks: ['a.css', 'b.css'] })).toThrow(/expected one main CSS chunk/)
    // Over budget.
    expect(() => call({ gzipOf: (c: string) => (c.endsWith('.css') ? 0 : 140001) })).toThrow(/over the 140000 byte budget/)
  })

  it('reads and gzips the chunk itself, so the battery has no wiring to get wrong', () => {
    // The default path, not an injected one. Guarding only the arithmetic
    // let a mutation that handed the layer the recorded baseline instead
    // of the measured chunk go straight through, because nothing exercised
    // the argument the battery passed. The battery passes none now, and
    // this drives the reading the layer does for itself.
    const dir = mkdtempSync(join(tmpdir(), 'dc-bundle-'))
    const body = 'x'.repeat(50_000) + Math.random()
    const styles = 'y'.repeat(9_000) + Math.random()
    writeFileSync(join(dir, 'index-real.js'), body)
    writeFileSync(join(dir, 'index-real.css'), styles)
    const expected = gzipSync(Buffer.from(body)).length + gzipSync(Buffer.from(styles)).length
    const measured = measureBundle({
      budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 },
      dir,
      startedAt: 0,
    })
    expect(measured.gz, 'the layer did not gzip the file it was pointed at').toBe(expected)
    expect(measured.headroom).toBe(10_000_000 - expected)
    expect(measured.line).toContain('js ' + gzipSync(Buffer.from(body)).length)
    expect(measured.line).toContain('css ' + gzipSync(Buffer.from(styles)).length)

    // And the stale-dist guard on the same real file, through the default
    // mtimeOf rather than an injected one: the previous version of this
    // test injected both readers, so the default that the battery actually
    // uses was never exercised and could have been removed unnoticed.
    expect(() =>
      measureBundle({
        budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 },
        dir,
        startedAt: Date.now() + 60_000,
      }),
    ).toThrow(/stale/)

    // The battery's own wiring: omitting the stamp used to switch the
    // staleness check off in silence, because a comparison against
    // undefined is false. It refuses now.
    expect(() =>
      measureBundle({ budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000, deferredBudgetGzipBytes: 10_000_000, staticBudgetBytes: 10_000_000 }, dir }),
    ).toThrow(/timestamp the battery started at/)

    rmSync(dir, { recursive: true, force: true })
  })
})
