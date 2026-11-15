// THE POLICY ENGINE'S HOLDS (v2.0 R2, Ken's mechanic of 14 November
// 2026: the human tie-break). On some nights the fleet's automated
// defense stops one of the fleet's own actions, and the player overrides
// the block or lets it stand. Sometimes the machine is right (the asset
// was compromised) and sometimes it is wrong (a false positive that costs
// the mission). Dealt from a stream of its own, so adding them moved no
// other draw. Which nights a seed's holds fall on, and whether each is a
// compromise, are the seed's alone: two players on one Daily Op are asked
// on the same nights and the same call is right. Which asset is held, and
// on what action, is drawn from the fleet as it stands that night, so a
// player who ordered another drone may see the hold on it.
//
// THE DEAL. A game has Scenario.holdCount of them, on nights drawn from night 2 to
// the last (night 1 is the first watch's, and has enough to learn). At
// least one is a compromise and at least one a false positive, so a
// player who always overrides and one who never does are each wrong at
// least once a game: the sweep holds both under the player who reads the
// evidence (tests/sweep.spec.ts).
//
// THE EVIDENCE SETTLES IT. A hold shows three checks. On a false positive
// every check reads clean: the rule tripped on something unusual and
// everything that can be verified verifies. On a compromise one or two
// read dirty. So the right call is always on the screen, and never a
// coin: override when every check is clean, let the block stand when one
// is not.
//
// WHAT A WRONG CALL COSTS. Each hold's template names the meter its action
// served. Overriding a compromise corrupts it; letting a false positive
// stand starves it, the fleet's own defense having denied its own
// mission. Either is Scenario.holdStake points of score at STANDARD, scaled
// like every other damage on EASY. (Measured: with a false positive
// charged to link availability, which a careful fleet keeps at its cap,
// the nightly recovery gave the points back and letting every block stand
// won within 1.2 points of reading the evidence.) No credits move, so
// WORST CASE is untouched.

import { mulberry32, type Rng } from './rng'
import { scaled } from './rules'
import { maiRaw, maiScore } from './scoring'
import type { GameState, HoldCall, HoldPlan, HoldTemplate, ResolvedHold } from './types'

const HOLD_SALT = 0x7b1e4c35
const stream = (seed: number, n: number): Rng => mulberry32((Math.imul(seed ^ HOLD_SALT, 2654435761) ^ Math.imul(n + 1, 40503)) >>> 0)

// The nights a seed's holds fall on, with whether each is a compromise.
export function holdNights(scenario: GameState['scenario'], seed: number): Map<number, boolean> {
  const out = new Map<number, boolean>()
  const count = Math.min(scenario.holdCount, scenario.totalTurns - 1)
  if (!scenario.holds.length || count <= 0) return out
  const r = stream(seed, 0)
  const nights: number[] = []
  for (let t = 2; t <= scenario.totalTurns; t += 1) nights.push(t)
  for (let i = nights.length - 1; i > 0; i -= 1) {
    const j = r.int(i + 1)
    ;[nights[i], nights[j]] = [nights[j], nights[i]]
  }
  const chosen = nights.slice(0, count).sort((a, b) => a - b)
  // One of each first, in a drawn order, then a coin for the rest.
  const truths = chosen.map((_, i) => (i === 0 ? true : i === 1 ? false : r.chance(0.5)))
  for (let i = truths.length - 1; i > 0; i -= 1) {
    const j = r.int(i + 1)
    ;[truths[i], truths[j]] = [truths[j], truths[i]]
  }
  chosen.forEach((t, i) => out.set(t, truths[i]))
  return out
}

// The order a seed takes its templates in, so the holds of one game are
// different actions (the first reviewer of the round met the same relay
// switch twice, word for word). The k-th hold takes the k-th template of
// this order that some live asset can carry.
function templateOrder(scenario: GameState['scenario'], seed: number): HoldTemplate[] {
  const out = [...scenario.holds]
  const r = stream(seed, 97)
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = r.int(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const holdTemplate = (scenario: GameState['scenario'], id: string): HoldTemplate | undefined => scenario.holds.find((h) => h.id === id)

// Tonight's hold, when the seed deals one and an asset it can be raised
// on is alive. Read from the state alone, so the presentation can show it
// before the night resolves.
export function holdTonight(state: Pick<GameState, 'scenario' | 'seed' | 'turn' | 'assets'>): HoldPlan | undefined {
  const nights = holdNights(state.scenario, state.seed)
  const compromised = nights.get(state.turn)
  if (compromised === undefined) return undefined
  const r = stream(state.seed, state.turn)
  const live = state.assets.filter((a) => a.integrity > 0)
  const order = templateOrder(state.scenario, state.seed)
  const k = [...nights.keys()].sort((a, b) => a - b).indexOf(state.turn)
  let template: HoldTemplate | undefined
  for (let i = 0; i < order.length && !template; i += 1) {
    const t = order[(k + i) % order.length]
    if (live.some((a) => t.kinds.includes(a.kind))) template = t
  }
  if (!template) return undefined
  const kinds = template.kinds
  const pool = live.filter((a) => kinds.includes(a.kind))
  const asset = pool[r.int(pool.length)]
  const dirty: number[] = []
  if (compromised) {
    const first = r.int(3)
    dirty.push(first)
    // One time in three a second check fails too.
    if (r.chance(1 / 3)) dirty.push((first + 1 + r.int(2)) % 3)
    dirty.sort((a, b) => a - b)
  }
  return { template: template.id, assetId: asset.id, compromised, dirty }
}

// The right call: override a false positive, let a compromise's block stand.
export const rightCall = (plan: Pick<HoldPlan, 'compromised'>): HoldCall => (plan.compromised ? 'stand' : 'override')

// What a wrong call takes from the meters, as the template names them.
function wrongDamage(state: GameState, plan: HoldPlan): { meter: 'dataIntegrity' | 'sensorIntegrity'; amount: number } {
  const w = state.scenario.maiWeights
  const total = w.coverage + w.linkAvailability + w.dataIntegrity + w.sensorIntegrity
  const meter = holdTemplate(state.scenario, plan.template)?.meter ?? 'dataIntegrity'
  return { meter, amount: scaled((state.scenario.holdStake * total) / w[meter], state.difficulty) }
}

// Resolve tonight's hold on the state, in place, with the player's call.
export function resolveHold(state: GameState, plan: HoldPlan, call: HoldCall | null | undefined): ResolvedHold {
  const made: HoldCall | 'none' = call === 'override' || call === 'stand' ? call : 'none'
  const overridden = made === 'override'
  const right = plan.compromised ? !overridden : overridden
  const scoreBefore = maiScore(state)
  const before = maiRaw(state)
  const { meter, amount } = wrongDamage(state, plan)
  const was = state.meters[meter]
  state.meters[meter] = Math.max(0, was - amount)
  const wrongLoss = before - maiRaw(state)
  if (right) state.meters[meter] = was
  const round1 = (n: number) => Math.round(n * 10) / 10
  return { ...plan, call: made, right, cost: right ? 0 : round1(wrongLoss), saved: right ? round1(wrongLoss) : 0, scoreBefore, scoreAfter: maiScore(state) }
}
