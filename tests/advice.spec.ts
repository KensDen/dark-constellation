// THE ADVICE AND THE GUARD (v2.0 R4, Ken's rulings of 15 November 2026).
//   4. BEST SPOT and FIX NEXT count the watch post they give up, so the
//      advice never raises AT STAKE (src/ui/three/gameModel.ts, spotAdvice
//      and fixNext).
//   5. WORST CASE warns only when the risk is real. Since v2.0 R5 (Ken's
//      ruling of 17 November 2026) its figure is the morning's, with the
//      funding and the coverage bonus in, and its mark is raised when a
//      broken budget is more likely than not (src/engine/worstCase.ts).
// Held over the nights the sweep's own Prepared and Novice lines reach, so
// the boards are ones a game arrives at, with posts standing and COLDVEIL
// already turned from what is covered.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { planFor } from '../src/engine/campaign'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { domainOf, mitigationOf, orderCost, postOf } from '../src/engine/rules'
import type { GameState, TurnActions } from '../src/engine/types'
import { movesOpen, worstCase } from '../src/engine/worstCase'
import { NO_ORDERS, atStakeOf, contactsFor, dodgeOf, eventDef, fixNext, spotAdvice, spotFor, type Orders } from '../src/ui/three/gameModel'
import { nightOf } from '../src/ui/night/nightModel'
import { WATCH } from './policies'

const SEEDS = 120
const ordersOf = (a: TurnActions): Orders => ({ defense: null, place: null, assets: a.buyAssets.map((b) => b.kind), scans: a.scans ?? [], sighted: a.sighted ?? [] })

function* nights(seeds = SEEDS): Generator<{ state: GameState; actions: TurnActions; after: GameState; where: string }> {
  for (const line of WATCH.filter((l) => l.name === 'prepared' || l.name === 'novice')) {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= seeds; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const actions = line.policy(state)
          const after = playNight(state, actions, line.respond)
          yield { state, actions, after, where: `${line.name} ${difficulty} seed ${seed} night ${state.turn}` }
          state = after
        }
      }
    }
  }
}

describe('ruling 4: the advice counts the watch post it gives up', () => {
  it('BEST SPOT never leaves AT STAKE worse than the night stands without the piece, and where every spot would, none is called best', () => {
    let pieces = 0
    let posted = 0
    let cost = 0
    let saved = 0
    for (const { state, actions, where } of nights(20)) {
      const orders = ordersOf(actions)
      const before = atStakeOf(contactsFor(state, orders))
      for (const cm of state.scenario.countermeasures) {
        if (state.counters.includes(cm.id)) continue
        pieces += 1
        const advice = spotAdvice(state, orders, cm.id)
        expect(advice.before, `${where} ${cm.id}: the night as it stands`).toBe(before)
        expect(advice.best, `${where} ${cm.id}: no spot`).toBeDefined()
        // What the card shows once it is placed there is what the advice said.
        const placed = atStakeOf(contactsFor(state, { ...orders, defense: cm.id, place: advice.best! }))
        expect(placed, `${where} ${cm.id}: AT STAKE on the recommended spot`).toBe(advice.after)
        const kinds = domainOf(state.scenario, cm.id)
        const spots = state.assets.filter((a) => a.integrity > 0 && kinds.includes(a.kind)).map((a) => atStakeOf(contactsFor(state, { ...orders, defense: cm.id, place: a.id })))
        if (advice.raises) {
          // Not called best, and truly so: no spot it can sit on holds the line.
          cost += 1
          expect(Math.max(...spots), `${where} ${cm.id}: a spot that held was passed over`).toBeLessThan(before - 0.05)
          expect(advice.after).toBe(Math.max(...spots))
          expect(advice.gives, `${where} ${cm.id}: the post it gives up is not named`).toBe(postOf(state))
        } else {
          expect(placed, `${where} ${cm.id}: BEST SPOT raised AT STAKE from ${before} to ${placed}`).toBeGreaterThanOrEqual(before - 0.05)
          // The case the R3 reviewer met: some spot would have raised it.
          if (Math.min(...spots) < before - 0.05) saved += 1
        }
        if (postOf(state)) posted += 1
      }
    }
    // Not vacuous: boards with a post standing, pieces that cost it
    // wherever they go, and pieces with a wrong spot the advice avoided.
    expect(pieces).toBeGreaterThan(2500)
    expect(posted).toBeGreaterThan(pieces / 2)
    expect(cost, 'no piece ever cost the post, so the warning went untested').toBeGreaterThan(10)
    expect(saved, 'no piece ever had a spot that raised AT STAKE, so the choice went untested').toBeGreaterThan(100)
    if (process.env.SWEEP) process.stderr.write(`\nadvice: ${pieces} pieces, ${posted} with a post standing, ${cost} cost the post wherever they go, ${saved} had a spot that raised AT STAKE\n`)
  }, 120_000)

  it('FIX NEXT names a piece only when placing it tomorrow leaves tomorrow no worse, and names the post when none can', () => {
    let fixes = 0
    let costly = 0
    let none = 0
    for (const { state, after, where } of nights()) {
      const night = nightOf(state, after)
      const through = night.steps
        .filter((s) => s.kind === 'threat' && s.ev.effectiveSeverity > 0)
        .sort((a, b) => a.scoreAfter - a.scoreBefore - (b.scoreAfter - b.scoreBefore))
        .map((s) => s.def)
      const fix = fixNext(after, through)
      if (!through.length) {
        expect(fix, where).toBeNull()
        continue
      }
      expect(fix, where).not.toBeNull()
      if (!fix!.cm) none += 1
      else if (fix!.gives) {
        costly += 1
        // Every piece that answers what got through would cost the post.
        for (const def of through) {
          const id = def.counters.find((c) => !after.counters.includes(c))
          if (id) expect(spotAdvice(after, NO_ORDERS, id).raises, `${where}: ${id} was passed over`).toBe(true)
        }
        expect(fix!.gives).toBe(postOf(after))
      } else {
        fixes += 1
        expect(after.counters, where).not.toContain(fix!.cm.id)
        expect(fix!.def.counters, where).toContain(fix!.cm.id)
        if (after.status === 'playing') {
          const advice = spotAdvice(after, NO_ORDERS, fix!.cm.id)
          expect(advice.raises, `${where}: FIX NEXT ${fix!.cm.id} raises tomorrow's AT STAKE from ${advice.before} to ${advice.after}`).toBe(false)
        }
      }
    }
    expect(fixes).toBeGreaterThan(500)
    expect(costly + none, 'the advice never had to hold back').toBeGreaterThan(0)
  })

  it('a result names the switch, and never calls a piece what would have helped against a move COLDVEIL would have left', () => {
    let switched = 0
    let stayed = 0
    for (const { state, actions, after, where } of nights()) {
      void actions
      for (const step of nightOf(state, after).steps) {
        if (step.kind !== 'threat' || step.ev.effectiveSeverity === 0) continue
        const id = step.def.counters.find((c) => !step.after.counters.includes(c))
        if (!id) continue
        const dodge = dodgeOf(step.before, step.def, id)
        const read = adversaryPicks(step.before, [...step.before.counters, id]).find((r) => r.candidates.some((c) => c.id === step.def.id))!
        if (dodge) {
          switched += 1
          // COLDVEIL would have left this move, for one that still lands.
          expect(read.least, where).not.toContain(step.def.id)
          expect(read.least, where).toContain(dodge.id)
          expect(dodge.baseSeverity - mitigationOf(dodge, [...step.before.counters, id]), where).toBeGreaterThanOrEqual(0)
        } else stayed += 1
      }
    }
    expect(switched, 'no result ever met a switch').toBeGreaterThan(50)
    expect(stayed).toBeGreaterThan(50)
  })
})

describe("WORST CASE (v2.0 R5, Ken's ruling of 17 November 2026): the morning's figure, and a mark that is right more often than not", () => {
  // Every way tonight can go, through the engine itself: a deck that plays
  // the chosen move on each track and deals no opportunity, and a debris
  // roll that loses the satellite or does not. No answer is spent.
  const everyWay = (state: GameState, actions: TurnActions) => {
    const counters = [...state.counters, ...actions.buyCounters.filter((c) => !state.counters.includes(c))]
    const open = movesOpen(state, state.turn, counters)
    const debris = open.flat().some((id) => eventDef(state, id).effect.special === 'debrisStrike')
    const out: { dawn: number; morning: number; post: boolean }[] = []
    const walk = (picks: number[]) => {
      if (picks.length < open.length) {
        for (let i = 0; i < open[picks.length].length; i += 1) walk([...picks, i])
        return
      }
      for (const call of debris ? (['burn', 'hold'] as const) : ([undefined] as const)) {
        for (const lose of debris && call === 'hold' ? [true, false] : [false]) {
          let at = 0
          const drawn = open.map((ids, k) => (ids.length > 1 || !(planFor(state, state.turn)!.slots[k].fixed) ? picks[k] : -1)).filter((i) => i >= 0)
          const deck = { next: () => 0.999, int: () => drawn[at++] ?? 0, pick: <T,>(items: readonly T[]) => items[0], chance: () => false }
          const rng = { next: () => 0, int: () => 0, pick: <T,>(items: readonly T[]) => items[0], chance: () => lose }
          const after = resolveTurn(state, { ...actions, ...(call ? { debris: call } : {}), responses: [] }, rng, deck)
          const { ledger, events } = after.history.at(-1)!
          expect(events.filter((e) => !e.debris).map((e) => e.eventId), 'the forced deck did not play the chosen moves').toEqual(open.map((ids, k) => ids[picks[k]]).filter((id) => eventDef(state, id).effect.special !== 'debrisStrike'))
          out.push({ dawn: ledger.after - ledger.funding - ledger.coverageBonus, morning: ledger.after, post: events.some((e) => (e.hardened ?? 0) > 0) })
        }
      }
    }
    walk([])
    return out
  }

  // The lines' own orders keep the night safe, so each night is also read
  // with more ordered than it can bear: every asset the budget still
  // covers, dearest first.
  const overspent = (state: GameState, actions: TurnActions): TurnActions => {
    let a = actions
    for (const kind of ['rpoSat', 'sat', 'groundStation', 'drone'] as const) {
      const more = { ...a, buyAssets: [...a.buyAssets, { kind }] }
      if (state.credits - orderCost(state, more) >= 0) a = more
    }
    return a
  }
  function* readings(seeds: number) {
    for (const night of nights(seeds)) {
      yield night
      const more = overspent(night.state, night.actions)
      if (more !== night.actions) yield { ...night, actions: more, where: `${night.where}, overspent` }
    }
  }

  it("the tile's figure is the engine's own worst night: the budget at the solvency check, and tomorrow morning's with the funding and the coverage bonus in", () => {
    let nightsRead = 0
    let exact = 0
    let bonusLost = 0
    let short = 0
    for (const { state, actions, where } of readings(40)) {
      const wc = worstCase(state, actions)
      const ways = everyWay(state, actions)
      const dawn = Math.min(...ways.map((w) => w.dawn))
      const morning = Math.min(...ways.map((w) => w.morning))
      nightsRead += 1
      // Never rosier than any night the engine can play, and the
      // engine's own worst to the credit, the post's point counted.
      expect(wc.dawn, `${where}: the dawn`).toBe(dawn)
      expect(wc.morning, `${where}: the morning`).toBe(morning)
      if (ways.some((w) => w.post)) exact += 1
      if (wc.dawn >= 0 && wc.morning - wc.dawn === state.scenario.incomePerTurn) bonusLost += 1
      if (wc.dawn < 0) short += 1
    }
    expect(nightsRead).toBeGreaterThan(1500)
    expect(exact, 'the post never took a point off a strike in a night read').toBeGreaterThan(300)
    // Not vacuous: nights whose worst costs the coverage bonus, and nights that read short.
    expect(bonusLost, 'no worst night ever lost the coverage bonus').toBeGreaterThan(10)
    expect(short, 'no night ever read short').toBeGreaterThan(5)
  }, 120_000)

  it('the odds are the nights the engine can play: with no answer left, the chance tonight breaks the budget is the share of them that close insolvent', () => {
    let read = 0
    let some = 0
    for (const { state, actions, where } of readings(60)) {
      if (state.scenario.answers - (state.answersUsed ?? 0) > 0) continue
      const open = movesOpen(state, state.turn, [...state.counters, ...actions.buyCounters.filter((c) => !state.counters.includes(c))])
      if (open.flat().some((id) => eventDef(state, id).effect.special === 'debrisStrike')) continue
      const ways = everyWay(state, actions)
      const wc = worstCase(state, actions)
      // Each way is as likely as the next: COLDVEIL draws evenly on each track.
      const share = ways.filter((w) => w.dawn < 0).length / ways.length
      expect(wc.tonight, where).toBeCloseTo(share, 9)
      read += 1
      if (share > 0) some += 1
    }
    expect(read).toBeGreaterThan(80)
    expect(some, 'no night read could break the budget').toBeGreaterThan(3)
  }, 120_000)

  it('does not mark a first piece, or read short, on an opening budget: the R3 reviewer was warned off an 8 CR piece with 62 CR in the bank', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (const cm of state.scenario.countermeasures) {
          const wc = worstCase(state, { buyAssets: [{ kind: 'drone' }], buyCounters: [cm.id] })
          expect(wc.risky, `${difficulty} seed ${seed}: ${cm.id} at ${cm.cost} CR with a drone on ${state.credits} CR is marked`).toBe(false)
          expect(wc.dawn, `${difficulty} seed ${seed}: ${cm.id} reads ${wc.dawn}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  // THE MEASUREMENT THE RULING ASKS FOR, over Prepared's 500 games: every
  // piece the budget could buy on every night, each mark ignored once (the
  // piece placed where its card recommends) and the game then played on
  // inside the guard. MEASURED (v2.0 R5, a drone at 25 CR, 90 to start):
  //   STANDARD: 25,500 pieces, 77 marked (0.3 percent) on 52 nights of
  //   3,000 (1 in 58); all 77 ignored ended insolvent. 184 more (0.7
  //   percent) read short on the tile with no mark, and bought anyway 60
  //   of them ended insolvent (1 in 3).
  //   EASY: none marked, and none read short.
  // The history of the rule, and what it measured at each step, is at the
  // head of src/engine/worstCase.ts.
  it('A MARK IS RIGHT MORE OFTEN THAN NOT: of the marks Prepared could ignore on STANDARD, more than half end with the budget broken', () => {
    const line = WATCH.find((l) => l.name === 'prepared')!
    const rows: string[] = []
    for (const difficulty of ['standard', 'easy'] as const) {
      let pieces = 0, marked = 0, nightsPlayed = 0, nightsMarked = 0, broke = 0, tight = 0, tightBroke = 0
      for (let seed = 1; seed <= 500; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const actions = line.policy(state)
          nightsPlayed += 1
          const base: TurnActions = { ...actions, buyCounters: [], placeOn: undefined }
          const free = state.credits - orderCost(state, base)
          let any = false
          for (const cm of state.scenario.countermeasures) {
            if (state.counters.includes(cm.id) || cm.cost > free) continue
            pieces += 1
            const where = spotFor(state, ordersOf(base), cm.id)
            const order: TurnActions = { ...base, buyCounters: [cm.id], ...(where ? { placeOn: { [cm.id]: where } } : {}) }
            const wc = worstCase(state, order)
            if (!wc.risky && wc.dawn >= 0) continue
            let s = playNight(state, order, line.respond)
            while (s.status === 'playing') s = playNight(s, line.policy(s), line.respond)
            const insolvent = s.lossReason === 'insolvency'
            if (!wc.risky) {
              // Short on the tile, and not marked: possible, not likely.
              tight += 1
              if (insolvent) tightBroke += 1
              continue
            }
            marked += 1
            any = true
            if (insolvent) broke += 1
          }
          if (any) nightsMarked += 1
          state = playNight(state, actions, line.respond)
        }
      }
      rows.push(`| ${difficulty.toUpperCase()} | ${pieces} | ${marked} (${((100 * marked) / pieces).toFixed(1)}%) | ${nightsMarked} of ${nightsPlayed}${nightsMarked ? ` (1 in ${Math.round(nightsPlayed / nightsMarked)})` : ''} | ${marked ? `${broke} of ${marked} (${((100 * broke) / marked).toFixed(1)}%)` : 'none to ignore'} | ${tight} (${((100 * tight) / pieces).toFixed(1)}%) | ${tight ? `${tightBroke} of ${tight} (${((100 * tightBroke) / tight).toFixed(1)}%)` : 'none'} |`)
      if (difficulty === 'standard') {
        expect(marked, 'nothing was ever marked, so the mark went untested').toBeGreaterThan(30)
        expect(broke / marked, `${broke} of ${marked} marks ignored ended insolvent`).toBeGreaterThan(0.5)
        // And it is quiet: under 2 pieces in 100.
        expect(marked / pieces).toBeLessThan(0.02)
        // A piece that reads short with no mark is the other half of it:
        // possible, and less likely than not.
        expect(tight, 'no piece ever read short without a mark').toBeGreaterThan(30)
        expect(tightBroke / tight, `${tightBroke} of ${tight} pieces that read short with no mark ended insolvent`).toBeLessThan(0.5)
      }
    }
    if (process.env.SWEEP)
      process.stderr.write(['\nWORST CASE over Prepared\'s 500 games, each mark ignored once:', '| difficulty | pieces the budget could buy | marked risky | nights with a mark | ignored, then insolvent | read short on the tile with no mark | bought anyway, then insolvent |', '|---|---|---|---|---|---|---|', ...rows, ''].join('\n') + '\n')
  }, 120_000)
})
