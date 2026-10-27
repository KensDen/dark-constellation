// GUARDS v1.6 R3 (Ken's phone playtest of 27 October 2026,
// files/20261027_DarkConstellation_v1.6_Playtest_Nits_v0.1.md), the halves
// that need no browser. The layout halves (no text-link controls, no
// nested scroll, the hit card on one screen, a strike's hold) are GUARD
// v1.6 R3 (n) to (q) in scripts/phone-layout.mjs.
//
//   (r) THE WATCH OFFICER NEVER SAYS THE SAME LINE TWICE IN A RUN (item 5:
//       uplink jamming on turn 1 and turn 3 read one line, word for word,
//       under one 03:14Z). Over 500 seeds and every policy of the sweep,
//       both campaigns: no run shows one line twice, and no two nights of a
//       run share the officer's clock.
//   (s) FILE TO DOSSIER, AND "INTEL" ONLY FOR THE INTEL BRIEF (item 4): the
//       hit card's button reads FILE TO DOSSIER, and nothing a player reads
//       says "intel card", COLLECT INTEL, FILE IT, or "intel" for anything
//       but the intel brief.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { planFor, variantFor } from '../src/engine/campaign'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { callSigns } from '../src/ui/board/board'
import { callTerms } from '../src/ui/night/closeModel'
import * as copy from '../src/ui/night/nightCopy'
import { nightOf } from '../src/ui/night/nightModel'
import { POLICIES } from './policies'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEEDS = 500

describe('GUARD v1.6 R3 (r): the watch officer never repeats a line in a run', () => {
  it('shows no line twice and no clock twice in any run, over 500 seeds, every policy and both campaigns', () => {
    const repeats: string[] = []
    const clocks: string[] = []
    let most = 0
    let mostAt = ''
    const campaigns = new Set<number>()
    let lines = 0
    for (const { name, policy } of POLICIES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        campaigns.add(variantFor(DEFAULT_SCENARIO, seed))
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        const said = new Map<string, string>()
        const nights = new Map<string, number>()
        const met = new Map<string, number>()
        while (state.status === 'playing') {
          const before = state
          state = resolveTurn(state, policy(state), turnRng(state.seed, state.turn))
          const night = nightOf(before, state)
          const signs = new Map([...callSigns(before), ...callSigns(state)])
          for (const step of night.steps) {
            if (step.kind === 'opportunity') continue
            const sign = step.kind === 'debris' ? callTerms(step.before, step.ev).sat : step.ev.targetAssetId ? signs.get(step.ev.targetAssetId) : undefined
            const officer = copy.officerFor(step, sign)
            if (!officer) continue
            lines += 1
            met.set(step.ev.eventId, (met.get(step.ev.eventId) ?? 0) + 1)
            // The line as written, before the tile's call sign is put in,
            // so two meetings on two tiles cannot pass as two lines.
            const bare = copy.officerFor(step)!.line
            const at = `${name}, seed ${seed}, turn ${before.turn}, ${step.ev.eventId}`
            if (said.has(bare)) repeats.push(`${at} repeats ${said.get(bare)}: "${bare}"`)
            else said.set(bare, at)
            if (step.index === 0) {
              if (nights.has(officer.clock)) clocks.push(`${at}: ${officer.clock} on turn ${nights.get(officer.clock)} too`)
              nights.set(officer.clock, before.turn)
            }
          }
        }
        for (const [id, n] of met)
          if (n > most) {
            most = n
            mostAt = `${id}, ${name}, seed ${seed}`
          }
      }
    }
    expect(repeats.slice(0, 10).join('\n'), 'a run showed a watch officer line twice').toBe('')
    expect(clocks.slice(0, 10).join('\n'), 'two nights of a run share the clock').toBe('')
    // Not vacuous: both campaigns played, and some run met a move three
    // times (uplink jamming, turns 1, 3 and 6 as written).
    expect([...campaigns].sort(), 'one campaign only').toEqual([0, 1])
    expect(most, `the most meetings of one move in a run: ${most} (${mostAt})`).toBe(3)
    expect(lines).toBeGreaterThan(10_000)
  })

  it('gives every move a line for each time a run can meet it, under either campaign', () => {
    // How often each move can come in a run: the turns whose plan can
    // draw it, in each campaign (seed 2 plays it as written, seed 32 the
    // other), counted from the scenario rather than written down.
    expect(variantFor(DEFAULT_SCENARIO, 2)).toBe(0)
    expect(variantFor(DEFAULT_SCENARIO, 32)).toBe(1)
    const most = new Map<string, number>()
    for (const seed of [2, 32]) {
      const state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      const turns = new Map<string, number>()
      for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
        for (const slot of planFor(state, turn)?.slots ?? []) for (const id of slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])) turns.set(id, (turns.get(id) ?? 0) + 1)
      }
      for (const [id, n] of turns) most.set(id, Math.max(most.get(id) ?? 0, n))
    }
    const twice = [...most].filter(([, n]) => n > 1).map(([id]) => id).sort()
    expect(twice, 'the moves that can come twice changed; give each a line per meeting').toEqual(['gnss-spoofing', 'ground-ransomware', 'ops-phishing', 'pnt-jamming', 'uplink-jamming'])
    for (const [id, n] of most) {
      expect(copy.OFFICER[id]?.length ?? 0, `${id} can come ${n} times and has ${copy.OFFICER[id]?.length ?? 0} lines`).toBeGreaterThanOrEqual(n)
      if (copy.HELD[id]) expect(copy.HELD[id].length, `${id} can be blocked ${n} times and has ${copy.HELD[id].length} lines`).toBeGreaterThanOrEqual(n)
    }
  })
})

// Every source file a player's words can come from.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(f) ? [p] : []
  })
}
// A file with its comments taken out, so what is left is code, strings
// and JSX text: what can reach the screen.
const uncommented = (text: string) =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('GUARD v1.6 R3 (s): FILE TO DOSSIER, and "intel" only for the intel brief', () => {
  it('names the hit card\'s button FILE TO DOSSIER', () => {
    expect(copy.FILE_TO_DOSSIER).toBe('FILE TO DOSSIER')
    expect(copy.NEW_CARD).not.toMatch(/intel/i)
  })

  it('says "intel card", COLLECT INTEL or FILE IT nowhere a player reads, and "intel" only before "brief"', () => {
    const found: string[] = []
    const files = [...sources(join(ROOT, 'src')), join(ROOT, 'README.md'), join(ROOT, 'index.html')]
    // What a player can read: the strings and the JSX text (a quoted
    // single word is a code key, such as a stage named 'intel').
    const readable = (text: string) => [
      ...[...text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? ''),
      // JSX text: between a tag's end and the next tag, with none of the
      // code marks (= ; ( ) ? :) that a generic or an arrow would carry.
      ...[...text.matchAll(/>([^<>{}=;()?:]+)</g)].map((m) => m[1]),
    ].filter((t) => !/^[A-Za-z][\w-]*$/.test(t.trim()))
    for (const file of files) {
      const raw = readFileSync(file, 'utf8')
      const prose = file.endsWith('.md') || file.endsWith('.html')
      for (const t of prose ? raw.split('\n') : readable(uncommented(raw))) {
        const at = `${file.slice(ROOT.length + 1)}: ${t.trim().slice(0, 100)}`
        if (/intel card|collect intel/i.test(t) || /\bFILE IT\b/.test(t)) found.push(at)
        for (const m of t.matchAll(/(?<![\w-])intel(?![\w-])/gi)) {
          const rest = t.slice(m.index! + m[0].length)
          if (/^\s*·?\s*brief/i.test(rest)) continue
          // A CSS or attribute selector, not words.
          if (/\[data-|^\s*\]/.test(t)) continue
          found.push(at)
        }
      }
    }
    expect([...new Set(found)].join('\n'), '"intel" where it does not mean the intel brief').toBe('')
  })
})
