// EXECUTE AND THE NIGHT (v1.3 brief 5.5; a decision in the night since
// v1.7 R1), in a chunk of its own that the board fetches as it opens.
// EXECUTE commits the orders; then COLDVEIL IS MOVING for 750ms, and per
// move, in order:
//   - a move that would land stops the night on one screen, THE RESPONSE:
//     the move and two or three answers, each with its cost and what it
//     does. The player's choice goes to the engine with the orders, and
//     the same screen then shows the result, with the move's Dossier
//     headline and FILE TO DOSSIER the first time it is met;
//   - a move a defense already stops gets THE BLOCK MOMENT, under a
//     second, on its own: the shield on its tile, BLOCKED, the streak, its
//     sound; then its result only if its card is still to file;
//   - the debris call and its result, and an opportunity, as before;
// then END OF TURN with BEGIN TURN n+1 or DEBRIEF.
//
// Only the overlay and the block moment advance on their own; everything
// else waits for the player (brief 5.5, M31). Under reduced motion the
// block moment stands still for its time and nothing else moves; while
// the tab is hidden the clocks stop (brief 8.3).
//
// The board under the cards is Game's: this tells it what to show
// (onBoard), which tile the strike is on, and how far the score fell.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MOMENT_CUES, strikeSound } from '../../cues'
import { strikeIntensity, useSilenceSound, useSound } from '../../audio'
import { responseOptions } from '../../engine/responses'
import type { DebrisChoice, GameState } from '../../engine/types'
import { dossier, fileCard, knownThreats } from '../../persistence'
import { callSigns } from '../board/board'
import { WIDE_BOARD, shortName } from '../board/boardModel'
import { BLOCK_MS, LOCK_SHARE, STRIKE_MS, strikeOf, tracesOf, type Strike, type Trace } from '../board/strike'
import { CloseUp, type CloseUpProps } from '../board/Playfield'
import { useReducedMotion } from '../cues/motion'
import { maiScore } from '../../engine/scoring'
import { dossierCount } from '../titleStatus'
import type { StepCardProps } from './cards'
import DotField from './DotField'
import PixelSprite from '../sprites/PixelSprite'
import { SHIELD_STAMP } from '../sprites/effects'
import * as copy from './nightCopy'
import { callIndex, nightOf, offersResponse, type NightStep } from './nightModel'
import { useStageTimer } from './useStageTimer'
import './night.css'

// The night's cards, in two chunks of their own so each stays inside the
// deferred cap (brief 10): the response and the result (./cards), and the
// call, its result, an opportunity and END OF TURN (./closeCards).
// Fetched the moment this module is, which the board does as it opens,
// and rendered from the loaded modules rather than through React.lazy:
// a lazy card suspends on its first showing, and React holds a revealed
// boundary back for up to 300ms.
let cards: typeof import('./cards') | null = null
let close: typeof import('./closeCards') | null = null
const ready = Promise.all([import('./cards').then((m) => (cards = m)), import('./closeCards').then((m) => (close = m))])
ready.catch(() => undefined)

export interface BoardView {
  shown: GameState
  strike: Strike | null
  // How far the score fell on a move that just landed, floated off it; a
  // block floats NO LOSS in its place (delta 0). Under COLDVEIL IS MOVING,
  // the live conditions' fall, with their name (v1.3 R5: "-2.5 JAMMED").
  drop: { id: string; delta: number; label?: string } | null
  // A view from before the night's close (every stage but END OF TURN):
  // a condition's turns left read as the close will leave them (G-103).
  preClose?: boolean
  // Tonight's moves before the one on screen, all of them at END OF TURN,
  // which the playfield keeps on the board (v1.5 R2).
  traces?: Trace[]
  // The desktop's night log (v1.5 R2): the moves landed so far, the one
  // whose card is up among them, and the move on its way while it strikes.
  log?: Trace[]
  moving?: string | null
  // END OF TURN states the turn's change itself, so the HUD floats none
  // (v1.6 R4's fresh eyes, K12: a green +4.0 over the card's red ▼1.4).
  hush?: boolean
}

export interface NightProps {
  // The state EXECUTE resolved from. Null when the night arrives from a
  // reload, which shows END OF TURN alone, from the record.
  before: GameState | null
  // The engine's resolution with HOLD, and with BURN on a night with a
  // call to make; `choice` once the player has made it. Both carry the
  // responses answered so far, every other move ridden out.
  hold: GameState
  burn: GameState | null
  choice: DebrisChoice | null
  // THE RESPONSES (v1.7 R1): the answers so far, by the move's place in
  // the night (null: ridden out); the engine's resolution of the night
  // were move `index` answered with `id`, for what each option would do;
  // and the answer itself.
  responses?: readonly (string | null)[]
  preview?: (index: number, id: string | null) => GameState | null
  onRespond?: (index: number, id: string | null) => void
  onCall: (choice: DebrisChoice) => void
  onBoard: (view: BoardView) => void
  // BEGIN TURN n+1, or DEBRIEF.
  onDone: () => void
}

type Stage =
  | { at: 'moving' }
  | { at: 'respond'; i: number }
  | { at: 'strike'; i: number; landed: boolean }
  | { at: 'card'; i: number; first: boolean; impact: boolean; filed: { n: number; total: number } | null }
  | { at: 'call'; i: number }
  | { at: 'end' }

const NO_RESPONSES: readonly (string | null)[] = []

export default function Night(p: NightProps) {
  const reduced = useReducedMotion()
  const play = useSound()
  // A player who walks out mid-night (SYSTEM's BACK TO TITLE, a new
  // operation) takes the night's sound with them; a night that ends on its
  // own (BEGIN TURN, DEBRIEF) lets its last cue ring out over the next
  // screen, which is where it belongs.
  const silence = useSilenceSound()
  const finished = useRef(false)
  useEffect(
    () => () => {
      if (!finished.current) silence()
    },
    [silence],
  )
  // Should the cards still be on their way (a slow first fetch), the night
  // waits for them; should they never come, one plain button carries the
  // player on, so a turn the engine resolved can always be left.
  const [loaded, setLoaded] = useState(() => !!(cards && close))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    ready.then(
      () => setLoaded(true),
      () => setFailed(true),
    )
  }, [loaded])
  const responses = p.responses ?? NO_RESPONSES
  const after = p.burn && p.choice === 'burn' ? p.burn : p.hold
  const pending = !!p.burn && p.choice === null
  const night = useMemo(() => (p.before ? nightOf(p.before, after) : null), [p.before, after])
  const call = p.burn ? callIndex(p.hold) : -1
  const record = after.history[after.history.length - 1]
  const scenario = after.scenario
  // Whether a move still waits for its answer: until then the turn's end
  // is not settled, the last turn's least of all.
  const asking = (i: number) => !!night && !!p.onRespond && offersResponse(night.steps[i].ev) && responses[i] === undefined
  const unsettled = pending || (!!night && night.steps.some((_, i) => asking(i)))
  const lastTurn = record.turn >= scenario.totalTurns || (!unsettled && after.status !== 'playing')
  const signs = useMemo(() => new Map([...(p.before ? callSigns(p.before) : []), ...callSigns(after)]), [p.before, after])
  // What the player can name tonight: every threat met or named on this
  // device, and tonight's own, whether or not the turn is committed yet.
  const known = useMemo(() => new Set([...knownThreats(), ...record.events.map((e) => e.eventId), ...record.named]), [record])

  const blockedByDefense = (step: NightStep) => step.kind === 'threat' && step.ev.effectiveSeverity === 0 && !step.ev.response
  const cardAt = (i: number, impact = false): Stage => ({ at: 'card', i, first: firstMeeting(night!.steps[i]), impact, filed: null })
  // Where a step starts: the call, the response, the block moment, or its
  // card. A move a defense stops, already filed, has no card: the block
  // moment is all of it.
  const entry = (i: number): Stage => {
    if (!night || i >= night.steps.length) return { at: 'end' }
    if (i === call && pending) return { at: 'call', i }
    if (asking(i)) return { at: 'respond', i }
    if (blockedByDefense(night.steps[i])) return { at: 'strike', i, landed: reduced }
    return cardAt(i)
  }
  const [stage, setStage] = useState<Stage>(() => (!night ? { at: 'end' } : reduced ? entry(0) : { at: 'moving' }))
  const go = (i: number) => setStage(entry(i))

  // The call made, or the response: the night goes on with the resolution
  // it chose, on the same screen.
  const prevChoice = useRef(p.choice)
  const answeredAt = stage.at === 'respond' && responses[stage.i] !== undefined
  useLayoutEffect(() => {
    if (!night) return
    if (prevChoice.current !== p.choice) {
      prevChoice.current = p.choice
      if (stage.at === 'call') setStage(cardAt(stage.i))
    }
    if (stage.at === 'respond' && answeredAt) setStage(cardAt(stage.i, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.choice, stage, night, answeredAt])

  // The clocks: the overlay, the block moment, a landed answer's beat on
  // the board, and the FILED stamp.
  useStageTimer(stage.at === 'moving' ? 'moving' : null, 750, () => go(0))
  const striking = stage.at === 'strike' ? stage : null
  const heard = useRef(-1)
  const sound = (i: number) => {
    if (!night || heard.current === i) return
    heard.current = i
    const step = night.steps[i]
    play(strikeSound(step.ev.eventId, step.ev.effectiveSeverity > 0), { intensity: strikeIntensity(step.ev.effectiveSeverity) })
  }
  const land = () => {
    if (!striking) return
    sound(striking.i)
    setStage({ at: 'strike', i: striking.i, landed: true })
  }
  // After the block moment: its card if there is one to file, else on.
  const pastBlock = () => {
    if (!striking || !night) return
    setStage(firstMeeting(night.steps[striking.i]) ? cardAt(striking.i) : entry(striking.i + 1))
  }
  useStageTimer(striking && !striking.landed ? `lock-${striking.i}` : null, BLOCK_MS * LOCK_SHARE, land)
  useStageTimer(striking?.landed ? `land-${striking.i}` : null, reduced ? BLOCK_MS : BLOCK_MS * (1 - LOCK_SHARE), pastBlock)
  // Under reduced motion the block moment arrives landed, and is heard then.
  useLayoutEffect(() => {
    if (striking?.landed) sound(striking.i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [striking?.i, striking?.landed])
  const tapStrike = () => {
    if (!striking) return
    sound(striking.i)
    pastBlock()
  }
  const carded = stage.at === 'card' ? stage : null
  useStageTimer(carded?.impact ? `impact-${carded.i}` : null, STRIKE_MS, () => carded && setStage({ ...carded, impact: false }))
  useStageTimer(carded?.filed ? `filed-${carded.i}` : null, cards?.FILED_BEAT_MS ?? 500, () => carded && go(carded.i + 1))

  // A threat's card is where its strike is heard, unless its block moment
  // already sounded it.
  useLayoutEffect(() => {
    if (!night || stage.at !== 'card') return
    if (night.steps[stage.i].kind === 'threat') sound(stage.i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, night])

  // What the board shows under each stage, with the night's moves so far
  // on the playfield.
  const onBoard = p.onBoard
  useLayoutEffect(() => {
    const traces = (n?: number) => tracesOf(record.turn, record.events, scenario, n)
    if (!night || stage.at === 'end') return onBoard({ shown: after, strike: null, drop: null, traces: traces(), log: traces(), hush: true })
    if (stage.at === 'moving') {
      const fell = Math.round((maiScore(night.before) - maiScore(night.opening)) * 10) / 10
      const label = night.pressed.length === 1 ? night.pressed[0] : copy.CONDITIONS_WORD
      return onBoard({ shown: night.opening, strike: null, drop: fell > 0 ? { id: `t${night.turn}-press`, delta: fell, label } : null, preClose: true })
    }
    const step = night.steps[stage.i]
    const id = `t${night.turn}-${stage.i}`
    if (stage.at === 'call') return onBoard({ shown: step.before, strike: null, drop: null, preClose: true, traces: traces(stage.i), log: traces(stage.i) })
    const fell = Math.round((step.scoreBefore - step.scoreAfter) * 10) / 10
    const drop = fell > 0 || step.ev.effectiveSeverity === 0 ? { id, delta: Math.max(0, fell) } : null
    if (stage.at === 'respond') {
      // The move on its way: the reticle locks on its tile and waits there
      // for the answer; the desktop's log has it INCOMING.
      return onBoard({ shown: step.before, strike: strikeOf(id, step.ev, step.def.layers, step.before, false), drop: null, preClose: true, traces: traces(stage.i), log: traces(stage.i), moving: step.ev.eventId })
    }
    if (stage.at === 'strike') {
      return onBoard({
        shown: stage.landed ? step.after : step.before,
        strike: strikeOf(id, step.ev, step.def.layers, step.before, stage.landed),
        drop: stage.landed ? drop : null,
        preClose: true,
        traces: traces(stage.i),
        log: traces(stage.landed ? stage.i + 1 : stage.i),
        moving: stage.landed ? null : step.ev.eventId,
      })
    }
    // A move's card. As an answer lands, the board plays it: the scorch or
    // the shield on the tile, and the score's change floated off it. After
    // that beat, and for any other card, the tile keeps a still reticle, so
    // the board says which tile the card is about; with motion off the
    // HUD's delta chip stands in for the float (v1.6 R1).
    const mark = step.kind === 'threat' ? strikeOf(id, step.ev, step.def.layers, step.before, true) : null
    const playing = stage.impact && !reduced
    onBoard({
      shown: step.after,
      strike: mark ? (playing ? mark : { ...mark, rest: true }) : null,
      drop: step.kind === 'threat' && (playing || reduced) ? drop : null,
      preClose: true,
      // The debris has no strike; its card keeps its trace on the board.
      traces: traces(step.kind === 'debris' ? stage.i + 1 : stage.i),
      log: traces(stage.i + 1),
    })
  }, [stage, night, after, onBoard, reduced, record, scenario])

  // FILE TO DOSSIER files the card at once (v1.6 R3, Ken's playtest item
  // 4): the button becomes its FILED stamp, the file cue rings, and after
  // a beat the night goes on (v1.7 R1: no second card to tap through).
  const onContinue = (i: number) => (collect: boolean) => {
    if (collect && night && carded) {
      fileCard(night.steps[i].ev.eventId)
      play(MOMENT_CUES.collect.sound)
      const { filed, total } = dossierCount()
      setStage({ ...carded, impact: false, filed: { n: filed, total } })
      return
    }
    go(i + 1)
  }
  useEffect(() => {
    if (!carded?.filed) return
    const id = window.setTimeout(() => play(MOMENT_CUES.file.sound), reduced ? 0 : 160)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carded?.filed, carded?.i])

  // What each answer to the move on screen would do to the score, from
  // the engine's own resolution of it.
  const asked = stage.at === 'respond' ? stage.i : -1
  const previewRef = useRef(p.preview)
  previewRef.current = p.preview
  const outcomes = useMemo(() => {
    const out = new Map<string | null, { score: number; repair: number }>()
    const preview = previewRef.current
    if (asked < 0 || !night || !preview) return out
    const step = night.steps[asked]
    for (const id of [null, ...(step.def.responses ?? []).map((r) => r.id)]) {
      const ev = preview(asked, id)?.history.at(-1)?.events[asked]
      if (ev) out.set(id, { score: Math.round((ev.scoreAfter - ev.scoreBefore) * 10) / 10, repair: ev.repairCost })
    }
    return out
  }, [asked, night])

  const turn = record.turn
  if (stage.at === 'moving') return <Moving />
  const step = night && stage.at !== 'end' ? night.steps[stage.i] : null
  if (stage.at === 'strike' && step) {
    // The close-up's target: the tile the move was aimed at (v1.5 R2).
    const from = step.before.assets.find((a) => a.id === step.ev.targetAssetId)
    const view: CloseUpProps = {
      eventId: step.ev.eventId,
      layer: from?.layer ?? step.def.layers[0],
      kind: from?.kind,
      integrity: from ? [from.integrity, from.integrity] : undefined,
      hit: false,
      landed: stage.landed,
      still: reduced,
    }
    return (
      <>
        {/* The whole screen takes the tap that ends the block moment. */}
        <button type="button" data-strike-tap aria-label={copy.NEXT_STRIKE} onClick={tapStrike} className="fixed inset-0 z-[39] cursor-pointer" />
        <BlockMoment key={`banner-${stage.i}`} name={shortName(step.def)} streak={step.streak} view={view} reduced={reduced} />
      </>
    )
  }
  if (!cards || !close) {
    if (!failed) return null
    return (
      <button
        type="button"
        data-continue
        onClick={() => {
          if (stage.at === 'respond') return p.onRespond?.(stage.i, null)
          if (stage.at !== 'end' && night) return stage.at === 'call' ? p.onCall('hold') : go(stage.i + 1)
          finished.current = true
          p.onDone()
        }}
        className="mt-auto min-h-12 border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground"
      >
        CONTINUE
      </button>
    )
  }
  const { HitCard, ResponseCard } = cards
  const { DebrisCall, DebrisResult, EndOfTurn, OpportunityCard } = close
  if (stage.at === 'end' || !night || !step) {
    return (
      <EndOfTurn
        key={`end-${turn}`}
        record={record}
        state={after}
        night={night}
        reduced={reduced}
        play={play}
        onNext={() => {
          finished.current = true
          if (after.status === 'playing') play(MOMENT_CUES['turn-start'].sound)
          p.onDone()
        }}
      />
    )
  }
  if (stage.at === 'respond') {
    return (
      <ResponseCard
        key={`respond-${stage.i}`}
        step={step}
        turn={turn}
        of={night.steps.filter((x) => x.kind === 'threat').length}
        signs={signs}
        options={responseOptions(step.def, step.ev, after.difficulty)}
        outcomes={outcomes}
        reduced={reduced}
        onRespond={(id) => p.onRespond?.(stage.i, id)}
      />
    )
  }
  if (stage.at === 'strike') return null
  if (stage.at === 'call') return <DebrisCall key={`call-${stage.i}`} step={step} turn={turn} filed={dossier().has(step.ev.eventId)} reduced={reduced} onCall={p.onCall} />
  const card: StepCardProps = {
    step,
    turn,
    lastTurn,
    signs,
    known,
    first: stage.first,
    filed: stage.filed,
    reduced,
    play,
    onContinue: onContinue(stage.i),
  }
  return step.kind === 'opportunity' ? (
    <OpportunityCard key={`card-${stage.i}`} {...card} />
  ) : step.kind === 'debris' ? (
    <DebrisResult key={`card-${stage.i}`} {...card} />
  ) : (
    <HitCard key={`card-${stage.i}`} {...card} options={step.ev.response ? [] : responseOptions(step.def, step.ev, after.difficulty)} />
  )
}

// A threat met for the first time is one not yet in the Dossier: its card
// offers FILE TO DOSSIER, and every later meeting offers CONTINUE.
// Opportunities are not threats and are never filed.
function firstMeeting(step: NightStep): boolean {
  return step.kind !== 'opportunity' && !dossier().has(step.ev.eventId)
}

// COLDVEIL IS MOVING (brief 5.5): the red sweep and the spinner, 750ms.
function Moving() {
  return (
    <div data-moving role="status" className="dc-moving-in fixed inset-0 z-40 flex items-center justify-center bg-dc-ground/55">
      <DotField token="hostile" mode="sweep" gap={12} ms={750} />
      <p className="relative flex items-center gap-3 border-2 border-dc-hostile bg-dc-ground/85 px-4 py-3 font-display text-[13px] text-dc-hostile">
        <span aria-hidden="true" className="dc-spin">
          <i />
          <i />
          <i />
        </span>
        {copy.MOVING}
      </p>
    </div>
  )
}

// THE BLOCK MOMENT (v1.7 R1, Ken's ruling of 9 November 2026: blocks that
// land). A move a defense stops breaks on its tile: the shield and the
// close-up, BLOCKED with the shield's stamp, the move's name, and the
// streak it extends, with its own sound and a haptic tick where the phone
// has one. Under a second, on its own, and it reads without motion and
// without sound: the word, the shield and the streak are all still there,
// and a screen reader hears the line.
function BlockMoment({ name, streak, view, reduced }: { name: string; streak: number; view: CloseUpProps; reduced: boolean }) {
  // On a phone the banner stands under the asset strip, never over it
  // (v1.6 R2's fresh eyes, G7).
  const [top] = useState(() => {
    if (typeof window === 'undefined' || window.matchMedia?.(WIDE_BOARD).matches) return undefined
    const strip = document.querySelector('[data-strip]')?.getBoundingClientRect().bottom ?? 0
    return strip + 12 > window.innerHeight * 0.3 ? strip + 12 : undefined
  })
  return (
    <div
      data-strike-banner="held"
      data-block-moment
      style={top === undefined ? undefined : { top }}
      className={`${reduced ? '' : 'dc-banner-in'} pointer-events-none fixed inset-x-0 top-[30%] z-40 flex flex-col items-center gap-2 px-4`}
    >
      <span role="status" className="sr-only">
        {copy.blockedSay(name, streak)}
      </span>
      {/* The move on its target, close up (v1.5 R2). */}
      <div aria-hidden="true" className="contents">
        <CloseUp {...view} />
        <span data-strike-word="held" className="flex items-center gap-2.5 font-display text-[28px] text-dc-go">
          <PixelSprite sprite={SHIELD_STAMP} scale={3} name="banner-shield" className={reduced ? '' : 'dc-stamp-pop'} />
          {copy.STRIKE_WORD.held}
        </span>
        <small data-strike-name className="max-w-full bg-dc-ground/90 px-2.5 py-1 text-center font-mono text-xs text-dc-ink">
          {name}
        </small>
        <span data-block-streak className="bg-dc-ground/90 px-2.5 py-1 font-mono text-[11px] tracking-wider text-dc-go">
          {copy.streakLine(streak)}
        </span>
      </div>
    </div>
  )
}
