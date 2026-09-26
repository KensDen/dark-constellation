// The board's derivations and the round's first guard (v1.2 R1, brief
// sections 4.2 to 4.4), swept over real play rather than hand-built
// states, because the engine is what decides which ids, layers and
// conditions a board ever has to show.

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { LAYERS, type GameState, type Layer, type TurnActions } from '../src/engine/types'
import {
  KIND_LAYER,
  callSigns,
  cartCallSigns,
  conditionsOn,
  defensesOn,
  pipsFor,
  purchaseOrder,
  spriteState,
  vectorsOf,
} from '../src/ui/board/board'
import { assetEffects } from '../src/ui/board/ProcureSheet'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const SEEDS = 12
const LINES: Record<number, TurnActions>[] = [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT]

function* playTurns(seed: number, script: Record<number, TurnActions>) {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') {
    const actions = script[state.turn] ?? NO_OP
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
    // The positive controls: the walker sees the copy the sheet renders,
    // so an empty scan cannot pass this. The effect line is a template
    // literal, which the parser hands over in parts, so its tail is what
    // has to be found; the spend line is JSX text.
    const tail = assetEffects.drone.slice(assetEffects.drone.indexOf(' coverage'))
    expect(strings.some((s) => s.file === 'ui/board/ProcureSheet.tsx' && s.text === tail), 'the string walker did not find the procure copy').toBe(true)
    expect(strings.some((s) => s.file === 'ui/Game.tsx' && /Planned spend/.test(s.text)), 'the walker missed the JSX text').toBe(true)
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
          // Every asset's layer is the one its kind flies in.
          for (const a of after.assets) expect(KIND_LAYER[a.kind], `${a.id} flies in ${a.layer}`).toBe(a.layer)
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
          // A cart entry's sign, shown on its queued tile, is the sign the
          // engine's id then carries.
          const queued = cartCallSigns(before, actions.buyAssets)
          actions.buyAssets.forEach((buy, i) => {
            const id = `t${before.turn}-${buy.kind}-${i + 1}`
            expect(signs.get(id), `the queued tile for ${id} promised ${queued[i]}`).toBe(queued[i])
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

  it('lights pips and picks a sprite state at the brief-s boundaries', () => {
    expect([100, 76, 75, 51, 50, 26, 25, 1, 0].map(pipsFor)).toEqual([4, 4, 3, 3, 2, 2, 1, 1, 0])
    expect([100, 67, 66, 34, 33, 1, 0].map(spriteState)).toEqual(['intact', 'intact', 'damaged', 'damaged', 'critical', 'critical', 'out'])
  })

  it('puts a chip on every layer its condition touches, and a defense on every layer its counters touch', () => {
    const scenario = DEFAULT_SCENARIO
    let chips = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { after } of playTurns(seed, WIN_SCRIPT)) {
        for (const c of after.conditions) {
          const def = scenario.events.find((e) => e.id === c.eventId)!
          const on = LAYERS.filter((layer) => conditionsOn(layer, after.conditions, scenario).includes(c))
          expect(on, `${c.name} is chipped on ${on.join(',')} and touches ${def.layers.join(',')}`).toEqual([...def.layers].sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b)))
          chips += 1
        }
        for (const layer of LAYERS) {
          for (const d of defensesOn(layer, after.counters, scenario)) {
            expect(after.counters, `${d.name} is shown on ${layer} and is not active`).toContain(d.id)
          }
        }
      }
    }
    expect(chips, 'no condition in the sweep').toBeGreaterThan(0)
    // Posture-wide purchases touch no layer, so the retainer, which does
    // enter state.counters, never gets a shield.
    for (const layer of LAYERS) {
      expect(defensesOn(layer, ['irRetainer', 'intelInvestment'], scenario)).toEqual([])
    }
  })

  it('names a defense by its vectors, and never by the events it answers', () => {
    // The answer-key fix (brief 4.4): the harden sheet renders what
    // vectorsOf returns, and this is the derivation's own half of the
    // guard. The rendered half is in tests/board.dom.spec.tsx.
    const scenario = DEFAULT_SCENARIO
    const names = scenario.events.map((e) => e.name.split(' (')[0])
    for (const cm of scenario.countermeasures) {
      const vectors = vectorsOf(cm, scenario)
      if (cm.counters.length > 0) expect(vectors.length, `${cm.name} answers events but has no vector`).toBeGreaterThan(0)
      else expect(vectors).toEqual([])
      for (const v of vectors) expect(names, `a vector reads as an event name: ${v}`).not.toContain(v)
      for (const layer of LAYERS as readonly Layer[]) {
        for (const d of defensesOn(layer, [cm.id], scenario)) {
          for (const name of names) expect(`${d.name} ${d.vector}`).not.toContain(name)
        }
      }
    }
  })
})

export type { GameState }
