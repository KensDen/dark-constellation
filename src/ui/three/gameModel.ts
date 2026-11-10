// THE 3D GAME'S MODEL (v2.0 R1). The whole six-turn game, played through
// the real engine: nothing here decides an outcome, it only asks the
// engine and reads its record. Pure, so the suite can hold it
// (tests/game3d.spec.ts) and the scene can be thrown away.
//
// What the player holds before a night is three things: the SCAN (which of
// tonight's signatures the watch has identified), the KIT (one new defense
// placed on an asset, and any assets ordered), and then, in the night, an
// answer and a timed tap for each move. All of it is engine input
// (TurnActions), so a seed and the player's inputs replay exactly.

import { adversaryPicks } from '../../engine/adversary'
import { planFor } from '../../engine/campaign'
import { newGame, resolveTurn } from '../../engine/reducer'
import { answered, responseOptions, type ResponseOption } from '../../engine/responses'
import { turnRng } from '../../engine/rng'
import {
  ASSET_DAMAGE_PER_SEVERITY,
  DEPLOY_TURNS,
  METER_DAMAGE_PER_SEVERITY,
  RESPONSE_DAMAGE_SHARE,
  TIMING_BONUS,
  billAfter,
  briefFree,
  chainBonusOf,
  countersAfter,
  debrisTarget,
  exposedOf,
  gnssDenied,
  mitigationOf,
  orderCost,
  scaled,
  scanPulses,
} from '../../engine/rules'
import { COVERAGE_PER_KIND } from '../../engine/scoring'
import type { Asset, AssetKind, Countermeasure, CountermeasureId, DebrisChoice, GameState, Layer, ResolvedEvent, ThreatEvent, TimingGrade, TurnActions } from '../../engine/types'
import { worstCase } from '../../engine/worstCase'
import { stopVerb } from '../board/boardModel'
import { nightOf, type Night, type NightStep } from '../night/nightModel'

// ------------------------------------------------------------- the inputs

// Tonight's orders: at most one new defense (the engine's rule), the asset
// kinds ordered, one of each at most, and the signatures scanned.
export interface Orders {
  defense: CountermeasureId | null
  assets: AssetKind[]
  scans: string[]
}
export const NO_ORDERS: Orders = { defense: null, assets: [], scans: [] }

// The night's answers so far: a response or null for each move reached, a
// timed tap's grade for each, and the debris call once it is made.
export interface NightInputs {
  responses: (string | null)[]
  timing: (TimingGrade | 0)[]
  debris: DebrisChoice | null
}
export const NO_INPUTS: NightInputs = { responses: [], timing: [], debris: null }

export function actionsOf(orders: Orders, inputs?: NightInputs): TurnActions {
  return {
    buyAssets: orders.assets.map((kind) => ({ kind })),
    buyCounters: orders.defense ? [orders.defense] : [],
    intelBrief: false,
    scans: [...orders.scans],
    ...(inputs ? { responses: [...inputs.responses], timing: [...inputs.timing], debris: inputs.debris ?? 'hold' } : {}),
  }
}

export const resolve = (state: GameState, orders: Orders, inputs: NightInputs = NO_INPUTS): GameState =>
  resolveTurn(state, actionsOf(orders, inputs), turnRng(state.seed, state.turn))

const lastEvents = (after: GameState): ResolvedEvent[] => after.history[after.history.length - 1].events

export const eventDef = (state: GameState, id: string): ThreatEvent => state.scenario.events.find((e) => e.id === id) as ThreatEvent
export const defenseDef = (state: GameState, id: CountermeasureId): Countermeasure => state.scenario.countermeasures.find((c) => c.id === id) as Countermeasure
export const assetById = (state: GameState, id: string | undefined): Asset | undefined => (id === undefined ? undefined : state.assets.find((a) => a.id === id))
const tenth = (n: number) => Math.round(n * 10) / 10

// ------------------------------------------------------------ the pieces

// A defense by the short name on its piece; the formal name stays in the
// Dossier and on the cards that teach.
export const PIECE: Record<CountermeasureId, string> = {
  antiJam: 'Anti-jam',
  linkAuth: 'Link auth',
  pntAuth: 'PNT auth',
  sensorFusion: 'Sensor fusion',
  tierAAttestation: 'Attestation',
  mlPipelineIntegrity: 'ML integrity',
  groundZeroTrust: 'Zero trust',
  insiderProgram: 'Least privilege',
  ssaManeuver: 'Tracking + fuel',
  encryptedBackhaul: 'Encryption',
  irRetainer: 'IR retainer',
}

const KINDS_ON: Record<Layer, AssetKind[]> = { ORBIT: ['sat', 'rpoSat'], AIR: ['drone'], GROUND: ['groundStation'] }

// WHERE A DEFENSE GOES: the kinds of asset on the layers its threats
// strike. The rules own a defense fleet-wide the moment it is ordered;
// where the piece sits is the player's, and says where the defense lives.
export function domainOf(state: GameState, id: CountermeasureId): AssetKind[] {
  const cm = defenseDef(state, id)
  const out = new Set<AssetKind>()
  for (const ev of state.scenario.events) if (cm.counters.includes(ev.id)) for (const l of ev.layers) for (const k of KINDS_ON[l]) out.add(k)
  if (out.size === 0) out.add('groundStation')
  return [...out]
}

// The gesture a response is made with in the world. Every response can
// also be dragged onto its target as a piece, and tapped on its card.
export type Gesture = 'reroute' | 'isolate' | 'shield'
const REROUTE = new Set(['backup-nav', 'backup-link', 'reroute', 'primary-only'])
const ISOLATE = new Set(['isolate-reflash', 'suspend-account', 'link-down', 'segment-restore', 'ground-squadron', 'stop-clear', 'revoke-reset', 'abort-approach', 'hold-retrain', 'limit-audit', 'hold-commands', 'holding-pattern'])
export const gestureOf = (responseId: string): Gesture => (REROUTE.has(responseId) ? 'reroute' : ISOLATE.has(responseId) ? 'isolate' : 'shield')

// ----------------------------------------------------------- the contacts

// A SIGNATURE IN THE THEATER, BEFORE THE NIGHT: one of the moves a track
// could play tonight. Unidentified until the scan names it (or it is a
// fixed slot, CONFIRMED, or an allied feed covers the night); its look is
// its own either way, so a player who has learned the look needs no pulse.
export type Favor = 'confirmed' | 'likely' | 'either' | 'unlikely'
export interface Answer {
  cm: Countermeasure
  verb: 'stops' | 'blunts' | 'answers'
  owned: boolean
  ordered: boolean
}
export interface Contact {
  id: string
  // Its track, which is its slot and its place in the night.
  slot: number
  def: ThreatEvent
  fixed: boolean
  debris: boolean
  known: boolean
  // The asset it shows over: the one the engine will strike when this is
  // the move played, and otherwise one of the kind it strikes.
  targetId: string | undefined
  strength: number
  mitigation: number
  exposed: number
  // What COLDVEIL does with it, read against the defenses as ordered.
  favor: Favor
  // About what it costs the score if it lands as it stands, ridden out.
  loss: number
  answers: Answer[]
}

export const allied = (state: Pick<GameState, 'turn' | 'briefFreeThrough'>): boolean => state.turn > 1 && briefFree(state)

// About what a move costs the score at a strength on a target: the
// engine's own arithmetic for a hit (meter damage on each meter it names,
// and its target's share of the coverage), to one decimal.
export function estimateLoss(state: GameState, def: ThreatEvent, exposed: number, target: Asset | undefined): number {
  if (exposed <= 0) return 0
  const w = state.scenario.maiWeights
  const total = w.coverage + w.linkAvailability + w.dataIntegrity + w.sensorIntegrity
  let loss = 0
  for (const m of def.effect.meters) loss += Math.min(state.meters[m], scaled(METER_DAMAGE_PER_SEVERITY * exposed, state.difficulty)) * w[m]
  if (target && def.effect.assetDamage !== false) loss += (Math.min(target.integrity, scaled(ASSET_DAMAGE_PER_SEVERITY * exposed, state.difficulty)) * COVERAGE_PER_KIND[target.kind] * w.coverage) / 100
  return -tenth(loss / total)
}

function standIn(state: GameState, def: ThreatEvent, nth: number): Asset | undefined {
  const live = state.assets.filter((a) => a.integrity > 0 && def.layers.includes(a.layer))
  const preferred = def.prefersKinds ? live.filter((a) => def.prefersKinds!.includes(a.kind)) : []
  const pool = preferred.length ? preferred : live
  return pool.length ? pool[nth % pool.length] : undefined
}

export function contactsFor(state: GameState, orders: Orders): Contact[] {
  const actions = actionsOf(orders)
  const counters = countersAfter(state, actions)
  const reads = adversaryPicks(state, counters)
  const events = lastEvents(resolve(state, orders))
  const denied = gnssDenied(state.conditions, state.scenario)
  const everything = allied(state)
  const out: Contact[] = []
  reads.forEach((read, slot) => {
    read.candidates.forEach((c, nth) => {
      const def = eventDef(state, c.id)
      const debris = def.effect.special === 'debrisStrike'
      const played = events[slot]?.eventId === c.id ? events[slot] : undefined
      const target = debris ? debrisTarget(state) : (assetById(state, played?.targetAssetId) ?? standIn(state, def, slot + nth))
      const strength = def.baseSeverity + (played ? played.chainBonus : chainBonusOf(def, denied))
      const mitigation = mitigationOf(def, counters)
      const exposed = debris ? 0 : Math.max(0, strength - mitigation)
      out.push({
        id: c.id,
        slot,
        def,
        fixed: read.fixed,
        debris,
        known: read.fixed || everything || orders.scans.includes(c.id),
        targetId: target?.id,
        strength,
        mitigation,
        exposed,
        favor: read.fixed ? 'confirmed' : read.least.length === 1 && read.least[0] === c.id ? 'likely' : read.least.includes(c.id) ? 'either' : 'unlikely',
        loss: debris ? 0 : estimateLoss(state, def, exposed, target),
        answers: def.counters.map((id) => {
          const verb = stopVerb(id, def)
          return { cm: defenseDef(state, id), verb, owned: state.counters.includes(id), ordered: orders.defense === id }
        }),
      })
    })
  })
  return out
}

// The scan as it stands: pulses the watch has tonight, and those left.
export function scanState(state: GameState, orders: Orders): { pulses: number; left: number } {
  const pulses = scanPulses(state)
  return { pulses, left: Math.max(0, pulses - orders.scans.length) }
}
export const canScan = (state: GameState, orders: Orders, contact: Contact): boolean => !contact.known && scanState(state, orders).left > 0

// ---------------------------------------------------------------- the kit

export interface KitPiece {
  cm: Countermeasure
  // Why it cannot be placed tonight, when it cannot.
  blocked: 'owned' | 'budget' | null
  ordered: boolean
  // Placing it tonight would leave WORST CASE below 0: a night that went
  // as badly as it can would break the budget.
  risky: boolean
  // The identified signatures tonight it answers, and what it does to each.
  answers: { contact: Contact; verb: Answer['verb'] }[]
  domain: AssetKind[]
}

// The budget tonight's orders leave, with one more order priced in.
export const remaining = (state: GameState, orders: Orders): number => state.credits - orderCost(state, actionsOf(orders))

export function kitFor(state: GameState, orders: Orders, contacts: readonly Contact[]): KitPiece[] {
  // What the budget would be with tonight's defense set aside, so a piece
  // that would replace it is priced against the right figure.
  const free = remaining(state, { ...orders, defense: null })
  const pieces = state.scenario.countermeasures.map((cm): KitPiece => {
    const owned = state.counters.includes(cm.id)
    const answers = contacts.filter((c) => c.known && c.def.counters.includes(cm.id)).map((c) => ({ contact: c, verb: stopVerb(cm.id, c.def) }))
    const blocked = owned ? ('owned' as const) : cm.cost > free ? ('budget' as const) : null
    const risky = !blocked && worstCase(state, actionsOf({ ...orders, defense: cm.id })).value < 0
    return { cm, blocked, ordered: orders.defense === cm.id, risky, answers, domain: domainOf(state, cm.id) }
  })
  // In the catalog's own order, every night: a tray that reshuffled itself
  // after each scan could not be learned (the round's fresh-eyes review).
  // The pieces that answer what the scan has named are lit, not moved.
  return pieces
}

export interface FleetPiece {
  kind: AssetKind
  price: number
  eta: number
  ordered: boolean
  fits: boolean
  risky: boolean
}
const FLEET_ORDER: AssetKind[] = ['drone', 'groundStation', 'sat', 'rpoSat']
export function fleetFor(state: GameState, orders: Orders): FleetPiece[] {
  return FLEET_ORDER.map((kind) => {
    const ordered = orders.assets.includes(kind)
    const price = state.scenario.prices[kind]
    const fits = ordered || price <= remaining(state, orders)
    const risky = fits && !ordered && worstCase(state, actionsOf({ ...orders, assets: [...orders.assets, kind] })).value < 0
    return { kind, price, eta: DEPLOY_TURNS[kind], ordered, fits, risky }
  })
}

// THE STAKES, said before the night so a point of score has a face: what
// tonight could take at most (each track's costliest move as the defenses
// stand, the unidentified ones counted), and what the budget reads if the
// night goes as badly as it can (the engine's WORST CASE).
export interface Stakes {
  score: number
  line: number
  atStake: number
  worst: number
  remaining: number
}
export function stakesFor(state: GameState, orders: Orders, contacts: readonly Contact[], score: number): Stakes {
  const bySlot = new Map<number, number>()
  for (const c of contacts) bySlot.set(c.slot, Math.min(bySlot.get(c.slot) ?? 0, c.loss))
  const atStake = tenth([...bySlot.values()].reduce((n, v) => n + v, 0))
  const wc = worstCase(state, actionsOf(orders))
  return { score, line: state.scenario.winThreshold, atStake, worst: wc.value, remaining: wc.remaining }
}

// --------------------------------------------------------------- the night

// THE NIGHT, AS FAR AS IT HAS BEEN ANSWERED. The engine resolves the whole
// night with the answers so far; the first step still waiting on the
// player (the debris call, or a move's response) is where it stands.
export interface NightNow {
  after: GameState
  night: Night
  // The step waiting on the player, or -1 when every choice is made.
  open: number
}

export function nightNow(state: GameState, orders: Orders, inputs: NightInputs): NightNow {
  const after = resolve(state, orders, inputs)
  const events = lastEvents(after)
  const open = events.findIndex((ev, i) => (ev.debris ? !!ev.debris.assetId && inputs.debris === null : ev.room !== undefined && inputs.responses[i] === undefined))
  return { after, night: nightOf(state, after), open }
}

// One answer the night offers, with what the engine says it would do.
export interface Choice {
  // null rides it out.
  id: string | null
  effect: 'block' | 'halve' | 'ride'
  gesture: Gesture | null
  cost: number
  fits: boolean
  why?: 'used' | 'budget'
  // What it has to fit in the room: its price and the repair it leaves.
  need: number
  // The score's change and the repair bill under this answer.
  score: number
  repair: number
}

export function choicesFor(state: GameState, orders: Orders, inputs: NightInputs, index: number, step: NightStep): Choice[] {
  const outcome = (id: string | null) => {
    const ev = lastEvents(resolve(state, orders, { ...inputs, responses: answered(inputs.responses, index, id) }))[index]
    return { score: tenth(ev.scoreAfter - ev.scoreBefore), repair: ev.repairCost }
  }
  const options: ResponseOption[] = responseOptions(step.def, step.ev, state.difficulty)
  return [
    ...options.map((o): Choice => {
      const need = o.cost + billAfter(step.def, exposedOf(step.ev), RESPONSE_DAMAGE_SHARE[o.effect], state.difficulty)
      return { id: o.id, effect: o.effect, gesture: gestureOf(o.id), cost: o.cost, fits: o.fits, why: o.why, need, ...(o.fits ? outcome(o.id) : { score: 0, repair: 0 }) }
    }),
    { id: null, effect: 'ride', gesture: null, cost: 0, fits: true, need: 0, ...outcome(null) },
  ]
}

export const withResponse = (inputs: NightInputs, index: number, id: string | null): NightInputs => ({ ...inputs, responses: answered(inputs.responses, index, id) })
export function withTiming(inputs: NightInputs, index: number, grade: TimingGrade | 0): NightInputs {
  const timing: (TimingGrade | 0)[] = []
  for (let k = 0; k < index; k += 1) timing.push(inputs.timing[k] ?? 0)
  timing.push(grade)
  return { ...inputs, timing }
}

// How a step ended, in one word the scene and the cards both read.
export type Verdict = 'blocked' | 'halved' | 'partial' | 'hit'
export function verdictOf(ev: ResolvedEvent): Verdict {
  if (ev.effectiveSeverity === 0) return 'blocked'
  if (ev.response?.effect === 'halve') return 'halved'
  return ev.mitigation > 0 ? 'partial' : 'hit'
}
// Who stopped a blocked move: the response taken tonight, or a defense.
export const blockedBy = (ev: ResolvedEvent): 'response' | 'defense' => (ev.response?.effect === 'block' ? 'response' : 'defense')

// THE TIMED TAP'S GRADE from how far off the moment it came, in seconds.
// Generous on purpose: a third of a second either side still counts.
export const PERFECT_WINDOW_S = 0.14
export const GOOD_WINDOW_S = 0.34
export const gradeTap = (offBy: number | null): TimingGrade | 0 => (offBy === null ? 0 : Math.abs(offBy) <= PERFECT_WINDOW_S ? 2 : Math.abs(offBy) <= GOOD_WINDOW_S ? 1 : 0)
// With Reduce Motion or Assist on there is no tap to time: every move
// takes the good grade, a fixed modest rate (src/engine/rules.ts).
export const ASSIST_GRADE: TimingGrade = 1
// Whether a tap can do anything to a move: it takes damage off one that
// lands and pays back a response that blocked one; a move a defense holds
// has nothing for it to improve, so the ring is not shown there.
export const tapMatters = (ev: ResolvedEvent): boolean => ev.effectiveSeverity > 0 || ev.response?.effect === 'block'

// What a timed tap did, for the card: the share it took off a hit, or the
// credits a clean block paid back; nothing on a move a defense held.
// `saved` is the score the tap kept, measured: the same night with no tap
// on this move. Damage is whole numbers, so a tap's share can round to
// more than its rate or to nothing, and the card says what it did.
export function tapLine(ev: ResolvedEvent, assist = false, saved?: number): string {
  if (!ev.timing) return ''
  if (!ev.refund && ev.effectiveSeverity === 0) return ''
  const word = assist ? 'ASSIST' : ev.timing === 2 ? 'PERFECT' : 'GOOD'
  if (ev.refund) return `${word} · +${ev.refund} CR back`
  if (saved !== undefined) return saved >= 0.05 ? `${word} · braced, saved ${saved.toFixed(1)}` : `${word} · braced, nothing to save this time`
  if (ev.effectiveSeverity > 0) return `${word} · braced, ${TIMING_BONUS[ev.timing] * 100}% less damage`
  return word
}

// --------------------------------------------------------- the conditions

// Which assets a live condition sits on: every live asset on the layers
// its event strikes. The engine keeps a condition on its layers; the world
// shows it on the links and assets there.
export function conditionsOn(state: GameState): Map<string, { eventId: string; name: string; left: number }[]> {
  const out = new Map<string, { eventId: string; name: string; left: number }[]>()
  for (const c of state.conditions) {
    const def = eventDef(state, c.eventId)
    for (const a of state.assets) {
      if (a.integrity <= 0 || !def.layers.includes(a.layer)) continue
      out.set(a.id, [...(out.get(a.id) ?? []), { eventId: c.eventId, name: c.name, left: c.remainingTurns }])
    }
  }
  return out
}

export const chainArmed = (state: GameState): boolean => gnssDenied(state.conditions, state.scenario)
export const chainTonight = (state: GameState): boolean => (planFor(state, state.turn)?.slots ?? []).some((s) => s.fixed === 'blackout-chain')

// ------------------------------------------------------- the whole record

// Each turn's inputs as the record has them, as the engine takes them:
// read from the events' own fields, so a record replays to itself.
export function inputsOf(state: GameState): TurnActions[] {
  const kindOf = (id: string) => /^t\d+-([A-Za-z]+)-\d+$/.exec(id)?.[1] as AssetKind | undefined
  return state.history.map((r, t) => {
    const buyCounters = state.scenario.countermeasures.filter((c) => r.purchases.some((p) => p.startsWith(`${c.name} (`))).map((c) => c.id)
    // The assets ordered that turn, by the ids the engine gave them.
    const ids = new Set<string>()
    for (const later of state.history.slice(t)) for (const id of later.ledger.arrivals) if (id.startsWith(`t${r.turn}-`)) ids.add(id)
    for (const p of state.pipeline) if (p.id.startsWith(`t${r.turn}-`)) ids.add(p.id)
    for (const a of state.assets) if (a.id.startsWith(`t${r.turn}-`)) ids.add(a.id)
    const buyAssets = [...ids].sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop())).flatMap((id) => (kindOf(id) ? [{ kind: kindOf(id) as AssetKind }] : []))
    const debris = r.events.find((e) => e.debris)?.debris?.choice
    return {
      buyAssets,
      buyCounters,
      intelBrief: r.purchases.some((p) => p.startsWith('Intel brief (')),
      ...(debris ? { debris } : {}),
      responses: r.events.map((e) => e.response?.id ?? null),
      timing: r.events.map((e) => e.timing ?? 0),
      scans: r.scanned ?? [],
    }
  })
}

// The game played from its seed with these inputs: every state on the way,
// the opening first. Stops where the engine refuses a turn.
export function timeline(state: GameState, inputs: readonly TurnActions[]): GameState[] {
  const out = [newGame(state.scenario, state.seed, state.difficulty, state.posture)]
  try {
    for (let t = 0; out[out.length - 1].status === 'playing' && t < state.scenario.totalTurns; t += 1) {
      const s = out[out.length - 1]
      out.push(resolveTurn(s, inputs[t] ?? { buyAssets: [], buyCounters: [], intelBrief: false, scans: [] }, turnRng(s.seed, s.turn)))
    }
  } catch {
    // The run so far stands.
  }
  return out
}

// THE NIGHTS OF A RUN, for the after-action replay: each night as the
// night's own model reads it, between the states either side.
export function nightsOf(states: readonly GameState[]): Night[] {
  const out: Night[] = []
  for (let t = 1; t < states.length; t += 1) out.push(nightOf(states[t - 1], states[t]))
  return out
}

// THE WATCH THAT HAS SEEN IT BEFORE: a careful line for the ghost run when
// the debrief has no single change to show. Each night it places the
// defense that answers the move COLDVEIL favors on the first track that
// needs one, while WORST CASE stays at 0 or more, takes the strongest
// answer the budget meets, and burns when the fuel is safe.
function coachOrders(state: GameState): TurnActions {
  let actions: TurnActions = { buyAssets: [], buyCounters: [], intelBrief: false, scans: [] }
  const denied = gnssDenied(state.conditions, state.scenario)
  for (const read of adversaryPicks(state, state.counters)) {
    const def = eventDef(state, read.least[0])
    if (def.effect.special === 'debrisStrike') continue
    if (def.baseSeverity + chainBonusOf(def, denied) - mitigationOf(def, state.counters) <= 0) continue
    const id = def.counters.find((c) => !state.counters.includes(c))
    if (!id) continue
    const next = { ...actions, buyCounters: [id] }
    if (state.credits - orderCost(state, next) >= 0 && worstCase(state, next).value >= 0) {
      actions = next
      break
    }
  }
  const debris = (planFor(state, state.turn)?.slots ?? []).some((s) => s.fixed === 'debris-conjunction')
  return debris ? { ...actions, debris: worstCase(state, actions).value >= 0 ? 'burn' : 'hold' } : actions
}

export function coachRun(state: GameState): GameState[] {
  const out = [newGame(state.scenario, state.seed, state.difficulty, state.posture)]
  while (out[out.length - 1].status === 'playing') {
    const s = out[out.length - 1]
    const actions = coachOrders(s)
    let responses: (string | null)[] = []
    let after = resolveTurn(s, { ...actions, responses }, turnRng(s.seed, s.turn))
    for (;;) {
      const events = lastEvents(after)
      const i = events.findIndex((ev, k) => ev.room !== undefined && responses[k] === undefined)
      if (i < 0) break
      const pick = responseOptions(eventDef(s, events[i].eventId), events[i], s.difficulty).find((o) => o.fits)?.id ?? null
      responses = answered(responses, i, pick)
      after = resolveTurn(s, { ...actions, responses }, turnRng(s.seed, s.turn))
    }
    out.push(after)
  }
  return out
}

export const finalScore = (states: readonly GameState[]): number => states[states.length - 1].history[states[states.length - 1].history.length - 1]?.maiScore ?? 0

// What a run ordered on a night, by short piece name, for the replay.
export function placedOn(night: Night): CountermeasureId[] {
  return night.closing.counters.filter((c) => !night.before.counters.includes(c))
}

export { answered, exposedOf }
