// WORST CASE (v1.3 brief 6.4, critique row M9; loosened in v2.0 R4; the
// morning's figure and a mark that is right more often than not since
// v2.0 R5). Two readings of one night, from one function:
//
//   THE FIGURE (the plan card's tile): what tomorrow morning's budget
//   reads if tonight goes as badly as COLDVEIL can make it.
//
//     dawn    = remaining - worstRepairs - upkeep
//     morning = dawn + funding + the coverage bonus, as that night leaves it
//
//   remaining is the budget less tonight's orders. worstRepairs is the
//   largest repair bill the moves COLDVEIL can take could leave, with no
//   answer spent and the post counted where it stands (a strike aimed at
//   its asset lands a point weaker, whatever COLDVEIL plays); on the
//   debris night the larger of the burn's fuel and the loss review, since
//   the player may choose either. upkeep is the
//   upkeep on every defense owned once the orders land. Nothing else takes
//   credits between EXECUTE and the solvency check (condition pressure
//   costs meters, an opportunity only pays), so a night whose `dawn` reads
//   0 or more cannot close insolvent: tests/sweep.spec.ts holds that over
//   500 seeds of every line on both difficulties. Under 0, the tile says
//   how far short, and the operation would end there.
//
//   THE MARK (a piece marked risky, BEGIN AT RISK): `risky`, raised when a
//   broken budget is MORE LIKELY THAN NOT by the close of tomorrow night
//   with nothing more ordered (`odds` above one half). Tonight and
//   tomorrow are each played every way they can go: COLDVEIL draws evenly
//   among the moves the defenses cover least (src/engine/adversary.ts),
//   the watch spends the answers it still holds on the moves that land,
//   in order, and on a debris night the watch makes the call that breaks
//   the budget less often. The night after tomorrow is not read: the player sees this
//   again before it, with that night's moves in sight.
//
// THE HISTORY OF THE RULE, each step measured over Prepared's 500 games on
// STANDARD (3,000 nights, 25,500 pieces the budget could buy), every mark
// ignored once and the game then played on inside the guard:
//   - R3: the costliest move on every track, and the worst bill of every
//     night to come held back. 30.8 percent of the pieces were marked, on
//     1 night in 3, and of 1,231 marks ignored none ended insolvent. The
//     round's reviewer was warned off an 8 CR piece with 62 CR in the bank.
//   - R4 (Ken's ruling of 15 November 2026: warn only when the risk is
//     real): the moves COLDVEIL can take, and tomorrow's average held
//     back. 3.6 percent of pieces on 1 night in 15; 38 of 183 ignored
//     ended insolvent, 1 in 5. Both of that round's first-time players
//     were still warned on nights 4 to 6 and finished solvent: "it became
//     noise". Part of it was the figure itself, the budget BEFORE the
//     night's funding and coverage bonus, up to 17 CR under the budget
//     they then saw at dawn.
//   - R5, first (Ken's ruling of 17 November 2026: read the morning's
//     figure): R4's rule on the morning's figure, the funding and the
//     coverage bonus counted and the post's point with them, marking a
//     night that reads short or one whose morning would not cover
//     tomorrow's average bills. At R5's numbers: 261 pieces (1.0 percent)
//     on 1 night in 24, and 137 of 261 ignored ended insolvent, 52.5
//     percent: a coin. A first-time player who spends freely (a piece
//     every night, no eye on the tile) met it on nights 4 to 6 in 46 games
//     of 500 and finished solvent in 20 of them; on EASY, where a first
//     game is played, in 9 games, and in 5 of them.
//   - R5, as it stands (the same ruling: if it still cries wolf, tighten
//     it until a mark is right more often than not): the mark reads the
//     odds. 77 pieces (0.3 percent) on 1 night in 58, and all 77 ignored
//     ended insolvent. The free spender meets it in 20 games of 500 and
//     finishes solvent in none; on EASY in 4, and in none.
//     tests/advice.spec.ts holds the mark to more than half and prints
//     the table.
// WHAT THE TIGHTENING COSTS. A night can read short on the tile with no
// mark raised: the worst case is possible there, and not likely. Over the
// same games 184 pieces (0.7 percent) read so, and bought anyway 60 of
// them ended insolvent, 1 in 3. The tile says it, in amber; BEGIN does not
// ask twice. A player who watches only the marks can end an operation on
// such a night: of the free spender's 26 insolvent games on STANDARD, 6
// came with no mark ever raised (none did under the first rule). The
// sweep's careful lines (tests/policies.ts, `safe`) read both, the tile at
// 0 or more and no mark, and none goes insolvent on a night the tile
// cleared. And nothing is held back for tomorrow until tomorrow is more
// likely than not to break the budget, so a line that spends to the edge
// every night (a drone a night while nothing is marked) now can: 46 games
// of 500.
//
// One function; the plan card, the sweep's lines and the battery all call
// it (brief 6.4).

import {
  ASSET_DAMAGE_PER_SEVERITY,
  DEBRIS_LOSS_CHANCE,
  DEPLOY_TURNS,
  HARDEN,
  RESPONSE_DAMAGE_SHARE,
  aimOf,
  answersLeft,
  billAfter,
  burnFuel,
  chainBonusOf,
  countersAfter,
  debrisTarget,
  eventById,
  fundingOf,
  gnssDenied,
  lossReviewBill,
  mitigationOf,
  newDefenses,
  orderCost,
  postOf,
  scaled,
} from './rules'
import { planFor } from './campaign'
import { COVERAGE_PER_KIND, METER_CAP, coverage } from './scoring'
import type { CountermeasureId, DebrisChoice, GameState, TurnActions } from './types'

export interface WorstCase {
  remaining: number
  // Tonight's worst repair bills, and the upkeep on every defense owned.
  repairs: number
  upkeep: number
  // The budget at tonight's solvency check on the worst night: under 0
  // ends the operation.
  dawn: number
  // Tomorrow morning's budget on that night, funding and the coverage
  // bonus in: the tile's figure. (`dawn` itself when that is under 0.)
  morning: number
  // The chance tonight's close breaks the budget, and the chance it is
  // broken by tomorrow night's close with nothing more ordered.
  tonight: number
  odds: number
  // More likely than not: the mark.
  risky: boolean
  // What tomorrow night is likely to need: its average repair bills with
  // no answer spent, and the upkeep. 0 on the last night. Not part of the
  // mark; a line that keeps more in hand than the game asks reads it
  // (tests/policies.ts, keeping).
  later: number
  // One figure for a line that reads both: `dawn`, and under 0 whenever
  // the mark is up. 0 or more is a night that cannot close insolvent and
  // is not marked.
  value: number
}

// The mark is raised above this chance.
export const RISK_BAR = 0.5

// The moves COLDVEIL can play on each of a night's tracks at these
// defenses: a fixed slot's one event, and on a drawn slot the candidates
// the defenses mitigate least, which is the set its pick is drawn from
// (src/engine/adversary.ts, adversaryPicks).
export function movesOpen(state: Pick<GameState, 'scenario' | 'seed'>, turn: number, counters: readonly CountermeasureId[]): string[][] {
  return (planFor(state, turn)?.slots ?? []).map((slot) => {
    if (slot.fixed) return [slot.fixed]
    const ids = slot.drawFrom ?? []
    const cover = ids.map((id) => mitigationOf(eventById(state.scenario, id), counters))
    const floor = Math.min(...cover)
    return ids.filter((_, i) => cover[i] === floor)
  })
}

// One way a night can go: its chance, the repair bills it leaves, the
// coverage its strikes take off the fleet (lost) or off station (off),
// whether GNSS denial is live after it, and the answers the watch has left.
interface Way {
  p: number
  bills: number
  lost: number
  off: number
  denied: boolean
  answers: number
  // What is left of the asset the post stands on: a strike aimed there
  // lands a point weaker only while it stands.
  post: number
}

// Every way a night can go at these defenses. `answers` is how many the
// watch spends, on the moves that land, in order (0 reads the night with
// none); `post` is the asset the post stands on. Each move is aimed where
// it is aimed as the night begins (rules.ts, aimOf); one that would re-aim
// because an earlier strike tonight took its target out is read where it
// was aimed, which can only miss a point the post would have taken off.
function waysOf(state: GameState, turn: number, counters: readonly CountermeasureId[], denied: boolean, answers: number, debris: DebrisChoice, post?: string): Way[] {
  const { scenario, difficulty } = state
  const at = { seed: state.seed, turn, assets: state.assets }
  let ways: Way[] = [{ p: 1, bills: 0, lost: 0, off: 0, denied, answers, post: state.assets.find((a) => a.id === post)?.integrity ?? 0 }]
  movesOpen(state, turn, counters).forEach((ids, slot) => {
    const next: Way[] = []
    for (const w of ways) {
      for (const id of ids) {
        const ev = eventById(scenario, id)
        const p = w.p / ids.length
        if (ev.effect.special === 'debrisStrike') {
          const sat = debrisTarget(state)
          const covers = sat ? (COVERAGE_PER_KIND[sat.kind] * sat.integrity) / 100 : 0
          if (!sat) next.push({ ...w, p })
          else if (debris === 'burn') next.push({ ...w, p, bills: w.bills + burnFuel(counters.includes('ssaManeuver')), off: w.off + covers })
          else {
            next.push({ ...w, p: p * DEBRIS_LOSS_CHANCE, bills: w.bills + lossReviewBill(ev, difficulty), lost: w.lost + covers, post: sat.id === post ? 0 : w.post })
            next.push({ ...w, p: p * (1 - DEBRIS_LOSS_CHANCE) })
          }
          continue
        }
        const strength = Math.max(0, ev.baseSeverity + chainBonusOf(ev, w.denied) - mitigationOf(ev, counters))
        const target = strength > 0 ? aimOf(at, slot, ev) : undefined
        const exposed = Math.max(0, strength - (target && target.id === post && w.post > 0 ? HARDEN : 0))
        const answer = exposed > 0 && w.answers > 0 ? ev.responses?.[0] : undefined
        const share = answer ? RESPONSE_DAMAGE_SHARE[answer.effect] : 1
        const struck = ev.effect.assetDamage !== false && exposed > 0 && share > 0 ? target : undefined
        const damage = struck ? Math.min(struck.integrity, scaled(ASSET_DAMAGE_PER_SEVERITY * exposed * share, difficulty)) : 0
        next.push({
          p,
          bills: w.bills + billAfter(ev, exposed, share, difficulty),
          lost: w.lost + (struck ? (COVERAGE_PER_KIND[struck.kind] * damage) / 100 : 0),
          off: w.off,
          denied: w.denied || (ev.effect.special === 'jamsGnss' && !!ev.condition && exposed > 0 && share > 0),
          answers: w.answers - (answer ? 1 : 0),
          post: struck && struck.id === post ? w.post - damage : w.post,
        })
      }
    }
    ways = next
  })
  return ways
}

export function worstCase(state: GameState, actions: TurnActions): WorstCase {
  const { scenario } = state
  const counters = countersAfter(state, actions)
  const remaining = state.credits - orderCost(state, actions)
  const upkeep = counters.length * scenario.upkeepPerDefense
  const funding = fundingOf(state)
  const last = state.turn >= scenario.totalTurns
  // The fleet at tonight's close: what flies now and what arrives tonight.
  const arriving = [...state.pipeline.filter((p) => p.etaTurns <= 1), ...actions.buyAssets.filter((b) => DEPLOY_TURNS[b.kind] <= 1)]
  const fleet = coverage(state.assets) + arriving.reduce((n, a) => n + COVERAGE_PER_KIND[a.kind], 0)
  const income = (w: Way) => funding + (Math.min(METER_CAP, fleet - w.lost - w.off) >= scenario.slaBonus.coverageMin ? scenario.slaBonus.credits : 0)
  const deniedNow = gnssDenied(state.conditions, scenario)
  // Denial that is still live tomorrow whatever tonight does.
  const deniedNext = gnssDenied(state.conditions.filter((c) => c.remainingTurns > 1), scenario)
  const debrisOn = (turn: number) => (planFor(state, turn)?.slots ?? []).some((s) => s.fixed && eventById(scenario, s.fixed).effect.special === 'debrisStrike')
  const calls = (turn: number, given?: DebrisChoice): DebrisChoice[] => (debrisOn(turn) ? (given ? [given] : ['burn', 'hold']) : ['hold'])

  // The post is where tonight's new defense is set down, or where it
  // stands already; a new piece not yet set down has none.
  const fresh = newDefenses(state, actions)[0]
  const set = fresh ? actions.placeOn?.[fresh] : undefined
  const post = fresh ? (state.assets.some((a) => a.id === set && a.integrity > 0) ? set : undefined) : postOf(state)

  // THE FIGURE: tonight every way it can go, with no answer spent and
  // either call on a debris night.
  let dawn = Infinity
  let morning = Infinity
  for (const call of calls(state.turn)) {
    for (const w of waysOf(state, state.turn, counters, deniedNow, 0, call, post)) {
      const at = remaining - w.bills - upkeep
      dawn = Math.min(dawn, at)
      morning = Math.min(morning, at < 0 ? at : at + income(w))
    }
  }

  // THE MARK: the chance the budget is under 0 at tonight's close, or at
  // tomorrow's with nothing more ordered.
  const held = answersLeft(state)
  const seen = new Map<string, Way[][]>()
  const tomorrow = (denied: boolean, answers: number): Way[][] => {
    const key = `${denied}:${answers}`
    let ways = seen.get(key)
    if (!ways) seen.set(key, (ways = calls(state.turn + 1).map((call) => waysOf(state, state.turn + 1, counters, denied, answers, call, post))))
    return ways
  }
  let tonight = 1
  let odds = 1
  for (const call of calls(state.turn, actions.debris)) {
    let now = 0
    let both = 0
    for (const w of waysOf(state, state.turn, counters, deniedNow, held, call, post)) {
      const at = remaining - w.bills - upkeep
      if (at < 0) {
        now += w.p
        both += w.p
        continue
      }
      if (last) continue
      const open = at + income(w)
      let least = 1
      for (const ways of tomorrow(w.denied || deniedNext, w.answers)) least = Math.min(least, ways.reduce((n, t) => n + (open - t.bills - upkeep < 0 ? t.p : 0), 0))
      both += w.p * least
    }
    // The call that breaks the budget less often is the one the watch makes.
    if (both < odds || (both === odds && now < tonight)) {
      odds = both
      tonight = now
    }
  }
  const risky = odds > RISK_BAR
  const later = last ? 0 : Math.ceil(Math.min(...calls(state.turn + 1).map((call) => waysOf(state, state.turn + 1, counters, deniedNext, 0, call).reduce((n, t) => n + t.p * t.bills, 0))) + upkeep)
  return { remaining, repairs: remaining - upkeep - dawn, upkeep, dawn, morning, tonight, odds, risky, later, value: risky ? Math.min(-1, dawn) : dawn }
}
