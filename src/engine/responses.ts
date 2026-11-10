// THE NIGHT'S CHOICES, PLAYED THROUGH THE ENGINE (v1.7 R1). The turn
// resolver takes the responses with the orders and resolves the whole
// night at once, so a night with choices is played by resolving it again
// as each one is made: with the responses so far, the first move the
// player has not yet answered is the one on screen, and every move before
// it is settled. The board's night (src/ui/Game.tsx) and the sweep's
// policies (tests/sweep-run.ts) both play it this way, through these
// functions. Pure: nothing here draws from a stream of its own.

import { turnRng } from './rng'
import { resolveTurn } from './reducer'
import { RESPONSES_PER_NIGHT, damageShare, exposedOf, responseCost, responseFits } from './rules'
import type { GameState, ResolvedEvent, ResponseEffect, ThreatEvent, TurnActions } from './types'

// One response as the night offers it: what it costs on this move tonight,
// and whether the budget can meet it (rules.ts, responseFits).
export interface ResponseOption {
  id: string
  effect: ResponseEffect
  cost: number
  fits: boolean
  // Why it cannot be taken: tonight's response is already used, or the
  // budget cannot meet it.
  why?: 'used' | 'budget'
}

export function responseOptions(def: ThreatEvent, ev: ResolvedEvent, difficulty: GameState['difficulty']): ResponseOption[] {
  const exposed = exposedOf(ev)
  const used = (ev.answered ?? 0) >= RESPONSES_PER_NIGHT
  return (def.responses ?? []).map((r) => {
    const fits = responseFits(def, r, exposed, ev.room ?? 0, difficulty, ev.answered)
    return { id: r.id, effect: r.effect, cost: responseCost(r.effect, exposed), fits, ...(fits ? {} : { why: used ? ('used' as const) : ('budget' as const) }) }
  })
}

// The first of a resolved night's moves that offered a response and has no
// answer yet in `responses`: -1 once every choice is made.
export function openChoice(events: readonly ResolvedEvent[], responses: readonly (string | null | undefined)[]): number {
  return events.findIndex((ev, i) => ev.room !== undefined && responses[i] === undefined)
}

// The answers so far with one more: `choice` for move `i`, null to ride it
// out, and null for every move before it that offered nothing.
export function answered(responses: readonly (string | null | undefined)[], i: number, choice: string | null): (string | null)[] {
  const out: (string | null)[] = []
  for (let k = 0; k < i; k += 1) out.push(responses[k] ?? null)
  out.push(choice)
  return out
}

// What the player is asked: the move as it stands if ridden out, its
// definition, the options, and the state the turn resolved from.
export interface Offer {
  state: GameState
  index: number
  ev: ResolvedEvent
  def: ThreatEvent
  options: ResponseOption[]
}
export type Responder = (offer: Offer) => string | null

// A whole night with a responder making each choice as it comes.
export function playNight(state: GameState, actions: TurnActions, respond: Responder): GameState {
  let responses: (string | null)[] = []
  for (;;) {
    const after = resolveTurn(state, { ...actions, responses }, turnRng(state.seed, state.turn))
    const events = after.history[after.history.length - 1].events
    const i = openChoice(events, responses)
    if (i < 0) return after
    const def = state.scenario.events.find((e) => e.id === events[i].eventId)!
    responses = answered(responses, i, respond({ state, index: i, ev: events[i], def, options: responseOptions(def, events[i], state.difficulty) }))
  }
}

export { damageShare }
