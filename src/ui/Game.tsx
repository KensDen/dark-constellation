// The game shell. Since v1.2 Round 1 the play screen is a BOARD (board
// pass brief section 4): a pinned HUD, the threat banner, three layer
// panels of asset tiles, and a pinned five-button action bar whose first
// four open bottom sheets over the board. The start screen and the
// outcome screen are the v1.1 ones. All game logic is unchanged: this
// file still owns the cart, the affordability gate, the cues and the
// engine call, and the components under ./board only render what it
// hands them. Since v1.2 R5 the outcome screen is the score screen, a
// chunk of its own (./ScoreScreen), and a campaign may be a Daily Op. The game-feel pass (Round 2) adds a playback phase between
// resolve and aftermath: the director plays the resolved turn beat by
// beat over a presented state, and instant speed skips straight to the
// aftermath exactly as v1.0 did. Instant is an explicit choice only:
// reduced motion keeps the sequence and takes the static form of every
// cue (brief v1.2 section 3).

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { getHaptics } from '../haptics'
import { ADVERSARY } from '../config'
import {
  LocalDailyLedger,
  LocalScoreSink,
  LocalStorageStore,
  SaveError,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  type DailyOp,
  type DailyStanding,
  type RestoredGame,
  type SaveMeta,
  type SavePhase,
} from '../persistence'
import { copyToClipboard } from './clipboard'
import { DC_BTN } from './buttons'
import DirectorView from '../director/DirectorView'
import HoldButton from './cues/HoldButton'
import { useMusicState, useSound, useSoundPrefs } from '../audio'
import { hasDoneFirstTurn, markFirstTurnDone } from './firstTurn'
import {
  beatDwellMs,
  defaultSpeed,
  deriveBeats,
  loadSpeedPreference,
  saveSpeedPreference,
  type Beat,
  type Speed,
} from '../director'
import { useBadgePhases } from './cues/ConditionBadge'
import { CUE_MS, useCueClass, usePageVisible, useReducedMotion } from './cues/motion'
import { JOB_FRAMING_HEADING, jobFramingBlocks } from './brief'
import Hud from './board/Hud'
import ThreatBanner from './board/ThreatBanner'
import LayerPanel, { type ChipModel } from './board/LayerPanel'
import BoardReference from './board/BoardReference'
import AftermathCard from './board/AftermathCard'
import ProcureSheet, { type ProcurePick } from './board/ProcureSheet'
import HardenSheet, { HARDEN_STEPS } from './board/HardenSheet'
import IntelSheet, { INTEL_STEPS } from './board/IntelSheet'
import SurgeSheet from './board/SurgeSheet'
import type { SheetId, StepSheet } from './board/actions'
import { ACTIONS, GUIDE, creditsTag, guideStage, resolveLabel, resolvingLabel, suggestNextStep, type Objective } from './board/actions'
import ActionBar from './board/ActionBar'
import SystemSheet from './board/SystemSheet'
import { conditionsOn, defensesOn, tilesByLayer, turnBudget } from './board/board'
import { COUNT_SHARE, LOCK_SHARE, strikeFor, type Strike } from './board/strike'
import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  OPPORTUNITY_EVENT_COUNT,
  SOURCE_COUNT,
  TECHNIQUE_REF_COUNT,
  THREAT_EVENT_COUNT,
  UNVERIFIED_REF_COUNT,
} from '../content'
import { DIFFICULTIES, effectiveIntel, newGame, resolveTurn } from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { assetPrice, maiScore } from '../engine/scoring'
import { LAYERS, type AssetKind, type Difficulty, type GameState, type TrustTier, type TurnActions } from '../engine/types'

import Wordmark from './Wordmark'
import heroUrl from './assets/hero.webp'
import heroPlaceholderUrl from './assets/hero-placeholder.webp'
import frameUrl from './assets/constellation-frame.svg'

// The animation is decoration; nothing about it may take the game down.
// A failed chunk fetch (stale index.html after a redeploy, flaky network)
// falls back to the still reference frame instead of rejecting the tree.
const FrameStill = () => <img src={frameUrl} alt="" aria-hidden="true" className="w-64 h-64 opacity-90" />
const Constellation = lazy(() =>
  import('./Constellation').catch(() => ({ default: FrameStill as unknown as (typeof import('./Constellation'))['default'] })),
)

// The GLOSSARY overlay's module, split out in the Round 1 fix batch. The
// overlay is an element of this component, so the split unmounts nothing:
// the campaign, the phase and the cart are exactly where they were while
// the chunk loads and after it closes. The dialog element itself is
// static and takes focus at once; only the entries arrive by chunk.
// A failed fetch of either overlay's chunk (the same stale index.html or
// flaky network as above) leaves the overlay with its own way out rather
// than rejecting the tree: the Glossary's back button, the intel card's
// CLOSE.
type GlossaryProps = Parameters<(typeof import('./Glossary'))['default']>[0]
type IntelCardProps = Parameters<(typeof import('./board/IntelCard'))['default']>[0]
const GlossaryUnavailable = ({ backLabel, onBack }: GlossaryProps) => (
  <button type="button" onClick={onBack} className="m-4 min-h-11 border border-phosphor px-3 font-mono text-sm text-phosphor">
    {backLabel}
  </button>
)
const IntelUnavailable = ({ onClose }: IntelCardProps) => (
  <button type="button" onClick={onClose} className="m-4 min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink">
    CLOSE
  </button>
)
const Glossary = lazy(() => import('./Glossary').catch(() => ({ default: GlossaryUnavailable })))
// The intel card (v1.2 R3, brief 4.8), for a tile or the threat banner,
// loaded on first open like the Glossary: it is an element of this
// component, so the split unmounts nothing.
const IntelCard = lazy(() => import('./board/IntelCard').catch(() => ({ default: IntelUnavailable })))

// THE SCORE SCREEN (v1.2 R5, brief 7.2), in a chunk of its own. It holds
// everything the end of a run shows except the save code and the ways
// out, which stay here, outside the chunk: a fetch that fails leaves a
// line saying so above them, never a lost code (the Round 6d defect).
// The chunk is fetched as soon as a campaign ends, while its last turn
// plays back, so the screen is usually there before it is asked for.
type ScoreScreenProps = Parameters<(typeof import('./ScoreScreen'))['default']>[0]
const ScoreUnavailable = (_: ScoreScreenProps) => (
  <p className="relative z-10 mt-4 font-mono text-sm text-dc-warn">The score screen could not load. Your save code is below.</p>
)
const ScoreScreen = lazy(() => import('./ScoreScreen').catch(() => ({ default: ScoreUnavailable })))

// The terminal-style fallback the other split screens use, as a block
// rather than a landmark: it renders inside the dialog, and a second
// <main> in the document is the thing the overlay exists to avoid.
function OverlayLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 font-mono text-sm">
      <p className="text-phosphor">&gt; LOADING MODULE_</p>
      <p className="mt-2 text-ink-dim">Standby.</p>
    </div>
  )
}

const DEFAULT_SEED = 20260711

const EMPTY_ACTIONS: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  buyIntelLevel: false,
  buyIrRetainer: false,
}

// A stable empty list, so the badge hook's dependency does not change
// identity on every render of the start screen.
const EMPTY_CONDITIONS: GameState['conditions'] = []

// The playback phase is presentation only (Round 2): it sits between
// resolve and aftermath and is never persisted. A reload during playback
// lands on the aftermath, which is what instant mode shows anyway.
type Phase = SavePhase | 'playback'
const persistPhase = (p: Phase): SavePhase => (p === 'playback' ? 'aftermath' : p)

interface PlaybackSession {
  before: GameState
  after: GameState
  beats: Beat[]
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 hover:bg-phosphor/10 disabled:opacity-40 disabled:cursor-not-allowed'
const panel = 'border border-phosphor/30 bg-panel p-3'
const h2cls = 'font-mono font-bold text-phosphor uppercase tracking-widest text-sm'

// THE BOARD'S CONTROLS (v1.2 R1). The confirm button in a sheet takes a
// press: the scale is motion-only, the border and background carry the
// press for reduced motion (brief v0.5 section 6). A refused control
// swaps its colour utilities rather than appending others: Tailwind
// resolves a conflict by stylesheet order, not by class order. The box is
// otherwise identical, so a refusal never changes the control's size.
const buyBtn = 'dc-tile font-display uppercase text-[10px] border-2 border-dc-go bg-dc-go/10 text-dc-go px-3 shadow-press active:shadow-none active:bg-dc-go/20'
const buyBtnDenied = 'dc-tile font-display uppercase text-[10px] border-2 border-hero-magenta bg-hero-magenta/10 text-hero-magenta px-3'
// The four step sheets, as the action array names them.
const isStep = (id: Sheet | null): id is StepSheet => id !== null && id !== 'system'
// The hint a short tap on RESOLVE puts on the objective line (R1b; on the
// objective line since R2b), and how long it stays.
const HOLD_HINT = 'Keep holding to resolve'
const HOLD_HINT_MS = 2000

// Which sheet is open. The sheet is presentation state, not a phase: the
// v1.1 phases 'procure' and 'harden' still arrive from older autosaves and
// save codes, and they open the matching sheet on a board at 'brief'.
type Sheet = SheetId
function arrive(phase: Phase | undefined): { phase: Phase; sheet: Sheet | null } {
  if (phase === 'procure' || phase === 'harden') return { phase: 'brief', sheet: phase }
  return { phase: phase ?? 'brief', sheet: null }
}

// Persistence singletons (R4). Local implementations behind the SaveStore
// and ScoreSink interfaces; the remote seam is v2 and not imported. The
// Daily Op's ledger of official results joined them in v1.2 R5.
const saveStore = new LocalStorageStore()
const scoreSink = new LocalScoreSink()
const dailyLedger = new LocalDailyLedger()

function plannedCost(state: GameState, actions: TurnActions): number {
  const s = state.scenario
  let total = 0
  if (actions.buyIntelLevel && state.intelLevel !== 3) total += s.prices.intelLevels[state.intelLevel]
  if (actions.buyIrRetainer && !state.irRetainer) {
    total += s.countermeasures.find((c) => c.id === 'irRetainer')?.cost ?? 0
  }
  for (const id of actions.buyCounters) {
    total += s.countermeasures.find((c) => c.id === id)?.cost ?? 0
  }
  for (const buy of actions.buyAssets) total += assetPrice(s, buy.kind, buy.tier)
  return total
}

export default function Game({
  onExit,
  onScoreboard,
  initial,
}: {
  onExit?: () => void
  onScoreboard?: () => void
  initial?: RestoredGame | null
}) {
  const [state, setState] = useState<GameState | null>(initial?.state ?? null)
  // WHICH DAILY OP THIS IS, when it is one (v1.2 R5, brief 7.1). It rides
  // beside the state in every copy this device writes (the autosave, the
  // slots, the codes) and never inside it. A pasted code arrives marked
  // (src/persistence/codec.ts), and the mark travels on.
  const [daily, setDaily] = useState<DailyOp | undefined>(initial?.daily)
  // Whether this campaign's finish claimed its date as the official run.
  // Only a finish played here can: null until then, and for a campaign
  // that arrived finished.
  const [standing, setStanding] = useState<DailyStanding | null>(null)
  const [phase, setPhase] = useState<Phase>(() => arrive(initial?.phase as Phase | undefined).phase)
  const [sheet, setSheet] = useState<Sheet | null>(() => arrive(initial?.phase as Phase | undefined).sheet)
  // Where each sheet is in its steps, and what PROCURE has picked so far.
  const [step, setStep] = useState(1)
  const [pick, setPick] = useState<ProcurePick>({})
  const [surgePick, setSurgePick] = useState<string | undefined>(undefined)
  // The steps whose sheet was opened this turn (R1b): each shows a check
  // in place of its number on the bar, as the turn's record, until the
  // next turn begins.
  const [stepsDone, setStepsDone] = useState<Set<string>>(() => new Set())
  // A short tap on RESOLVE answers with a hint for a moment (R1b).
  const [holdHint, setHoldHint] = useState<number | null>(null)
  // The guided first turn (R2b): on until this device's first completed
  // resolve, or until "Skip tips" is pressed.
  const [guideOn, setGuideOn] = useState(() => !hasDoneFirstTurn())
  const holdRef = useRef<HTMLButtonElement | null>(null)
  const [actions, setActions] = useState<TurnActions>(EMPTY_ACTIONS)
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED))
  const [difficulty, setDifficulty] = useState<Difficulty>('standard')
  const [notice, setNotice] = useState('')
  const [codeInput, setCodeInput] = useState('')
  // The GLOSSARY entry a technique tag opened, as an OVERLAY rather than a
  // route. Routing to the glossary screen would unmount Game, and the
  // autosave carries the turn and phase but not the procurement cart, so
  // reading one technique mid-buy would silently empty it. An overlay
  // keeps the player in the game in the literal sense as well as the
  // navigational one.
  const [glossaryFocus, setGlossaryFocus] = useState<string | null>(null)
  const glossaryRef = useRef<HTMLDivElement | null>(null)
  // Where focus was when the overlay opened, so closing it puts the player
  // back on the tag they pressed rather than at the top of the document.
  const focusBeforeGlossary = useRef<HTMLElement | null>(null)
  const [slots, setSlots] = useState<SaveMeta[]>(() => saveStore.list())
  // Whether this campaign's score has been posted. TRUE FROM THE START when
  // the campaign arrived already finished, because it was not played here.
  //
  // Round 6e made this reachable. Until the save code was rendered, a
  // finished-state code was hard to come by: Save and Copy save code render
  // only while playing. Now a player can paste a friend's MISSION ASSURED
  // code, or reload their own to re-read it, and the effect below would
  // treat "this state is finished" as "a run finished here": it posted a
  // score the player never earned, cleared their in-progress autosave, and
  // on a repeat load posted duplicates that evict real runs from a board
  // that keeps ten.
  const recordedRef = useRef(initial?.state ? initial.state.status !== 'playing' : false)
  // One timestamp per FINISHED CAMPAIGN, not per mount.
  //
  // Mount-scoped was the first version and it was wrong in two directions.
  // A player who finishes a campaign, starts another and finishes that
  // inside one mount would have stamped the second code with the moment
  // the component mounted, which could be hours earlier. And a remount
  // restamps a campaign that has not changed, so the same finished game
  // exports two different codes.
  //
  // Held in a ref keyed on the state object rather than a useMemo, because
  // a memo may be discarded and recomputed at React's discretion and this
  // value must not move once the player has read it off the screen.
  const stampRef = useRef<{ for: GameState | null; at: string }>({ for: null, at: '' })
  // Director playback (Round 2). `presented` is the state the HUD shows
  // while beats play; `state` is always the engine's output.
  const [playback, setPlayback] = useState<PlaybackSession | null>(null)
  const [presented, setPresented] = useState<GameState | null>(null)
  // How much of the credits change the beat now on screen carries is the
  // player's own purchase, which playback folds into the next visible beat
  // because the procurement recap is silent.
  const [chosenSpend, setChosenSpend] = useState(0)
  // What the beat on screen does to the board (v1.2 R3): a hit on a tile,
  // held on a header, or nothing. Derived from the beat and the state the
  // board showed before it, which the ref carries between beats.
  const [strike, setStrike] = useState<Strike | null>(null)
  const presentedRef = useRef<GameState | null>(null)
  const [beatId, setBeatId] = useState<string | null>(null)
  const showPresented = useCallback((s: GameState, chosenCredits: number, beat: Beat | null) => {
    const before = presentedRef.current
    presentedRef.current = s
    setPresented(s)
    setChosenSpend(chosenCredits)
    setBeatId(beat?.id ?? null)
    // The same beat can be presented again (a pause and resume); its strike
    // stays where it was rather than locking on a second time.
    setStrike((current) => (current && current.id === beat?.id ? current : strikeFor(beat, before)))
  }, [])
  const [speed, setSpeedState] = useState<Speed>(() => defaultSpeed(loadSpeedPreference()))
  const setSpeed = useCallback((s: Speed) => {
    setSpeedState(s)
    saveSpeedPreference(s)
  }, [])
  const finishPlayback = useCallback(() => {
    setPlayback(null)
    setPresented(null)
    setStrike(null)
    setBeatId(null)
    presentedRef.current = null
    setPhase('aftermath')
    // chosenSpend is deliberately NOT cleared here. Skipping, and choosing
    // INSTANT mid-turn, end playback in the same commit that jumps the
    // credits to the engine's after-state, and that jump still carries the
    // purchase; clearing the declaration here would paint the player's own
    // buy as damage on the way out. It is cleared when the next turn is
    // resolved, and whenever a different campaign is loaded.
  }, [])
  // Cue state. These sit with the other top-level hooks because the start
  // screen returns early below, and hook order cannot depend on whether a
  // campaign is in progress.
  const reducedMotion = useReducedMotion()
  // The board's idle life, and every other animation on it, pauses while
  // the tab is hidden (v1.2 R2, brief 5.3): one class on the board root,
  // which src/index.css turns into a pause for everything under it.
  const pageVisible = usePageVisible()
  // The procurement phase's own sounds (brief section 6, rows "Buy fleet or
  // countermeasure" and "Cannot afford"). Playback sounds are the
  // director's; these three tiles are the only cues the player triggers
  // themselves, which is why they live with the controls rather than with
  // the beats.
  const play = useSound()
  // The two audio toggles ride the save row, which is the only chrome the
  // campaign screen carries in every phase.
  const [soundPrefs, setSoundPrefs] = useSoundPrefs()
  // Cannot-afford cue (brief v0.5 section 6): the tile shakes and the
  // spend line flashes. A nonce restarts the animation on a repeat press.
  const [denied, setDenied] = useState<{ id: string; nonce: number } | null>(null)
  // The manifest entry a buy just added, so it can slide in (brief section
  // 4: "item slides into the manifest"). Cleared when the cart empties.
  const [arrived, setArrived] = useState<{ index: number; nonce: number } | null>(null)
  const denialShake = useCueClass(denied?.nonce ?? null, 'dc-shake', reducedMotion)
  // The colour half of the cue is not motion, so it plays under reduced
  // motion too; the stylesheet drops only the animation there.
  const denialFlash = useCueClass(denied?.nonce ?? null, 'dc-flash-bad', false)
  // The manifest entrance, and the dim the adversary phase enters through.
  const manifestCue = useCueClass(arrived?.nonce ?? null, 'dc-manifest-in', reducedMotion, 320)
  const phaseDim = useCueClass(phase === 'playback' ? `dim-${state?.turn ?? 0}` : null, 'dc-phase-dim', reducedMotion, 420)
  // THE HIT BEATS (v1.2 R3, brief 4.5). A visible beat's dwell at this
  // speed sets every duration on the board (the CSS reads it as --dc-beat),
  // so 2x plays the hit twice as fast and INSTANT, which has no beats,
  // plays none of it. The lock-on holds for LOCK_SHARE of the beat, then
  // the hit lands and the board shakes. The shake's class is applied
  // whatever the motion preference: the stylesheet decides whether it
  // moves, as it does for the idle life.
  const beatMs = beatDwellMs(speed)
  useEffect(() => {
    if (strike?.kind !== 'hit' || strike.landed) return
    const id = window.setTimeout(
      () => setStrike((s) => (s && s.id === strike.id && s.kind === 'hit' ? { ...s, landed: true } : s)),
      beatMs * LOCK_SHARE,
    )
    return () => window.clearTimeout(id)
  }, [strike, beatMs])
  // Held until the strike changes (duration 0): the stylesheet times the
  // shake from --dc-beat, and a JS duration that followed the speed would
  // re-run the cue, and shake the board again, on a speed change mid-beat.
  const hitShake = useCueClass(strike?.kind === 'hit' && strike.landed ? strike.id : null, 'dc-hit-shake', false, 0)
  // What the beat is about, brought into view in the scrolling column: the
  // struck tile, the held layer, the layer a condition stamps, or else the
  // event card. On a phone the column cannot hold the card and a lower
  // tile at once, so a hit or a stamp scrolls the card away for its beat;
  // the beat's title stays on screen on the objective line over the bar.
  // Under reduced motion the view does not jump to the board at all: the
  // card is where that player reads what happened. And the dotted beam
  // from the COLDVEIL emblem to a struck tile, measured once the tile is
  // in view.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [beam, setBeam] = useState<{ id: string; x: number; y: number; length: number; angle: number } | null>(null)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !beatId) {
      setBeam(null)
      return
    }
    const hit = strike?.kind === 'hit' && strike.id === beatId ? strike : null
    const held = strike?.kind === 'held' && strike.id === beatId ? strike : null
    const stamped = playback?.beats.find((b) => b.id === beatId && (b.kind === 'condition-applied' || b.kind === 'condition-renewed'))
    const layer = held ? held.layers[0] : stamped?.layers?.[0]
    const target = hit
      ? body.querySelector(`button[data-asset-id="${hit.assetId}"]`)
      : layer
        ? body.querySelector(`section[aria-labelledby="layer-${layer}"]`)
        : null
    const card = body.querySelector('div[data-beat-card]')
    ;(reducedMotion ? card : (target ?? card))?.scrollIntoView?.({ block: 'nearest' })
    const emblem = body.querySelector('svg[data-sprite="coldveil"]')
    if (!hit || !target || !emblem) {
      setBeam(null)
      return
    }
    const b = body.getBoundingClientRect()
    const e = emblem.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const x = e.left + e.width / 2 - b.left
    const y = e.top + e.height / 2 - b.top
    const dx = t.left + t.width / 2 - b.left - x
    const dy = t.top + t.height / 2 - b.top - y
    setBeam({ id: hit.id, x, y, length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI })
    // Measured when the beat changes, not when the hit lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId])
  // The intel card (v1.2 R3, brief 4.8): a tile's, or the threat banner's.
  // A dialog like the Glossary's: focus goes in and comes back to what
  // opened it, Escape closes it, and the game behind is inert. Its Escape
  // listener runs in the capture phase and stops there, so closing the card
  // during playback does not also skip the playback.
  const [intel, setIntel] = useState<{ kind: 'tile'; assetId: string } | { kind: 'banner' } | null>(null)
  const intelRef = useRef<HTMLDivElement | null>(null)
  const focusBeforeIntel = useRef<HTMLElement | null>(null)
  const intelOpen = intel !== null
  useEffect(() => {
    if (!intel) return
    // What opened the card gets focus back. A tapped button is not focused
    // on every browser (Safari leaves focus on the page), so the opener is
    // found by what was opened when focus says nothing useful.
    const active = document.activeElement as HTMLElement | null
    const opener =
      intel.kind === 'tile'
        ? document.querySelector<HTMLElement>(`button[data-asset-id="${intel.assetId}"]`)
        : document.querySelector<HTMLElement>('button[aria-label="Threat intel"]')
    focusBeforeIntel.current = active && active !== document.body ? active : opener
    intelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setIntel(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      focusBeforeIntel.current?.focus?.()
    }
    // Once per opening; a re-render of the same card is not a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelOpen])
  // A refusal is a flash, not a state: it lifts on its own, and at once if
  // the cart or the phase changes, so a fixed cart never carries a stale
  // warning.
  useEffect(() => {
    if (!denied) return
    const id = window.setTimeout(() => setDenied(null), CUE_MS)
    return () => window.clearTimeout(id)
  }, [denied])
  useEffect(() => {
    setDenied(null)
  }, [actions, phase])
  // During playback the HUD follows the director's presented state, so the
  // badge cues fire on the beat that applies them rather than jumping to
  // the engine's end state. Computed here because hooks run before the
  // start-screen early return below.
  // While a hit is locking on, the board still shows the state before it,
  // so the tile, its pips and MAI change when the hit lands (v1.2 R3).
  const locking = strike?.kind === 'hit' && !strike.landed
  const shownOrNull = phase === 'playback' && presented ? (locking ? strike.before : presented) : state
  // The music bed follows the same state the HUD does, for the same
  // reason: during playback that is the director's presented state, so the
  // threat layer rises on the beat that arms the chain rather than at the
  // top of the turn that will eventually arm it. Null is the start screen,
  // which gets the base layer only.
  useMusicState(shownOrNull)
  const { badges, phases } = useBadgePhases(
    shownOrNull?.conditions ?? EMPTY_CONDITIONS,
    reducedMotion,
    shownOrNull?.turn,
    // A seed identifies the campaign, so loading a save or starting a new
    // game adopts its conditions instead of announcing them as arrivals.
    shownOrNull ? `${shownOrNull.seed}-${shownOrNull.difficulty}` : 'none',
  )
  const scenario = DEFAULT_SCENARIO

  // Autosave every turn/phase change while playing, for refresh-safe
  // resume. On game over, record the score once and clear the autosave so
  // a finished run is not offered for resume. A Daily Op's finish also
  // goes to the ledger, which says whether it is the date's official run:
  // the date is the one the run started on, from its identity, never the
  // clock at the finish (brief 7.1).
  useEffect(() => {
    if (!state) return
    if (state.status === 'playing') {
      saveStore.autosave(state, persistPhase(phase), daily)
    } else if (!recordedRef.current) {
      recordedRef.current = true
      saveStore.clearAutosave()
      const last = state.history[state.history.length - 1]
      const recordedAt = new Date().toISOString()
      scoreSink.record({
        outcome: state.status,
        mai: last?.maiScore ?? 0,
        seed: state.seed,
        turnsSurvived: state.history.length,
        totalTurns: scenario.totalTurns,
        scenarioId: scenario.id,
        difficulty: state.difficulty,
        recordedAt,
      })
      if (daily) {
        setStanding(
          dailyLedger.claim(daily, {
            n: daily.n,
            seed: state.seed,
            outcome: state.status,
            lossReason: state.lossReason,
            mai: last?.maiScore ?? 0,
            turns: state.history.length,
            recordedAt,
          }),
        )
      }
    }
  }, [state, phase, scenario, daily])

  // Fetch the score screen's chunk the moment a campaign ends, while its
  // last turn is still playing back. The same import the lazy declaration
  // makes, so it is the same chunk, fetched once.
  const finished = !!state && state.status !== 'playing'
  useEffect(() => {
    if (finished) import('./ScoreScreen').catch(() => undefined)
  }, [finished])

  const flash = (msg: string) => setNotice(msg)

  // Derived from content so the help text tracks any duration retune.
  const durations = scenario.events.flatMap((e) => (e.duration ? [e.duration.min, e.duration.max] : []))
  const conditionDurationRange = durations.length
    ? `${Math.min(...durations)} to ${Math.max(...durations)} turns`
    : 'a few turns'

  // Item 1: the job framing (three numbered lines and a line of context), shown on the start screen and again
  // in the turn 1 brief so a skimming player can state the objective.
  // Round 7b: the lines come from ui/brief.ts, which is the module the
  // reading-diet budgets read. They used to be spelled here as JSX, and
  // the brief screen rendered them INSIDE the same disclosure as the
  // posture panel where no budget could see them.
  const framingBlocks = jobFramingBlocks(scenario)
  const framingBody = framingBlocks.map((line, i) => (
    <p key={i} className={i === framingBlocks.length - 1 ? 'mt-1 text-ink-dim' : 'mt-1'}>
      {line}
    </p>
  ))
  const jobFraming = (
    <div className={`${panel} mt-4`}>
      <p className={h2cls}>{JOB_FRAMING_HEADING}</p>
      {framingBody}
    </div>
  )

  const constellationVisual = reducedMotion ? (
    <FrameStill />
  ) : (
    <Suspense fallback={<FrameStill />}>
      <Constellation size={256} />
    </Suspense>
  )

  // ESCAPE ON A WINDOW LISTENER, and focus moved into the dialog.
  //
  // The first version bound onKeyDown to the overlay div, which has no
  // tabIndex and never receives focus: after the tag is pressed focus is
  // still on the tag button, a SIBLING of the overlay, so the keydown
  // bubbled past it and Escape did nothing. DirectorView does the same job
  // with a window listener, which is the mechanism that works, and four
  // review lenses said so independently.
  //
  // Declaring role="dialog" and aria-modal without moving focus is worse
  // than not declaring them: it promises a screen reader an inertness
  // nothing implements. Focus goes in, comes back out, and the game behind
  // is marked inert while it is open.
  useEffect(() => {
    if (!glossaryFocus) return
    focusBeforeGlossary.current = document.activeElement as HTMLElement | null
    glossaryRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setGlossaryFocus(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      focusBeforeGlossary.current?.focus?.()
    }
  }, [glossaryFocus])

  // Opening a sheet starts it at step one with nothing picked; the same
  // button again closes it. The four sheets are exclusive.
  const openSheet = (next: Sheet | null) => {
    setSheet(next)
    setStep(1)
    setPick({})
    setSurgePick(undefined)
    if (isStep(next)) setStepsDone((done) => (done.has(next) ? done : new Set(done).add(next)))
  }
  const toggleSheet = (next: Sheet) => openSheet(sheet === next ? null : next)

  // The board's keys, on the one window listener the play screen has for
  // them, and not while the glossary is open: its own listener answers
  // then. Escape closes the sheet. The digits are the action bar's
  // hotkeys (R1b), resolved through the one action array: a step's digit
  // opens or closes its sheet, and RESOLVE's moves focus to the hold
  // control rather than committing, because a keypress cannot hold and a
  // turn should not end on a stray digit.
  const decidingNow = state !== null && phase !== 'playback' && phase !== 'aftermath'
  useEffect(() => {
    if (!state || glossaryFocus || intel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!sheet) return
        e.preventDefault()
        openSheet(null)
        return
      }
      if (!decidingNow || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const action = ACTIONS.find((a) => a.hotkey === e.key)
      if (!action) return
      e.preventDefault()
      if (action.sheet) toggleSheet(action.sheet)
      else holdRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The hint lifts on its own.
  useEffect(() => {
    if (holdHint === null) return
    const id = window.setTimeout(() => setHoldHint(null), HOLD_HINT_MS)
    return () => window.clearTimeout(id)
  }, [holdHint])

  const beginGame = (next: GameState, nextPhase: Phase, nextDaily?: DailyOp) => {
    // A loaded code that is already over was not played here, so it neither
    // posts a score nor clears the autosave of the campaign it interrupts.
    recordedRef.current = next.status !== 'playing'
    const arrival = arrive(nextPhase)
    setState(next)
    setDaily(nextDaily)
    setStanding(null)
    setActions(EMPTY_ACTIONS)
    setPlayback(null)
    setPresented(null)
    setChosenSpend(0)
    setPhase(arrival.phase)
    openSheet(arrival.sheet)
    setStepsDone(new Set(arrival.sheet ? [arrival.sheet] : []))
    setIntel(null)
    setNotice('')
  }

  const start = () => {
    const seed = Number.parseInt(seedInput, 10)
    beginGame(newGame(scenario, Number.isFinite(seed) ? seed : DEFAULT_SEED, difficulty), 'brief')
  }

  const newCampaign = () => {
    recordedRef.current = false
    setState(null)
    setDaily(undefined)
    setStanding(null)
    setActions(EMPTY_ACTIONS)
    setPlayback(null)
    setPresented(null)
    setChosenSpend(0)
    setPhase('brief')
    openSheet(null)
    setStepsDone(new Set())
    setIntel(null)
    setSlots(saveStore.list())
    setNotice('')
  }

  // Load from a pasted save code (R4 item 2), with graceful failure.
  const loadCode = () => {
    try {
      const restored = decodeSaveCode(codeInput)
      beginGame(restored.state, restored.phase as Phase, restored.daily)
    } catch (e) {
      flash(e instanceof SaveError ? e.message : 'That save code could not be read.')
    }
  }

  const loadSlot = (id: string) => {
    const restored = saveStore.load(id)
    if (restored) beginGame(restored.state, restored.phase as Phase, restored.daily)
    else flash('That save could not be loaded.')
  }

  const saveSlot = () => {
    if (!state) return
    const name = `Turn ${Math.min(state.turn, scenario.totalTurns)} save`
    saveStore.save(state, persistPhase(phase), name, daily)
    setSlots(saveStore.list())
    flash('Saved to a slot.')
  }

  const exportCode = async () => {
    if (!state) return
    const code = encodeSaveCode(captureGame(state, persistPhase(phase), new Date().toISOString(), daily))
    flash(
      (await copyToClipboard(code))
        ? 'Save code copied to clipboard.'
        : // No promise that the code is somewhere to be selected. On the
          // brief screen it is not: nothing renders it there, and telling
          // a player to select what is not on screen was the Round 6d
          // defect. The outcome screen renders its own code and says so.
          'Copy failed. Your code is also shown on the outcome screen when the campaign ends.',
    )
  }

  // The finished campaign's save code, computed ONCE.
  //
  // Round 6d found that this string was produced, copied to the clipboard,
  // and never rendered anywhere, so a player whose browser gates the
  // clipboard API was told to "select and copy manually" from nothing at
  // all. That is a lost campaign and an impossible instruction, and it is
  // the one finding of that audit that was a defect rather than a
  // divergence.
  //
  // Memoised on the finished state rather than recomputed per render,
  // because captureGame stamps a timestamp: an unmemoised version would
  // show the player one code and put a different one on their clipboard,
  // which is a worse bug than the one it fixes. The copy button on this
  // screen sends exactly the string above it.
  // Stamped once per finished campaign, and the REF is the only thing
  // holding the code still.
  //
  // This used to also be wrapped in a useMemo keyed on state, which was
  // belt and braces and made the ref's guard unobservable: a mutation
  // removing `for !== state` left every test green, because the memo would
  // not recompute anyway. React may drop a memo whenever it likes, so the
  // guard was doing real work that nothing could fail for. Removing the
  // memo costs one base64 encode per render of a screen that renders on
  // its own, and makes the thing that actually guarantees stability the
  // thing under test.
  if (state && state.status !== 'playing' && stampRef.current.for !== state) {
    stampRef.current = { for: state, at: new Date().toISOString() }
  }
  const outcomeCode =
    state && state.status !== 'playing' ? encodeSaveCode(captureGame(state, 'aftermath', stampRef.current.at, daily)) : ''

  const copyOutcomeCode = async () => {
    flash(
      (await copyToClipboard(outcomeCode))
        ? 'Save code copied to clipboard.'
        : 'Copy failed. Select the code above and copy it.',
    )
  }

  if (!state) {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <h1>
            <Wordmark size="clamp(0.6rem, 3vw, 1.4rem)" />
          </h1>
          {onExit && (
            <button className={`${btn} text-sm`} onClick={onExit}>
              Back to menu
            </button>
          )}
        </div>
        <div
          className="mt-4 border border-phosphor/20 max-w-xl mx-auto"
          style={{ backgroundImage: `url(${heroPlaceholderUrl})`, backgroundSize: 'cover', aspectRatio: '1 / 1' }}
        >
          <img
            src={heroUrl}
            width={1200}
            height={1200}
            alt="Split-sphere key art: a dark sphere broken by a diagonal breach line, blue energy on one flank, magenta on the other, debris spraying from both"
            className="block w-full h-auto"
            decoding="async"
          />
        </div>
        <p className="mt-2 text-center font-mono text-xs text-ink-dim">
          <span className="text-hero-blue">blue: friendly and defense</span>
          {' | '}
          <span className="text-hero-magenta">magenta: {ADVERSARY} and hostile</span>
          {' | '}
          <span className="text-phosphor">green: mission chrome</span>
        </p>
        <div className="mt-4 border-l-2 border-phosphor/50 pl-3">
          <p className="font-mono text-xs text-phosphor tracking-widest">&gt; DIRECTORATE TRANSMISSION_</p>
          <p className="mt-1">{scenario.briefIntro}</p>
        </div>
        {jobFraming}
        <p className="mt-4 font-mono text-sm text-ink-dim">Scenario: {scenario.name}.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="font-mono text-sm">
            Seed:{' '}
            <input
              className="border border-phosphor/40 bg-panel text-ink px-2 py-1 font-mono w-32"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              aria-label="game seed"
            />
          </label>
          <button className={btn} onClick={start}>
            Start campaign
          </button>
        </div>

        <fieldset className="mt-4 border border-phosphor/30 bg-panel p-3">
          <legend className={`${h2cls} px-1`}>Difficulty</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={`font-mono text-sm border px-3 py-1 ${
                  difficulty === d
                    ? 'border-phosphor bg-phosphor/15 text-phosphor'
                    : 'border-phosphor/40 text-ink-dim hover:bg-phosphor/10'
                }`}
              >
                {DIFFICULTIES[d].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-dim">{DIFFICULTIES[difficulty].blurb}</p>
          <p className="mt-1 font-mono text-xs text-ink-dim">
            Condition pressure x{DIFFICULTIES[difficulty].conditionPressure}, income x
            {DIFFICULTIES[difficulty].income}, starting credits x{DIFFICULTIES[difficulty].startCredits}.
          </p>
        </fieldset>

        <details className="mt-4 border border-phosphor/20 bg-panel p-3">
          <summary className="cursor-pointer font-mono text-sm text-phosphor">Load a saved game or save code</summary>
          <div className="mt-3">
            <label className="font-mono text-sm">
              Paste a save code:
              <textarea
                className="mt-1 w-full border border-phosphor/40 bg-base text-ink px-2 py-1 font-mono text-xs h-16"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="DC1-..."
                aria-label="save code"
              />
            </label>
            <button className={`${btn} mt-1 text-sm`} disabled={!codeInput.trim()} onClick={loadCode}>
              Load from code
            </button>
          </div>
          {slots.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-sm text-phosphor">Saved slots ({slots.length})</p>
              <ul className="mt-1">
                {slots.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                    <span className="font-mono">{s.name}</span>
                    <span className="text-ink-dim text-xs">{s.savedAt.slice(0, 16).replace('T', ' ')}</span>
                    <button className={`${btn} px-2 py-0 text-xs`} onClick={() => loadSlot(s.id)}>
                      load
                    </button>
                    <button
                      className={`${btn} px-2 py-0 text-xs`}
                      onClick={() => {
                        saveStore.remove(s.id)
                        setSlots(saveStore.list())
                      }}
                    >
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
        {notice && <p className="mt-2 font-mono text-sm text-alert-amber">{notice}</p>}

        <div className="mt-6 flex justify-center">{constellationVisual}</div>
        <p className="mt-6 text-sm text-ink-dim">
          Content loaded from data: {THREAT_EVENT_COUNT} threat events, {OPPORTUNITY_EVENT_COUNT} opportunity events,{' '}
          {COUNTERMEASURE_COUNT} countermeasures, {TECHNIQUE_REF_COUNT} framework techniques, {SOURCE_COUNT} cited
          sources.
          {UNVERIFIED_REF_COUNT > 0 && (
            <span>
              {' '}
              {UNVERIFIED_REF_COUNT} reference{UNVERIFIED_REF_COUNT === 1 ? '' : 's'} still await live web
              verification and are labeled verify-at-build on their cards.
            </span>
          )}
        </p>
      </main>
    )
  }

  // The engine credits income (and any SLA bonus) before purchases, so the
  // budget gate mirrors that: this turn's spendable total, not last turn's
  // ending balance.
  const available = turnBudget(state)
  const cost = plannedCost(state, actions)
  const affordable = cost <= available
  const lastRecord = state.history[state.history.length - 1]
  const displayTurn =
    (phase === 'aftermath' || phase === 'playback') && lastRecord ? lastRecord.turn : Math.min(state.turn, scenario.totalTurns)
  // Narrowed from the nullable value computed with the hooks above.
  const shown = shownOrNull ?? state

  // A press released early: the hint, and the light tick the buy uses,
  // without its sound (R1b).
  const shortTap = () => {
    getHaptics().fire('buy-click')
    setHoldHint((n) => (n ?? 0) + 1)
  }

  const resolve = () => {
    setHoldHint(null)
    // The engine is the authority on affordability. If the UI gate and the
    // engine ever disagree, surface the reason instead of dying silently:
    // a throw inside an event handler never reaches an error boundary.
    try {
      const next = resolveTurn(state, actions, turnRng(state.seed, state.turn))
      // The first completed resolve on this device ends the walkthrough
      // for good (R2b).
      markFirstTurnDone()
      setGuideOn(false)
      // A new turn declares its own spend; nothing carries over.
      setChosenSpend(0)
      // The director derives its beats from the two states. It is
      // presentation only: instant speed never runs it (the v1.0 path,
      // unchanged), and if derivation ever fails the turn still stands and
      // the aftermath shows the engine's result directly.
      //
      // Round 4d consequence, recorded because it is not obvious: no beats
      // means no beat sounds. At instant speed the eleven section 6 rows
      // the director plays are silent, and only the five a component plays
      // (the two procurement tiles, EXECUTE TURN, the meter tick and the
      // MAI crossing) still sound. That is what an explicit INSTANT choice
      // costs, and since v1.2 it is only ever an explicit choice: reduced
      // motion no longer lands here. See soundsAtInstantSpeed in
      // director/cues.ts.
      let beats: Beat[] | null = null
      if (speed !== 'instant') {
        try {
          beats = deriveBeats(state, next)
        } catch {
          beats = null
        }
      }
      setState(next)
      setActions(EMPTY_ACTIONS)
      openSheet(null)
      setIntel(null)
      // The cart is gone, so the entry the cue pointed at is too.
      setArrived(null)
      if (!beats) {
        setPlayback(null)
        setPresented(null)
        setPhase('aftermath')
      } else {
        setPlayback({ before: state, after: next, beats })
        setPresented(state)
        presentedRef.current = state
        setStrike(null)
        setPhase('playback')
      }
    } catch (e) {
      flash(e instanceof Error ? `Turn could not resolve: ${e.message}` : 'Turn could not resolve.')
    }
  }

  // A new turn starts with every step numbered again; the aftermath kept
  // the resolved turn's checks as its record.
  const nextTurn = () => {
    setStepsDone(new Set())
    setPhase('brief')
  }

  // The engine is the authority on affordability; this keeps the cart
  // inside the same budget so the gate never has to refuse at resolve time.
  const afforded = (kind: AssetKind, tier: TrustTier): boolean => cost + assetPrice(scenario, kind, tier) <= available
  const afford = (price: number, tileId: string): boolean => {
    if (cost + price <= available) return true
    // Every refusal in the phase comes through here, so the buzz does too:
    // a second copy at a call site is a copy that can be forgotten.
    play('denied-buzz')
    setDenied((d) => ({ id: tileId, nonce: (d?.nonce ?? 0) + 1 }))
    return false
  }

  const addAsset = (kind: AssetKind, tier: TrustTier) => {
    const price = assetPrice(scenario, kind, tier)
    if (!afford(price, `${kind}-${tier}`)) return
    play('buy-click')
    // The new entry is the last one, and the nonce restarts the cue when
    // the same kind is bought twice in a row.
    setArrived({ index: actions.buyAssets.length, nonce: (arrived?.nonce ?? 0) + 1 })
    setActions({ ...actions, buyAssets: [...actions.buyAssets, { kind, tier }] })
  }
  const removeAsset = (index: number) => {
    // Taking an item back out is the same control as putting it in. The
    // brief's row names the buy, but a silent removal beside a clicking
    // buy reads as a control that stopped working.
    play('buy-click')
    // The cue points at a row by index, so a removal invalidates it.
    setArrived(null)
    setActions({ ...actions, buyAssets: actions.buyAssets.filter((_, i) => i !== index) })
  }
  const toggleCounter = (id: (typeof scenario.countermeasures)[number]['id']) => {
    const already = actions.buyCounters.includes(id)
    if (!already) {
      const price = scenario.countermeasures.find((c) => c.id === id)?.cost ?? 0
      if (!afford(price, `cm-${id}`)) return
    }
    play('buy-click')
    setActions({
      ...actions,
      buyCounters: already ? actions.buyCounters.filter((c) => c !== id) : [...actions.buyCounters, id],
    })
  }

  // Surge authority (item 4): queue one live condition to be cleared when
  // the turn resolves. The reducer applies it before condition pressure, so
  // a queued condition never presses again. Undo to change the mind.
  const queueSurge = (instanceId: string | undefined) => setActions({ ...actions, spendSurgeOn: instanceId })

  // THE BOARD'S STATE, derived. During playback the panels follow the
  // director's presented state, like the HUD, so a hit lands on the beat
  // that applies it rather than at the engine's end state.
  const deciding = phase !== 'playback' && phase !== 'aftermath'
  const showsDurationEstimate = effectiveIntel(shown) >= 3
  const canSurge = deciding && state.surgeTokens > 0 && shown.conditions.length > 0
  const surgeReason = !deciding ? '' : state.surgeTokens === 0 ? 'no tokens' : shown.conditions.length === 0 ? 'no conditions' : ''
  const tiles = tilesByLayer(shown, actions.buyAssets)
  // The queued tile that just slid in carries the manifest cue (brief
  // section 4: "item slides into the manifest"); the manifest is the
  // layer panel now.
  for (const layer of LAYERS) {
    for (const tile of tiles[layer]) {
      if (tile.kind === 'queued') {
        const i = tile.index
        tile.cue = arrived?.index === i ? manifestCue : undefined
      }
    }
  }
  // Condition chips per layer (brief 4.3), from the one badge hook above,
  // with elapsed time counted from the engine's turn so the number does
  // not jump when playback hands over to the aftermath.
  const chipsOn = (layer: (typeof LAYERS)[number]): ChipModel[] =>
    conditionsOn(layer, badges, scenario).map((c) => ({
      condition: c,
      phase: phases[c.instanceId] ?? 'attached',
      elapsed: state.turn - c.startedTurn,
      remainingEstimate: showsDurationEstimate ? c.remainingTurns : undefined,
      queuedForSurge: actions.spendSurgeOn === c.instanceId,
    }))
  const surgeOptions = shown.conditions.map((c) => ({
    condition: c,
    layers: scenario.events.find((e) => e.id === c.eventId)?.layers ?? [],
    elapsed: state.turn - c.startedTurn,
  }))

  // The spend line every decision sheet carries. It is the element the
  // cannot-afford flash lands on (brief v0.5 section 6).
  const spendLine = (
    <p className={`text-xs font-mono text-dc-muted ${denialFlash}`}>
      Planned spend: {cost} of {available} credits available (current {state.credits} plus {available - state.credits} turn income).
    </p>
  )
  // The colour channel of a refusal, which survives reduced motion; the
  // shake is the motion channel. Both on the control that was touched.
  const deniedTile = (id: string) => (denied?.id === id ? `${denialShake} border-hero-magenta/60` : 'border-transparent')

  // The confirm step's control. The refused buy swaps its classes (see
  // buyBtnDenied) and shakes.
  const buyClass = pick.kind && pick.tier && denied?.id === `${pick.kind}-${pick.tier}` ? `${buyBtnDenied} ${denialShake}` : buyBtn
  const buyPicked = () => {
    if (!pick.kind || !pick.tier) return
    const ok = afforded(pick.kind, pick.tier)
    addAsset(pick.kind, pick.tier)
    // A buy closes the sheet, so the queued tile is seen sliding into its
    // layer. A refused one stays on the confirm step, so the refusal is
    // seen on the control that was pressed.
    if (ok) openSheet(null)
  }

  // The deciding turn's playback and aftermath still render before the
  // score screen, exactly as the aftermath alone did in v1.0.
  if (state.status !== 'playing' && phase !== 'aftermath' && phase !== 'playback') {
    return (
      <main className="relative min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="relative z-10 flex items-center justify-between gap-2">
          <h1>
            <Wordmark size="clamp(0.6rem, 3vw, 1.4rem)" />
          </h1>
          {onExit && (
            <button className={`${btn} text-sm`} onClick={onExit}>
              Back to menu
            </button>
          )}
        </div>
        {/* The score screen's own boundary: Game never suspends, so App's
            boundary never swaps the whole screen for a loading line, and
            the save code below renders whatever the chunk is doing. */}
        <Suspense fallback={<OverlayLoading />}>
          <ScoreScreen state={state} daily={daily} standing={standing} />
        </Suspense>
        {/* THE SAVE CODE REVEAL (brief section 4, outcome row; Round 6e).
            Rendered, not merely copyable. A readonly textarea rather than a
            <code> block because it is the one element a phone will reliably
            let a player select and copy from, and because the failure path
            this fixes is exactly the player whose clipboard API is gated.
            The copy button below sends this string, not a freshly stamped
            one, so what is on screen is what lands on the clipboard. Kept
            here rather than in the score screen's chunk (v1.2 R5), so it
            never waits on a fetch. */}
        <div className="relative z-10 mt-6 border-t-2 border-dc-line pt-3">
          <label className="font-display text-[9px] text-dc-muted" htmlFor="outcome-save-code">
            SAVE CODE
          </label>
          <textarea
            id="outcome-save-code"
            data-outcome-save-code
            readOnly
            value={outcomeCode}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full border-2 border-dc-line bg-dc-ground text-dc-ink px-2 py-1 font-mono text-xs h-16 break-all"
            aria-label="save code for this campaign"
          />
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap gap-2">
          <button className={DC_BTN} onClick={copyOutcomeCode}>
            EXPORT SAVE CODE
          </button>
          <button className={DC_BTN} onClick={newCampaign}>
            NEW CAMPAIGN
          </button>
          {onScoreboard && (
            <button className={DC_BTN} onClick={onScoreboard}>
              SCOREBOARD
            </button>
          )}
          {onExit && (
            <button className={DC_BTN} onClick={onExit}>
              BACK TO MENU
            </button>
          )}
        </div>
        {notice && <p className="relative z-10 mt-2 font-mono text-sm text-alert-amber">{notice}</p>}
      </main>
    )
  }

  const displayRecord = phase === 'aftermath' && lastRecord ? lastRecord : null
  // What each step says under its label: what is queued for the turn.
  const queued = (n: number) => (n > 0 ? `${n} queued` : '')
  const captions: Record<string, string> = {
    procure: queued(actions.buyAssets.length),
    harden: queued(actions.buyCounters.length),
    intel: actions.buyIntelLevel || actions.buyIrRetainer ? 'queued' : '',
    surge: actions.spendSurgeOn ? 'queued' : surgeReason || `${state.surgeTokens} token${state.surgeTokens === 1 ? '' : 's'}`,
  }
  const sheetOpen = sheet !== null
  // How far MAI fell on the hit that just landed, floated off the number.
  const fell = strike?.kind === 'hit' && strike.landed && presented ? Math.round((maiScore(strike.before) - maiScore(presented)) * 10) / 10 : 0
  const maiDrop = strike && fell > 0 ? { id: strike.id, delta: fell } : null
  // WHAT TO DO NEXT (R2b): the objective line's tag and sentence and the
  // step that glows, as one value from one call, so the bar cannot light
  // one step and name another. While the turn is decided it is the
  // walkthrough on this device's first turn, and the suggestion otherwise,
  // with the credits the HUD shows; after that it says how to move on.
  const creditsLeft = available - cost
  const guided = guideOn && deciding && state.turn === 1
  const hardenedOrSkipped = actions.buyCounters.length > 0 || (stepsDone.has('harden') && sheet !== 'harden')
  const objective: Objective = deciding
    ? guided
      ? GUIDE[guideStage(actions.buyAssets.length > 0, hardenedOrSkipped)]
      : { tag: creditsTag(creditsLeft), ...suggestNextStep(state, stepsDone, creditsLeft) }
    : phase === 'playback'
      ? { tag: `TURN ${displayTurn}`, sentence: playback?.beats.find((b) => b.id === beatId)?.title ?? 'Watch the turn play out.', step: null }
      : {
          tag: `TURN ${displayTurn} RESOLVED`,
          sentence: state.status === 'playing' ? 'Tap NEXT TURN when ready.' : 'Tap FINAL REPORT to see how it ended.',
          step: 'resolve',
        }

  return (
    <>
      {/* The game, marked inert while the overlay is open. aria-modal is a
          promise to a screen reader that nothing behind the dialog is
          reachable; inert is what keeps it. The pinned chrome and the
          sheets all sit inside this landmark for the same reason. */}
      <main
        data-board
        className={`relative flex flex-1 min-h-0 w-full max-w-[560px] mx-auto flex-col overflow-hidden bg-dc-ground text-dc-ink ${
          pageVisible ? '' : 'dc-board-hidden'
        } ${hitShake}`}
        style={{ '--dc-beat': `${beatMs}ms` } as CSSProperties}
        {...(glossaryFocus || intelOpen ? { inert: true, 'aria-hidden': true } : {})}
      >
      <Hud
        shown={shown}
        displayTurn={displayTurn}
        drop={maiDrop}
        countMs={beatMs ? beatMs * COUNT_SHARE : undefined}
        onSystem={() => toggleSheet('system')}
        systemOpen={sheet === 'system'}
        credits={{
          // During the decision the ticker shows what the cart leaves, so
          // a buy ticks the number down as the brief asks; at every other
          // time it is the engine's balance. A buy is a decision, not
          // damage, so the tone is dropped while the player is choosing.
          value: deciding ? available - cost : shown.credits,
          basis: deciding ? 'cart' : 'balance',
          chosen: deciding,
          chosenDelta: chosenSpend,
        }}
      />
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col">
        {/* Keyed on the PRESENTED turn, so the teletype runs once when a
            turn's transmission arrives and not again when the engine's
            turn advances under a playback that is still showing this one. */}
        <ThreatBanner shown={shown} cueKey={shown.turn} onTag={(tag) => setGlossaryFocus(tag)} onIntel={() => setIntel({ kind: 'banner' })} />
        {/* The dotted beam from the emblem to the struck tile, over
            everything in the body and taking no input. It draws while the
            hit locks on; the stylesheet shows it only when motion is
            allowed. */}
        {beam && locking && (
          <span
            key={beam.id}
            aria-hidden="true"
            data-beam
            className="dc-beam pointer-events-none absolute z-20 h-0 origin-left border-t-2 border-dotted border-dc-hostile"
            style={{ left: beam.x, top: beam.y, width: beam.length, '--beam-angle': `${beam.angle}deg` } as CSSProperties}
          />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 flex flex-col gap-1.5">
          {/* The adversary phase enters through a dim. It plays on the
              way in and blocks nothing: the engine resolved the turn
              before this renders (principle 3). */}
      {phase === 'playback' && playback && (
        <div className={phaseDim}>
          <DirectorView
            before={playback.before}
            after={playback.after}
            beats={playback.beats}
            speed={speed}
            onSpeedChange={setSpeed}
            onPresented={showPresented}
            onDone={finishPlayback}
          />
        </div>
      )}
          {displayRecord && (
            <AftermathCard record={displayRecord} state={state} scenario={scenario} reducedMotion={reducedMotion} ledgerOpen={speed === 'instant'} />
          )}
          {LAYERS.map((layer) => (
            <LayerPanel
              key={layer}
              layer={layer}
              tiles={tiles[layer]}
              chips={chipsOn(layer)}
              defenses={defensesOn(layer, shown.counters, scenario)}
              selectedKey={intel?.kind === 'tile' ? intel.assetId : null}
              onSelect={(key) => setIntel(key ? { kind: 'tile', assetId: key } : null)}
              onRemoveQueued={removeAsset}
              hit={strike?.kind === 'hit' && strike.layer === layer ? strike : null}
              held={strike?.kind === 'held' && strike.layers.includes(layer) ? strike.id : null}
            />
          ))}
          <BoardReference shown={shown} conditionDurationRange={conditionDurationRange} />
          {/* The flash notice, when the SYSTEM sheet that carries it is not
              open. Save, Copy save code, Back to menu, the toggles and the
              playback speed live in that sheet since R1b, so the board
              ends at the action bar. */}
          {notice && sheet !== 'system' && <p className="font-mono text-xs text-alert-amber">{notice}</p>}
        </div>
        {/* THE SHEETS (brief 4.4), over the dimmed board and under the
            action bar, which stays live so the next action is one tap
            away from inside any sheet. The backdrop closes the sheet. */}
        {sheetOpen && <button type="button" aria-label="Close sheet" className="absolute inset-0 z-20 bg-dc-ground/80" onClick={() => openSheet(null)} />}
        {sheet === 'procure' && (
          <ProcureSheet
            scenario={scenario}
            step={step}
            pick={pick}
            onKind={(kind) => {
              setPick({ kind })
              setStep(2)
            }}
            onTier={(tier) => {
              setPick((p) => ({ ...p, tier }))
              setStep(3)
            }}
            onBuy={buyPicked}
            onBack={() => setStep((n) => Math.max(1, n - 1))}
            onClose={() => openSheet(null)}
            buyClass={buyClass}
            spendLine={spendLine}
          />
        )}
        {sheet === 'harden' && (
          <HardenSheet
            scenario={scenario}
            state={state}
            queued={actions.buyCounters}
            step={step}
            onToggle={toggleCounter}
            onNext={() => setStep(Math.min(HARDEN_STEPS, step + 1))}
            onBack={() => setStep((n) => Math.max(1, n - 1))}
            onClose={() => openSheet(null)}
            deniedClassFor={(id) => deniedTile(`cm-${id}`)}
            spendLine={spendLine}
          />
        )}
        {sheet === 'intel' && (
          <IntelSheet
            scenario={scenario}
            state={state}
            actions={actions}
            step={step}
            onIntel={(checked) => {
              const intelPrice = state.intelLevel !== 3 ? scenario.prices.intelLevels[state.intelLevel] : 0
              if (checked && !afford(intelPrice, 'intel')) return
              play('buy-click')
              setActions({ ...actions, buyIntelLevel: checked })
            }}
            onRetainer={(checked) => {
              const price = scenario.countermeasures.find((c) => c.id === 'irRetainer')?.cost ?? 0
              if (checked && !afford(price, 'cm-irRetainer')) return
              play('buy-click')
              setActions({ ...actions, buyIrRetainer: checked })
            }}
            onNext={() => setStep(Math.min(INTEL_STEPS, step + 1))}
            onBack={() => setStep((n) => Math.max(1, n - 1))}
            onClose={() => openSheet(null)}
            intelClass={deniedTile('intel')}
            retainerClass={deniedTile('cm-irRetainer')}
            spendLine={spendLine}
          />
        )}
        {sheet === 'surge' && (
          <SurgeSheet
            options={surgeOptions}
            tokens={state.surgeTokens}
            queuedId={actions.spendSurgeOn}
            step={step}
            pickedId={surgePick}
            onPick={(id) => {
              setSurgePick(id)
              setStep(2)
            }}
            onConfirm={() => {
              queueSurge(surgePick)
              openSheet(null)
            }}
            onUndo={() => queueSurge(undefined)}
            onBack={() => setStep((n) => Math.max(1, n - 1))}
            onClose={() => openSheet(null)}
          />
        )}
        {sheet === 'system' && (
          <SystemSheet
            playing={state.status === 'playing'}
            onSave={saveSlot}
            onExport={exportCode}
            onExit={onExit}
            soundPrefs={soundPrefs}
            onSoundPrefs={setSoundPrefs}
            speed={speed}
            onSpeed={setSpeed}
            notice={notice}
            onClose={() => openSheet(null)}
          />
        )}
      </div>
      {/* THE ACTION BAR (brief 4.1; a turn stepper since R2b): the
          objective line, the four steps and RESOLVE full width under them.
          RESOLVE is the one irreversible action in the game, so it asks
          for a deliberate gesture rather than a tap that can land by
          accident on a phone; a keyboard or assistive activation fires at
          once. Its label is the instruction and its accessible name, a
          short tap puts "Keep holding to resolve" on the objective line,
          and after playback the slot becomes the way to the next turn. */}
      <ActionBar
        actions={ACTIONS}
        phase={deciding ? 'deciding' : phase === 'playback' ? 'playback' : 'aftermath'}
        openSheet={isStep(sheet) ? sheet : null}
        done={stepsDone}
        objective={objective}
        hint={holdHint !== null && deciding ? HOLD_HINT : undefined}
        onSkipTips={guided ? () => setGuideOn(false) : undefined}
        onToggle={toggleSheet}
        disabledFor={(action) => (action.id === 'surge' ? !canSurge && !actions.spendSurgeOn : !deciding)}
        captionFor={(action) => captions[action.id] ?? ''}
        resolve={(look) => (
          <HoldButton
            ref={holdRef}
            className={look.className}
            fillClassName={look.fillClassName}
            disabled={!affordable}
            onConfirm={resolve}
            onShortTap={shortTap}
            label={
              <span data-label className="uppercase">
                {resolveLabel(state.turn)}
              </span>
            }
            holdingLabel={<span className="uppercase">{resolvingLabel(state.turn)}</span>}
          />
        )}
        nextLabel={phase === 'playback' ? 'PLAYBACK' : state.status === 'playing' ? 'NEXT TURN' : 'FINAL REPORT'}
        onNext={nextTurn}
        pulseNext={phase === 'aftermath' && !reducedMotion}
        note={
          !affordable && deciding ? (
            <p className="px-2 pb-1 font-mono text-[10px] text-alert-amber">Planned spend exceeds credits. Trim the cart.</p>
          ) : undefined
        }
      />
    </main>
      {/* THE GLOSSARY OVERLAY, a sibling of the game rather than a child of
          it. Rendered inside this component so nothing unmounts: the
          campaign, the phase and the procurement cart are all still there
          when it closes, which is the whole reason this is not a route.
          Outside <main> because Glossary renders a landmark of its own and
          a nested <main> is invalid. */}
      {/* THE INTEL CARD (v1.2 R3, brief 4.8), for a tile or the banner, a
          sibling of the game like the Glossary, over the board it reads. */}
      {intel && (
        <div
          ref={intelRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-base/95 outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="intel"
          data-intel-overlay
        >
          <Suspense fallback={<OverlayLoading />}>
            <IntelCard subject={intel} state={shown} turn={state.turn} onClose={() => setIntel(null)} />
          </Suspense>
        </div>
      )}
      {glossaryFocus && (
        <div
          ref={glossaryRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-base/95 outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="glossary"
          data-glossary-overlay
        >
          <Suspense fallback={<OverlayLoading />}>
            <Glossary
              embedded
              focus={glossaryFocus}
              backLabel="Back to the brief"
              onBack={() => setGlossaryFocus(null)}
            />
          </Suspense>
        </div>
      )}
    </>
  )
}
