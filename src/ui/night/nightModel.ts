// THE NIGHT, AS THE PLAYER SEES IT (v1.3 brief 5.5). The engine resolves
// the whole turn at once; the night then shows it one event at a time: the
// strike, the move's card, and the close. The 3D game plays it
// (src/ui/three/gameModel.ts); the pixel night it was written for was
// retired in v2.0 R3.
//
// Everything a card says comes from the engine's record of the turn
// (TurnRecord and its ResolvedEvents): which move landed, its strength,
// what was blocked, the target and its integrity either side, the
// condition it left, the points saved, the debris call, the repair bills
// and the whole ledger. Two figures the engine does not record per event,
// so this module carries them forward from the record, with the engine's
// own exported rules:
//   - the board between events, for the score either side of a hit (the
//     card's "-d", brief 5.5 item 2) and the assets and conditions the
//     world shows as each event lands;
//   - the defense streak after each event, which the engine counts the
//     same way and records only at the turn's end.
// tests/night-model.spec.ts proves both land on the engine's after-state
// on every turn of hundreds of games: the board, closed with the ledger,
// is the engine's next state, and the last streak is the record's.
//
// Pure, so the suite sweeps it without a DOM. Since v1.3 Round 3 it
// replaces the v1.1 director's beat derivation (src/director, retired).

import { resolveHold } from '../../engine/holds'
import { CONDITION_PRESSURE_PER_SEVERITY, DEPLOY_TURNS, damageShare, exposedOf, meterDamageOf, mitigationOf, scaled } from '../../engine/reducer'
import { maiScore } from '../../engine/scoring'
import type { AssetKind, Countermeasure, GameState, PendingAsset, ResolvedEvent, ResolvedHold, ThreatEvent, TurnRecord } from '../../engine/types'
import { stopVerb } from '../board/boardModel'

export type StepKind = 'threat' | 'debris' | 'opportunity'

export interface NightStep {
  kind: StepKind
  ev: ResolvedEvent
  def: ThreatEvent
  // The board either side of this event.
  before: GameState
  after: GameState
  scoreBefore: number
  scoreAfter: number
  // The defense streak after this event (brief 6.8): a threat with
  // nothing through extends it, any point through resets it, and the
  // debris call and an opportunity leave it where it was.
  streak: number
  // Its place in the night, 0 first: the watch officer's clock (v1.6 R3).
  index: number
}

export interface Night {
  turn: number
  // The engine's state EXECUTE resolved from.
  before: GameState
  record: TurnRecord
  // The board as the first event arrives: tonight's orders landed and the
  // live conditions pressed.
  opening: GameState
  // The conditions that pressed as it opened, by name (JAMMED), for the
  // labelled change under COLDVEIL IS MOVING (v1.3 R5).
  pressed: string[]
  // The policy engine's hold (v2.0 R2), settled before COLDVEIL's first
  // move: the board either side of it. Absent on a night with none.
  hold?: { ev: ResolvedHold; before: GameState; after: GameState }
  steps: NightStep[]
  // The engine's own next state, by identity: the close shows it.
  closing: GameState
}

const eventDef = (state: GameState, id: string): ThreatEvent => {
  const ev = state.scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`night: unknown event ${id}`)
  return ev
}

// A copy of the fields the night changes; the scenario and the history
// are shared, since nothing here writes them.
function copyBoard(s: GameState): GameState {
  return {
    ...s,
    assets: s.assets.map((a) => ({ ...a })),
    meters: { ...s.meters },
    conditions: s.conditions.map((c) => ({ ...c })),
    pipeline: s.pipeline.map((p) => ({ ...p })),
    counters: [...s.counters],
    ...(s.placed ? { placed: { ...s.placed } } : {}),
  }
}

const isOpportunity = (def: ThreatEvent) => (def.kind ?? 'threat') === 'opportunity'

// The assets tonight's orders put in the pipeline, read off the engine's
// ids (t<turn>-<kind>-<n>), wherever they are by the close.
function orderedTonight(after: GameState, turn: number): PendingAsset[] {
  const out: PendingAsset[] = []
  for (const id of [...after.pipeline.map((p) => p.id), ...after.assets.map((a) => a.id)]) {
    const m = /^t(\d+)-([A-Za-z]+)-(\d+)$/.exec(id)
    if (!m || Number(m[1]) !== turn) continue
    const kind = m[2] as AssetKind
    out.push({ id, kind, etaTurns: DEPLOY_TURNS[kind] })
  }
  return out.sort((x, y) => Number(x.id.split('-').pop()) - Number(y.id.split('-').pop()))
}

export function nightOf(before: GameState, after: GameState): Night {
  const record = after.history[after.history.length - 1]
  if (!record || record.turn !== before.turn || after.history.length !== before.history.length + 1) {
    throw new Error('night: after is not the resolution of before')
  }
  const { difficulty } = before
  const board = copyBoard(before)
  // EXECUTE: the orders land.
  board.counters = [...after.counters]
  if (after.placed) board.placed = { ...after.placed }
  board.credits = before.credits - record.ledger.ordered
  board.pipeline = [...board.pipeline, ...orderedTonight(after, before.turn)]
  // The live conditions press, read against the defenses owned now.
  const pressed: string[] = []
  for (const c of board.conditions) {
    const def = eventDef(before, c.eventId)
    const pressure = Math.max(0, c.baseSeverity - mitigationOf(def, board.counters))
    if (pressure === 0) continue
    if (!pressed.includes(c.name)) pressed.push(c.name)
    for (const m of def.effect.meters) board.meters[m] = Math.max(0, board.meters[m] - scaled(CONDITION_PRESSURE_PER_SEVERITY * pressure, difficulty))
  }
  const opening = copyBoard(board)
  // The hold, with the engine's own arithmetic on a copy of the board.
  let hold: Night['hold']
  let afterHold = opening
  if (record.hold) {
    afterHold = copyBoard(opening)
    resolveHold(afterHold, record.hold, record.hold.call === 'none' ? null : record.hold.call)
    hold = { ev: record.hold, before: opening, after: afterHold }
  }

  const steps: NightStep[] = []
  let streak = before.streak
  let shown = afterHold
  for (const ev of record.events) {
    const def = eventDef(before, ev.eventId)
    const next = copyBoard(shown)
    let kind: StepKind
    if (isOpportunity(def)) {
      kind = 'opportunity'
      next.credits += record.ledger.windfall
    } else if (ev.debris) {
      kind = 'debris'
      next.credits -= ev.debris.fuel
      if (ev.debris.lost && ev.debris.assetId) {
        const a = next.assets.find((x) => x.id === ev.debris!.assetId)
        if (a) a.integrity = 0
      }
    } else {
      kind = 'threat'
      // A halved move does its share (v1.7 R1).
      if (ev.effectiveSeverity > 0) {
        for (const m of def.effect.meters) {
          next.meters[m] = Math.max(0, next.meters[m] - scaled(meterDamageOf(before) * ev.effectiveSeverity * damageShare(ev), difficulty))
        }
      }
      if (ev.integrityAfter !== undefined && ev.targetAssetId !== undefined) {
        const a = next.assets.find((x) => x.id === ev.targetAssetId)
        if (a) a.integrity = ev.integrityAfter
      }
      if (ev.condition) {
        const existing = next.conditions.find((c) => c.eventId === ev.eventId)
        if (existing) existing.remainingTurns = Math.max(existing.remainingTurns, ev.condition.turns)
        else
          next.conditions.push({
            instanceId: `${ev.eventId}-t${before.turn}`,
            eventId: ev.eventId,
            name: ev.condition.name,
            startedTurn: before.turn,
            remainingTurns: ev.condition.turns,
            baseSeverity: def.baseSeverity,
          })
      }
      streak = ev.effectiveSeverity === 0 ? streak + 1 : 0
    }
    next.streak = streak
    // The figure is the engine's own (the per-event score, v1.3 R6); a
    // record from before the engine kept it falls back to the replay.
    steps.push({ kind, ev, def, before: shown, after: next, scoreBefore: ev.scoreBefore ?? maiScore(shown), scoreAfter: ev.scoreAfter ?? maiScore(next), streak, index: steps.length })
    shown = next
  }
  return { turn: before.turn, before, record, opening, pressed, ...(hold ? { hold } : {}), steps, closing: after }
}

export { exposedOf }

// Which defense the outcome block names: the first in the threat's own
// order that was owned tonight (the engine credits the same one), and the
// first that was not; and, where the named one does not block the move
// alone (the stops rule, R6 question 2), the owned defense it blocked it
// with, so a joint block is not said of one defense.
export function defensesFor(def: ThreatEvent, owned: readonly string[], scenario: GameState['scenario']) {
  const by = (id: string) => scenario.countermeasures.find((c) => c.id === id) as Countermeasure
  const held = def.counters.find((c) => owned.includes(c))
  const missing = def.counters.find((c) => !owned.includes(c))
  const partner = held && stopVerb(held, def) !== 'stops' ? def.counters.find((c) => c !== held && owned.includes(c)) : undefined
  return { held: held ? by(held) : undefined, missing: missing ? by(missing) : undefined, partner: partner ? by(partner) : undefined }
}
