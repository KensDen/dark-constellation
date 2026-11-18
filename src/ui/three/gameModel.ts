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
import { holdTonight, rightCall } from '../../engine/holds'
import { newGame, resolveTurn } from '../../engine/reducer'
import { answered, responseOptions, type ResponseOption } from '../../engine/responses'
import { turnRng } from '../../engine/rng'
import {
  ASSET_DAMAGE_PER_SEVERITY,
  DEPLOY_TURNS,
  HARDEN,
  TIMING_BONUS,
  aimOf,
  briefFree,
  chainBonusOf,
  countersAfter,
  debrisTarget,
  domainOf as domainKinds,
  exposedOf,
  gnssDenied,
  meterDamageOf,
  mitigationOf,
  orderCost,
  postOf,
  scaled,
  scanPulses,
} from '../../engine/rules'
import { COVERAGE_PER_KIND } from '../../engine/scoring'
import type { Asset, AssetKind, Countermeasure, CountermeasureId, DebrisChoice, GameState, HoldCall, ResolvedEvent, ThreatEvent, TimingGrade, TurnActions } from '../../engine/types'
import { RISK_BAR, worstCase } from '../../engine/worstCase'
import { stopVerb } from '../board/boardModel'
import { nightOf, type Night, type NightStep } from '../night/nightModel'

// ------------------------------------------------------------- the inputs

// Tonight's orders: at most one new defense (the engine's rule), the asset
// kinds ordered, one of each at most, and the signatures scanned.
export interface Orders {
  defense: CountermeasureId | null
  // The asset tonight's defense is set down on (v2.0 R2): it hardens it.
  place?: string | null
  assets: AssetKind[]
  scans: string[]
  // THE NAME ON SIGHT (v2.0 R3): the signatures named right from their
  // look tonight, and the one named wrong, which ended naming for the night.
  sighted?: string[]
  missed?: string[]
}
export const NO_ORDERS: Orders = { defense: null, place: null, assets: [], scans: [] }

// The night's answers so far: a response or null for each move reached, a
// timed tap's grade for each, and the debris call once it is made.
export interface NightInputs {
  responses: (string | null)[]
  timing: (TimingGrade | 0)[]
  debris: DebrisChoice | null
  // THE TIE-BREAK (v2.0 R2): the call on tonight's hold. Absent until the
  // hold is settled; 'none' when the clock ran out and the block stood.
  hold?: HoldCall | 'none'
}
export const NO_INPUTS: NightInputs = { responses: [], timing: [], debris: null }

export function actionsOf(orders: Orders, inputs?: NightInputs): TurnActions {
  return {
    buyAssets: orders.assets.map((kind) => ({ kind })),
    buyCounters: orders.defense ? [orders.defense] : [],
    scans: [...orders.scans],
    ...(orders.sighted?.length ? { sighted: [...orders.sighted] } : {}),
    ...(orders.defense && orders.place ? { placeOn: { [orders.defense]: orders.place } } : {}),
    ...(inputs ? { responses: [...inputs.responses], timing: [...inputs.timing], debris: inputs.debris ?? 'hold', tiebreak: inputs.hold === 'override' || inputs.hold === 'stand' ? inputs.hold : null } : {}),
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

// WHERE A DEFENSE GOES: the kinds of asset on the layers its threats
// strike (the engine's rule: rules.ts, domainOf). A defense covers the
// fleet against its moves wherever it sits; the asset the newest one sits
// on is the watch's post, and a strike there is 1 point weaker (rules.ts,
// postOf).
export const domainOf = (state: GameState, id: CountermeasureId): AssetKind[] => domainKinds(state.scenario, id)

// The post as tonight's orders leave it: where tonight's piece is set
// down, and otherwise where it already stands.
export function postNow(state: GameState, orders: Orders): string | undefined {
  if (orders.defense && !state.counters.includes(orders.defense)) return orders.place ?? undefined
  return postOf(state)
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
  // The point its target's own defense takes off (v2.0 R2).
  hardened: number
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
  for (const m of def.effect.meters) loss += Math.min(state.meters[m], scaled(meterDamageOf(state) * exposed, state.difficulty)) * w[m]
  if (target && def.effect.assetDamage !== false) loss += (Math.min(target.integrity, scaled(ASSET_DAMAGE_PER_SEVERITY * exposed, state.difficulty)) * COVERAGE_PER_KIND[target.kind] * w.coverage) / 100
  return -tenth(loss / total)
}

export function contactsFor(state: GameState, orders: Orders): Contact[] {
  const actions = actionsOf(orders)
  const counters = countersAfter(state, actions)
  const reads = adversaryPicks(state, counters)
  const events = lastEvents(resolve(state, orders))
  const denied = gnssDenied(state.conditions, state.scenario)
  const everything = allied(state)
  const post = postNow(state, orders)
  const out: Contact[] = []
  reads.forEach((read, slot) => {
    read.candidates.forEach((c) => {
      const def = eventDef(state, c.id)
      const debris = def.effect.special === 'debrisStrike'
      const played = events[slot]?.eventId === c.id ? events[slot] : undefined
      // A signature's target is its own, whatever is ordered (rules.ts,
      // aimOf): it stays where it was sighted.
      const target = debris ? debrisTarget(state) : aimOf(state, slot, def)
      const strength = def.baseSeverity + (played ? played.chainBonus : chainBonusOf(def, denied))
      const mitigation = mitigationOf(def, counters)
      const hardened = debris || !target || post !== target.id ? 0 : Math.min(HARDEN, Math.max(0, strength - mitigation))
      const exposed = debris ? 0 : Math.max(0, strength - mitigation - hardened)
      out.push({
        id: c.id,
        slot,
        def,
        fixed: read.fixed,
        debris,
        known: read.fixed || everything || orders.scans.includes(c.id) || !!orders.sighted?.includes(c.id),
        targetId: target?.id,
        strength,
        mitigation,
        hardened,
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

// THE NAME ON SIGHT (v2.0 R3; the rule is in src/engine/rules.ts). Every
// signature has a look of its own, so a player who knows the look can name
// an unidentified one and spend no pulse. The game offers SIGHT_CHOICES
// names: its own and others it could be mistaken for. A right name
// identifies it, and the player may go on naming; THE FIRST WRONG NAME ENDS
// NAMING FOR THE NIGHT, so a name is a risk taken and not a free guess.
//
// AS FIRST BUILT IT WAS A GIVEAWAY, and the round's first-time reviewer
// showed it: 3 names, one try a signature, the other names drawn from the
// whole deck. A player with an empty Dossier named 11 of 12, because 2 of
// the 3 names were usually moves already identified on tonight's board
// (elimination), and the third was nothing like the look. So:
//   - no other name is a move on tonight's board, identified or not, so
//     nothing on screen rules a name out;
//   - the others are the moves it is most easily taken for: the same kind
//     of attack first (a jam beside a spoof, one LiDAR trick beside
//     another), then moves on the layer its target is on, then the rest;
//   - 4 names, not 3, and a miss costs the rest of the night's naming.
// The names stand in an order fixed by the seed, the night and the
// signature, so a reload offers the same names and every player of a
// Daily Op is asked the same.
export const SIGHT_CHOICES = 4
const sightHash = (text: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  h ^= h >>> 15
  return Math.imul(h, 0x2c1b3c6d) >>> 0
}
export function sightChoices(state: GameState, contact: Contact): string[] {
  const key = (id: string) => sightHash(`${state.seed}:${state.turn}:${contact.id}:${id}`)
  const layer = assetById(state, contact.targetId)?.layer
  const tonight = new Set((planFor(state, state.turn)?.slots ?? []).flatMap((slot) => (slot.fixed ? [slot.fixed] : (slot.drawFrom ?? []))))
  const others = state.scenario.events.filter((e) => (e.kind ?? 'threat') === 'threat' && e.effect.special !== 'debrisStrike' && e.id !== contact.id && !tonight.has(e.id))
  // How easily a move is taken for this one: 0 the same kind of attack, 1
  // one that strikes the same layer, 2 any other.
  const near = (e: ThreatEvent) => (e.vector === contact.def.vector ? 0 : layer !== undefined && e.layers.includes(layer) ? 1 : 2)
  const picked = [...others].sort((a, b) => near(a) - near(b) || key(a.id) - key(b.id)).slice(0, SIGHT_CHOICES - 1).map((e) => e.id)
  return [contact.id, ...picked].sort((a, b) => key(`#${a}`) - key(`#${b}`))
}
// Whether naming is still open tonight: no wrong name has been given.
export const sightOpen = (orders: Orders): boolean => !orders.missed?.length
// Whether a signature can be named: unidentified, and naming still open.
export const canSight = (orders: Orders, contact: Contact): boolean => !contact.known && !contact.fixed && sightOpen(orders)
// The orders with a name given: right, the signature is identified; wrong,
// naming is over for the night.
export function withSight(orders: Orders, contact: Contact, named: string): Orders {
  if (named === contact.id) return { ...orders, sighted: [...(orders.sighted ?? []), contact.id] }
  return { ...orders, missed: [...(orders.missed ?? []), contact.id] }
}

// WHERE TONIGHT'S PIECE DOES MOST, COUNTING THE POST IT GIVES UP (v2.0 R4,
// Ken's ruling of 15 November 2026: the advice never raises AT STAKE).
// The asset the newest defense sits on is the watch's post (rules.ts,
// postOf), so setting tonight's piece down moves the post, and whatever it
// was blunting where it stood comes back at full strength. Through R3 the
// recommended spot was the asset with the most aimed at it and never looked
// at what the move left behind: a first-time player placed the lit piece on
// its BEST SPOT and watched AT STAKE go from -10.2 to -14.9.
//
// Each asset the piece can sit on is now read as the board would stand with
// the post there: AT STAKE as the plan card shows it, and what the post
// would save of the moves COLDVEIL can take (one it favors counts whole,
// one of several its share, one it has turned from nothing, one the scan
// has not named a guess). The recommended spot is the one that saves most
// AMONG THOSE THAT LEAVE AT STAKE NO WORSE than it stands with no new piece
// tonight. Where no such spot exists (the piece cannot sit where the post
// is, and the post is holding down the night's costliest move), nothing is
// called BEST: `raises` is set, `best` is the spot that costs least, and
// the card says what the piece gives up. The piece's card, a tap on the
// piece, and the sweep's placement all read this.
export interface SpotAdvice {
  best: string | undefined
  // AT STAKE with no new piece tonight, and with this one on `best`.
  before: number
  after: number
  // Every spot leaves AT STAKE worse than no new piece: the post is lost.
  raises: boolean
  // The post as it stands with no new piece, when placing would move it.
  gives: string | undefined
  // Every spot it can sit on reads the same tonight: nothing is aimed
  // where the piece can go, so no spot is called best (v2.0 R5: the
  // round's desktop player was told BEST SPOT for a post that could weaken
  // no strike, and the phone's that a piece chosen on one asset's card was
  // "placed on" another with no reason given).
  even: boolean
}
// What the post is worth against a signature the scan has not named: a
// guess at a point of strength on one meter, in score.
const UNNAMED_SAVE = 3
export const atStakeOf = (contacts: readonly Contact[]): number => {
  const bySlot = new Map<number, number>()
  for (const c of contacts) bySlot.set(c.slot, Math.min(bySlot.get(c.slot) ?? 0, c.loss))
  return tenth([...bySlot.values()].reduce((n, v) => n + v, 0))
}
export function spotAdvice(state: GameState, orders: Orders, id: CountermeasureId): SpotAdvice {
  const domain = domainOf(state, id)
  const bare = { ...orders, defense: null, place: null }
  const before = atStakeOf(contactsFor(state, bare))
  const stands = postNow(state, bare)
  // The board with the piece ordered and the post nowhere: COLDVEIL has
  // already moved off what the piece covers.
  const open = contactsFor(state, { ...orders, defense: id, place: null })
  // A signature as it reads with the post on an asset.
  const posted = (c: Contact, post: string): Contact => {
    if (c.debris || c.targetId !== post) return c
    const hardened = Math.min(HARDEN, Math.max(0, c.strength - c.mitigation))
    const exposed = Math.max(0, c.strength - c.mitigation - hardened)
    return { ...c, hardened, exposed, loss: estimateLoss(state, c.def, exposed, assetById(state, post)) }
  }
  const share = (c: Contact) => {
    const peers = open.filter((x) => x.slot === c.slot)
    if (!c.known) return 0.6 / peers.length
    return c.favor === 'unlikely' ? 0 : c.favor === 'either' ? 1 / Math.max(1, peers.filter((x) => x.favor === 'either').length) : 1
  }
  let best: { id: string; atStake: number; saves: number; ok: boolean } | undefined
  const reads: number[] = []
  for (const a of state.assets) {
    if (a.integrity <= 0 || !domain.includes(a.kind)) continue
    const board = open.map((c) => posted(c, a.id))
    const atStake = atStakeOf(board)
    let saves = COVERAGE_PER_KIND[a.kind] / 1000
    board.forEach((c, i) => {
      if (c.hardened > 0) saves += share(c) * (c.known ? c.loss - open[i].loss : UNNAMED_SAVE)
    })
    reads.push(Math.round((saves - COVERAGE_PER_KIND[a.kind] / 1000) * 1000) + atStake * 1e6)
    const ok = atStake >= before - 0.05
    const better = !best || (ok !== best.ok ? ok : ok ? saves > best.saves + 1e-9 || (Math.abs(saves - best.saves) <= 1e-9 && atStake > best.atStake) : atStake > best.atStake || (atStake === best.atStake && saves > best.saves + 1e-9))
    if (better) best = { id: a.id, atStake, saves, ok }
  }
  return { best: best?.id, before, after: best?.atStake ?? before, raises: !!best && !best.ok, gives: best && stands && stands !== best.id ? stands : undefined, even: reads.length > 1 && reads.every((r) => Math.abs(r - reads[0]) < 0.5) }
}
export const spotFor = (state: GameState, orders: Orders, id: CountermeasureId): string | undefined => spotAdvice(state, orders, id).best

// FIX NEXT, AT DAWN (v2.0 R4, the same ruling): the piece that answers the
// costliest move that got through tonight, unless setting it down tomorrow
// would raise tomorrow's AT STAKE by pulling the post off what it is
// holding. Then the next costliest move's piece is tried, and when every
// one would cost the post, none is advised: `gives` names the asset the
// post would leave, and the card says to keep an answer instead.
// `through` is tonight's moves that landed, costliest first; `after` is the
// state the next night opens on.
export interface Fix {
  def: ThreatEvent
  cm: Countermeasure | null
  gives?: string
}
export function fixNext(after: GameState, through: readonly ThreatEvent[]): Fix | null {
  let costly: Fix | null = null
  for (const def of through) {
    const id = def.counters.find((c) => !after.counters.includes(c))
    if (!id) continue
    const cm = defenseDef(after, id)
    const advice = after.status === 'playing' ? spotAdvice(after, NO_ORDERS, id) : null
    if (!advice?.raises) return { def, cm }
    costly ??= { def, cm, gives: advice.gives ?? postOf(after) }
  }
  return costly ?? (through.length ? { def: through[0], cm: null } : null)
}

// WHAT COLDVEIL WOULD HAVE DONE INSTEAD (v2.0 R4): the move it would have
// switched to on a track tonight had a defense been in service, when that
// move would still have landed. A result that says a piece "would have
// helped" against a move COLDVEIL would simply have left for a worse one
// was the R3 reviewers' complaint; the result names the switch instead.
// `board` is the night's board (its turn and its defenses as ordered).
// `placed` is the defense set down tonight, when one was: only 1 new
// defense goes down a night, so the piece could only have been there IN
// ITS PLACE, and that is the night the line describes. (The round's
// reviewers: the planning numbers said PNT auth over Anti-jam, the hit
// said "what would have helped: Anti-jam".)
export function dodgeOf(board: GameState, def: ThreatEvent, id: CountermeasureId, placed?: CountermeasureId | null): ThreatEvent | undefined {
  const counters = [...board.counters.filter((c) => c !== id && c !== placed), id]
  const read = adversaryPicks(board, counters).find((r) => r.candidates.some((c) => c.id === def.id))
  if (!read || read.fixed || read.least.includes(def.id)) return undefined
  const denied = gnssDenied(board.conditions, board.scenario)
  const other = read.least.map((x) => eventDef(board, x)).find((e) => e.baseSeverity + chainBonusOf(e, denied) - mitigationOf(e, counters) > 0)
  return other
}

// ---------------------------------------------------------------- the kit

export interface KitPiece {
  cm: Countermeasure
  // Why it cannot be placed tonight, when it cannot.
  blocked: 'owned' | 'budget' | null
  ordered: boolean
  // THE MARK (v2.0 R5): with it placed tonight, a broken budget is more
  // likely than not by tomorrow night's close (src/engine/worstCase.ts).
  // `odds` is that chance, and `soon` whether tonight alone is the likely
  // break. A piece can be risky at a price the tile seems to cover: it
  // adds upkeep and can turn COLDVEIL to a costlier move.
  risky: boolean
  odds: number
  soon: boolean
  // What the tile would read with it placed: under 0 with no mark is a
  // night whose very worst breaks the budget, possible and not likely.
  // The piece's card says so, with the chance tonight breaks it
  // (`tonight`); the tray does not mark it.
  worst: number
  tonight: number
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
    // Read where it would stand: where it is placed if it is tonight's
    // piece, and otherwise on the spot its card recommends, since the post
    // takes a point off a strike there and the odds count it.
    const wc = blocked ? null : worstCase(state, actionsOf({ ...orders, defense: cm.id, place: orders.defense === cm.id ? orders.place : (spotFor(state, orders, cm.id) ?? null) }))
    return { cm, blocked, ordered: orders.defense === cm.id, risky: !!wc?.risky, odds: wc?.odds ?? 0, soon: (wc?.tonight ?? 0) > RISK_BAR, worst: !wc ? 0 : wc.dawn < 0 ? wc.dawn : wc.morning, tonight: wc?.tonight ?? 0, answers, domain: domainOf(state, cm.id) }
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
  odds: number
  soon: boolean
}
const FLEET_ORDER: AssetKind[] = ['drone', 'groundStation', 'sat', 'rpoSat']
export function fleetFor(state: GameState, orders: Orders): FleetPiece[] {
  return FLEET_ORDER.map((kind) => {
    const ordered = orders.assets.includes(kind)
    const price = state.scenario.prices[kind]
    const fits = ordered || price <= remaining(state, orders)
    const wc = fits && !ordered ? worstCase(state, actionsOf({ ...orders, assets: [...orders.assets, kind] })) : null
    return { kind, price, eta: DEPLOY_TURNS[kind], ordered, fits, risky: !!wc?.risky, odds: wc?.odds ?? 0, soon: (wc?.tonight ?? 0) > RISK_BAR }
  })
}

// THE STAKES, said before the night so a point of score has a face: what
// tonight could take at most (each track's costliest move as the defenses
// stand, the unidentified ones counted), and what the budget reads
// tomorrow morning if the night goes as badly as it can (the engine's
// WORST CASE).
export interface Stakes {
  score: number
  line: number
  atStake: number
  remaining: number
  // WORST CASE as the tile shows it (v2.0 R5): tomorrow morning's budget
  // on the worst night, funding and the coverage bonus in; under 0, how
  // far short tonight's worst repairs and upkeep would leave it.
  worst: number
  // THE MARK: a broken budget is more likely than not by tomorrow night's
  // close (`odds`), and whether tonight alone is the likely break (`soon`).
  risky: boolean
  odds: number
  soon: boolean
  // The chance tonight's close breaks the budget: what a tile that reads
  // short with no mark says beside "possible, not likely".
  tonight: number
  // BEGIN ASKS TWICE on this night: the mark is up, or the tile reads
  // short, so that no operation ends at a dawn BEGIN did not ask about.
  asks: boolean
}
export function stakesFor(state: GameState, orders: Orders, contacts: readonly Contact[], score: number): Stakes {
  const atStake = atStakeOf(contacts)
  const wc = worstCase(state, actionsOf(orders))
  return { score, line: state.scenario.winThreshold, atStake, remaining: wc.remaining, worst: wc.dawn < 0 ? wc.dawn : wc.morning, risky: wc.risky, odds: wc.risky && wc.tonight > RISK_BAR ? wc.tonight : wc.odds, soon: wc.tonight > RISK_BAR, tonight: wc.tonight, asks: wc.risky || wc.dawn < 0 }
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
  // Tonight's hold is still waiting on the player's call (v2.0 R2).
  holdOpen: boolean
}

export function nightNow(state: GameState, orders: Orders, inputs: NightInputs): NightNow {
  const after = resolve(state, orders, inputs)
  const events = lastEvents(after)
  // An answer is asked for only while the watch has one left.
  const open = events.findIndex((ev, i) => (ev.debris ? !!ev.debris.assetId && inputs.debris === null : (ev.left ?? 0) > 0 && inputs.responses[i] === undefined))
  return { after, night: nightOf(state, after), open, holdOpen: !!holdTonight(state) && inputs.hold === undefined }
}

// One answer the night offers, with what the engine says it would do.
export interface Choice {
  // null rides it out.
  id: string | null
  effect: 'block' | 'halve' | 'ride'
  gesture: Gesture | null
  fits: boolean
  why?: 'used'
  // The score's change and the repair bill under this answer.
  score: number
  repair: number
}

export function choicesFor(state: GameState, orders: Orders, inputs: NightInputs, index: number, step: NightStep): Choice[] {
  const outcome = (id: string | null) => {
    const ev = lastEvents(resolve(state, orders, { ...inputs, responses: answered(inputs.responses, index, id) }))[index]
    return { score: tenth(ev.scoreAfter - ev.scoreBefore), repair: ev.repairCost }
  }
  // AN ANSWER THAT DOES LESS FOR THE SAME PRICE IS NOT OFFERED (v2.0 R3).
  // Every answer costs 1 of the pool since R2, so where a move can be
  // blocked its halving was a dead third of the card (both of the round's
  // reviewers said so). The halving is offered where it is the move's best.
  const all: ResponseOption[] = responseOptions(step.def, step.ev)
  const options = all.some((o) => o.effect === 'block') ? all.filter((o) => o.effect === 'block') : all
  return [
    ...options.map((o): Choice => ({ id: o.id, effect: o.effect, gesture: gestureOf(o.id), fits: o.fits, why: o.why, ...(o.fits ? outcome(o.id) : { score: 0, repair: 0 }) })),
    { id: null, effect: 'ride', gesture: null, fits: true, ...outcome(null) },
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
// lands; a move that is stopped has nothing for it to improve, so the ring
// is not shown there.
export const tapMatters = (ev: ResolvedEvent): boolean => ev.effectiveSeverity > 0

// What a timed tap did, for the card: the share it took off a hit; nothing
// on a move that was stopped.
// `saved` is the score the tap kept, measured: the same night with no tap
// on this move. Damage is whole numbers, so a tap's share can round to
// more than its rate or to nothing, and the card says what it did.
export function tapLine(ev: ResolvedEvent, assist = false, saved?: number): string {
  if (!ev.timing || ev.effectiveSeverity === 0) return ''
  const word = assist ? 'ASSIST' : ev.timing === 2 ? 'PERFECT' : 'GOOD'
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
      ...(debris ? { debris } : {}),
      responses: r.events.map((e) => e.response?.id ?? null),
      timing: r.events.map((e) => e.timing ?? 0),
      scans: r.scanned ?? [],
      ...(r.sighted ? { sighted: r.sighted } : {}),
      // Where that night's defense was set down, and the call on its hold.
      placeOn: { ...state.placed },
      tiebreak: r.hold && r.hold.call !== 'none' ? r.hold.call : null,
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
      out.push(resolveTurn(s, inputs[t] ?? { buyAssets: [], buyCounters: [], scans: [] }, turnRng(s.seed, s.turn)))
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
  let actions: TurnActions = { buyAssets: [], buyCounters: [], scans: [] }
  const denied = gnssDenied(state.conditions, state.scenario)
  for (const read of adversaryPicks(state, state.counters)) {
    const def = eventDef(state, read.least[0])
    if (def.effect.special === 'debrisStrike') continue
    if (def.baseSeverity + chainBonusOf(def, denied) - mitigationOf(def, state.counters) <= 0) continue
    const id = def.counters.find((c) => !state.counters.includes(c))
    if (!id) continue
    const where = spotFor(state, NO_ORDERS, id)
    const next = { ...actions, buyCounters: [id], ...(where ? { placeOn: { [id]: where } } : {}) }
    if (state.credits - orderCost(state, next) >= 0 && worstCase(state, next).value >= 0) {
      actions = next
      break
    }
  }
  // It reads the evidence on a hold, and makes the right call.
  const hold = holdTonight(state)
  if (hold) actions = { ...actions, tiebreak: rightCall(hold) }
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
      const i = events.findIndex((ev, k) => ev.left !== undefined && responses[k] === undefined)
      if (i < 0) break
      // It keeps its answers for moves worth one.
      const worth = exposedOf(events[i]) >= 2 || s.turn >= s.scenario.totalTurns
      const pick = worth ? (responseOptions(eventDef(s, events[i].eventId), events[i]).find((o) => o.fits)?.id ?? null) : null
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
