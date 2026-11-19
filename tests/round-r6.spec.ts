// v2.0 ROUND 6 (Ken's calls of 18 November 2026): what the round changed,
// held where the engine and the cards can hold it. The night's labels, the
// title's own scroll box and the cards' fit are in the browser, and the
// bot and the layout guard hold those (scripts/game3d-bot.mjs,
// scripts/phone-layout.mjs).
//
//   1. BEGIN's ask carries its reason: the moves that would have to land,
//      what their repairs and the upkeep come to, against what, and that
//      funding arrives after.
//   2. The sum behind WORST CASE is the engine's own: the budget in hand
//      less the worst repairs and the upkeep is the figure, on every night.
//   3. The dawn's ledger is in the order the sums are taken: the bills,
//      the budget they leave, then what arrives.
//   4. A piece chosen on a signature's card sits under that signature
//      whenever the post does as much there as anywhere, and the advice
//      still never raises AT STAKE.
//   5. No reading of the board throws for want of credits: through R5 a
//      signature's card opened with less in the budget than one of its
//      answers costs took the whole game off the screen.

import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { billAfter } from '../src/engine/rules'
import type { Difficulty, GameState } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import { callSigns } from '../src/ui/board/board'
import { nightOf } from '../src/ui/night/nightModel'
import { CallCard, DawnCard, PlanCard } from '../src/ui/three/cards3d'
import * as c3 from '../src/ui/three/copy3d'
import { NO_ORDERS, actionsOf, contactsFor, fixNext, fleetFor, kitFor, spotAdvice, stakesFor, type Orders } from '../src/ui/three/gameModel'
import { coachRun } from '../src/ui/three/runModel'
import * as g3 from '../src/ui/three/guide3d'
import { WATCH, careless, ride, sensible } from './policies'

// Built from their code points, so this file carries neither.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// Every night of a line's games, as the plan opens: the state, and the
// orders the line then gives.
function nights(name: string, difficulty: Difficulty, seeds: number, respond = careless): { state: GameState; after: GameState }[] {
  const line = WATCH.find((w) => w.name === name)!
  const out: { state: GameState; after: GameState }[] = []
  for (let seed = 1; seed <= seeds; seed += 1) {
    let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
    while (state.status === 'playing') {
      const after = playNight(state, line.policy(state), respond)
      out.push({ state, after })
      state = after
    }
  }
  return out
}

describe('BEGIN asks with its reason (v2.0 R6, Ken: the ask carries its reason in plain words)', () => {
  const short = { worst: -2, odds: 0.3, soon: false, risky: false, tonight: 0.3, have: 19, repairs: 9, upkeep: 12, eased: 9, debris: 0 }

  it('says which moves would have to land, what the bills come to against what is in hand, and that funding arrives after', () => {
    const line = g3.riskLine(short, ['Blackout chain', 'an unidentified move'], true, false)
    expect(line).toContain('WORST CASE: 2 CR short.')
    expect(line).toContain('If Blackout chain and an unidentified move land unanswered,')
    expect(line).toContain('repairs (9 CR) and upkeep (12 CR) come out of your 19 CR before funding arrives')
    expect(line).toContain('a budget under 0 ends the operation, whatever the score')
    expect(line).toContain('Possible, not likely (about 3 in 10).')
    // No answer is in hand here, and none is spoken of.
    expect(line).not.toMatch(/answers? /i)
    expect(line.endsWith('Take an order back, or tap BEGIN again.')).toBe(true)
    expect(line).not.toMatch(DASHES)
  })

  it('counts one move as one, three as three, and says what an answer does only to a watch that has one', () => {
    expect(g3.riskLine(short, ['Ransomware'], true, true)).toContain('If Ransomware lands unanswered,')
    expect(g3.riskLine(short, ['2 unidentified moves'], true, true)).toContain('If 2 unidentified moves land unanswered,')
    expect(g3.riskLine(short, ['the debris', 'Insider', 'Ransomware'], true, true)).toContain('If the debris, Insider and Ransomware land unanswered,')
    // WHAT THE ANSWERS LEAVE IS A FIGURE, NOT A HINT. The round's first cut
    // said "An answer cuts a move's repair bill", and two of its three
    // first-time players began on that and lost above the win line.
    expect(g3.riskLine(short, ['Ransomware'], true, true)).not.toContain('An answer cuts')
    // An answer that blocks: the repair goes, and whether that is enough is said.
    expect(g3.riskLine({ ...short, eased: 0 }, ['Ransomware'], true, true)).toContain('With your answers spent, repairs come to 0 CR: the budget holds.')
    // An answer that only halves (the Blackout chain): 13 in hand, 12 of repairs, 10 of upkeep.
    const halved = g3.riskLine({ ...short, worst: -9, odds: 1, soon: true, risky: true, tonight: 1, have: 13, repairs: 12, upkeep: 10, eased: 6 }, ['Blackout chain'], true, true)
    expect(halved).toContain('That is all but certain. With your answers spent, repairs come to 6 CR: 3 CR short still. Take an order back, or tap BEGIN again.')
    // Upkeep alone over the budget: nothing in the night helps, and it says so.
    const sunk = g3.riskLine({ ...short, worst: -15, odds: 1, soon: true, risky: true, tonight: 1, have: 6, repairs: 13, upkeep: 8, eased: 6, debris: 10 }, ['the debris', 'LiDAR dazzle'], true, true)
    expect(sunk).toContain('Upkeep alone is more than you have: nothing in the night can save it.')
    expect(sunk).not.toContain('With your answers')
    // The debris takes no answer: the figure is with a hold on it, and "at most".
    const debris = g3.riskLine({ ...short, worst: -10, tonight: 0.04, have: 18, repairs: 22, upkeep: 6, eased: 12, debris: 10 }, ['the debris', 'Firmware implant'], false, true)
    expect(debris).toContain('Possible, not likely (under 1 in 10). With your answers spent and a hold on the debris, repairs come to at most 12 CR: the budget holds. Nothing is ordered: tap BEGIN again to take the odds.')
    // No answer left: nothing is promised of one; a hold on the debris is still said.
    expect(g3.riskLine(short, ['Ransomware'], true, false)).not.toMatch(/answers? /i)
    expect(g3.riskLine({ ...short, repairs: 16, eased: 12, debris: 10 }, ['the debris', 'Ransomware'], true, false)).toContain('With a hold on the debris, repairs come to at most 12 CR')
    // Marked for tomorrow and only possible tonight: both are said, and the tile's tap agrees.
    expect(g3.riskLine({ ...short, risky: true, odds: 0.7, tonight: 0.04 }, ['Ransomware'], true, false)).toContain('Possible, not likely (under 1 in 10), and likely by tomorrow night.')
    expect(c3.worstNote(-2, true, 0.04, 19, 9, 12, false)).toContain('possible, not likely (under 1 in 10), and likely by tomorrow night, and')
    // An even chance is not called unlikely.
    expect(c3.possibly(0.5)).toBe('an even chance (about 5 in 10)')
    expect(g3.riskLine({ ...short, tonight: 0.5 }, ['Ransomware'], true, false)).toContain('An even chance (about 5 in 10).')
    // Nothing ordered: there is no order to take back, and it is not offered.
    expect(g3.riskLine(short, ['Ransomware'], false, false)).toContain('Nothing is ordered: tap BEGIN again to take the odds.')
    expect(g3.riskLine(short, ['Ransomware'], false, false)).not.toContain('Take an order back')
  })

  it('says upkeep alone when no repair is in the worst night, the likely case as likely, and tomorrow as tomorrow', () => {
    const upkeep = g3.riskLine({ ...short, worst: -3, have: 5, repairs: 0, upkeep: 8, eased: 0 }, [], true, true)
    expect(upkeep).toContain('WORST CASE: 3 CR short. Upkeep (8 CR) comes out of your 5 CR before funding arrives')
    // An answer cuts a repair bill, and there is none in this one (the
    // round's reviewers were told it on a night whose whole bill was upkeep).
    expect(upkeep).not.toContain('With your answers')
    expect(upkeep).toContain('Upkeep alone is more than you have: nothing in the night can save it.')
    // The same figure at a tap on the tile, with its verb in agreement.
    expect(c3.worstNote(-3, true, 1, 5, 0, 8)).toBe('Tonight at its worst, upkeep (8 CR) comes out of 5 CR before funding arrives: likely, and a budget under 0 ends the operation, whatever the score.')
    expect(c3.worstNote(-2, false, 0.3, 19, 9, 12)).toBe('Tonight at its worst, repairs (9 CR) and upkeep (12 CR) come out of 19 CR before funding arrives: possible, not likely (about 3 in 10), and a budget under 0 ends the operation, whatever the score.')
    expect(g3.riskLine({ ...short, odds: 0.7, soon: true, tonight: 0.7 }, ['Ransomware'], true, false)).toContain('That is the likely case (about 7 in 10).')
    expect(g3.riskLine({ ...short, odds: 1, soon: true, tonight: 1 }, ['Ransomware'], true, false)).toContain('That is all but certain.')
    const later = g3.riskLine({ ...short, worst: 7, odds: 0.7, soon: false, tonight: 0 }, [], true, false)
    expect(later).toContain('WORST CASE: 7 CR at dawn. Tonight holds, but tomorrow night')
    expect(later).toContain('come out before its funding')
    expect(later).toContain('likely to take the budget under 0 (about 7 in 10)')
  })
})

describe('an order marked risky says what it would leave and what that has to cover (v2.0 R6)', () => {
  it('gives the sum where tonight is the break, with "up to" where a repair is part of it, and the odds where it is not certain', () => {
    expect(c3.riskyBy({ odds: 1, soon: true, have: 2, repairs: 0, upkeep: 4 })).toBe('Risky: leaves 2 CR for 4 CR of bills before funding')
    expect(c3.riskyBy({ odds: 0.7, soon: true, have: 9, repairs: 9, upkeep: 12 })).toBe('Risky: leaves 9 CR for up to 21 CR of bills before funding, about 7 in 10')
    expect(c3.riskyBy({ odds: 0.7, soon: false, have: 30, repairs: 4, upkeep: 8 })).toBe('Risky: with it the budget is likely to break by tomorrow night, about 7 in 10')
    expect(c3.riskyBy({ odds: 1, soon: false, have: 30, repairs: 4, upkeep: 8 })).toBe('Risky: with it the budget is all but certain to break by tomorrow night')
  })

  it('is the engine\'s own sum on every marked piece and fleet order of 120 games', () => {
    let marked = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const { state } of [...nights('novice', difficulty, 40), ...nights('buyEverything', difficulty, 20, ride)]) {
        const contacts = contactsFor(state, NO_ORDERS)
        for (const p of kitFor(state, NO_ORDERS, contacts)) {
          if (!p.risky) continue
          marked += 1
          const wc = worstCase(state, actionsOf({ ...NO_ORDERS, defense: p.cm.id, place: spotAdvice(state, NO_ORDERS, p.cm.id).best ?? null }))
          expect([p.have, p.repairs, p.upkeep], `seed ${state.seed} night ${state.turn} ${p.cm.id}`).toEqual([wc.remaining, wc.repairs, wc.upkeep])
          if (p.soon) expect(p.have - p.repairs - p.upkeep).toBeLessThan(0)
        }
        for (const f of fleetFor(state, NO_ORDERS)) {
          if (!f.risky) continue
          marked += 1
          const wc = worstCase(state, actionsOf({ ...NO_ORDERS, assets: [f.kind] }))
          expect([f.have, f.repairs, f.upkeep], `seed ${state.seed} night ${state.turn} ${f.kind}`).toEqual([wc.remaining, wc.repairs, wc.upkeep])
        }
      }
    }
    expect(marked, 'nothing was marked, so no sum was checked').toBeGreaterThan(10)
  })
})

describe('the sum behind WORST CASE is the engine\'s own (v2.0 R6)', () => {
  const games = (['standard', 'easy'] as const).flatMap((d) => [...nights('novice', d, 60), ...nights('buyEverything', d, 30, sensible), ...nights('nothing', d, 10, ride)])

  it('reads the figure as what is in hand less the worst repairs and the upkeep, on every night, and names the moves those repairs are', () => {
    let short = 0
    let named = 0
    let exact = 0
    let withBills = 0
    for (const { state } of games) {
      for (const orders of [NO_ORDERS, ...kitFor(state, NO_ORDERS, contactsFor(state, NO_ORDERS)).filter((p) => !p.blocked).slice(0, 3).map((p): Orders => ({ ...NO_ORDERS, defense: p.cm.id, place: spotAdvice(state, NO_ORDERS, p.cm.id).best ?? null }))]) {
        const contacts = contactsFor(state, orders)
        const stakes = stakesFor(state, orders, contacts, 0)
        const wc = worstCase(state, actionsOf(orders))
        const where = `seed ${state.seed} ${state.difficulty} night ${state.turn} ${orders.defense ?? 'no piece'}`
        expect(stakes.have - stakes.repairs - stakes.upkeep, where).toBe(wc.dawn)
        expect(stakes.have, where).toBe(wc.remaining)
        if (stakes.worst < 0) {
          short += 1
          // The tile's figure is how far short that is.
          expect(stakes.worst, where).toBe(stakes.have - stakes.repairs - stakes.upkeep)
        }
        // The moves named are ones COLDVEIL can take, one a track.
        expect(new Set(stakes.by.map((c) => c.slot)).size, where).toBe(stakes.by.length)
        for (const c of stakes.by) expect(c.favor, where).not.toBe('unlikely')
        if (stakes.repairs > 0) {
          withBills += 1
          if (stakes.by.length > 0) named += 1
          // Their repairs come to the figure's, save where a jam that lands
          // earlier the same night arms the chain for a later move: then
          // they come to less, never to more.
          const sum = stakes.by.reduce((n, c) => n + (c.debris ? stakes.repairs : billAfter(c.def, c.exposed, 1, state.difficulty)), 0)
          if (!stakes.by.some((c) => c.debris)) expect(sum, where).toBeLessThanOrEqual(stakes.repairs)
          if (sum === stakes.repairs || stakes.by.some((c) => c.debris)) exact += 1
        }
      }
    }
    // Not vacuous, and the names are the figure's on all but a few nights.
    expect(games.length).toBeGreaterThan(800)
    expect(short, 'no night read short, so the short reading was never checked').toBeGreaterThan(20)
    expect(named).toBe(withBills)
    expect(exact / withBills, `${exact} of ${withBills}`).toBeGreaterThan(0.9)
  })

  it('shows the sum on the plan card where the tile reads short, and says the order at a tap', () => {
    const tight = games.map(({ state }) => ({ state, stakes: stakesFor(state, NO_ORDERS, contactsFor(state, NO_ORDERS), 0) })).find((g) => g.stakes.worst < 0 && !g.stakes.risky)
    expect(tight, 'no night opens short with no mark').toBeTruthy()
    const { state, stakes } = tight!
    const card = (s: typeof stakes) =>
      renderToStaticMarkup(
        createElement(PlanCard, { eyebrow: 'WATCH OFFICER', summary: '', intro: 'The night ahead.', note: '', contacts: contactsFor(state, NO_ORDERS), signs: callSigns(state), stakes: s, scanLeft: 2, scanPulses: 2, answers: 3, answersOf: 3, onPick: () => undefined, lens: null }),
      )
    const html = card(stakes)
    expect(html).toContain('data-t3-sum')
    expect(text(html)).toContain(`${stakes.have} CR must cover ${stakes.repairs + stakes.upkeep} CR of bills before funding. The night ahead.`)
    expect(text(html)).toMatch(/before funding arrives: (possible, not likely|an even chance)/)
    expect(c3.shortSum(19, 21)).toBe('19 CR must cover 21 CR of bills before funding.')
    // A night that reads clear says nothing of the kind.
    const clear = card({ ...stakes, worst: 12, risky: false, asks: false })
    expect(clear).not.toContain('data-t3-sum')
    expect(text(clear)).not.toContain('must cover')
    expect(c3.worstNote(-2, false, 0.3, 19, 9, 12)).not.toMatch(DASHES)
  })
})

describe('the dawn\'s sums are shown in the order they are taken (v2.0 R6)', () => {
  it('puts the bills first, the budget they leave, then what arrives, and the figures are the ledger\'s own', () => {
    let seen = 0
    let insolvent = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const { state, after } of [...nights('novice', difficulty, 25), ...nights('buyEverything', difficulty, 25, ride)]) {
        const night = nightOf(state, after)
        const l = night.record.ledger
        const html = text(renderToStaticMarkup(createElement(DawnCard, { before: state, night, after, signs: callSigns(after), first: createRef<HTMLButtonElement>(), onNext: () => undefined })))
        const where = `seed ${state.seed} ${difficulty} night ${state.turn}: ${html.slice(html.indexOf('Budget'))}`
        expect(html, where).toContain(`Budget ${l.start} CR → ${l.after} CR`)
        const bills = l.ordered || l.fuel || l.windfall || l.repairs || l.upkeep
        const mid = l.start - l.ordered - l.fuel + l.windfall - l.repairs - l.upkeep
        if (l.insolvent) {
          insolvent += 1
          expect(mid, where).toBeLessThan(0)
          expect(html, where).toContain(`= ${mid} CR: under 0 before funding`)
          expect(html, where).not.toContain('Funding +')
          continue
        }
        expect(mid + l.funding + l.coverageBonus, where).toBe(l.after)
        if (bills) {
          seen += 1
          expect(html, where).toContain(`= ${mid} CR, then Funding +${l.funding}`)
          // Nothing that arrives is listed among the bills.
          const sums = html.slice(html.indexOf('Budget'))
          expect(sums.indexOf('Funding +'), where).toBeGreaterThan(sums.indexOf(`= ${mid} CR`))
          if (l.repairs) expect(sums.indexOf(`Repairs -${l.repairs}`), where).toBeLessThan(sums.indexOf(`= ${mid} CR`))
          if (l.upkeep) expect(sums.indexOf(`Upkeep -${l.upkeep}`), where).toBeLessThan(sums.indexOf(`= ${mid} CR`))
        }
        expect(html, where).not.toMatch(DASHES)
      }
    }
    expect(seen).toBeGreaterThan(300)
    expect(insolvent, 'no insolvent dawn was drawn, so that line was never checked').toBeGreaterThan(0)
  })
})

describe('a night BEGIN asked about and that came through is closed at its dawn (v2.0 R6, Ken: asked and survived, still trusts the next ask)', () => {
  it('says the worst did not come, with the repairs the ask was about beside the ones the night left, and says nothing where it would be false', () => {
    const card = (state: GameState, after: GameState, asked?: number) => text(renderToStaticMarkup(createElement(DawnCard, { before: state, night: nightOf(state, after), after, signs: callSigns(after), asked, first: createRef<HTMLButtonElement>(), onNext: () => undefined })))
    const all = [...nights('novice', 'standard', 30), ...nights('buyEverything', 'standard', 30, ride)]
    const ledger = (n: { state: GameState; after: GameState }) => nightOf(n.state, n.after).record.ledger
    const held = all.find((n) => !ledger(n).insolvent && ledger(n).repairs > 0 && ledger(n).windfall === 0 && ledger(n).fuel === 0)!
    const l = ledger(held)
    expect(card(held.state, held.after, l.repairs + 6)).toContain(`BEGIN asked about tonight. The worst did not come: repairs took ${l.repairs} CR, not ${l.repairs + 6}.`)
    // Not asked: nothing is said. The worst came and the budget held: nothing is said.
    expect(card(held.state, held.after)).not.toContain('BEGIN asked')
    expect(card(held.state, held.after, l.repairs)).not.toContain('BEGIN asked')
    // The budget broke: the dawn says these are the bills the ask named.
    const broke = all.find((n) => ledger(n).insolvent)
    expect(broke, 'no night broke the budget').toBeTruthy()
    expect(card(broke!.state, broke!.after, 99)).toContain('BEGIN asked about tonight: these are the bills it named.')
    expect(card(broke!.state, broke!.after)).not.toContain('BEGIN asked')
    expect(c3.askedAndHeld(4, 14, false)).toBe('BEGIN asked about tonight. The worst did not come: repairs took 4 CR, not 14.')
    // The burn's fuel is counted with the repairs, as the ask counted it.
    expect(c3.askedAndHeld(16, 22, true)).toBe('BEGIN asked about tonight. The worst did not come: repairs and fuel took 16 CR, not 22.')
    // A night only a windfall kept solvent says that, and not that the worst stayed away.
    expect(c3.askedAndLucky(25, 4)).toBe('BEGIN asked about tonight. A windfall of 25 CR covered it: without it the bills left the budget 4 CR short.')
    const lucky = all.find((n) => !ledger(n).insolvent && ledger(n).windfall > ledger(n).after - ledger(n).funding - ledger(n).coverageBonus)
    if (lucky) {
      const k = ledger(lucky)
      expect(card(lucky.state, lucky.after, 99)).toContain(`A windfall of ${k.windfall} CR covered it: without it the bills left the budget ${k.windfall - (k.after - k.funding - k.coverageBonus)} CR short.`)
    }
  })

  it('does not call a night clean when it lost the operation or a satellite', () => {
    const card = (state: GameState, after: GameState) => text(renderToStaticMarkup(createElement(DawnCard, { before: state, night: nightOf(state, after), after, signs: callSigns(after), first: createRef<HTMLButtonElement>(), onNext: () => undefined })))
    const all = (['standard', 'easy'] as const).flatMap((d) => [...nights('novice', d, 40), ...nights('buyEverything', d, 40, ride), ...nights('nothing', d, 10, ride)])
    let rough = 0
    let clean = 0
    for (const n of all) {
      const night = nightOf(n.state, n.after)
      const html = card(n.state, n.after)
      if (n.after.status === 'lost' || night.steps.some((s) => s.ev.debris?.lost)) {
        rough += 1
        expect(html, `seed ${n.state.seed} night ${n.state.turn}`).not.toContain('A CLEAN NIGHT')
        expect(html, `seed ${n.state.seed} night ${n.state.turn}`).not.toContain('A QUIET NIGHT')
      } else if (html.includes('A CLEAN NIGHT')) clean += 1
    }
    expect(rough).toBeGreaterThan(50)
    expect(clean, 'no night was ever called clean').toBeGreaterThan(20)
  })
})

describe('the debris call says when a burn is more than the night can spare (v2.0 R6)', () => {
  it('gives what a burn would leave and what that has to cover', () => {
    expect(c3.burnShort(1, 11, false)).toBe('A burn leaves 1 CR for up to 11 CR of bills before funding.')
    expect(c3.burnShort(1, 8, true)).toBe('A burn leaves 1 CR for 8 CR of bills before funding.')
    const html = text(renderToStaticMarkup(createElement(CallCard, { turn: 4, terms: { ssa: false, chance: 0.4, fuel: 10, sat: 'SG-2', bonus: null, review: 6 }, burnRisk: c3.burnShort(1, 11, false), first: createRef<HTMLButtonElement>(), onCall: () => undefined })))
    expect(html).toContain('A burn leaves 1 CR for up to 11 CR of bills before funding.')
    expect(text(renderToStaticMarkup(createElement(CallCard, { turn: 4, terms: { ssa: false, chance: 0.4, fuel: 10, sat: 'SG-2', bonus: null, review: 6 }, first: createRef<HTMLButtonElement>(), onCall: () => undefined })))).not.toContain('A burn leaves')
  })

  it('reads what the answers leave from the engine\'s own bills', () => {
    let eased = 0
    let debris = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const { state } of [...nights('novice', difficulty, 40), ...nights('buyEverything', difficulty, 20, ride)]) {
        const stakes = stakesFor(state, NO_ORDERS, contactsFor(state, NO_ORDERS), 0)
        const where = `seed ${state.seed} ${difficulty} night ${state.turn}`
        expect(stakes.eased, where).toBeGreaterThanOrEqual(0)
        expect(stakes.eased, where).toBeLessThanOrEqual(stakes.repairs)
        expect(stakes.debris, where).toBeLessThanOrEqual(stakes.repairs)
        if (stakes.eased < stakes.repairs) eased += 1
        if (stakes.debris > 0) {
          debris += 1
          expect(stakes.by.some((c) => c.debris), where).toBe(true)
        }
      }
    }
    expect(eased).toBeGreaterThan(100)
    expect(debris).toBeGreaterThan(20)
  })
})

describe('a piece chosen on a signature\'s card sits under it unless the post is worth more elsewhere (v2.0 R6)', () => {
  it('takes the signature\'s own asset whenever the post does as much there, never raises AT STAKE for it, and can say why when it sits elsewhere', () => {
    let chosen = 0
    let under = 0
    let pulled = 0
    let elsewhere = 0
    let why = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const { state } of nights('novice', difficulty, 40)) {
        // Every signature identified, as the cards read once the scan is done.
        const orders: Orders = { ...NO_ORDERS, sighted: contactsFor(state, NO_ORDERS).filter((c) => !c.known).map((c) => c.id) }
        const contacts = contactsFor(state, orders)
        for (const c of contacts) {
          if (c.debris || !c.targetId) continue
          const target = state.assets.find((a) => a.id === c.targetId)!
          for (const a of c.answers) {
            const piece = kitFor(state, orders, contacts).find((p) => p.cm.id === a.cm.id)!
            if (piece.blocked) continue
            const where = `seed ${state.seed} ${difficulty} night ${state.turn} ${a.cm.id} against ${c.id}`
            // A defense can always sit on the asset its own threat strikes.
            expect(piece.domain, where).toContain(target.kind)
            const plain = spotAdvice(state, orders, a.cm.id)
            const near = spotAdvice(state, orders, a.cm.id, c.targetId)
            chosen += 1
            // The promise of R4 stands: where the plain advice does not
            // raise AT STAKE, neither does the piece set under its signature.
            if (!plain.raises) expect(near.raises, where).toBe(false)
            expect(near.after, where).toBeGreaterThanOrEqual(Math.min(plain.after, near.before) - 0.05)
            if (near.best === c.targetId) {
              under += 1
              if (plain.best !== c.targetId) pulled += 1
            } else {
              elsewhere += 1
              // It sits elsewhere only because the plain advice does too.
              expect(near.best, where).toBe(plain.best)
              // The move its post is worth most under is named when the
              // watch has identified one there.
              if (near.under) {
                why += 1
                expect(near.under.targetId, where).toBe(near.best)
                expect(near.under.known, where).toBe(true)
              }
            }
          }
        }
      }
    }
    expect(chosen).toBeGreaterThan(500)
    // It changes something, and it does not change everything.
    expect(pulled, 'the signature\'s own asset was never preferred').toBeGreaterThan(20)
    expect(elsewhere, 'the post was never worth more elsewhere').toBeGreaterThan(20)
    expect(why / elsewhere, `${why} of ${elsewhere}`).toBeGreaterThan(0.9)
    // MEASURED over these nights with every signature identified: under
    // its own signature 427 times, elsewhere 787. Elsewhere is the common
    // case, because the piece itself covers the move it was chosen
    // against, so the post is worth least exactly there. Setting it down
    // under its signature regardless would be the plain thing to do, and
    // it costs games: Prepared placing each piece under the move it was
    // bought for wins 46.0 percent on STANDARD against 86.2 at the spot,
    // and 88.0 on EASY against 100.0 (placing at random, 42.2 and 78.2;
    // tests/sweep.spec.ts). So the piece goes where it does most and the
    // game says why.
    expect(under).toBeGreaterThan(200)
  })

  it('says where it went and why, and says the post moves when it does', () => {
    // Where it went is said first: a phone shows 2 lines before a tap.
    expect(g3.sitsElse('Zero trust', 'GS-1', 'SG-R1', 'Uplink jamming')).toBe('Zero trust sits on SG-R1, not GS-1: it covers the whole fleet from any asset, and its post does most under Uplink jamming.')
    expect(g3.sitsElse('Zero trust', 'GS-1', 'SG-R1')).toBe('Zero trust sits on SG-R1, not GS-1: it covers the whole fleet from any asset, and its post does most there.')
    expect(g3.postMovesThere('KESTREL-1')).toBe('The watch post moves there from KESTREL-1: a strike there is 1 weaker.')
    expect(g3.postMoves('KESTREL-1', 'SG-R1')).toBe('The watch post moves from KESTREL-1 to SG-R1 with your newest defense: a strike there is 1 weaker.')
    expect(c3.placeNote('KESTREL-1')).toBe('It covers the whole fleet. Where it sits becomes the watch post (now on KESTREL-1): any strike on that asset is 1 weaker.')
    expect(c3.placeNote()).toBe('It covers the whole fleet. Where it sits becomes the watch post: any strike on that asset is 1 weaker.')
    expect(c3.placeNote('KESTREL-1', true)).toBe('It covers the whole fleet. Nothing is aimed where it can sit tonight, so any spot serves. Where it sits becomes the watch post (now on KESTREL-1).')
  })
})

describe('no reading of the board throws for want of credits (v2.0 R6: a blank screen on a poor night)', () => {
  it('reads every piece on every night at any budget, a signature\'s card and the dawn\'s FIX NEXT among them', () => {
    const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
    let read = 0
    let poor = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const { state, after } of nights('novice', difficulty, 12)) {
        for (const credits of [0, 3, 7, 11, state.credits]) {
          const s = { ...state, credits }
          const where = `seed ${state.seed} ${difficulty} night ${state.turn} with ${credits} CR`
          const contacts = contactsFor(s, NO_ORDERS)
          const kit = kitFor(s, NO_ORDERS, contacts)
          for (const cm of DEFAULT_SCENARIO.countermeasures) {
            if (s.counters.includes(cm.id)) continue
            if (cm.cost > credits) poor += 1
            // What a signature's card asks of each piece that answers it.
            expect(() => contactsFor(s, { ...NO_ORDERS, defense: cm.id }), where).not.toThrow()
            expect(() => spotAdvice(s, NO_ORDERS, cm.id, contacts[0]?.targetId), where).not.toThrow()
            // A piece the budget cannot pay for is still not on offer.
            if (cm.cost > credits) expect(kit.find((p) => p.cm.id === cm.id)?.blocked, where).toBe('budget')
            read += 1
          }
          expect(() => stakesFor(s, NO_ORDERS, contacts, 0), where).not.toThrow()
        }
        // The dawn's advice, on the budget the night left and on none.
        if (after.status === 'playing') for (const credits of [0, 4, after.credits]) expect(() => fixNext({ ...after, credits }, threats), `the dawn of seed ${state.seed} night ${state.turn} with ${credits} CR`).not.toThrow()
      }
    }
    expect(read).toBeGreaterThan(3000)
    expect(poor, 'no piece was ever out of reach, so the poor night was never read').toBeGreaterThan(1000)
    // And the ghost of a game that ended poor still plays.
    const end = nights('buyEverything', 'standard', 6, ride).filter((n) => n.after.status !== 'playing')
    expect(end.length).toBe(6)
    for (const { after } of end) expect(() => coachRun(after), `the ghost of seed ${after.seed}`).not.toThrow()
  })
})
