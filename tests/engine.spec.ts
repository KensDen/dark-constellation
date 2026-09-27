// Engine battery (spec Section 11.2): determinism, purity, and win/loss
// reachability by real play. The determinism hash must match the
// committed snapshot; regenerate deliberately with UPDATE_SNAPSHOTS=1
// after an intentional engine or content change.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { DEFAULT_SCENARIO } from '../src/content'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT, a } from './scripts'

const SNAPSHOT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'determinism.snap.json')

// With the R3.25 dynamics, prepared play no longer wins on every seed
// (target ~75 to 85 percent). WIN_SEED is a confirmed win for the prepared
// line; LOSS_SEED a confirmed loss for the do-nothing line. Both anchor the
// determinism snapshot.
const WIN_SEED = 20260712
const LOSS_SEED = 4041

// Standard difficulty is pinned here (R5): its multipliers are exactly 1 on
// every axis, so the snapshot must stay byte-identical to the pre-R5 hash.
//
// `deck` says where the adversary's draws come from (v1.2 R5a). 'deck' is
// the engine's own deck stream, what every caller gets. 'legacy' hands the
// main stream in as the deck, which is exactly how every version before the
// split drew: one stream, a slot's pick and then its resolution, in order.
type DeckRouting = 'deck' | 'legacy'
function playGame(seed: number, script: Record<number, TurnActions>, deck: DeckRouting = 'deck'): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') {
    const actions = script[state.turn] ?? NO_OP
    const main = turnRng(state.seed, state.turn)
    state = deck === 'deck' ? resolveTurn(state, actions, main) : resolveTurn(state, actions, main, main)
  }
  return state
}

// The prepared line as it stood before v1.2 R5a, frozen, so the proofs of
// earlier snapshot moves replay the script they were proved against even
// after WIN_SCRIPT itself changes.
const WIN_SCRIPT_BEFORE_R5A: Record<number, TurnActions> = {
  1: a({ buyCounters: ['sensorFusion', 'antiJam'], buyAssets: [{ kind: 'sat', tier: 'B' }], buyIntelLevel: true }),
  2: a({ buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  3: a({ buyCounters: ['groundZeroTrust'] }),
  4: a({ buyCounters: ['tierAAttestation'], buyIrRetainer: true }),
  5: a({ buyCounters: ['ssaManeuver'] }),
  6: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  7: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  8: a({ buyCounters: ['linkAuth'] }),
  9: a({ buyAssets: [{ kind: 'sat', tier: 'A' }] }),
  10: a({}),
  11: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  12: a({}),
}

function gameLogHash(state: GameState): string {
  const log = {
    seed: state.seed,
    status: state.status,
    lossReason: state.lossReason ?? null,
    history: state.history,
  }
  return createHash('sha256').update(JSON.stringify(log)).digest('hex')
}

// THE R3 MOVE, PROVED (brief v0.8 section 4.5). ResolvedEvent gained
// targetAssetId in v1.2 Round 3, which moves the snapshot. The move has to
// be that field and nothing else, so the proof strips it from every event
// of both replays, rebuilds the snapshot file's bytes exactly as
// UPDATE_SNAPSHOTS writes them, and requires the file's SHA-1 to be the
// one the brief records for the snapshot before the field existed,
// 50eb2261. The two hashes that file held are kept here, so the proof
// does not lean on the file it replaced. The snapshot after R3 is the
// committed tests/determinism.snap.json; its file SHA-1 is POST_TARGET_FILE_SHA1.
const PRE_TARGET = {
  win: 'c31e68e4ec8c7fd626bc02ae29be940158f0b487e9ecad759ba6d2d5f1d4ad58',
  loss: '0ca1aebab66b5b0d6791ea0f7b4dce86e9670a0ff9af3823dcb214a0920c3919',
}
const PRE_TARGET_FILE_SHA1 = '50eb22612dea4e4f5a03a6fa3d2fd174f3855134'
const POST_TARGET_FILE_SHA1 = '5413e6332b09bc3be21cec6c4e2e39fcfff38f7e'

// THE R5a MOVE (brief v0.9 section 7.1): the adversary draws from a deck
// stream of its own. The snapshot after R3 held these two hashes, in the
// file POST_TARGET_FILE_SHA1 names; the proof below replays both lines with
// the deck routed back to the main stream and requires them, to the byte.
// The deck move alone gave the file POST_DECK_FILE_SHA1 names.
const POST_TARGET = {
  win: 'c99c56a6b731e236ee39b330d9c3c50c63e7b3466b06224030cd07d8310ec61c',
  loss: 'd31a41e8aa638dc957cd891d225a3fadfeeebfbbc5951438e3485aec5d94b896',
}
const POST_DECK = {
  win: 'faf9ad331dacc6429c3485d41e6c8f432f3686dd0aedf667c895b53af39c0685',
  loss: '9734c6503c8442d85535e19c5e03ab50c1c167dd7db0efa4fa30c545d4794e32',
}
const POST_DECK_FILE_SHA1 = '1baa3371d9d0bbb241c910801bc27fce25482f66'
// THE SECOND R5a MOVE: the prepared line buys its turn 9 sat at Tier B
// (tests/scripts.ts). The committed snapshot is the one after both moves.
const SNAPSHOT_FILE_SHA1 = '795ec81875056aa2c0c814c34902bc1d95457fef'

function withoutTargets(state: GameState): GameState {
  return {
    ...state,
    history: state.history.map((record) => ({
      ...record,
      events: record.events.map((ev) => {
        const { targetAssetId: _dropped, ...rest } = ev
        return rest
      }),
    })),
  }
}

const snapshotFile = (snap: { win: string; loss: string }) => JSON.stringify(snap, null, 2) + '\n'
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex')

describe('determinism', () => {
  it('same seed and actions produce the identical log hash', () => {
    const first = playGame(WIN_SEED, WIN_SCRIPT)
    const second = playGame(WIN_SEED, WIN_SCRIPT)
    expect(gameLogHash(first)).toBe(gameLogHash(second))
  })

  it('fixed-seed full-game replays match the committed snapshot', () => {
    const actual = {
      win: gameLogHash(playGame(WIN_SEED, WIN_SCRIPT)),
      loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT)),
    }
    if (process.env.UPDATE_SNAPSHOTS) {
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + '\n')
    }
    const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    expect(actual).toEqual(committed)
  })

  it('GUARD R3 (b): moves by targetAssetId alone; stripped, the replays rebuild the pre-R3 snapshot to the byte', () => {
    // Replayed as R3 drew them: the deck routed back to the main stream and
    // the prepared line as it was (see GUARD R5a (a)).
    const win = playGame(WIN_SEED, WIN_SCRIPT_BEFORE_R5A, 'legacy')
    const loss = playGame(LOSS_SEED, LOSS_SCRIPT, 'legacy')
    const stripped = { win: gameLogHash(withoutTargets(win)), loss: gameLogHash(withoutTargets(loss)) }
    expect(stripped, 'stripping targetAssetId does not restore the pre-R3 hashes').toEqual(PRE_TARGET)
    expect(sha1(snapshotFile(stripped)), 'the rebuilt pre-R3 file is not 50eb2261').toBe(PRE_TARGET_FILE_SHA1)
    // And the field is really there: unstripped, both replays move.
    expect(gameLogHash(win)).not.toBe(PRE_TARGET.win)
    expect(gameLogHash(loss)).not.toBe(PRE_TARGET.loss)
  })

  it('GUARD R5a (a): moves by the deck stream alone; routed back to the main stream, the replays rebuild the post-R3 snapshot to the byte', () => {
    const legacy = {
      win: gameLogHash(playGame(WIN_SEED, WIN_SCRIPT_BEFORE_R5A, 'legacy')),
      loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT, 'legacy')),
    }
    expect(legacy, 'the deck routed to the main stream does not replay as R3 did').toEqual(POST_TARGET)
    expect(sha1(snapshotFile(legacy)), 'the rebuilt post-R3 file is not 5413e633').toBe(POST_TARGET_FILE_SHA1)
    // And the deck is really its own: on its own stream, both replays move.
    expect(gameLogHash(playGame(WIN_SEED, WIN_SCRIPT_BEFORE_R5A))).not.toBe(POST_TARGET.win)
    expect(gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT))).not.toBe(POST_TARGET.loss)
  })

  it('moves a second time by the prepared line alone; its old script on the deck stream rebuilds the deck snapshot to the byte', () => {
    const deckOnly = {
      win: gameLogHash(playGame(WIN_SEED, WIN_SCRIPT_BEFORE_R5A)),
      loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT)),
    }
    expect(deckOnly, 'the old script on the deck stream does not replay as the deck move left it').toEqual(POST_DECK)
    expect(sha1(snapshotFile(deckOnly)), 'the rebuilt deck snapshot is not 1baa3371').toBe(POST_DECK_FILE_SHA1)
    // The committed snapshot is the one this build produces, and its file
    // hash is the one recorded above.
    expect(sha1(readFileSync(SNAPSHOT_PATH, 'utf8')), 'the committed snapshot file changed').toBe(SNAPSHOT_FILE_SHA1)
  })

  it('GUARD R5a (b): every player on a seed meets the same threats, whatever they buy', () => {
    // Before the adversary plays, a turn's asset buys draw their delivery
    // and slip rolls from the main stream, so lines that buy different
    // assets reach the deck with that stream in different places, and how
    // each hit lands differs with what they own. The events each turn draws
    // must not. The prepared line is paired with the do-nothing line and
    // with the mixed line, which buys a different fleet and, unlike the
    // do-nothing line (which collapses by turn nine), plays every turn to
    // the end, so the last turns' draws are compared too.
    const draws = (state: GameState) => state.history.map((r) => r.events.map((e) => e.eventId))
    const differing = (deck: DeckRouting) => {
      const out: string[] = []
      const perTurn = new Array<number>(DEFAULT_SCENARIO.totalTurns).fill(0)
      for (let seed = 1; seed <= 60; seed += 1) {
        const prepared = draws(playGame(seed, WIN_SCRIPT, deck))
        for (const other of [LOSS_SCRIPT, MIXED_SCRIPT]) {
          const theirs = draws(playGame(seed, other, deck))
          for (let t = 0; t < Math.min(prepared.length, theirs.length); t += 1) {
            perTurn[t] += 1
            if (JSON.stringify(prepared[t]) !== JSON.stringify(theirs[t])) out.push(`seed ${seed} turn ${t + 1}`)
          }
        }
      }
      return { out, perTurn }
    }
    const split = differing('deck')
    // Every turn compared, the last ones included, on enough seeds to mean something.
    expect(Math.min(...split.perTurn), `turns compared per turn: ${split.perTurn.join(', ')}`).toBeGreaterThanOrEqual(30)
    expect(split.out.join('\n'), 'two players on one seed met different threats').toBe('')
    // The positive control: the same comparison on the single stream every
    // earlier version drew from does find the difference, so the check can see it.
    expect(differing('legacy').out.length, 'the comparison cannot tell the two routings apart').toBeGreaterThan(0)
  })

  it('GUARD R3 (a), the engine half: every asset-damaging event names the asset it damaged, and only those do', () => {
    // The oracle is the engine's own note, read here and only here: the
    // presentation must never parse it (principle 7), which is the point
    // of the field.
    const DAMAGE_NOTE = /\b((?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+) (?:degraded to \d+ percent integrity|disabled|lost)\./
    const lines: [number, Record<number, TurnActions>][] = [
      [WIN_SEED, WIN_SCRIPT],
      [LOSS_SEED, LOSS_SCRIPT],
      [WIN_SEED, MIXED_SCRIPT],
      [LOSS_SEED, MIXED_SCRIPT],
    ]
    let damaging = 0
    for (const [seed, script] of lines) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        const known = new Set(after.assets.map((a) => a.id))
        for (const ev of after.history[after.history.length - 1].events) {
          const named = ev.notes.map((n) => DAMAGE_NOTE.exec(n)?.[1]).filter(Boolean)
          expect(named.length, `${ev.eventId} on turn ${state.turn} damaged more than one asset`).toBeLessThanOrEqual(1)
          if (named.length === 1) {
            damaging += 1
            expect(ev.targetAssetId, `${ev.eventId} on turn ${state.turn}, seed ${seed}`).toBe(named[0])
            expect(known.has(ev.targetAssetId!), `${ev.targetAssetId} is not an asset`).toBe(true)
          } else {
            expect(ev.targetAssetId, `${ev.eventId} on turn ${state.turn} names a target it did not damage`).toBeUndefined()
          }
        }
        state = after
      }
    }
    expect(damaging, 'the sweep saw too few hits to mean anything').toBeGreaterThan(10)
  })

  it('resolveTurn does not mutate its input state', () => {
    const state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = JSON.stringify(state)
    resolveTurn(state, WIN_SCRIPT[1], turnRng(state.seed, state.turn))
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('reachability by real play', () => {
  it('the prepared-architect line wins', () => {
    const end = playGame(WIN_SEED, WIN_SCRIPT)
    expect(end.status).toBe('won')
    expect(end.history).toHaveLength(DEFAULT_SCENARIO.totalTurns)
  })

  it('the do-nothing line loses', () => {
    const end = playGame(LOSS_SEED, LOSS_SCRIPT)
    expect(end.status).toBe('lost')
    expect(end.lossReason).toBeTruthy()
  })

  it('the supply-chain implant never damages Tier A assets (spec Sections 5 and 8)', () => {
    // A Tier A drone deploys in one turn, so it is reliably on station well
    // before the scripted turn-5 implant.
    const buyTierA: TurnActions = { ...NO_OP, buyAssets: [{ kind: 'drone', tier: 'A' }] }
    for (let seed = 1; seed <= 50; seed += 1) {
      let state = newGame(DEFAULT_SCENARIO, seed)
      state = resolveTurn(state, buyTierA, turnRng(state.seed, state.turn))
      while (state.status === 'playing' && state.turn <= 4) {
        state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      }
      if (state.status !== 'playing') continue
      const tierABefore = state.assets.filter((a) => a.tier === 'A').map((a) => a.integrity)
      expect(tierABefore.length).toBeGreaterThan(0)
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)) // turn 5: scripted implant
      const implant = state.history.find((h) => h.turn === 5)?.events.find((e) => e.eventId === 'supply-chain-implant')
      expect(implant).toBeTruthy()
      const tierAAfter = state.assets.filter((a) => a.tier === 'A').map((a) => a.integrity)
      expect(tierAAfter).toEqual(tierABefore)
    }
  })

  it('a jam becomes an active condition that holds LiDAR fallback, then expires', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)) // turn 6: fixed pnt-jamming
    }
    const jam = state.conditions.find((c) => c.eventId === 'pnt-jamming')
    expect(jam, 'pnt-jamming should be an active condition after turn 6').toBeTruthy()
    expect(jam!.remainingTurns).toBeGreaterThanOrEqual(1)
    expect(state.flags.lidarFallback).toBe(true)
    // Play out with no new jams and confirm the condition eventually lifts.
    let sawExpiry = false
    for (let i = 0; i < 4 && state.status === 'playing'; i += 1) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      if (!state.conditions.some((c) => c.instanceId === jam!.instanceId)) sawExpiry = true
    }
    expect(sawExpiry).toBe(true)
  })

  it('deployments arrive after their ETA, not instantly', () => {
    let state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = state.assets.length
    state = resolveTurn(state, { ...NO_OP, buyAssets: [{ kind: 'sat', tier: 'B' }] }, turnRng(state.seed, state.turn))
    expect(state.assets.length, 'sat should not be operational the turn it is bought').toBe(before)
    expect(state.pipeline.length).toBe(1)
    expect(state.pipeline[0].etaTurns).toBeGreaterThanOrEqual(1)
    let arrived = false
    for (let i = 0; i < 4 && state.status === 'playing'; i += 1) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      if (state.assets.length > before) arrived = true
    }
    expect(arrived, 'sat should reach orbit within a few turns').toBe(true)
  })

  it('a surge token clears one active condition and is consumed', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    const cond = state.conditions[0]
    expect(cond).toBeTruthy()
    const tokensBefore = state.surgeTokens
    expect(tokensBefore).toBeGreaterThan(0)
    state = resolveTurn(state, { ...NO_OP, spendSurgeOn: cond.instanceId }, turnRng(state.seed, state.turn))
    expect(state.conditions.some((c) => c.instanceId === cond.instanceId)).toBe(false)
    expect(state.surgeTokens).toBe(tokensBefore - 1)
  })

  it('the BLACKOUT CHAIN lands at full potency against a single-sensor posture', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 7) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    const chainTurn = state.history.find((h) => h.turn === 7)
    const chainEvent = chainTurn?.events.find((e) => e.eventId === 'blackout-chain')
    expect(chainEvent?.chainBonus).toBe(2)
  })
})
