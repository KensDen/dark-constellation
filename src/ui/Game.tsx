// The game shell. Since v1.2 Round 1 the play screen is a BOARD (board
// pass brief section 4): a pinned HUD, the threat banner, three layer
// panels of asset tiles, and a pinned five-button action bar whose first
// four open bottom sheets over the board. The start screen and the
// outcome screen are the v1.1 ones. All game logic is unchanged: this
// file still owns the cart, the affordability gate, the cues and the
// engine call, and the components under ./board only render what it
// hands them. The game-feel pass (Round 2) adds a playback phase between
// resolve and aftermath: the director plays the resolved turn beat by
// beat over a presented state, and instant speed skips straight to the
// aftermath exactly as v1.0 did. Instant is an explicit choice only:
// reduced motion keeps the sequence and takes the static form of every
// cue (brief v1.2 section 3).

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ADVERSARY } from '../config'
import {
  LocalScoreSink,
  LocalStorageStore,
  SaveError,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  type RestoredGame,
  type SaveMeta,
  type SavePhase,
} from '../persistence'
import { reportData, shareText } from './reportCard'
import DirectorView from '../director/DirectorView'
import HoldButton from './cues/HoldButton'
import SoundToggles from './cues/SoundToggles'
import { useMusicState, useSound, useSoundPrefs } from '../audio'
import {
  SpeedSelect,
  defaultSpeed,
  deriveBeats,
  loadSpeedPreference,
  saveSpeedPreference,
  type Beat,
  type Speed,
} from '../director'
import { useBadgePhases } from './cues/ConditionBadge'
import { CUE_MS, useCueClass, useReducedMotion } from './cues/motion'
import { vectorIcons } from './cues/icons'
import Glossary from './Glossary'
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
import type { SheetId } from './board/Sheet'
import { conditionsOn, defensesOn, tilesByLayer } from './board/board'
import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  OPPORTUNITY_EVENT_COUNT,
  SOURCE_COUNT,
  TECHNIQUE_REF_COUNT,
  THREAT_EVENT_COUNT,
  UNVERIFIED_REF_COUNT,
} from '../content'
import { DIFFICULTIES, effectiveIntel, incomeFor, newGame, resolveTurn } from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { assetPrice, coverage } from '../engine/scoring'
import { LAYERS, type AssetKind, type Difficulty, type GameState, type TrustTier, type TurnActions } from '../engine/types'

import Wordmark from './Wordmark'
import defeatSphereUrl from './assets/defeat-sphere.webp'
import winSphereUrl from './assets/win-sphere.webp'
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
// The action bar's four sheet buttons and the two shapes of the fifth.
const barBtn =
  'dc-tile flex flex-col items-center justify-center gap-0.5 min-h-16 font-display text-[10px] border-2 border-dc-line bg-dc-panel text-dc-ink shadow-press active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed'
const barBtnOpen = `${barBtn} border-dc-friendly text-dc-friendly bg-dc-friendly/10`
const barPrimary = `${barBtn} border-dc-go bg-dc-go/10 text-dc-go`

// Which sheet is open. The sheet is presentation state, not a phase: the
// v1.1 phases 'procure' and 'harden' still arrive from older autosaves and
// save codes, and they open the matching sheet on a board at 'brief'.
type Sheet = SheetId
function arrive(phase: Phase | undefined): { phase: Phase; sheet: Sheet | null } {
  if (phase === 'procure' || phase === 'harden') return { phase: 'brief', sheet: phase }
  return { phase: phase ?? 'brief', sheet: null }
}

// Persistence singletons (R4). Local implementations behind the SaveStore
// and ScoreSink interfaces; the remote seam is v2 and not imported.
const saveStore = new LocalStorageStore()
const scoreSink = new LocalScoreSink()

// Copy text to the clipboard with a synchronous fallback for browsers that
// gate the async clipboard API.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

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

export default function Game({ onExit, initial }: { onExit?: () => void; initial?: RestoredGame | null }) {
  const [state, setState] = useState<GameState | null>(initial?.state ?? null)
  const [phase, setPhase] = useState<Phase>(() => arrive(initial?.phase as Phase | undefined).phase)
  const [sheet, setSheet] = useState<Sheet | null>(() => arrive(initial?.phase as Phase | undefined).sheet)
  // Where each sheet is in its steps, and what PROCURE has picked so far.
  const [step, setStep] = useState(1)
  const [pick, setPick] = useState<ProcurePick>({})
  const [surgePick, setSurgePick] = useState<string | undefined>(undefined)
  // The tile whose full name and exact integrity the panel prints.
  const [selectedTile, setSelectedTile] = useState<string | null>(null)
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
  // finished-state code was hard to come by: Save and Export code render
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
  const showPresented = useCallback((s: GameState, chosenCredits: number) => {
    setPresented(s)
    setChosenSpend(chosenCredits)
  }, [])
  const [speed, setSpeedState] = useState<Speed>(() => defaultSpeed(loadSpeedPreference()))
  const setSpeed = useCallback((s: Speed) => {
    setSpeedState(s)
    saveSpeedPreference(s)
  }, [])
  const finishPlayback = useCallback(() => {
    setPlayback(null)
    setPresented(null)
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
  const shownOrNull = phase === 'playback' && presented ? presented : state
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
  // a finished run is not offered for resume.
  useEffect(() => {
    if (!state) return
    if (state.status === 'playing') {
      saveStore.autosave(state, persistPhase(phase))
    } else if (!recordedRef.current) {
      recordedRef.current = true
      saveStore.clearAutosave()
      const last = state.history[state.history.length - 1]
      scoreSink.record({
        outcome: state.status,
        mai: last?.maiScore ?? 0,
        seed: state.seed,
        turnsSurvived: state.history.length,
        totalTurns: scenario.totalTurns,
        scenarioId: scenario.id,
        difficulty: state.difficulty,
        recordedAt: new Date().toISOString(),
      })
    }
  }, [state, phase, scenario])

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
  }
  const toggleSheet = (next: Sheet) => openSheet(sheet === next ? null : next)

  // Escape closes the sheet, on a window listener like the glossary's,
  // and not while the glossary is open: its own listener answers then.
  useEffect(() => {
    if (!sheet || glossaryFocus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        openSheet(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, glossaryFocus])

  const beginGame = (next: GameState, nextPhase: Phase) => {
    // A loaded code that is already over was not played here, so it neither
    // posts a score nor clears the autosave of the campaign it interrupts.
    recordedRef.current = next.status !== 'playing'
    const arrival = arrive(nextPhase)
    setState(next)
    setActions(EMPTY_ACTIONS)
    setPlayback(null)
    setPresented(null)
    setChosenSpend(0)
    setPhase(arrival.phase)
    openSheet(arrival.sheet)
    setSelectedTile(null)
    setNotice('')
  }

  const start = () => {
    const seed = Number.parseInt(seedInput, 10)
    beginGame(newGame(scenario, Number.isFinite(seed) ? seed : DEFAULT_SEED, difficulty), 'brief')
  }

  const newCampaign = () => {
    recordedRef.current = false
    setState(null)
    setActions(EMPTY_ACTIONS)
    setPlayback(null)
    setPresented(null)
    setChosenSpend(0)
    setPhase('brief')
    openSheet(null)
    setSelectedTile(null)
    setSlots(saveStore.list())
    setNotice('')
  }

  // Load from a pasted save code (R4 item 2), with graceful failure.
  const loadCode = () => {
    try {
      const restored = decodeSaveCode(codeInput)
      beginGame(restored.state, restored.phase as Phase)
    } catch (e) {
      flash(e instanceof SaveError ? e.message : 'That save code could not be read.')
    }
  }

  const loadSlot = (id: string) => {
    const restored = saveStore.load(id)
    if (restored) beginGame(restored.state, restored.phase as Phase)
    else flash('That save could not be loaded.')
  }

  const saveSlot = () => {
    if (!state) return
    const name = `Turn ${Math.min(state.turn, scenario.totalTurns)} save`
    saveStore.save(state, persistPhase(phase), name)
    setSlots(saveStore.list())
    flash('Saved to a slot.')
  }

  const exportCode = async () => {
    if (!state) return
    const code = encodeSaveCode(captureGame(state, persistPhase(phase), new Date().toISOString()))
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
    state && state.status !== 'playing' ? encodeSaveCode(captureGame(state, 'aftermath', stampRef.current.at)) : ''

  const copyOutcomeCode = async () => {
    flash(
      (await copyToClipboard(outcomeCode))
        ? 'Save code copied to clipboard.'
        : 'Copy failed. Select the code above and copy it.',
    )
  }

  const copyResult = async () => {
    if (!state) return
    flash((await copyToClipboard(shareText(state))) ? 'Result summary copied.' : 'Copy failed; try again.')
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
  const turnIncome =
    incomeFor(state.difficulty, scenario.incomePerTurn) +
    (coverage(state.assets) >= scenario.slaBonus.coverageMin ? scenario.slaBonus.credits : 0)
  const available = state.credits + turnIncome
  const cost = plannedCost(state, actions)
  const affordable = cost <= available
  const lastRecord = state.history[state.history.length - 1]
  const displayTurn =
    (phase === 'aftermath' || phase === 'playback') && lastRecord ? lastRecord.turn : Math.min(state.turn, scenario.totalTurns)
  // Narrowed from the nullable value computed with the hooks above.
  const shown = shownOrNull ?? state

  const resolve = () => {
    // The engine is the authority on affordability. If the UI gate and the
    // engine ever disagree, surface the reason instead of dying silently:
    // a throw inside an event handler never reaches an error boundary.
    try {
      const next = resolveTurn(state, actions, turnRng(state.seed, state.turn))
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
      setSelectedTile(null)
      // The cart is gone, so the entry the cue pointed at is too.
      setArrived(null)
      if (!beats) {
        setPlayback(null)
        setPresented(null)
        setPhase('aftermath')
      } else {
        setPlayback({ before: state, after: next, beats })
        setPresented(state)
        setPhase('playback')
      }
    } catch (e) {
      flash(e instanceof Error ? `Turn could not resolve: ${e.message}` : 'Turn could not resolve.')
    }
  }

  const nextTurn = () => setPhase('brief')

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
      Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn income).
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
  // report card, exactly as the aftermath alone did in v1.0.
  if (state.status !== 'playing' && phase !== 'aftermath' && phase !== 'playback') {
    // The same report data feeds the on-screen card and the shareable
    // summary, so they can never disagree (R4).
    const report = reportData(state)
    const won = state.status === 'won'
    return (
      <main className="relative min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        {/* Outcome backdrop: dimmed and duotoned toward the state colour,
            magenta on a loss (R3.5) and blue on a win (R5), lazy-loaded and
            symmetric. Only the one that applies is ever requested. */}
        <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={won ? winSphereUrl : defeatSphereUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover opacity-60"
            style={{
              filter: won
                ? 'grayscale(1) brightness(0.55) sepia(1) hue-rotate(175deg) saturate(4)'
                : 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(270deg) saturate(4)',
            }}
          />
          <div className="absolute inset-0 bg-base/60" />
        </div>
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
        <h2
          className={`relative z-10 mt-6 font-display text-xl sm:text-2xl tracking-widest ${won ? 'text-hero-blue' : 'text-hero-magenta'}`}
        >
          {won ? 'MISSION ASSURED' : 'MISSION FAILED'}
        </h2>
        <p className="relative z-10 mt-2">
          {won
            ? `The architecture held through turn ${scenario.totalTurns}.`
            : state.lossReason === 'insolvency'
              ? 'Budget insolvency. The program ran out of credits before it ran out of threats.'
              : state.lossReason === 'maiCollapse'
                ? 'Mission Assurance Index collapse. The architecture came apart under the campaign.'
                : `End of campaign below the win threshold of ${scenario.winThreshold}.`}
        </p>
        <p className="relative z-10 mt-4 font-mono text-xl text-phosphor">
          Final MAI: {lastRecord?.maiScore ?? 0}
          <span className="text-ink-dim text-sm">
            {' '}
            | turns survived {state.history.length} of {scenario.totalTurns} | seed {state.seed} |{' '}
            {DIFFICULTIES[state.difficulty].label}
          </span>
        </p>
        <h3 className={`${h2cls} relative z-10 mt-6`}>Technique report card</h3>
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {report.burned.map((t) => (
            <div key={t.id} className="border border-hero-magenta/50 bg-hero-magenta/5 p-2 font-mono text-xs">
              <p className="text-hero-magenta font-bold flex items-center gap-2">
                {t.vector && <img src={vectorIcons[t.vector]} alt="" className="w-5 h-5" />}
                COMPROMISED
              </p>
              <p className="mt-1">{t.id}</p>
              <p className="text-ink-dim font-sans">{t.name}</p>
            </div>
          ))}
          {report.resisted.map((t) => (
            <div key={t.id} className="border border-hero-blue/50 bg-hero-blue/5 p-2 font-mono text-xs">
              <p className="text-hero-blue font-bold flex items-center gap-2">
                {t.vector && <img src={vectorIcons[t.vector]} alt="" className="w-5 h-5" />}
                RESILIENT
              </p>
              <p className="mt-1">{t.id}</p>
              <p className="text-ink-dim font-sans">{t.name}</p>
            </div>
          ))}
          {report.burned.length === 0 && report.resisted.length === 0 && (
            <p className="text-ink-dim">No technique fired or was shut out this run.</p>
          )}
        </div>
        <div className="relative z-10 mt-6 pt-3 border-t border-phosphor/30 flex flex-wrap items-center justify-between gap-2">
          <Wordmark size="0.7rem" />
          <p className="font-mono text-xs text-ink-dim">
            {won ? 'assured' : 'failed'} at MAI {lastRecord?.maiScore ?? 0} | seed {state.seed} |
            kensden.github.io/dark-constellation
          </p>
        </div>
        {/* THE SAVE CODE REVEAL (brief section 4, outcome row; Round 6e).
            Rendered, not merely copyable. A readonly textarea rather than a
            <code> block because it is the one element a phone will reliably
            let a player select and copy from, and because the failure path
            this fixes is exactly the player whose clipboard API is gated.
            The copy button below sends this string, not a freshly stamped
            one, so what is on screen is what lands on the clipboard. */}
        <div className="relative z-10 mt-6 border-t border-phosphor/30 pt-3">
          <label className="font-mono text-xs text-phosphor" htmlFor="outcome-save-code">
            Save code
          </label>
          <textarea
            id="outcome-save-code"
            data-outcome-save-code
            readOnly
            value={outcomeCode}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full border border-phosphor/40 bg-base text-ink px-2 py-1 font-mono text-xs h-16 break-all"
            aria-label="save code for this campaign"
          />
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap gap-2">
          <button className={btn} onClick={copyResult}>
            Copy result
          </button>
          <button className={btn} onClick={copyOutcomeCode}>
            Export save code
          </button>
          <button className={btn} onClick={newCampaign}>
            New campaign
          </button>
          {onExit && (
            <button className={btn} onClick={onExit}>
              Back to menu
            </button>
          )}
        </div>
        {notice && <p className="mt-2 font-mono text-sm text-alert-amber">{notice}</p>}
      </main>
    )
  }

  const displayRecord = phase === 'aftermath' && lastRecord ? lastRecord : null
  const sheetOpen = sheet !== null

  return (
    <>
      {/* The game, marked inert while the overlay is open. aria-modal is a
          promise to a screen reader that nothing behind the dialog is
          reachable; inert is what keeps it. The pinned chrome and the
          sheets all sit inside this landmark for the same reason. */}
      <main
        className="relative flex flex-1 min-h-0 w-full max-w-[560px] mx-auto flex-col overflow-hidden bg-dc-ground text-dc-ink"
        {...(glossaryFocus ? { inert: true, 'aria-hidden': true } : {})}
      >
      <Hud
        shown={shown}
        displayTurn={displayTurn}
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Keyed on the PRESENTED turn, so the teletype runs once when a
            turn's transmission arrives and not again when the engine's
            turn advances under a playback that is still showing this one. */}
        <ThreatBanner shown={shown} cueKey={shown.turn} onTag={(tag) => setGlossaryFocus(tag)} />
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
              selectedKey={selectedTile}
              onSelect={setSelectedTile}
              onRemoveQueued={removeAsset}
            />
          ))}
          <BoardReference shown={shown} conditionDurationRange={conditionDurationRange} />
          {/* Saving and exporting belong to a campaign in progress; muting
              does not. The toggles vanished with the old save row the
              moment the engine returned won or lost, which is exactly when
              the longest cues of the whole game play: principle 4 calls
              the effects toggle an accessibility path, and one that
              disappears at the loudest moment is not one. */}
          <div className="flex flex-wrap items-center gap-2 border-t-2 border-dc-line pt-2 pb-2">
            {state.status === 'playing' && (
              <>
                <button className={`${btn} text-xs min-h-11`} onClick={saveSlot}>
                  Save
                </button>
                <button className={`${btn} text-xs min-h-11`} onClick={exportCode}>
                  Export code
                </button>
              </>
            )}
            {onExit && (
              <button className={`${btn} text-xs min-h-11`} onClick={onExit}>
                Back to menu
              </button>
            )}
            <SoundToggles prefs={soundPrefs} onChange={setSoundPrefs} />
            {/* The adversary phase plays back beat by beat unless the speed
                is instant, which resolves straight to the aftermath as v1.0
                did. The control lives here as well as in the playback view,
                because instant never mounts that view and would otherwise
                be a choice with no way back. */}
            <SpeedSelect speed={speed} onChange={setSpeed} />
          </div>
          {notice && <p className="font-mono text-xs text-alert-amber">{notice}</p>}
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
      </div>
      {/* THE ACTION BAR (brief 4.1), pinned, five buttons of 60px or more.
          The fifth is the one irreversible action in the game, so it asks
          for a deliberate gesture rather than a tap that can land by
          accident on a phone; a keyboard or assistive activation fires at
          once. After playback it becomes the way to the next turn. */}
      <nav aria-label="Actions" className="flex-none border-t-2 border-dc-line bg-dc-chrome px-safe pb-safe">
        <div className="grid grid-cols-5 gap-1 p-1">
          <button type="button" className={sheet === 'procure' ? barBtnOpen : barBtn} aria-expanded={sheet === 'procure'} disabled={!deciding} onClick={() => toggleSheet('procure')}>
            PROCURE
            {actions.buyAssets.length > 0 && <span className="font-mono text-[10px] text-dc-friendly">{actions.buyAssets.length} queued</span>}
          </button>
          <button type="button" className={sheet === 'harden' ? barBtnOpen : barBtn} aria-expanded={sheet === 'harden'} disabled={!deciding} onClick={() => toggleSheet('harden')}>
            HARDEN
            {actions.buyCounters.length > 0 && <span className="font-mono text-[10px] text-dc-friendly">{actions.buyCounters.length} queued</span>}
          </button>
          <button type="button" className={sheet === 'intel' ? barBtnOpen : barBtn} aria-expanded={sheet === 'intel'} disabled={!deciding} onClick={() => toggleSheet('intel')}>
            INTEL
            {(actions.buyIntelLevel || actions.buyIrRetainer) && <span className="font-mono text-[10px] text-dc-friendly">queued</span>}
          </button>
          <button
            type="button"
            className={sheet === 'surge' ? barBtnOpen : barBtn}
            aria-expanded={sheet === 'surge'}
            disabled={!canSurge && !actions.spendSurgeOn}
            onClick={() => toggleSheet('surge')}
          >
            SURGE
            <span className="font-mono text-[10px] text-dc-muted">{actions.spendSurgeOn ? 'queued' : surgeReason || `${state.surgeTokens} token${state.surgeTokens === 1 ? '' : 's'}`}</span>
          </button>
          {deciding ? (
            <HoldButton
              className={barPrimary}
              disabled={!affordable}
              onConfirm={resolve}
              label={
                <>
                  <span aria-hidden="true">RESOLVE</span>
                  <span className="sr-only">Hold to resolve turn {state.turn}</span>
                </>
              }
              holdingLabel={
                <>
                  <span aria-hidden="true">RESOLVING</span>
                  <span className="sr-only">Hold... resolving turn {state.turn}</span>
                </>
              }
            />
          ) : (
            <button type="button" className={barPrimary} disabled={phase === 'playback'} onClick={nextTurn}>
              {phase === 'playback' ? 'PLAYBACK' : state.status === 'playing' ? 'NEXT TURN' : 'FINAL REPORT'}
            </button>
          )}
        </div>
        {!affordable && deciding && <p className="px-2 pb-1 font-mono text-[10px] text-alert-amber">Planned spend exceeds credits. Trim the cart.</p>}
      </nav>
    </main>
      {/* THE GLOSSARY OVERLAY, a sibling of the game rather than a child of
          it. Rendered inside this component so nothing unmounts: the
          campaign, the phase and the procurement cart are all still there
          when it closes, which is the whole reason this is not a route.
          Outside <main> because Glossary renders a landmark of its own and
          a nested <main> is invalid. */}
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
          <Glossary
            embedded
            focus={glossaryFocus}
            backLabel="Back to the brief"
            onBack={() => setGlossaryFocus(null)}
          />
        </div>
      )}
    </>
  )
}
