// EXECUTE AND THE NIGHT (v1.3 brief 5.5), in a chunk of its own that the
// board fetches as it opens. EXECUTE commits the orders; then COLDVEIL IS
// MOVING for 750ms, and per event, in order: the strike on the board,
// then its card (the hit card, the debris call and its result, or an
// opportunity), and the intel card for a threat met for the first time;
// then END OF TURN with BEGIN TURN n+1 or DEBRIEF.
//
// Only the overlay and the strike advance on their own; every card waits
// for a tap (brief 5.5, M31). Under reduced motion both are skipped and
// the cards arrive with the board already changed; while the tab is
// hidden their clocks stop (brief 8.3). This replaces the v1.1 director,
// retired with its dwell, speeds and hold-to-resolve in v1.3 Round 3.
//
// The board under the cards is Game's: this tells it what to show
// (onBoard), which tile the strike is on, and how far the score fell.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MOMENT_CUES, strikeSound } from '../../cues'
import { strikeIntensity, useSilenceSound, useSound } from '../../audio'
import type { DebrisChoice, GameState } from '../../engine/types'
import { dossier, fileCard, knownThreats } from '../../persistence'
import { callSigns } from '../board/board'
import { LOCK_SHARE, STRIKE_MS, strikeOf, type Strike } from '../board/strike'
import { useReducedMotion } from '../cues/motion'
import { dossierCount } from '../titleStatus'
import type { StepCardProps } from './cards'
import DotField from './DotField'
import PixelSprite from '../sprites/PixelSprite'
import { SHIELD_FLASH } from '../sprites/effects'
import * as copy from './nightCopy'
import { callIndex, nightOf, type NightStep } from './nightModel'
import { useStageTimer } from './useStageTimer'
import './night.css'

// The night's cards, in two chunks of their own so each stays inside the
// deferred cap (brief 10): the hit card and the intel card (./cards), and
// the call, its result, an opportunity and END OF TURN (./closeCards).
// Fetched the moment this module is, which the board does as it opens,
// and rendered from the loaded modules rather than through React.lazy:
// a lazy card suspends on its first showing, and React holds a revealed
// boundary back for up to 300ms, which put a gap between the strike and
// its card.
let cards: typeof import('./cards') | null = null
let close: typeof import('./closeCards') | null = null
const ready = Promise.all([import('./cards').then((m) => (cards = m)), import('./closeCards').then((m) => (close = m))])
ready.catch(() => undefined)

export interface BoardView {
  shown: GameState
  strike: Strike | null
  // How far the score fell on a move that just landed, floated off it; a
  // block floats NO LOSS in its place (delta 0).
  drop: { id: string; delta: number } | null
}

export interface NightProps {
  // The state EXECUTE resolved from. Null when the night arrives from a
  // reload, which shows END OF TURN alone, from the record.
  before: GameState | null
  // The engine's resolution with HOLD, and with BURN on a night with a
  // call to make; `choice` once the player has made it.
  hold: GameState
  burn: GameState | null
  choice: DebrisChoice | null
  onCall: (choice: DebrisChoice) => void
  onBoard: (view: BoardView) => void
  // BEGIN TURN n+1, or DEBRIEF.
  onDone: () => void
}

type Stage =
  | { at: 'moving' }
  | { at: 'strike'; i: number; landed: boolean }
  | { at: 'card'; i: number; first: boolean }
  | { at: 'intel'; i: number; filed: number }
  | { at: 'call'; i: number }
  | { at: 'end' }

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
  const after = p.burn && p.choice === 'burn' ? p.burn : p.hold
  const pending = !!p.burn && p.choice === null
  const night = useMemo(() => (p.before ? nightOf(p.before, after) : null), [p.before, after])
  const call = p.burn ? callIndex(p.hold) : -1
  const record = after.history[after.history.length - 1]
  const scenario = after.scenario
  const lastTurn = record.turn >= scenario.totalTurns || (!pending && after.status !== 'playing')
  const signs = useMemo(() => new Map([...(p.before ? callSigns(p.before) : []), ...callSigns(after)]), [p.before, after])
  // What the player can name tonight: every threat met or named on this
  // device, and tonight's own, whether or not the turn is committed yet.
  const known = useMemo(() => new Set([...knownThreats(), ...record.events.map((e) => e.eventId), ...record.named]), [record])

  // Where a step's card starts: the call, the strike, or the card itself.
  const entry = (i: number): Stage => {
    if (!night || i >= night.steps.length) return { at: 'end' }
    if (i === call && pending) return { at: 'call', i }
    const step = night.steps[i]
    if (step.kind === 'threat' && !reduced) return { at: 'strike', i, landed: false }
    return { at: 'card', i, first: firstMeeting(step) }
  }
  const [stage, setStage] = useState<Stage>(() => (!night ? { at: 'end' } : reduced ? entry(0) : { at: 'moving' }))
  const go = (i: number) => setStage(entry(i))

  // The call made: the night goes on with the resolution it chose.
  const prevChoice = useRef(p.choice)
  useLayoutEffect(() => {
    if (prevChoice.current === p.choice) return
    prevChoice.current = p.choice
    if (stage.at === 'call' && night) setStage({ at: 'card', i: stage.i, first: firstMeeting(night.steps[stage.i]) })
  }, [p.choice, stage, night])

  // The two clocks: the overlay, and the strike's lock-on and landing.
  useStageTimer(stage.at === 'moving' ? 'moving' : null, 750, () => go(0))
  const striking = stage.at === 'strike' ? stage : null
  useStageTimer(striking && !striking.landed ? `lock-${striking.i}` : null, STRIKE_MS * LOCK_SHARE, () => {
    if (!striking || !night) return
    const step = night.steps[striking.i]
    play(strikeSound(step.ev.eventId, step.ev.effectiveSeverity > 0), { intensity: strikeIntensity(step.ev.effectiveSeverity) })
    setStage({ at: 'strike', i: striking.i, landed: true })
  })
  useStageTimer(striking?.landed ? `land-${striking.i}` : null, STRIKE_MS * (1 - LOCK_SHARE), () => {
    if (!striking || !night) return
    setStage({ at: 'card', i: striking.i, first: firstMeeting(night.steps[striking.i]) })
  })

  // Under reduced motion a threat's card is where its strike is heard.
  const heard = useRef(-1)
  useLayoutEffect(() => {
    if (!night || stage.at !== 'card' || heard.current === stage.i) return
    heard.current = stage.i
    const step = night.steps[stage.i]
    if (reduced && step.kind === 'threat') play(strikeSound(step.ev.eventId, step.ev.effectiveSeverity > 0), { intensity: strikeIntensity(step.ev.effectiveSeverity) })
  }, [stage, night, reduced, play])

  // What the board shows under each stage.
  const onBoard = p.onBoard
  useLayoutEffect(() => {
    if (!night || stage.at === 'end') return onBoard({ shown: after, strike: null, drop: null })
    if (stage.at === 'moving') return onBoard({ shown: night.opening, strike: null, drop: null })
    const step = night.steps[stage.i]
    if (stage.at === 'call') return onBoard({ shown: step.before, strike: null, drop: null })
    if (stage.at === 'strike') {
      const strike = strikeOf(`t${night.turn}-${stage.i}`, step.ev, step.def.layers, step.before, stage.landed)
      const fell = Math.round((step.scoreBefore - step.scoreAfter) * 10) / 10
      return onBoard({
        shown: stage.landed ? step.after : step.before,
        strike,
        drop: stage.landed && (fell > 0 || step.ev.effectiveSeverity === 0) ? { id: `t${night.turn}-${stage.i}`, delta: Math.max(0, fell) } : null,
      })
    }
    // While a move's card is up, its tile keeps a still reticle, so the
    // board says which tile the card is about, with motion or without
    // (fresh-eyes review: under reduced motion nothing marked it).
    const rest = step.kind === 'threat' ? strikeOf(`t${night.turn}-${stage.i}`, step.ev, step.def.layers, step.before, true) : null
    onBoard({ shown: step.after, strike: rest ? { ...rest, rest: true } : null, drop: null })
  }, [stage, night, after, onBoard])

  const onContinue = (i: number) => (collect: boolean) => {
    if (collect) {
      play(MOMENT_CUES.collect.sound)
      setStage({ at: 'intel', i, filed: dossierCount().filed })
      return
    }
    go(i + 1)
  }

  const turn = record.turn
  if (stage.at === 'moving') return <Moving />
  const step = night && stage.at !== 'end' ? night.steps[stage.i] : null
  if (stage.at === 'strike' && step) return <StrikeBanner key={`banner-${stage.i}`} held={step.ev.effectiveSeverity === 0} name={step.def.name} />
  if (!cards || !close) {
    if (!failed) return null
    return (
      <button
        type="button"
        data-continue
        onClick={() => {
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
  const { HitCard, IntelFile } = cards
  const { DebrisCall, DebrisResult, EndOfTurn, OpportunityCard } = close
  if (stage.at === 'end' || !night || !step) {
    return (
      <>
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
      </>
    )
  }
  const card: StepCardProps = {
    step,
    turn,
    lastTurn,
    signs,
    known,
    first: stage.at === 'card' ? stage.first : false,
    reduced,
    play,
    onContinue: onContinue(stage.i),
  }
  return (
    <>
      {stage.at === 'call' && <DebrisCall key={`call-${stage.i}`} step={step} turn={turn} filed={dossier().has(step.ev.eventId)} reduced={reduced} onCall={p.onCall} />}
      {(stage.at === 'card' || stage.at === 'intel') &&
        (step.kind === 'opportunity' ? (
          <OpportunityCard key={`card-${stage.i}`} {...card} />
        ) : step.kind === 'debris' ? (
          <DebrisResult key={`card-${stage.i}`} {...card} />
        ) : (
          <HitCard key={`card-${stage.i}`} {...card} />
        ))}
      {stage.at === 'intel' && (
        <IntelFile
          key={`intel-${stage.i}`}
          def={step.def}
          stoppedBy={step.def.counters.map((c) => scenario.countermeasures.find((x) => x.id === c)?.name ?? c)}
          filed={stage.filed}
          total={dossierCount().total}
          reduced={reduced}
          onFile={() => {
            // Filed on the device at once (brief 5.5 item 3).
            fileCard(step.ev.eventId)
            play(MOMENT_CUES.file.sound)
            go(stage.i + 1)
          }}
        />
      )}
    </>
  )
}

// A threat met for the first time is one not yet in the Dossier: its card
// offers COLLECT INTEL CARD, and every later meeting offers CONTINUE.
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

// The strike's banner (brief 5.5 item 1): COLDVEIL MOVES or HELD, with the
// move's name.
function StrikeBanner({ held, name }: { held: boolean; name: string }) {
  return (
    <div data-strike-banner={held ? 'held' : 'hit'} aria-hidden="true" className="dc-banner-in pointer-events-none fixed inset-x-0 top-[34%] z-40 flex flex-col items-center gap-2 px-4">
      <span className={`flex items-center gap-2 font-display text-[20px] ${held ? 'text-dc-go' : 'text-dc-hostile'}`}>
        {held && <PixelSprite sprite={SHIELD_FLASH} scale={2} name="banner-shield" />}
        {held ? copy.STRIKE_HELD : copy.STRIKE_HIT}
      </span>
      <small className="max-w-full bg-dc-ground/90 px-2.5 py-1 text-center font-mono text-xs text-dc-ink">{name}</small>
    </div>
  )
}
