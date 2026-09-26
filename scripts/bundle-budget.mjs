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
// DEFERRED IS BUDGETED PER CHUNK, ruled by Ken on 2026-09-26 after v1.2
// Round 0 (brief v0.3 section 8). The group had one ceiling, 132,000 on
// the sum, set when deferred meant the constellation frame alone at
// 129,274. Round 0 split five screens out of the initial chunk, and the
// sum became 136,214 across seven chunks that no session downloads
// together: a number no player ever waits on. So the frame chunk keeps its
// own 132,000, every other deferred chunk is capped at 10,000 each, and the
// total is still printed but only as a record.
//
// The frame is RECOGNISED BY WHAT IT CARRIES, never by its file name, its
// hash or its size rank: it is the one deferred chunk holding both
// three.js (the `__THREE__` instance marker three's core sets on window)
// and src/ui/Constellation.tsx (any of the distinctive string literals that
// file contains, parsed out of the source at measure time rather than
// copied here). ANY, not every: the ruling's own review found builds that
// drop literals the source still has, a dev-only warning or an entity the
// JSX compiler decodes, and requiring all of them turned a valid build red
// as a "split" frame. Picking it by name would follow a rename, and picking
// the largest chunk would wave a heavy screen through at 132,000 the day
// it outgrew the frame. A misidentification cannot pass quietly either:
// the frame is many times the per-chunk cap, so mistaking it for a screen
// fails.
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
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export function headroomFor(measuredGzipBytes, budgetGzipBytes) {
  return budgetGzipBytes - measuredGzipBytes
}

// three.js's own mark: its core sets window.__THREE__ to the revision so it
// can warn about a second copy. A property name, so no minifier renames it.
export const THREE_MARKER = '__THREE__'

// The module the frame chunk is built from, resolved from this file rather
// than from the working directory.
export const FRAME_SOURCE = fileURLToPath(new URL('../src/ui/Constellation.tsx', import.meta.url))

// Long enough that the literal names this file and not a common word.
const DISTINCTIVE_LITERAL_CHARS = 20

// The string literals in the frame's source that a build can carry
// verbatim. Parsed with the TypeScript compiler rather than matched with a
// pattern, so an apostrophe in a comment or a word of JSX text cannot pass
// itself off as a literal. Left out: module specifiers, which the bundler
// rewrites; literals inside types, which are erased; and anything with a
// quote, a backslash, an ampersand or a non-ASCII character, which a
// minifier may re-escape or the JSX compiler may decode. A literal can
// still be dropped (a dev-only branch), which is why a chunk needs only one.
export function frameSourceMarkers(source) {
  const ts = createRequire(import.meta.url)('typescript')
  const file = ts.createSourceFile('Constellation.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text.length >= DISTINCTIVE_LITERAL_CHARS &&
      /^[\x20-\x7e]+$/.test(node.text) &&
      !/['"`\\&]/.test(node.text)
    ) {
      out.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  // Nothing to recognise the frame by is an error, said as what it is,
  // rather than a match that can never succeed and surfaces later as a
  // frame that seems to have gone missing.
  if (out.length === 0) {
    throw new Error(
      `${FRAME_SOURCE} has no string literal of ${DISTINCTIVE_LITERAL_CHARS} or more plain characters, so its chunk cannot be recognised by content`,
    )
  }
  return out
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
  contentOf = (chunk) => readFileSync(join(dir, chunk), 'utf8'),
  frameMarkers: frameMarkersIn,
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
  // The retired sum budget is refused rather than ignored. Left in place it
  // would read as a ceiling the battery enforces, and a number that is
  // reported but not gated is the unmetered channel this file keeps finding.
  if ('deferredBudgetGzipBytes' in budget) {
    throw new Error(
      'bundle-budget.json records deferredBudgetGzipBytes, the deferred SUM budget retired by Ken\'s ruling of 2026-09-26; ' +
        'deferred chunks are budgeted one by one (frameBudgetGzipBytes, deferredChunkBudgetGzipBytes)',
    )
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
  // Which deferred chunk is the frame, by content. The markers are derived
  // only when there is a deferred chunk to look in, so a caller with none
  // never touches the frame's source.
  const frameMarkers = deferred.length === 0 ? [] : (frameMarkersIn ?? frameSourceMarkers(readFileSync(FRAME_SOURCE, 'utf8')))
  const deferredChunks = deferred.map((chunk) => {
    const text = contentOf(chunk)
    const three = text.includes(THREE_MARKER)
    const source = frameMarkers.some((marker) => text.includes(marker))
    return { chunk, gz: gzipOf(chunk), three, source, frame: three && source }
  })
  const frames = deferredChunks.filter((c) => c.frame)
  if (frames.length > 1) {
    throw new Error(
      `${frames.map((c) => c.chunk).join(' and ')} all carry three.js and src/ui/Constellation.tsx; the frame budget is for one chunk, so which one it bounds is ambiguous`,
    )
  }
  // Half a frame is refused by name. If a build ever split three.js from
  // the component that uses it, the vendor chunk would fail the 10,000 cap
  // with a message about a screen; this says what actually happened, and
  // does not call it a split when the likelier story is that none of the
  // component's literals reached the build.
  if (frames.length === 0 && deferredChunks.some((c) => c.three || c.source)) {
    const where = (key) => deferredChunks.filter((c) => c[key]).map((c) => c.chunk).join(', ')
    const threeAt = where('three')
    const sourceAt = where('source')
    if (threeAt && sourceAt) {
      throw new Error(
        `the constellation frame is split: three.js is in ${threeAt}, src/ui/Constellation.tsx is in ${sourceAt}; ` +
          'the frame budget was ruled for one chunk built from both, so this build needs the ruling revisited, not a cap',
      )
    }
    throw new Error(
      threeAt
        ? `no deferred chunk is recognisably the constellation frame: three.js is in ${threeAt}, but none of the literals ` +
            `derived from src/ui/Constellation.tsx (${frameMarkers.map((m) => JSON.stringify(m)).join(', ')}) is in any deferred chunk, ` +
            'so either the component left that chunk or none of those literals survives the build'
        : `no deferred chunk is recognisably the constellation frame: src/ui/Constellation.tsx is in ${sourceAt}, ` +
            `but no deferred chunk carries three.js's ${THREE_MARKER} marker`,
    )
  }
  const frame = frames[0] ?? null
  const others = deferredChunks.filter((c) => !c.frame)
  const largestOther = others.reduce((big, c) => (big && big.gz >= c.gz ? big : c), null)
  // A record, not a gate. See the header for why the sum stopped meaning
  // anything a player feels.
  const deferredGz = deferredChunks.reduce((sum, c) => sum + c.gz, 0)
  // Raw, because these do not compress and no server tries. See the header.
  const staticBytes = staticFiles.reduce((sum, file) => sum + rawOf(file), 0)
  const delta = gz - budget.baselineGzipBytes
  const headroom = headroomFor(gz, budget.budgetGzipBytes)
  const frameHeadroom = frame ? headroomFor(frame.gz, budget.frameBudgetGzipBytes) : null
  const otherHeadroom = largestOther ? headroomFor(largestOther.gz, budget.deferredChunkBudgetGzipBytes) : null
  const staticHeadroom = headroomFor(staticBytes, budget.staticBudgetBytes)
  const line =
    `initial ${gz} (js ${jsGz} + css ${cssGz}; baseline ${budget.baselineGzipBytes}, ` +
    `${delta >= 0 ? '+' : ''}${delta}; budget ${budget.budgetGzipBytes}, headroom ${headroom}), ` +
    `deferred frame ${frame ? `${frame.chunk} ${frame.gz} (budget ${budget.frameBudgetGzipBytes}, headroom ${frameHeadroom})` : 'none'}, ` +
    `${others.length} other deferred chunk${others.length === 1 ? '' : 's'}` +
    (largestOther
      ? `, largest ${largestOther.chunk} ${largestOther.gz} (cap ${budget.deferredChunkBudgetGzipBytes} each, headroom ${otherHeadroom})`
      : '') +
    `, deferred total ${deferredGz} in ${deferred.length} chunk${deferred.length === 1 ? '' : 's'} (recorded, not gated), ` +
    `static ${staticBytes} raw in ${staticFiles.length} file${staticFiles.length === 1 ? '' : 's'} ` +
    `(budget ${budget.staticBudgetBytes}, headroom ${staticHeadroom})`
  if (gz > budget.budgetGzipBytes) {
    throw new Error(`the initial download is ${gz} bytes gzipped (js ${jsGz} + css ${cssGz}), over the ${budget.budgetGzipBytes} byte budget`)
  }
  // Both deferred ceilings must exist. Defaulting either to Infinity would
  // recreate the unmetered channel the moment a new split chunk appeared.
  if (!Number.isFinite(budget.frameBudgetGzipBytes)) {
    throw new Error('bundle-budget.json records no frameBudgetGzipBytes; the constellation frame ships too and must be bounded')
  }
  if (!Number.isFinite(budget.deferredChunkBudgetGzipBytes)) {
    throw new Error('bundle-budget.json records no deferredChunkBudgetGzipBytes; split chunks ship too and must be bounded')
  }
  if (frame && frame.gz > budget.frameBudgetGzipBytes) {
    throw new Error(
      `the constellation frame chunk ${frame.chunk} is ${frame.gz} bytes gzipped, over its ${budget.frameBudgetGzipBytes} byte budget`,
    )
  }
  // Every chunk that is not the frame, each on its own, whatever its size
  // or name. Listing all of them at once so a fix is not found one by one.
  const over = others.filter((c) => c.gz > budget.deferredChunkBudgetGzipBytes)
  if (over.length > 0) {
    throw new Error(
      `${over.map((c) => `${c.chunk} is ${c.gz} bytes gzipped`).join('; ')}, over the ${budget.deferredChunkBudgetGzipBytes} byte cap ` +
        `every deferred chunk but the frame is held to (frame: ${frame ? frame.chunk : 'none'})`,
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
    deferredChunks,
    frame: frame ? frame.chunk : null,
    frameGz: frame ? frame.gz : null,
    largestOther: largestOther ? largestOther.chunk : null,
    staticBytes,
    staticFiles,
    delta,
    headroom,
    frameHeadroom,
    otherHeadroom,
    staticHeadroom,
    line,
  }
}
