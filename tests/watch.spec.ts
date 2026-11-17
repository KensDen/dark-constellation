// THE WATCH'S RULES (v2.0 R2, Ken's rulings of 14 November 2026; the
// game's only rules since v2.0 R3). Each held here on whole games: a
// signature keeps the target it was sighted on, the answers are a pool
// that credits cannot refill, the watch's post takes a point off a strike
// on the asset the newest defense sits on and nothing else, the policy
// engine's holds are dealt as the rule says, cost what it says, and are
// settled by the evidence on the card, and (v2.0 R3) a signature named on
// sight is identified with no pulse spent.
//
// The balance (the bands, the fixed lines, the two tie-break extremes) is
// tests/sweep.spec.ts; the presentation is the bot's (scripts/game3d-bot.mjs).

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { HOLDS, HUMAN_IN_COMMAND } from '../src/content/holds'
import { adversaryPicks } from '../src/engine/adversary'
import { planFor } from '../src/engine/campaign'
import { holdNights, holdTonight, resolveHold, rightCall } from '../src/engine/holds'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { playNight, type Responder } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import { HARDEN, aimOf, answersLeft, answersOf, domainOf, eventById, exposedOf, postOf, scanPulses } from '../src/engine/rules'
import { maiScore } from '../src/engine/scoring'
import type { GameState, TurnActions } from '../src/engine/types'
import { captureGame, decodeSaveCode, encodeSaveCode } from '../src/persistence'
import { ordersOf, replay } from '../src/ui/debriefModel'
import { nightOf } from '../src/ui/night/nightModel'
import { NO_ORDERS as NO_PLAN, SIGHT_CHOICES, actionsOf, canSight, coachRun, contactsFor, finalScore, inputsOf, sightChoices, sightOpen, spotFor, timeline, withSight } from '../src/ui/three/gameModel'
import { FIXED, NO_ORDERS, WATCH, WATCH_REPORTED, careless, sensible } from './policies'

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1)
const W2 = DEFAULT_SCENARIO
const game = (seed: number, difficulty: 'easy' | 'standard' = 'standard') => newGame(DEFAULT_SCENARIO, seed, difficulty)
const line = (name: string) => [...WATCH, ...FIXED, ...WATCH_REPORTED].find((l) => l.name === name)!

// A whole game of a line, every state on the way.
function play(start: GameState, policy: (s: GameState) => TurnActions, respond: Responder): GameState[] {
  const out = [start]
  while (out[out.length - 1].status === 'playing') out.push(playNight(out[out.length - 1], policy(out[out.length - 1]), respond))
  return out
}

describe('a signature keeps the target it was sighted on (v2.0 R2)', () => {
  it('aims every candidate at the same asset whatever is ordered, placed, bought or called', () => {
    let checked = 0
    for (const seed of SEEDS.slice(0, 30)) {
      for (const states of [play(game(seed), line('prepared').policy, sensible)]) {
        for (const s of states) {
          if (s.status !== 'playing') continue
          const base = contactsFor(s, NO_PLAN)
          const free = s.scenario.countermeasures.filter((c) => !s.counters.includes(c.id) && c.cost <= s.credits)
          const variants = [
            ...free.slice(0, 4).map((c) => ({ ...NO_PLAN, defense: c.id, place: spotFor(s, NO_PLAN, c.id) ?? null })),
            { ...NO_PLAN, assets: ['drone' as const] },
            { ...NO_PLAN, scans: base.filter((c) => !c.fixed).slice(0, 2).map((c) => c.id) },
          ]
          for (const orders of variants) {
            if (s.credits < 15 && orders.assets.length) continue
            for (const c of contactsFor(s, orders)) {
              expect(c.targetId, `seed ${seed} night ${s.turn}: ${c.id} moved`).toBe(base.find((b) => b.id === c.id)?.targetId)
              checked += 1
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
  })

  it('strikes where the signature stood: the move played lands on the asset its signature was over, burn or hold', () => {
    let strikes = 0
    for (const seed of SEEDS) {
      for (const debris of ['burn', 'hold'] as const) {
        let s = game(seed)
        while (s.status === 'playing') {
          const before = s
          const sighted = new Map(contactsFor(before, NO_PLAN).map((c) => [c.id, c.targetId]))
          s = playNight(s, { ...NO_ORDERS, debris }, () => null)
          const rec = s.history.at(-1)!
          rec.events.forEach((ev, slot) => {
            const def = eventById(before.scenario, ev.eventId)
            if (def.kind === 'opportunity' || ev.debris) return
            // An asset lost earlier the same night is the one case a target moves.
            const lostTonight = rec.events.slice(0, slot).some((e) => e.debris?.lost && e.debris.assetId === sighted.get(ev.eventId))
            if (!lostTonight) expect(ev.targetAssetId, `seed ${seed} night ${rec.turn}: ${ev.eventId}`).toBe(sighted.get(ev.eventId))
            strikes += 1
          })
        }
      }
    }
    expect(strikes).toBeGreaterThan(600)
  })

  it('prefers the kind a move prefers, and only assets on its layers', () => {
    const s = game(11)
    for (let slot = 0; slot < 2; slot += 1) {
      for (const ev of s.scenario.events.filter((e) => (e.kind ?? 'threat') === 'threat' && e.effect.special !== 'debrisStrike')) {
        const t = aimOf(s, slot, ev)
        expect(t, ev.id).toBeDefined()
        expect(ev.layers, ev.id).toContain(t!.layer)
        if (ev.prefersKinds?.some((k) => s.assets.some((a) => a.kind === k))) expect(ev.prefersKinds, ev.id).toContain(t!.kind)
      }
    }
  })
})

describe('the answers are a pool for the operation (v2.0 R2)', () => {
  it('spends no credits, never more than the pool, and offers none once it is empty', () => {
    let taken = 0
    let dry = 0
    for (const seed of SEEDS) {
      for (const respond of [sensible, careless]) {
        const states = play(game(seed), line('prepared').policy, respond)
        const end = states.at(-1)!
        const answers = end.history.flatMap((r) => r.events.filter((e) => e.response))
        expect(answers.length, `seed ${seed}`).toBeLessThanOrEqual(W2.answers)
        expect(end.answersUsed ?? 0).toBe(answers.length)
        expect(answersLeft(end)).toBe(answersOf(end) - answers.length)
        // No credits move for an answer: a night's budget is its orders,
        // its fuel and its windfall, and nothing else.
        for (const r of end.history) {
          expect(r.ledger.afterNight, `seed ${seed} night ${r.turn}`).toBe(r.ledger.start - r.ledger.ordered - r.ledger.fuel + r.ledger.windfall)
          for (const ev of r.events) if (ev.left === 0) dry += 1
        }
        taken += answers.length
      }
    }
    expect(taken).toBeGreaterThan(200)
    // Not vacuous: moves arrive with the pool already empty, and get no answer.
    expect(dry).toBeGreaterThan(50)
  })

  it('ignores an answer named for a move once the pool is empty', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      let s = game(seed)
      while (s.status === 'playing') {
        // Every response of every move, named for every move tonight.
        const plan = planFor(s, s.turn)?.slots ?? []
        const wish = adversaryPicks(s, s.counters).map((read) => eventById(s.scenario, read.pick).responses?.[0]?.id ?? null)
        const after = resolveTurn(s, { ...NO_ORDERS, debris: 'burn', responses: wish }, turnRng(s.seed, s.turn))
        expect(plan.length).toBeGreaterThan(0)
        expect(after.answersUsed ?? 0).toBeLessThanOrEqual(W2.answers)
        s = after
      }
      expect(s.history.flatMap((r) => r.events.filter((e) => e.response)).length).toBe(W2.answers)
    }
  })
})

describe('the watch post: where the newest defense sits (v2.0 R2)', () => {
  it('takes a point off a strike on the post and no other, and never moves COLDVEIL’s choice', () => {
    let onPost = 0
    let elsewhere = 0
    for (const seed of SEEDS) {
      const states = play(game(seed), line('prepared').policy, sensible)
      for (let t = 1; t < states.length; t += 1) {
        const before = states[t - 1]
        const rec = states[t].history.at(-1)!
        const opening = nightOf(before, states[t]).opening
        const post = postOf(opening)
        for (const ev of rec.events) {
          if (eventById(before.scenario, ev.eventId).kind === 'opportunity' || ev.debris) continue
          const full = ev.baseSeverity + ev.chainBonus - ev.mitigation
          if (ev.targetAssetId === post && full > 0) {
            expect(ev.hardened, `seed ${seed} night ${rec.turn}: ${ev.eventId} on the post`).toBe(HARDEN)
            onPost += 1
          } else {
            expect(ev.hardened, `seed ${seed} night ${rec.turn}: ${ev.eventId} off the post`).toBeUndefined()
            elsewhere += 1
          }
          expect(exposedOf(ev)).toBe(Math.max(0, full - (ev.hardened ?? 0)))
        }
        // COLDVEIL reads what is fielded, not where it stands.
        expect(adversaryPicks(opening, opening.counters).map((r) => r.pick)).toEqual(adversaryPicks({ ...opening, placed: {} }, opening.counters).map((r) => r.pick))
      }
    }
    expect(onPost).toBeGreaterThan(40)
    expect(elsewhere).toBeGreaterThan(200)
  })

  it('moves with each new defense, stays through a night with none, and is lost with its asset', () => {
    let s = game(5)
    expect(postOf(s)).toBeUndefined()
    s = resolveTurn(s, { ...NO_ORDERS, buyCounters: ['antiJam'], placeOn: { antiJam: 'start-sat-1' } }, turnRng(s.seed, s.turn))
    expect(postOf(s)).toBe('start-sat-1')
    s = resolveTurn(s, NO_ORDERS, turnRng(s.seed, s.turn))
    expect(postOf(s), 'a night with no new defense').toBe('start-sat-1')
    s = resolveTurn(s, { ...NO_ORDERS, buyCounters: ['pntAuth'], placeOn: { pntAuth: 'start-drone-4' } }, turnRng(s.seed, s.turn))
    expect(postOf(s)).toBe('start-drone-4')
    expect(postOf({ ...s, assets: s.assets.map((a) => (a.id === 'start-drone-4' ? { ...a, integrity: 0 } : a)) }), 'its asset lost').toBeUndefined()
    // A defense set down where it cannot sit is owned and stands nowhere.
    const odd = resolveTurn(game(5), { ...NO_ORDERS, buyCounters: ['groundZeroTrust'], placeOn: { groundZeroTrust: 'start-drone-4' } }, turnRng(5, 1))
    expect(odd.counters).toContain('groundZeroTrust')
    expect(postOf(odd)).toBeUndefined()
  })

  it('recommends a spot the piece can sit on, on every night of every seed', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const s of play(game(seed), line('novice').policy, careless)) {
        if (s.status !== 'playing') continue
        for (const cm of s.scenario.countermeasures) {
          if (s.counters.includes(cm.id)) continue
          const where = spotFor(s, NO_PLAN, cm.id)
          const asset = s.assets.find((a) => a.id === where)
          expect(asset && asset.integrity > 0, `seed ${seed} night ${s.turn}: ${cm.id}`).toBe(true)
          expect(domainOf(s.scenario, cm.id)).toContain(asset!.kind)
        }
      }
    }
  })
})

describe('the policy engine’s holds: the human tie-break (v2.0 R2)', () => {
  it('deals a seed its holds whatever is ordered: the count, the nights, and at least one of each kind', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const nights = holdNights(DEFAULT_SCENARIO, seed)
      expect(nights.size, `seed ${seed}`).toBe(W2.holdCount)
      expect(Math.min(...nights.keys())).toBeGreaterThanOrEqual(2)
      expect(Math.max(...nights.keys())).toBeLessThanOrEqual(DEFAULT_SCENARIO.totalTurns)
      const truths = [...nights.values()]
      expect(truths, `seed ${seed}: no compromise`).toContain(true)
      expect(truths, `seed ${seed}: no false positive`).toContain(false)
    }
    // And both kinds fall on every night from 2 to the last, across seeds.
    for (let t = 2; t <= DEFAULT_SCENARIO.totalTurns; t += 1) {
      const seen = new Set<boolean>()
      for (let seed = 1; seed <= 400; seed += 1) {
        const v = holdNights(DEFAULT_SCENARIO, seed).get(t)
        if (v !== undefined) seen.add(v)
      }
      expect(seen.size, `night ${t}`).toBe(2)
    }
  })

  it('puts the answer on the card: every check clean on a false positive, 1 or 2 dirty on a compromise', () => {
    const used = new Set<string>()
    let both = 0
    for (let seed = 1; seed <= 300; seed += 1) {
      const states = play(game(seed), line('prepared').policy, sensible)
      for (const s of states) {
        const plan = s.status === 'playing' ? holdTonight(s) : undefined
        if (!plan) continue
        used.add(plan.template)
        const t = HOLDS.find((h) => h.id === plan.template)!
        const asset = s.assets.find((a) => a.id === plan.assetId)!
        expect(asset.integrity).toBeGreaterThan(0)
        expect(t.kinds).toContain(asset.kind)
        if (plan.compromised) {
          expect(plan.dirty.length).toBeGreaterThanOrEqual(1)
          expect(plan.dirty.length).toBeLessThanOrEqual(2)
          expect(new Set(plan.dirty).size).toBe(plan.dirty.length)
          for (const i of plan.dirty) expect([0, 1, 2]).toContain(i)
          if (plan.dirty.length === 2) both += 1
        } else expect(plan.dirty).toEqual([])
        expect(rightCall(plan)).toBe(plan.compromised ? 'stand' : 'override')
      }
    }
    expect(used.size, 'every template is dealt').toBe(HOLDS.length)
    expect(both).toBeGreaterThan(20)
  })

  it('costs a wrong call its stake and a right call nothing, and makes no call a block that stands', () => {
    let wrong = 0
    for (const seed of SEEDS) {
      // A careful line's states, so the meters are there to lose.
      for (const s of play(game(seed), line('prepared').policy, sensible)) {
        const plan = s.status === 'playing' ? holdTonight(s) : undefined
        if (plan) {
          const right = rightCall(plan)
          const other = right === 'stand' ? 'override' : 'stand'
          const a = resolveTurn(s, { ...NO_ORDERS, tiebreak: right }, turnRng(s.seed, s.turn)).history.at(-1)!.hold!
          const b = resolveTurn(s, { ...NO_ORDERS, tiebreak: other }, turnRng(s.seed, s.turn)).history.at(-1)!.hold!
          const none = resolveTurn(s, NO_ORDERS, turnRng(s.seed, s.turn)).history.at(-1)!.hold!
          expect(a.right).toBe(true)
          expect(a.cost).toBe(0)
          expect(a.scoreAfter).toBe(a.scoreBefore)
          expect(b.right).toBe(false)
          expect(b.saved).toBe(0)
          expect(b.cost).toBeGreaterThan(0)
          expect(b.cost, `seed ${seed} night ${s.turn}`).toBeLessThanOrEqual(W2.holdStake + 0.11)
          // What the right call kept is what the wrong one cost.
          expect(a.saved).toBe(b.cost)
          expect(none.call).toBe('none')
          expect(none.right).toBe(right === 'stand')
          // A hold moves no credits: WORST CASE is untouched by it.
          expect(resolveTurn(s, { ...NO_ORDERS, tiebreak: other }, turnRng(s.seed, s.turn)).credits).toBe(resolveTurn(s, { ...NO_ORDERS, tiebreak: right }, turnRng(s.seed, s.turn)).credits)
          wrong += 1
        }
      }
    }
    expect(wrong).toBeGreaterThan(100)
    // On EASY the stake scales with every other damage.
    const easy = game(3, 'easy')
    let e = easy
    while (!holdTonight(e)) e = resolveTurn(e, NO_ORDERS, turnRng(e.seed, e.turn))
    const plan = holdTonight(e)!
    const cost = resolveTurn(e, { ...NO_ORDERS, tiebreak: rightCall(plan) === 'stand' ? 'override' : 'stand' }, turnRng(e.seed, e.turn)).history.at(-1)!.hold!.cost
    expect(cost).toBeLessThan(W2.holdStake)
    expect(cost).toBeGreaterThan(0)
  })

  it('resolves on a copy exactly as the engine does, so the night can show the board either side of it', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const states = play(game(seed), line('novice').policy, careless)
      for (let t = 1; t < states.length; t += 1) {
        const night = nightOf(states[t - 1], states[t])
        const rec = states[t].history.at(-1)!
        expect(!!night.hold).toBe(!!rec.hold)
        if (!night.hold || !rec.hold) continue
        expect(maiScore(night.hold.before)).toBe(rec.hold.scoreBefore)
        expect(maiScore(night.hold.after)).toBe(rec.hold.scoreAfter)
        // And the moves start from the board the hold left.
        if (night.steps[0]) expect(maiScore(night.steps[0].before)).toBe(rec.hold.scoreAfter)
        const again = { ...night.hold.before, meters: { ...night.hold.before.meters } }
        expect(resolveHold(again, rec.hold, rec.hold.call === 'none' ? null : rec.hold.call).scoreAfter).toBe(rec.hold.scoreAfter)
      }
    }
  })

  it('has its words in order: 3 checks a template, a clean and a dirty reading that differ, no dash, and a public source for the term', () => {
    expect(HOLDS.length).toBeGreaterThanOrEqual(5)
    const dirty = new Set<string>()
    const clean = new Set<string>()
    for (const h of HOLDS) {
      expect(h.checks.length).toBe(3)
      for (const c of h.checks) {
        expect(c.clean).not.toBe(c.dirty)
        dirty.add(c.dirty)
        clean.add(c.clean)
      }
      for (const text of [h.action, h.rule, h.ifOverridden, h.ifStood, ...h.checks.flatMap((c) => [c.label, c.clean, c.dirty])]) {
        expect(text, h.id).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`))
        expect(text.trim().length, h.id).toBeGreaterThanOrEqual(3)
      }
    }
    // A dirty reading is never some other check's clean one: the bot reads
    // the card by these words, and so does a player.
    for (const d of dirty) expect(clean.has(d), d).toBe(false)
    expect(dirty.size).toBe(HOLDS.length * 3)
    expect(HUMAN_IN_COMMAND.url).toMatch(/^https:\/\/digital-strategy\.ec\.europa\.eu\//)
    // Every kind of asset the fleet starts with can be held.
    for (const kind of new Set(DEFAULT_SCENARIO.starterAssets.map((a) => a.kind))) expect(HOLDS.some((h) => h.kinds.includes(kind)), kind).toBe(true)
  })
})

describe('a game replays to itself, and a save carries it (v2.0 R2)', () => {
  it('replays from its record: placements, answers, holds and all, by both readers of the record', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const l of [line('prepared'), line('novice'), line('randomPlace')]) {
        const end = play(game(seed, seed % 2 ? 'easy' : 'standard'), l.policy, l.respond).at(-1)!
        const states = timeline(end, inputsOf(end))
        expect(states.at(-1)!.history, `seed ${seed} ${l.name}: the 3D game's replay`).toEqual(end.history)
        expect(states.at(-1)!.placed).toEqual(end.placed)
        expect(replay(end, ordersOf(end))?.history, `seed ${seed} ${l.name}: the debrief's replay`).toEqual(end.history)
      }
    }
  })

  it('has a ghost that ends its game, and a save code that carries where the pieces sit and the answers spent', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const end = play(game(seed), line('novice').policy, careless).at(-1)!
      const ghost = coachRun(end)
      expect(ghost.at(-1)!.status).not.toBe('playing')
      expect(finalScore(ghost)).toBeGreaterThan(0)
      const back = decodeSaveCode(encodeSaveCode(captureGame(end, 'aftermath', '2026-11-14T00:00:00.000Z'))).state
      expect(back.placed).toEqual(end.placed)
      expect(back.answersUsed).toBe(end.answersUsed)
      expect(back.history).toEqual(end.history)
    }
  })

  it('starts every game on the scenario\'s budget, with nothing placed and no answer spent', () => {
    const s = game(1)
    expect(s.credits).toBe(DEFAULT_SCENARIO.startCredits)
    expect(s.placed).toEqual({})
    expect(answersLeft(s)).toBe(DEFAULT_SCENARIO.answers)
    expect(postOf(s)).toBeUndefined()
  })
})

// THE GAME'S MODEL ON THESE RULES: a whole game played the way the
// screen plays it (src/ui/three/gameModel.ts), a choice at a time.
import { NO_INPUTS, choicesFor, kitFor, nightNow, postNow, scanState, stakesFor, withResponse, type NightInputs, type Orders } from '../src/ui/three/gameModel'

describe('a game through the game’s model (v2.0 R2)', () => {
  it('stops for the hold before the first move, offers answers only while the pool has one, and ends as the engine ends it', () => {
    let holds = 0
    let asked = 0
    for (const seed of SEEDS.slice(0, 24)) {
      let state = game(seed, seed % 2 ? 'easy' : 'standard')
      while (state.status === 'playing') {
        let orders: Orders = NO_PLAN
        for (const c of contactsFor(state, orders)) if (!c.known && scanState(state, orders).left > 0) orders = { ...orders, scans: [...orders.scans, c.id] }
        const contacts = contactsFor(state, orders)
        const want = contacts.find((c) => c.known && !c.debris && c.exposed > 0 && c.favor !== 'unlikely')
        const piece = want && kitFor(state, orders, contacts).find((p) => !p.blocked && !p.risky && p.answers.some((a) => a.contact.id === want.id))
        if (piece) {
          const place = spotFor(state, orders, piece.cm.id) ?? null
          orders = { ...orders, defense: piece.cm.id, place }
          // The post is where tonight's piece is set down, at once.
          expect(postNow(state, orders)).toBe(place ?? undefined)
          expect(stakesFor(state, orders, contactsFor(state, orders), 0).worst).toBeGreaterThanOrEqual(0)
        }
        let inputs: NightInputs = { ...NO_INPUTS, debris: 'burn' }
        const plan = holdTonight(state)
        const first = nightNow(state, orders, inputs)
        expect(first.holdOpen, `seed ${seed} night ${state.turn}`).toBe(!!plan)
        if (plan) {
          holds += 1
          inputs = { ...inputs, hold: rightCall(plan) }
          const settled = nightNow(state, orders, inputs)
          expect(settled.holdOpen).toBe(false)
          expect(settled.night.hold?.ev.right).toBe(true)
        }
        for (;;) {
          const now = nightNow(state, orders, inputs)
          if (now.open < 0) {
            state = now.after
            break
          }
          const step = now.night.steps[now.open]
          // The night asks only while there is an answer to give.
          expect(step.ev.left, `seed ${seed}: asked with the pool empty`).toBeGreaterThan(0)
          const choices = choicesFor(state, orders, inputs, now.open, step)
          const pick = choices.find((c) => c.id !== null && c.fits)
          expect(pick, 'an answer fits while the pool has one').toBeDefined()
          asked += 1
          inputs = withResponse(inputs, now.open, pick!.id)
        }
      }
      expect(timeline(state, inputsOf(state)).at(-1)!.history).toEqual(state.history)
    }
    expect(holds).toBeGreaterThan(50)
    expect(asked).toBeGreaterThan(50)
  })
})

// THE NAME ON SIGHT (v2.0 R3, Ken's ruling of 15 November 2026).
describe('a signature named on sight is identified, and costs no pulse (v2.0 R3)', () => {
  it('identifies exactly the ones named, beside a full scan, and changes no number of the night', () => {
    let named = 0
    for (const seed of SEEDS.slice(0, 30)) {
      let s = game(seed)
      while (s.status === 'playing') {
        const drawn = (planFor(s, s.turn)?.slots ?? []).flatMap((slot) => (slot.fixed ? [] : (slot.drawFrom ?? [])))
        const scans = drawn.slice(0, scanPulses(s))
        const sighted = drawn.slice(scanPulses(s))
        const base: TurnActions = { ...NO_ORDERS, scans, debris: 'burn' }
        const plain = resolveTurn(s, base, turnRng(s.seed, s.turn))
        const seen = resolveTurn(s, { ...base, sighted }, turnRng(s.seed, s.turn))
        const a = plain.history.at(-1)!
        const b = seen.history.at(-1)!
        // The record says what was named and how; a night with none says nothing.
        expect(a.sighted).toBeUndefined()
        expect(b.sighted ?? [], `seed ${seed} night ${s.turn}`).toEqual(sighted)
        expect(b.scanned ?? []).toEqual(scans)
        for (const id of sighted) expect(b.named).toContain(id)
        named += sighted.length
        // Knowledge, not an outcome: the night is the same night.
        expect({ ...b, named: [], sighted: undefined }).toEqual({ ...a, named: [], sighted: undefined })
        expect(seen.credits).toBe(plain.credits)
        expect(seen.meters).toEqual(plain.meters)
        s = seen
      }
    }
    expect(named).toBeGreaterThan(100)
  })

  it('still holds the scan to its pulses, takes a name only for a move on tonight\'s board, and counts one the scan named as the scan\'s', () => {
    // The first night with more signatures than pulses.
    let s = game(3)
    const drawnOn = (g: GameState) => (planFor(g, g.turn)?.slots ?? []).flatMap((slot) => (slot.fixed ? [] : (slot.drawFrom ?? [])))
    while (drawnOn(s).length <= scanPulses(s)) s = resolveTurn(s, { ...NO_ORDERS, debris: 'burn' }, turnRng(s.seed, s.turn))
    const drawn = drawnOn(s)
    expect(s.status).toBe('playing')
    expect(() => resolveTurn(s, { ...NO_ORDERS, scans: drawn, sighted: drawn }, turnRng(s.seed, s.turn))).toThrow(/scans/)
    const rec = resolveTurn(s, { ...NO_ORDERS, scans: drawn.slice(0, 1), sighted: [drawn[0], 'no-such-move', drawn[1]] }, turnRng(s.seed, s.turn)).history.at(-1)!
    expect(rec.scanned).toEqual([drawn[0]])
    expect(rec.sighted).toEqual([drawn[1]])
  })

  it('offers 4 names with the right one among them, the same 4 every time, none of them a move on tonight\'s board, the nearest look-alikes first', () => {
    let offered = 0
    let alike = 0
    const first = new Map<number, number>()
    for (const seed of SEEDS.slice(0, 40)) {
      let s = game(seed)
      while (s.status === 'playing') {
        const contacts = contactsFor(s, NO_PLAN)
        const tonight = contacts.map((c) => c.id)
        for (const c of contacts) {
          expect(canSight(NO_PLAN, c), `${c.id}: a name is offered exactly for an unidentified signature`).toBe(!c.known)
          if (c.known) continue
          const names = sightChoices(s, c)
          expect(names.length).toBe(SIGHT_CHOICES)
          expect(new Set(names).size).toBe(SIGHT_CHOICES)
          expect(names).toContain(c.id)
          expect(sightChoices(s, c)).toEqual(names)
          const others = names.filter((id) => id !== c.id)
          for (const id of others) {
            // Nothing on the board rules a name out: no other name is one
            // of tonight's moves, identified or not.
            expect(tonight, `${c.id}: ${id} is on tonight's board`).not.toContain(id)
            const def = eventById(s.scenario, id)
            expect(def.kind ?? 'threat').toBe('threat')
            expect(def.effect.special).not.toBe('debrisStrike')
          }
          // Look-alikes first: every move of its own kind that is not on
          // the board is offered before any other kind is.
          const sameKind = s.scenario.events.filter((e) => (e.kind ?? 'threat') === 'threat' && e.effect.special !== 'debrisStrike' && e.vector === c.def.vector && e.id !== c.id && !tonight.includes(e.id)).map((e) => e.id)
          const offeredSame = others.filter((id) => sameKind.includes(id)).length
          expect(offeredSame, `${c.id}: a look-alike was passed over`).toBe(Math.min(sameKind.length, SIGHT_CHOICES - 1))
          if (offeredSame > 0) alike += 1
          first.set(names.indexOf(c.id), (first.get(names.indexOf(c.id)) ?? 0) + 1)
          offered += 1
          // Right, it is identified, its card opens, and naming goes on.
          const right = withSight(NO_PLAN, c, c.id)
          expect(contactsFor(s, right).find((x) => x.id === c.id)!.known).toBe(true)
          expect(scanState(s, right).left).toBe(scanState(s, NO_PLAN).left)
          expect(sightOpen(right)).toBe(true)
          // Wrong, it stays unidentified, and naming is over for the
          // night: for this signature and for every other.
          const wrong = withSight(NO_PLAN, c, others[0])
          const after = contactsFor(s, wrong)
          expect(after.find((x) => x.id === c.id)!.known).toBe(false)
          expect(sightOpen(wrong)).toBe(false)
          for (const x of after) expect(canSight(wrong, x), `${x.id} can still be named after a miss`).toBe(false)
          expect(actionsOf(wrong).sighted).toBeUndefined()
          // A scan still identifies it.
          expect(contactsFor(s, { ...wrong, scans: [c.id] }).find((x) => x.id === c.id)!.known).toBe(true)
        }
        s = resolveTurn(s, { ...NO_ORDERS, debris: 'burn' }, turnRng(s.seed, s.turn))
      }
    }
    expect(offered).toBeGreaterThan(400)
    expect(alike / offered, 'a look-alike is among the names on most offers').toBeGreaterThan(0.7)
    // The right name is not always in one place: each of the 4 places
    // holds it on a fair share of the offers.
    for (let i = 0; i < SIGHT_CHOICES; i += 1) expect((first.get(i) ?? 0) / offered, `place ${i + 1}`).toBeGreaterThan(0.15)
  })

  it('replays a game with names on sight to itself, by both readers of the record', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const name of ['preparedSight', 'noviceSight']) {
        const l = line(name)
        const end = play(game(seed), l.policy, l.respond).at(-1)!
        expect(end.history.some((r) => r.sighted?.length), `seed ${seed} ${name}: nothing was named`).toBe(true)
        expect(timeline(end, inputsOf(end)).at(-1)!.history).toEqual(end.history)
        expect(replay(end, ordersOf(end))?.history).toEqual(end.history)
      }
    }
  })
})

// THE RULES' OWN SNAPSHOT (v2.0 R2): 2 fixed-seed games, hashed. After a
// deliberate change to the rules or their numbers, run with
// UPDATE_SNAPSHOTS=1, read the 2 hashes it prints, and edit them in here.
//
// REGENERATED ONCE IN v2.0 R3, for the record's shape and not its play:
// with the pixel board's rules out of the engine an event no longer
// carries `room`, or a `cost` of 0 on its answer. Before the hashes were
// replaced, the engine as R2 shipped it (v2.0/r2, 6a1a1fb) and this one
// were played side by side on the same inputs, 800 games on both
// difficulties and both postures, 4,776 nights with 2,237 answers, 2,380
// holds and 3,200 placements: every night's record matched field for
// field but those two, and every state between. The sweep's table
// (tests/sweep.spec.ts) also reproduces R2's to the decimal.
//
// REGENERATED IN v2.0 R4, for the numbers (Ken's rulings of 15
// November 2026): the placement advice counts the post it gives up, WORST
// CASE holds back what tomorrow is likely to need and no further, and the
// scenario's numbers were re-tuned to the bands (15 meter damage a point,
// 7 recovery and 7 funding a night, 3.5 points for a wrong call).
import { createHash } from 'node:crypto'

describe('the rules replay to a pinned log (v2.0 R2)', () => {
  const hash = (s: GameState) => createHash('sha256').update(JSON.stringify({ seed: s.seed, status: s.status, lossReason: s.lossReason ?? null, placed: s.placed, answersUsed: s.answersUsed ?? 0, history: s.history })).digest('hex')
  it('plays 2 fixed-seed games to the committed hashes', () => {
    const prepared = play(game(20261114), line('prepared').policy, sensible).at(-1)!
    const idle = play(game(4041), line('nothing').policy, () => null).at(-1)!
    const actual = { prepared: hash(prepared), idle: hash(idle) }
    if (process.env.UPDATE_SNAPSHOTS) process.stderr.write(`\nrules snapshot: ${JSON.stringify(actual)}\n`)
    expect(actual).toEqual({ prepared: 'ebcf15d3b3beb917fb1222040918e5cf94c7759dc2816dadb2152e1cecbdc81e', idle: 'f47da29b26b866cbe055e173aa8015f87f369aa520e34c7929a960de3a2e008a' })
    expect(hash(play(game(20261114), line('prepared').policy, sensible).at(-1)!)).toBe(actual.prepared)
  })
})
