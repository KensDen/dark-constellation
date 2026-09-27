// Condition badge cues (brief v0.5 section 6). A badge attaches to its
// layer with a red pulse when the condition lands, ticks quietly while it
// persists, and sweeps green as it dissolves on clear. The hidden span
// stays hidden: the badge never shows how many turns are left unless the
// player has bought top intel, which is the mechanic's whole point.
//
// The time reads T+n, elapsed turns only (v1.2 brief 4.3). It used to
// read the start turn as well ("t3 +1"); on a layer header a chip has
// room for one number, and the one that matters is how long the thing
// has been pressing.

import { useEffect, useRef, useState } from 'react'
import type { ActiveCondition, Layer } from '../../engine/types'
import { useCueClass, useReducedMotion } from './motion'

export type BadgePhase = 'attached' | 'applying' | 'ticking' | 'clearing'

const LAYER_LABEL: Record<Layer, string> = { ORBIT: 'ORBIT', AIR: 'AIR', GROUND: 'GROUND' }

export const PHASE_CLASS: Record<BadgePhase, string> = {
  attached: '',
  applying: 'dc-badge-attach',
  ticking: 'dc-badge-tick',
  clearing: 'dc-badge-clear',
}

// Each phase runs for as long as its own animation, matching the
// stylesheet. One shared constant truncated the tick, which is the
// longest of the three. The clearing badge holds its end state (opacity
// zero) because it is about to leave the DOM anyway; clearing the class
// would make it flash back into view first.
export const PHASE_MS: Record<BadgePhase, number> = {
  attached: 0,
  applying: 420,
  ticking: 700,
  clearing: 0,
}

export interface ConditionBadgeProps {
  condition: ActiveCondition
  layer?: Layer
  phase?: BadgePhase
  // Elapsed turns, always shown; the remaining span only at top intel.
  elapsed: number
  remainingEstimate?: number
  queuedForSurge?: boolean
  onSurge?: () => void
  surgeLabel?: string
}

export default function ConditionBadge({
  condition,
  layer,
  phase = 'attached',
  elapsed,
  remainingEstimate,
  queuedForSurge,
  onSurge,
  surgeLabel,
}: ConditionBadgeProps) {
  const reduced = useReducedMotion()
  const cue = useCueClass(
    phase === 'attached' ? null : `${condition.instanceId}-${phase}`,
    PHASE_CLASS[phase],
    reduced,
    PHASE_MS[phase],
  )
  const clearing = phase === 'clearing'
  const tone = clearing ? 'border-phosphor/70 bg-phosphor/10' : 'border-hero-magenta/50 bg-hero-magenta/10'

  return (
    <span
      className={`dc-badge inline-flex flex-wrap items-center gap-1.5 border px-2 py-1 ${tone} ${cue} ${
        queuedForSurge ? 'opacity-50' : ''
      }`}
    >
      {layer && (
        <span className="font-mono text-[10px] tracking-widest text-ink-dim" aria-hidden="true">
          {LAYER_LABEL[layer]}
        </span>
      )}
      <span
        className={`font-mono text-xs ${clearing ? 'text-phosphor' : 'text-hero-magenta'} ${
          queuedForSurge ? 'line-through' : ''
        }`}
      >
        {condition.name}
      </span>
      <span className="font-mono text-[10px] text-ink-dim">
        T+{elapsed}
        {remainingEstimate !== undefined ? `, ~${remainingEstimate} left` : ''}
      </span>
      {onSurge && (
        <button
          className="font-mono text-[10px] border border-phosphor/60 text-phosphor px-1.5 min-h-8 hover:bg-phosphor/10"
          onClick={onSurge}
        >
          {surgeLabel}
        </button>
      )}
    </span>
  )
}

// Track which condition instances are newly present, newly gone, or
// carried into a new turn, so the list can play the attach, tick and clear
// cues without the caller threading beat state through. A cleared badge
// lingers for one cue length before it leaves the DOM, and an attached
// badge settles back to its resting state once its entrance has played,
// so no cue class latches on.
//
// The previous list is held in a ref rather than in state: keeping it in
// state made a lingering badge look like a fresh removal on the next pass,
// which set state again and looped. The ref is compared by instance id, so
// a new array carrying the same conditions (every playback beat produces
// one) is correctly a no-op.
const CLEAR_LINGER_MS = 560

// The phase decision, kept pure and separate from the timers so the
// battery can call it rather than read the hook's source for a literal.
// Returns only the phases that change; an empty result means no cue.
export function nextPhases({
  prev,
  next,
  sameTurn,
  reduced,
  prevTurn,
}: {
  prev: ActiveCondition[]
  next: ActiveCondition[]
  sameTurn: boolean
  reduced: boolean
  // The turn the badges were last showing. A condition that started on it
  // was applied during the playback just watched, so it is not persisting
  // into anything yet; omit the turn and every survivor counts as carried.
  prevTurn?: number
}): Record<string, BadgePhase> {
  const liveIds = new Set(next.map((c) => c.instanceId))
  const prevIds = new Set(prev.map((c) => c.instanceId))
  const added = next.filter((c) => !prevIds.has(c.instanceId))
  const removed = prev.filter((c) => !liveIds.has(c.instanceId))
  // A condition already live that has crossed into a new turn ticks: the
  // brief's "condition persists into a new turn" row. The turn only flips
  // when playback hands over to the engine's after-state, so without the
  // startedTurn test every condition applied during that playback would
  // tick a second after it attached.
  const carried = sameTurn
    ? []
    : next.filter((c) => prevIds.has(c.instanceId) && (prevTurn === undefined || c.startedTurn < prevTurn))
  const out: Record<string, BadgePhase> = {}
  if (reduced) {
    // No entrance to play, so no phase to settle out of later. Recording
    // one anyway would latch it, and the preference is read live, so
    // turning reduced motion off would replay every latched cue at once.
    for (const c of [...added, ...carried]) out[c.instanceId] = 'attached'
    return out
  }
  for (const c of added) out[c.instanceId] = 'applying'
  for (const c of carried) out[c.instanceId] = 'ticking'
  for (const c of removed) out[c.instanceId] = 'clearing'
  return out
}

// What a batch of decided phases owes in settles: the id, the phase that
// batch actually wrote, and how long that phase runs. Pure and exported so
// the battery can assert that a tick settles on its own length rather than
// on a shared constant, and that a resting or clearing badge settles
// nothing. The phase travels with the timer, which is what lets a later
// batch supersede an earlier one instead of being overwritten by it.
export function settlesFor(decided: Record<string, BadgePhase>): Array<{ id: string; phase: BadgePhase; ms: number }> {
  return Object.entries(decided)
    .filter(([, phase]) => phase === 'applying' || phase === 'ticking')
    .map(([id, phase]) => ({ id, phase, ms: PHASE_MS[phase] }))
}

// `session` identifies the campaign being shown. When it changes (a new
// game, a loaded save, a resumed autosave) the conditions on screen are a
// different campaign's, not arrivals in this one, so the badges adopt them
// silently rather than replaying an attach cue for each.
export function useBadgePhases(
  conditions: ActiveCondition[],
  reduced: boolean,
  turn?: number,
  session?: string,
) {
  const prevRef = useRef<ActiveCondition[]>(conditions)
  const prevTurnRef = useRef<number | undefined>(turn)
  const sessionRef = useRef(session)
  const [lingering, setLingering] = useState<ActiveCondition[]>([])
  const [phases, setPhases] = useState<Record<string, BadgePhase>>({})
  // Timers outlive the effect that started them. The conditions array gets
  // a new identity on every playback beat, so an effect cleanup would
  // cancel a timer moments after it was set and the badge would never
  // settle or leave. They are cleared on unmount instead.
  const timersRef = useRef<number[]>([])
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
    },
    [],
  )

  const after = (ms: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== timer)
      fn()
    }, ms)
    timersRef.current.push(timer)
  }

  useEffect(() => {
    if (sessionRef.current !== session) {
      // A different campaign is on screen: adopt it without cues.
      sessionRef.current = session
      prevRef.current = conditions
      prevTurnRef.current = turn
      setPhases({})
      setLingering([])
      return
    }
    const prev = prevRef.current
    const prevTurn = prevTurnRef.current
    const liveIds = new Set(conditions.map((c) => c.instanceId))
    const sameTurn = turn === undefined || prevTurn === undefined || turn === prevTurn
    const removed = prev.filter((c) => !liveIds.has(c.instanceId))
    // One classifier, not two: the hook used to recompute added, removed
    // and carried itself, so the rule the battery tests and the rule the
    // badges follow could drift apart.
    const decided = nextPhases({ prev, next: conditions, sameTurn, reduced, prevTurn })
    prevRef.current = conditions
    prevTurnRef.current = turn
    if (Object.keys(decided).length === 0 && removed.length === 0) return

    setPhases((p) => ({ ...p, ...decided }))

    // Entrance and tick cues are one-shot: settle each badge afterwards so
    // the class does not stay on the element. Each settle knows the phase
    // its own batch wrote and runs for that phase's own length, so it
    // cannot cut short a later cue on the same badge, and a batch that has
    // been superseded settles nothing.
    for (const { id, phase: was, ms } of settlesFor(decided)) {
      after(ms, () => setPhases((p) => (p[id] === was ? { ...p, [id]: 'attached' } : p)))
    }

    if (removed.length === 0) return
    const removedIds = new Set(removed.map((c) => c.instanceId))
    if (reduced) {
      // No sweep to play, so the badge goes at once and leaves no phase
      // entry behind.
      setPhases((p) => {
        const next = { ...p }
        for (const gone of removedIds) delete next[gone]
        return next
      })
      return
    }
    setLingering((l) => [...l.filter((c) => !removedIds.has(c.instanceId)), ...removed])
    after(CLEAR_LINGER_MS, () => {
      setLingering((l) => l.filter((c) => !removedIds.has(c.instanceId)))
      setPhases((p) => {
        const next = { ...p }
        for (const gone of removedIds) delete next[gone]
        return next
      })
    })
  }, [conditions, reduced, turn, session])

  const liveIds = new Set(conditions.map((c) => c.instanceId))
  const badges = [...conditions, ...lingering.filter((c) => !liveIds.has(c.instanceId))]
  return { badges, phases }
}
