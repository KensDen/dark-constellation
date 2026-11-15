// The call signs and the round's first guard (v1.2 R1, brief sections 4.2
// to 4.4), swept over real play rather than hand-built states, because the
// engine is what decides which ids a game ever has to name. The pixel
// board's tiles, chips and defense icons, which this file also held, were
// retired with the board in v2.0 R3.

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { CALL_SIGN_PREFIX, callSigns, cartCallSigns, purchaseOrder } from '../src/ui/board/board'
import { LOSS_SCRIPT, MIXED_SCRIPT, WIN_SCRIPT, scripted } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const SEEDS = 12
const LINES: Record<number, TurnActions>[] = [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT]

// Each script as a line the engine takes: what the budget cannot meet on a
// night is left out (tests/scripts.ts, scripted).
function* playTurns(seed: number, script: Record<number, TurnActions>) {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  const line = scripted(script)
  while (state.status === 'playing') {
    const actions = line(state)
    const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
    yield { before: state, actions, after }
    state = after
  }
}

// Every string a player could read out of src/: string literals,
// template literals in every part, and JSX text, parsed by the TypeScript
// compiler so a comment or an identifier cannot stand in for one.
function playerStrings(): { file: string; text: string }[] {
  const ts = createRequire(import.meta.url)('typescript')
  const out: { file: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(path, 'utf8')
        const kind = entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        const file = ts.createSourceFile(entry.name, source, ts.ScriptTarget.Latest, true, kind)
        const visit = (node: { text?: string; kind: number }) => {
          if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node) ||
            ts.isJsxText(node)
          ) {
            out.push({ file: path.slice(SRC.length + 1), text: node.text ?? '' })
          }
          ts.forEachChild(node, visit)
        }
        visit(file)
      }
    }
  }
  walk(SRC)
  return out
}

describe('the board (v1.2 R1)', () => {
  it('GUARD (a): no player-visible string says "in this build"', () => {
    // The developer parentheticals of Appendix G ("no extra effect in this
    // build", "no game effect in this build") are gone from player copy
    // (brief 4.4). Read from the parse tree of every module under src/,
    // not from the two places they used to be: a parenthetical moved to
    // a content file or a sheet would be the same defect elsewhere.
    const strings = playerStrings()
    // The positive controls: the walker sees the copy the game renders,
    // so an empty scan cannot pass this. A call sign is built from parts,
    // and a satellite's prefix is a plain literal among them; the credits'
    // heading is JSX text.
    const prefix = CALL_SIGN_PREFIX.sat
    expect([...callSigns(newGame(DEFAULT_SCENARIO, 1, 'standard')).values()].some((sign) => sign.startsWith(prefix)), 'no call sign starts with the satellite prefix').toBe(true)
    expect(strings.some((s) => s.file === 'ui/board/board.ts' && s.text === prefix), 'the string walker did not find the call sign copy').toBe(true)
    expect(strings.some((s) => s.file === 'ui/Credits.tsx' && s.text === 'CREDITS'), 'the walker missed the JSX text').toBe(true)
    const offenders = strings.filter((s) => /in this build/i.test(s.text)).map((s) => `${s.file}: ${JSON.stringify(s.text)}`)
    expect(offenders.join('\n'), 'a developer parenthetical is back in player copy').toBe('')
  })

  it('derives a call sign from every id the engine mints, in real play', () => {
    // The ordinal is read out of the id's shape, which the engine owns
    // (src/engine/reducer.ts newGame and applyPurchases). This pins the
    // two shapes against every id real play produces, so an engine that
    // changed them fails here rather than renumbering the board.
    let seen = 0
    for (const script of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { after } of playTurns(seed, script)) {
          for (const a of [...after.assets, ...after.pipeline]) {
            expect(purchaseOrder(a.id), `${a.id} is an id shape the board cannot rank`).not.toBeNull()
            seen += 1
          }
        }
      }
    }
    expect(seen, 'the sweep produced no ids').toBeGreaterThan(100)
  })

  it('keeps every call sign unique and stable for the whole campaign', () => {
    let arrivals = 0
    for (const script of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let previous = new Map<string, string>()
        for (const { before, actions, after } of playTurns(seed, script)) {
          const signs = callSigns(after)
          const values = [...signs.values()]
          expect(new Set(values).size, `seed ${seed}: two things share a call sign: ${values.join(', ')}`).toBe(values.length)
          // A sign never changes once given, whatever arrives or slips.
          for (const [id, sign] of previous) {
            expect(signs.get(id), `${id} was renumbered on turn ${before.turn}`).toBe(sign)
          }
          // A cart entry's sign, shown before it is ordered, is the sign the
          // engine's id then carries.
          const queued = cartCallSigns(before, actions.buyAssets)
          actions.buyAssets.forEach((buy, i) => {
            const id = `t${before.turn}-${buy.kind}-${i + 1}`
            expect(signs.get(id), `the cart entry for ${id} promised ${queued[i]}`).toBe(queued[i])
            arrivals += 1
          })
          previous = signs
        }
      }
    }
    expect(arrivals, 'no purchase in the sweep, so the cart claim is untested').toBeGreaterThan(20)
    // The starter fleet's signs, by name: the ids carry a GLOBAL index
    // (start-drone-4), and the sign must not copy it.
    const start = callSigns(newGame(DEFAULT_SCENARIO, 1, 'standard'))
    expect([...start.values()]).toEqual(['SG-1', 'SG-2', 'SG-R1', 'KESTREL-1', 'KESTREL-2', 'GS-1'])
  })
})

export type { GameState }
