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

  it('says which moves the worst is, what the bills come to against what is in hand, and that funding arrives after', () => {
    const line = g3.riskLine(short, ['Blackout chain', 'an unidentified move'], true, false)
    expect(line).toBe(
      'WORST CASE: 2 CR short. At the worst, with Blackout chain and an unidentified move landing unanswered, repairs (9 CR) and upkeep (12 CR) come out of your 19 CR before funding arrives, and a budget under 0 ends the operation, whatever the score. That is possible, not likely (about 3 in 10). Take an order back, or tap BEGIN again.',
    )
    expect(line).not.toMatch(DASHES)
    // The moves are named as the worst, not as tonight's: the costliest on
    // a track is not always the one that comes (the second cut's reader
    // took "If Insider and Data poisoning land" for a forecast).
    expect(g3.riskLine(short, ['Ransomware'], true, false)).toContain('At the worst, with Ransomware landing unanswered,')
    expect(g3.riskLine(short, ['the debris', 'Insider', 'Ransomware'], true, false)).toContain('At the worst, with the debris, Insider and Ransomware landing unanswered,')
    // Nothing ordered: there is no order to take back, and it is not offered, nor hinted that one would help.
    expect(g3.riskLine(short, ['Ransomware'], false, false).endsWith('There is no order to take back: tap BEGIN again.')).toBe(true)
  })

  it('says what the answers leave as a figure, and never hints that an answer is a way out', () => {
    // WHAT THE ANSWERS LEAVE IS A FIGURE. The round's first cut said "An
    // answer cuts a move's repair bill", and two of its three first-time
    // players began on that and lost above the win line.
    for (const answers of [true, false]) expect(g3.riskLine(short, ['Ransomware'], true, answers)).not.toContain('An answer cuts')
    // An answer that blocks: the repair goes, and that it is enough is said.
    expect(g3.riskLine({ ...short, eased: 0 }, ['Ransomware'], true, true)).toContain('With every move that lands answered, the worst leaves 0 CR of repairs and the budget holds. Take an order back')
    // An answer that only halves (the Blackout chain on 13 CR): the desktop
    // reviewer's night 6, which it lost by 3 CR.
    const halved = g3.riskLine({ ...short, worst: -9, odds: 1, soon: true, risky: true, tonight: 1, have: 13, repairs: 12, upkeep: 10, eased: 6 }, ['Blackout chain'], true, true)
    expect(halved).toContain('Even with every move that lands answered, the worst leaves 6 CR of repairs, 3 CR short. Played that way it is all but certain. Take an order back, or tap BEGIN again.')
    // THE CHANCE IS THE CHANCE WITH THE ANSWERS PLAYED, and says so: said
    // bare, the reader took it for the odds whatever was done.
    const played = g3.riskLine({ ...short, worst: -9, tonight: 0.33, have: 14, repairs: 13, upkeep: 10, eased: 7 }, ['Blackout chain', 'Ransomware'], false, true)
    expect(played).toContain('Even with every move that lands answered, the worst leaves 7 CR of repairs, 3 CR short. Played that way it is possible, not likely (about 3 in 10).')
    // The debris takes no answer: the figure is with a hold on it.
    const debris = g3.riskLine({ ...short, worst: -10, tonight: 0.04, have: 18, repairs: 22, upkeep: 6, eased: 12, debris: 10 }, ['the debris', 'Firmware implant'], false, true)
    expect(debris).toContain('With every move that lands answered and a hold on the debris, the worst leaves 12 CR of repairs and the budget holds.')
    // No answer left: nothing is said of one; a hold on the debris still is.
    expect(g3.riskLine(short, ['Ransomware'], true, false)).not.toMatch(/answer(s|ed) /i)
    expect(g3.riskLine({ ...short, worst: -9, repairs: 16, eased: 12, debris: 10 }, ['the debris', 'Ransomware'], true, false)).toContain('Even with a hold on the debris, the worst leaves 12 CR of repairs, 5 CR short. Played that way it is possible, not likely (about 3 in 10).')
  })

  it('says upkeep alone as a certainty, the likely case as likely, tomorrow as tomorrow, and an even chance as that', () => {
    // Upkeep over the budget: no chance is quoted and no odds are offered
    // (the Mobile Safari reviewer's night 4; "all but certain" and "take
    // the odds" beside it read as a contradiction to the second cut's reader).
    const sunk = g3.riskLine({ ...short, worst: -15, odds: 1, soon: true, risky: true, tonight: 1, have: 6, repairs: 13, upkeep: 8, eased: 6, debris: 10 }, ['the debris', 'LiDAR dazzle'], true, true)
    expect(sunk).toBe('WORST CASE: 15 CR short. Upkeep (8 CR) alone is more than your 6 CR, and it comes out before funding arrives: a budget under 0 ends the operation, whatever the score. Nothing in the night can change that. Take an order back.')
    expect(g3.riskLine({ ...short, worst: -12, odds: 1, soon: true, risky: true, tonight: 1, have: 6, repairs: 10, upkeep: 8, eased: 0 }, ['Insider'], false, true).endsWith('There is no order to take back: tap BEGIN again.')).toBe(true)
    expect(g3.riskLine({ ...short, odds: 0.7, soon: true, tonight: 0.7 }, ['Ransomware'], true, false)).toContain('That is the likely case (about 7 in 10).')
    // Marked for tomorrow and only possible tonight: both are said, and the tile's tap agrees.
    expect(g3.riskLine({ ...short, risky: true, odds: 0.7, tonight: 0.04 }, ['Ransomware'], true, false)).toContain('That is possible, not likely (under 1 in 10), and likely by tomorrow night.')
    expect(c3.worstNote(-2, true, 0.04, 19, 9, 12, false)).toContain('possible, not likely (under 1 in 10), and likely by tomorrow night, and')
    // An even chance is not called unlikely.
    expect(c3.possibly(0.5)).toBe('an even chance (about 5 in 10)')
    expect(g3.riskLine({ ...short, tonight: 0.5 }, ['Ransomware'], true, false)).toContain('That is an even chance (about 5 in 10).')
    // The tile's tap, with its verb in agreement.
    expect(c3.worstNote(-3, true, 1, 5, 0, 8)).toBe('Tonight at its worst, upkeep (8 CR) comes out of 5 CR before funding arrives: likely, and a budget under 0 ends the operation, whatever the score.')
    expect(c3.worstNote(-2, false, 0.3, 19, 9, 12)).toBe('Tonight at its worst, repairs (9 CR) and upkeep (12 CR) come out of 19 CR before funding arrives: possible, not likely (about 3 in 10), and a budget under 0 ends the operation, whatever the score.')
    const later = g3.riskLine({ ...short, worst: 7, odds: 0.7, soon: false, tonight: 0 }, [], true, false)
    expect(later).toContain('WORST CASE: 7 CR at dawn. Tonight holds, but tomorrow night')
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
    expect(card(held.state, held.after, l.repairs + 6)).toContain(`BEGIN asked about tonight. The budget held: repairs took ${l.repairs} CR, not the ${l.repairs + 6} it warned of.`)
    // Not asked: nothing is said. The worst came and the budget held: nothing is said.
    expect(card(held.state, held.after)).not.toContain('BEGIN asked')
    expect(card(held.state, held.after, l.repairs)).not.toContain('BEGIN asked')
    // The budget broke: the dawn says these are the bills the ask named.
    const broke = all.find((n) => ledger(n).insolvent)
    expect(broke, 'no night broke the budget').toBeTruthy()
    expect(card(broke!.state, broke!.after, 99)).toContain('BEGIN asked about tonight: these are the bills it named.')
    expect(card(broke!.state, broke!.after)).not.toContain('BEGIN asked')
    expect(c3.askedAndHeld(4, 14, false)).toBe('BEGIN asked about tonight. The budget held: repairs took 4 CR, not the 14 it warned of.')
    // The burn's fuel is counted with the repairs, as the ask counted it.
    expect(c3.askedAndHeld(16, 22, true)).toBe('BEGIN asked about tonight. The budget held: repairs and fuel took 16 CR, not the 22 it warned of.')
    // An answer or a ride the budget cannot spare says so on the choice.
    expect(c3.overRoom(4)).toBe('Only 4 CR to spare before funding.')
    expect(c3.overRoom(-2)).toBe('Only 0 CR to spare before funding.')
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
