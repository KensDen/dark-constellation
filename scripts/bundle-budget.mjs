// The bundle budget's arithmetic, in one place so the battery and the
// suite agree on it.
//
// IT COUNTS EVERY EMITTED CHUNK, corrected at the opening of Round 6, and
// it counts them in two groups because they are not the same kind of cost.
//
// INITIAL: the entry script and the stylesheet, which a visitor downloads
// before anything is interactive. This measured the script alone from
// Round 2 until now, so every visual round shipped into an unmetered
// channel: Round 5 spent 834 gzipped of a 9,000 sub-budget while
// index.css grew 1,817 raw bytes that nothing counted.
//
// DEFERRED: everything Rollup splits out, which today is the lazily loaded
// constellation frame and the three.js it imports. Keeping it out of the
// entry chunk was a deliberate decision and is why it was never in the
// initial figure. But deferred is not free: the default path on the start
// screen fetches it, and nobody had ever measured it. It is 129,274 bytes
// gzipped, which is almost the whole of the rest of the game, and the
// first version of this correction did not see it either because both
// patterns were anchored to `^index-`.
//
// So the layer enumerates what is actually in the directory rather than
// matching the two names it expects, and anything it cannot classify is an
// error rather than a silent zero. That is the same lesson as the
// hand-maintained headroom of Round 4c: a number nobody computes goes
// wrong, and so does a number computed over a set nobody checks.
//
// AND THEN THE SAME DEFECT AGAIN, one level further out, found by Round
// 6b's pass over this very fix. Round 6a enumerated the directory but
// declared the EXTENSIONS: it filtered to /\.(js|css)$/ and every image,
// font and SVG in the build fell through the filter into the same silence
// the stylesheet had been in. That is 506,664 bytes in dist/assets alone,
// and another 285,956 in the dist root, against the 264,446 of code the
// budget could see. A commit message saying it counted everything that
// ships was wrong by a factor of three, and so was the round report built
// on it.
//
// STATIC is therefore the third group, and it is defined by subtraction
// rather than by a list of extensions: every file the build emits that is
// not one of the code chunks above. A format nobody anticipated is counted
// by default, which is the only shape of this function that has survived
// two rounds of being wrong.
//
// Static is measured RAW, not gzipped, and that is a correction too:
// webp, jpg and woff2 are already compressed, no server re-compresses
// them, and gzipping them here reports MORE bytes than the wire carries
// (defeat-sphere.webp gzips to 58 bytes larger than it is). Code compresses
// and is measured compressed; media does not and is measured as it ships.
//
// Headroom is DERIVED from the bundle that was just measured, never
// written down. The battery used to print budget minus the recorded
// BASELINE, which is a fact about last round rather than about this build:
// when a round grew the bundle past its baseline, the printed headroom was
// stale, and Round 4c copied that stale number into its report twice.
// Round 2 flagged the recorded headroom as hand-maintained with nothing
// computing or checking it; this is the first time it went wrong, so the
// field is gone rather than guarded.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export function headroomFor(measuredGzipBytes, budgetGzipBytes) {
  return budgetGzipBytes - measuredGzipBytes
}

// Every file the build emitted, as paths relative to `root`, directories
// walked rather than listed. A build output is a tree and Round 6a treated
// it as one flat directory, which is how the dist root's own files stayed
// invisible alongside the images.
export function emittedFiles(root, prefix = '') {
  const out = []
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...emittedFiles(root, rel))
    else out.push(rel)
  }
  return out
}

// The whole bundle layer, including the reading, so the battery has no
// wiring of its own to get wrong. Guarding only the arithmetic was the
// weak form: a mutation that had the battery hand it the recorded baseline
// instead of the measured chunk went straight through, because nothing
// exercised the argument the battery passes. There is no such argument
// now; the defaults below are the real path and the suite drives them
// against a temporary file.
//
// Returns the line the battery prints and the figures behind it. Throws on
// the conditions the battery fails: a recorded headroom, a stale chunk, no
// chunk, or a bundle over budget.
export function measureBundle({
  budget,
  // The whole build output, not one directory inside it.
  dir = 'dist',
  emitted: emittedIn,
  allChunks: allChunksIn,
  jsChunks: jsChunksIn,
  cssChunks: cssChunksIn,
  gzipOf = (chunk) => gzipSync(readFileSync(join(dir, chunk))).length,
  rawOf = (file) => statSync(join(dir, file)).size,
  mtimeOf = (chunk) => statSync(join(dir, chunk)).mtimeMs,
  startedAt,
}) {
  // Resolved in the BODY rather than as chained default parameters.
  // Defaults evaluate left to right whenever their own argument is
  // undefined, so `emitted = emittedFiles(dir)` ran even for a caller that
  // supplied allChunks and never wanted the filesystem touched, and it
  // scanned the real dist while that caller's own chunk list was used for
  // everything else: a reading assembled from two different builds.
  const emitted = emittedIn ?? emittedFiles(dir)
  const allChunks = allChunksIn ?? emitted.filter((f) => /\.(js|css)$/.test(f))
  const jsChunks = jsChunksIn ?? allChunks.filter((f) => /(^|\/)index-[^/]*\.js$/.test(f))
  const cssChunks = cssChunksIn ?? allChunks.filter((f) => /(^|\/)index-[^/]*\.css$/.test(f))
  // The one argument the battery still passes, and the one the staleness
  // check depends on: omitted, `mtime < undefined` is false and the guard
  // switches itself off without a word. Three lenses of the Round 4c
  // re-review found that independently, so it fails loudly instead.
  if (!Number.isFinite(startedAt)) {
    throw new Error('measureBundle needs the timestamp the battery started at, or the stale-chunk check cannot run')
  }
  if ('headroomGzipBytes' in budget) {
    throw new Error('bundle-budget.json records a headroom; it is derived from the measured chunk, not written')
  }
  if (jsChunks.length !== 1) throw new Error(`expected one main JS chunk, found ${jsChunks.length}`)
  // The CSS chunk is required, not optional. Treating it as optional would
  // mean a build that stopped emitting it measured smaller and passed,
  // which is the unmetered channel again with an extra step.
  if (cssChunks.length !== 1) throw new Error(`expected one main CSS chunk, found ${cssChunks.length}`)
  const js = jsChunks[0]
  const css = cssChunks[0]
  // EVERY other script or stylesheet in the directory. Rollup splits the
  // lazily loaded frame out under its own name, so a pattern anchored to
  // the entry chunk's name cannot see it; enumerating and subtracting
  // means a chunk this layer has never heard of is counted rather than
  // ignored.
  const deferred = allChunks.filter((f) => f !== js && f !== css)
  // Everything else the build emitted. Defined by subtraction on purpose:
  // a list of extensions is a set someone declared, and declaring this set
  // is the exact mistake Round 6a made one level in.
  const staticFiles = emitted.filter((f) => !allChunks.includes(f))
  // BOTH are checked for staleness. Checking only the JS would let a
  // stale stylesheet be measured against a fresh script, which is the
  // reading this function exists to stop being wrong about.
  // Staleness covers EVERY chunk, not the two named ones. A stale
  // stylesheet measured against a fresh script was one mutation this
  // round's first version slept through; a stale deferred chunk is the
  // same defect one file further out.
  for (const chunk of [js, css, ...deferred, ...staticFiles]) {
    if (mtimeOf(chunk) < startedAt) {
      throw new Error(`${chunk} predates this battery run; dist is stale, rebuild before measuring`)
    }
  }
  const jsGz = gzipOf(js)
  const cssGz = gzipOf(css)
  const gz = jsGz + cssGz
  const deferredGz = deferred.reduce((sum, chunk) => sum + gzipOf(chunk), 0)
  // Raw, because these do not compress and no server tries. See the header.
  const staticBytes = staticFiles.reduce((sum, file) => sum + rawOf(file), 0)
  const delta = gz - budget.baselineGzipBytes
  const headroom = headroomFor(gz, budget.budgetGzipBytes)
  const deferredHeadroom = headroomFor(deferredGz, budget.deferredBudgetGzipBytes)
  const staticHeadroom = headroomFor(staticBytes, budget.staticBudgetBytes)
  const line =
    `initial ${gz} (js ${jsGz} + css ${cssGz}; baseline ${budget.baselineGzipBytes}, ` +
    `${delta >= 0 ? '+' : ''}${delta}; budget ${budget.budgetGzipBytes}, headroom ${headroom}), ` +
    `deferred ${deferredGz} in ${deferred.length} chunk${deferred.length === 1 ? '' : 's'} ` +
    `(budget ${budget.deferredBudgetGzipBytes}, headroom ${deferredHeadroom}), ` +
    `static ${staticBytes} raw in ${staticFiles.length} file${staticFiles.length === 1 ? '' : 's'} ` +
    `(budget ${budget.staticBudgetBytes}, headroom ${staticHeadroom})`
  if (gz > budget.budgetGzipBytes) {
    throw new Error(`the initial download is ${gz} bytes gzipped (js ${jsGz} + css ${cssGz}), over the ${budget.budgetGzipBytes} byte budget`)
  }
  // The deferred budget must exist. Defaulting it to Infinity would
  // recreate the unmetered channel the moment a new split chunk appeared.
  if (!Number.isFinite(budget.deferredBudgetGzipBytes)) {
    throw new Error('bundle-budget.json records no deferredBudgetGzipBytes; split chunks ship too and must be bounded')
  }
  if (deferredGz > budget.deferredBudgetGzipBytes) {
    throw new Error(
      `deferred chunks are ${deferredGz} bytes gzipped (${deferred.join(', ')}), over the ${budget.deferredBudgetGzipBytes} byte budget`,
    )
  }
  // Same rule as the deferred budget, and for the same reason: a missing
  // ceiling is an unmetered channel with an extra step, and this group is
  // the one that spent two rounds proving it.
  if (!Number.isFinite(budget.staticBudgetBytes)) {
    throw new Error('bundle-budget.json records no staticBudgetBytes; images and fonts ship too and must be bounded')
  }
  if (staticBytes > budget.staticBudgetBytes) {
    throw new Error(
      `static files are ${staticBytes} raw bytes (${staticFiles.join(', ')}), over the ${budget.staticBudgetBytes} byte budget`,
    )
  }
  return {
    gz,
    jsGz,
    cssGz,
    deferredGz,
    deferred,
    staticBytes,
    staticFiles,
    delta,
    headroom,
    deferredHeadroom,
    staticHeadroom,
    line,
  }
}
