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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MOMENT_CUES, strikeSound } from '../../cues'
import { strikeIntensity, useSilenceSound, useSound } from '../../audio'
import type { DebrisChoice, GameState } from '../../engine/types'
import { dossier, fileCard, knownThreats } from '../../persistence'
import { callSigns } from '../board/board'
import { WIDE_BOARD, shortName, stoppedByLine } from '../board/boardModel'
import { LOCK_SHARE, STRIKE_HOLD_MS, STRIKE_MS, strikeOf, tracesOf, type Strike, type Trace } from '../board/strike'
import { CloseUp, type CloseUpProps } from '../board/Playfield'
import { useReducedMotion } from '../cues/motion'
import { maiScore } from '../../engine/scoring'
import { dossierCount } from '../titleStatus'
import type { StepCardProps } from './cards'
import DotField from './DotField'
import PixelSprite from '../sprites/PixelSprite'
import { SHIELD_STAMP } from '../sprites/effects'
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

  // SKIP NIGHT (v1.6 R3, Ken's ruling of 27 October 2026 on his playtest
  // item 2): the rest of the night plays without strikes, and stops only
  // where the player has something to do: the debris call, and a move met
  // for the first time, whose card files it to the Dossier. Every other
  // card is passed, and END OF TURN shows the night whole.
  const [skipping, setSkipping] = useState(false)
  // Where a step's card starts: the call, the strike, or the card itself.
  const entry = (i: number, skip = skipping): Stage => {
    if (!night || i >= night.steps.length) return { at: 'end' }
    if (i === call && pending) return { at: 'call', i }
    const step = night.steps[i]
    if (skip) return firstMeeting(step) ? { at: 'card', i, first: true } : entry(i + 1, skip)
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
  const land = () => {
    if (!striking || !night) return
    const step = night.steps[striking.i]
    play(strikeSound(step.ev.eventId, step.ev.effectiveSeverity > 0), { intensity: strikeIntensity(step.ev.effectiveSeverity) })
    setStage({ at: 'strike', i: striking.i, landed: true })
  }
  const toCard = () => {
    if (!striking || !night) return
    setStage({ at: 'card', i: striking.i, first: firstMeeting(night.steps[striking.i]) })
  }
  useStageTimer(striking && !striking.landed ? `lock-${striking.i}` : null, STRIKE_MS * LOCK_SHARE, land)
  // The landed strike stands until STRIKE_HOLD_MS from its lock-on (v1.6
  // R3, Ken's playtest item 2), then its card comes up.
  useStageTimer(striking?.landed ? `land-${striking.i}` : null, STRIKE_HOLD_MS - STRIKE_MS * LOCK_SHARE, toCard)
  // A tap during a strike ends its hold: a strike still locking on lands
  // (its sound with it), and a landed one gives way to its card.
  const tapStrike = () => {
    if (!striking) return
    if (striking.landed) toCard()
    else {
      land()
      toCard()
    }
  }
  const skipNight = () => {
    setSkipping(true)
    if (striking) setStage(firstMeeting(night!.steps[striking.i]) ? { at: 'card', i: striking.i, first: true } : entry(striking.i + 1, true))
  }

  // Under reduced motion a threat's card is where its strike is heard.
  const heard = useRef(-1)
  useLayoutEffect(() => {
    if (!night || stage.at !== 'card' || heard.current === stage.i) return
    heard.current = stage.i
    const step = night.steps[stage.i]
    if (reduced && step.kind === 'threat') play(strikeSound(step.ev.eventId, step.ev.effectiveSeverity > 0), { intensity: strikeIntensity(step.ev.effectiveSeverity) })
  }, [stage, night, reduced, play])

  // What the board shows under each stage, with the night's moves so far
  // on the playfield.
  const onBoard = p.onBoard
  useLayoutEffect(() => {
    const traces = (n?: number) => tracesOf(record.turn, record.events, scenario, n)
    if (!night || stage.at === 'end') return onBoard({ shown: after, strike: null, drop: null, traces: traces(), log: traces() })
    if (stage.at === 'moving') {
      const fell = Math.round((maiScore(night.before) - maiScore(night.opening)) * 10) / 10
      const label = night.pressed.length === 1 ? night.pressed[0] : copy.CONDITIONS_WORD
      return onBoard({ shown: night.opening, strike: null, drop: fell > 0 ? { id: `t${night.turn}-press`, delta: fell, label } : null, preClose: true })
    }
    const step = night.steps[stage.i]
    if (stage.at === 'call') return onBoard({ shown: step.before, strike: null, drop: null, preClose: true, traces: traces(stage.i), log: traces(stage.i) })
    if (stage.at === 'strike') {
      const strike = strikeOf(`t${night.turn}-${stage.i}`, step.ev, step.def.layers, step.before, stage.landed)
      const fell = Math.round((step.scoreBefore - step.scoreAfter) * 10) / 10
      return onBoard({
        shown: stage.landed ? step.after : step.before,
        strike,
        drop: stage.landed && (fell > 0 || step.ev.effectiveSeverity === 0) ? { id: `t${night.turn}-${stage.i}`, delta: Math.max(0, fell) } : null,
        preClose: true,
        traces: traces(stage.i),
        // The desktop's log writes the move's row as it lands (v1.6 R2,
        // R1's fresh eyes F6); until then it is INCOMING.
        log: traces(stage.landed ? stage.i + 1 : stage.i),
        moving: stage.landed ? null : step.ev.eventId,
      })
    }
    // While a move's card is up, its tile keeps a still reticle, so the
    // board says which tile the card is about, with motion or without
    // (fresh-eyes review: under reduced motion nothing marked it).
    const rest = step.kind === 'threat' ? strikeOf(`t${night.turn}-${stage.i}`, step.ev, step.def.layers, step.before, true) : null
    // With motion off no strike floats the move's change, so the HUD's
    // delta chip stands while its card is up (v1.6 R1: the score's digits
    // stay neutral, and the chip is where a hit's red and a block's green
    // show).
    const fell = Math.round((step.scoreBefore - step.scoreAfter) * 10) / 10
    const drop = reduced && step.kind === 'threat' && (fell > 0 || step.ev.effectiveSeverity === 0) ? { id: `t${night.turn}-${stage.i}`, delta: Math.max(0, fell) } : null
    // The debris has no strike; its card keeps its trace on the board.
    onBoard({ shown: step.after, strike: rest ? { ...rest, rest: true } : null, drop, preClose: true, traces: traces(step.kind === 'debris' ? stage.i + 1 : stage.i), log: traces(stage.i + 1) })
  }, [stage, night, after, onBoard, reduced, record, scenario])

  // FILE TO DOSSIER files the card at once (v1.6 R3, Ken's playtest item
  // 4), and the card arrives stamped FILED; the file cue rings as the stamp
  // lands.
  const onContinue = (i: number) => (collect: boolean) => {
    if (collect && night) {
      const filed = dossierCount().filed
      fileCard(night.steps[i].ev.eventId)
      play(MOMENT_CUES.collect.sound)
      setStage({ at: 'intel', i, filed })
      return
    }
    go(i + 1)
  }
  useEffect(() => {
    if (stage.at !== 'intel') return
    const id = window.setTimeout(() => play(MOMENT_CUES.file.sound), reduced ? 0 : 420)
    return () => window.clearTimeout(id)
  }, [stage, reduced, play])

  const turn = record.turn
  if (stage.at === 'moving') return <Moving />
  const step = night && stage.at !== 'end' ? night.steps[stage.i] : null
  if (stage.at === 'strike' && step) {
    // The close-up's target: the tile the move was aimed at, either side
    // of it (v1.5 R2).
    const from = step.before.assets.find((a) => a.id === step.ev.targetAssetId)
    const to = step.after.assets.find((a) => a.id === step.ev.targetAssetId)
    const view: CloseUpProps = {
      eventId: step.ev.eventId,
      layer: from?.layer ?? step.def.layers[0],
      kind: from?.kind,
      integrity: from ? [from.integrity, to?.integrity ?? 0] : undefined,
      hit: step.ev.effectiveSeverity > 0,
      landed: stage.landed,
    }
    return (
      <>
        {/* The whole screen takes the tap that ends the strike's hold. */}
        <button type="button" data-strike-tap aria-label={copy.NEXT_STRIKE} onClick={tapStrike} className="fixed inset-0 z-[39] cursor-pointer" />
        <StrikeBanner key={`banner-${stage.i}`} result={step.ev.effectiveSeverity === 0 ? 'held' : step.ev.outcome === 'reduced' ? 'reduced' : 'hit'} name={shortName(step.def)} view={view}>
          {cards && <cards.StrikeCard step={step} signs={signs} earlier={tracesOf(turn, record.events, scenario, stage.i)} of={tracesOf(turn, record.events, scenario).length} />}
        </StrikeBanner>
        <button
          type="button"
          data-skip-night
          onClick={skipNight}
          className="dc-tile fixed bottom-3 right-3 z-50 min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink shadow-press active:shadow-none"
        >
          {copy.SKIP_NIGHT}
        </button>
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
          stoppedBy={stoppedByLine(step.def, scenario)}
          filed={stage.filed}
          total={dossierCount().total}
          reduced={reduced}
          onContinue={() => go(stage.i + 1)}
        />
      )}
    </>
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

// The strike's banner (brief 5.5 item 1): COLDVEIL MOVES or BLOCKED, with the
// move's name; on a phone the strike's card under it names the move
// instead (v1.6 R1), and the stylesheet keeps one of the two.
function StrikeBanner({ result, name, view, children }: { result: keyof typeof copy.STRIKE_WORD; name: string; view: CloseUpProps; children?: ReactNode }) {
  const held = result === 'held'
  // On a phone the banner stands under the asset strip, never over it
  // (v1.6 R2's fresh eyes, G7: once a condition's chip or the streak's
  // line made the strip taller, its foot ran under the close-up). Read as
  // the strike starts, before the card under it measures its room, with
  // 12px to spare for the streak's line, which can arrive as a move lands.
  const [top] = useState(() => {
    if (typeof window === 'undefined' || window.matchMedia?.(WIDE_BOARD).matches) return undefined
    const strip = document.querySelector('[data-strip]')?.getBoundingClientRect().bottom ?? 0
    return strip + 12 > window.innerHeight * 0.3 ? strip + 12 : undefined
  })
  return (
    <div
      data-strike-banner={held ? 'held' : 'hit'}
      aria-hidden="true"
      style={top === undefined ? undefined : { top }}
      className="dc-banner-in pointer-events-none fixed inset-x-0 top-[30%] z-40 flex flex-col items-center gap-2 px-4"
    >
      {/* The move on its target, close up (v1.5 R2). */}
      <CloseUp {...view} />
      <span data-strike-word={result} className={`flex items-center gap-2.5 font-display text-[28px] ${held ? 'text-dc-go' : result === 'reduced' ? 'text-dc-warn' : 'text-dc-hostile'}`}>
        {held && <PixelSprite sprite={SHIELD_STAMP} scale={3} name="banner-shield" className="dc-stamp-pop" />}
        {copy.STRIKE_WORD[result]}
      </span>
      <small data-strike-name className="max-w-full bg-dc-ground/90 px-2.5 py-1 text-center font-mono text-xs text-dc-ink">
        {name}
      </small>
      {children}
    </div>
  )
}
