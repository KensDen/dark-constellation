// Text-first game shell, restyled in R2 per design brief v0.2: phosphor
// terminal chrome, hero-derived state accents (blue = friendly/defense,
// magenta = hostile/threat, amber = alerts), monospace HUD over sans body.
// All game logic is unchanged from R1.5. The game-feel pass (Round 2) adds
// a playback phase between resolve and aftermath: the director plays the
// resolved turn beat by beat over a presented state, and instant speed
// skips straight to the aftermath exactly as v1.0 did. Instant is an
// explicit choice only: reduced motion keeps the sequence and takes the
// static form of every cue (brief v1.2 section 3). The engine call is
// untouched.

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
import Readout from './cues/Meter'
import ConditionBadge, { useBadgePhases } from './cues/ConditionBadge'
import Teletype, { TransmissionBar } from './cues/Teletype'
import { CUE_MS, useCueClass, useReducedMotion } from './cues/motion'
import { layerBadges, vectorIcons } from './cues/icons'
import Glossary from './Glossary'
import { kindLabels, techniqueLabel } from './labels'
import { CHAIN_ARMED_LINE, briefCopy, hudLabels, hudStatusLine, jobFramingLines } from './brief'
import { verdictFor } from './verdict'
import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  OPPORTUNITY_EVENT_COUNT,
  SOURCE_COUNT,
  TECHNIQUE_REF_COUNT,
  THREAT_EVENT_COUNT,
  UNVERIFIED_REF_COUNT,
} from '../content'
import {
  CHAIN_BONUS,
  DEPLOY_ETA,
  MITIGATION_PER_COUNTER,
  SSA_MITIGATION_BONUS,
  DIFFICULTIES,
  SURGE_TOKEN_CAP,
  TIER_A_FLEET_SHARE,
  effectiveIntel,
  incomeFor,
  newGame,
  resolveTurn,
} from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT, METER_CAP, assetPrice, coverage, maiScore } from '../engine/scoring'
import type {
  AssetBuy,
  AssetKind,
  CountermeasureId,
  Difficulty,
  GameState,
  ResolvedEvent,
  TrustTier,
  TurnActions,
} from '../engine/types'

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

// Plain-language effect of buying each asset kind, shown at the point of
// purchase so the reason for every buy is legible.
const assetEffects: Record<AssetKind, string> = {
  sat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.sat.min} to ${DEPLOY_ETA.sat.max} turns to orbit`,
  rpoSat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.rpoSat.min} to ${DEPLOY_ETA.rpoSat.max} turns to orbit; hosts the docking LiDAR (no extra effect in this build)`,
  drone: `+${COVERAGE_PER_DRONE} coverage, deploys next turn; flies the LiDAR mapping sorties`,
  groundStation: `no coverage, ${DEPLOY_ETA.groundStation.min} to ${DEPLOY_ETA.groundStation.max} turns to stand up; ground ops capacity with no game effect in this build`,
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 hover:bg-phosphor/10 disabled:opacity-40 disabled:cursor-not-allowed'
// Tiles take a press: the scale is motion-only, the border and background
// carry the press for reduced motion (brief v0.5 section 6).
const tileBtn = `dc-tile ${btn} active:bg-phosphor/20 active:border-phosphor`
// A refused tile swaps its colour utilities rather than appending others:
// Tailwind resolves a conflict by stylesheet order, not by class order.
// The box is otherwise identical to tileBtn, so a refusal never changes
// the tile's size and shifts the row.
const tileBtnDenied =
  'dc-tile font-mono border border-hero-magenta text-hero-magenta bg-hero-magenta/10 px-3 py-1'
const panel = 'border border-phosphor/30 bg-panel p-3'
const h2cls = 'font-mono font-bold text-phosphor uppercase tracking-widest text-sm'

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
  const [phase, setPhase] = useState<Phase>((initial?.phase as Phase) ?? 'brief')
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

  // Item 1: the three-line job framing, shown on the start screen and again
  // in the turn 1 brief so a skimming player can state the objective.
  // Round 7b: the lines come from ui/brief.ts, which is the module the
  // reading-diet budgets read. They used to be spelled here as JSX, and
  // the brief screen rendered them INSIDE the same disclosure as the
  // posture panel where no budget could see them.
  const jobFraming = (
    <div className={`${panel} mt-4`}>
      <p className={h2cls}>Your job</p>
      {jobFramingLines(scenario).map((line, i) => (
        <p key={i} className={i === jobFramingLines(scenario).length - 1 ? 'mt-1 text-ink-dim' : 'mt-1'}>
          {i < 3 ? `${i + 1}. ${line}` : line}
        </p>
      ))}
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

  const beginGame = (next: GameState, nextPhase: Phase) => {
    // A loaded code that is already over was not played here, so it neither
    // posts a score nor clears the autosave of the campaign it interrupts.
    recordedRef.current = next.status !== 'playing'
    setState(next)
    setActions(EMPTY_ACTIONS)
    setPlayback(null)
    setPresented(null)
    setChosenSpend(0)
    setPhase(nextPhase)
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

  const shortEventName = (id: string) => scenario.events.find((e) => e.id === id)?.name.split(' (')[0] ?? id

  // Surge authority (item 4): queue one live condition to be cleared when
  // the turn resolves. The reducer applies it before condition pressure, so
  // a queued condition never presses again. Toggle to change the mind.
  const toggleSurge = (instanceId: string) =>
    setActions({ ...actions, spendSurgeOn: actions.spendSurgeOn === instanceId ? undefined : instanceId })

  // Item 1 UI: active-conditions panel with per-condition elapsed counters.
  // Only high intel estimates how many turns a condition has left; otherwise
  // the remaining span stays hidden, as the mechanic intends.
  const brief = briefCopy(shown)
  const hud = hudLabels(shown)
  const showsDurationEstimate = effectiveIntel(shown) >= 3
  const canSurge = state.surgeTokens > 0 && phase !== 'aftermath' && phase !== 'playback'
  const activeConditions =
    badges.length > 0 ? (
      <div className="mt-2 border border-hero-magenta/40 bg-hero-magenta/5 p-2">
        <p className="text-xs font-bold text-hero-magenta uppercase tracking-widest">
          Active conditions ({shown.conditions.length || badges.length})
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {badges.map((c) => {
            const queued = actions.spendSurgeOn === c.instanceId
            // Counted from the engine's turn so the number does not jump when
            // playback hands over to the aftermath.
            const elapsed = state.turn - c.startedTurn
            const def = scenario.events.find((e) => e.id === c.eventId)
            const offerSurge = phases[c.instanceId] !== 'clearing' && (queued || (canSurge && !actions.spendSurgeOn))
            return (
              <ConditionBadge
                key={c.instanceId}
                condition={c}
                layer={def?.layers[0]}
                phase={phases[c.instanceId] ?? 'attached'}
                elapsed={elapsed}
                remainingEstimate={showsDurationEstimate ? c.remainingTurns : undefined}
                queuedForSurge={queued}
                onSurge={offerSurge ? () => toggleSurge(c.instanceId) : undefined}
                surgeLabel={queued ? 'undo' : 'surge'}
              />
            )
          })}
        </div>
      </div>
    ) : null

  // Item 6: say in plain words why damage landed and what was missing, with
  // each counter's real worth. When everything applicable was owned, name
  // the gate that made an owned defense inert rather than blaming base
  // severity. state.counters after resolution reflects what was active.
  const whatWouldHaveHelped = (ev: ResolvedEvent): string => {
    const def = scenario.events.find((e) => e.id === ev.eventId)
    if (!def) return ''
    const missing = def.counters.filter((c) => !state.counters.includes(c))
    if (missing.length > 0) {
      const worth = (c: CountermeasureId): string => {
        if (c === 'ssaManeuver' && def.effect.special === 'debrisStrike') {
          return `cuts severity by ${MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS} when the maneuver budget is funded`
        }
        if (c === 'sensorFusion' && ev.chainBonus > 0) {
          return `cuts severity by ${MITIGATION_PER_COUNTER} and removes the +${CHAIN_BONUS} chain bonus`
        }
        if (c === 'tierAAttestation') {
          return `cuts severity by ${MITIGATION_PER_COUNTER} once at least a third of the sensored fleet flies Tier A`
        }
        return `cuts severity by ${MITIGATION_PER_COUNTER}`
      }
      const names = missing.map((c) => `${scenario.countermeasures.find((x) => x.id === c)?.name ?? c} (${worth(c)})`)
      return `What would have helped: ${names.join('; ')}.`
    }
    const sensored = state.assets.filter((a) => a.integrity > 0 && a.kind !== 'groundStation')
    const tierAShare = sensored.length > 0 ? sensored.filter((a) => a.tier === 'A').length / sensored.length : 0
    if (def.counters.includes('tierAAttestation') && tierAShare < TIER_A_FLEET_SHARE) {
      return 'Firmware attestation was owned but inert: it bites once at least a third of the sensored fleet flies Tier A.'
    }
    if (def.effect.special === 'debrisStrike' && ev.mitigation < MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS) {
      return 'SSA was owned but the maneuver budget could not cover the avoidance burn.'
    }
    return 'Every applicable defense was active. What landed is what the attack buys through them.'
  }

  const statusPanel = (
    <section className={`${panel} mt-4 font-mono`}>
      <h2 className="sr-only">Posture</h2>
      {/* Meters ease and count to their new values, with the tone carrying
          the direction; MAI strobes while it sits under the win line
          (brief v0.5 section 6). Reduced motion keeps the numbers and the
          colour and drops the movement. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <Readout
          label={hud.mai}
          value={maiScore(shown)}
          max={METER_CAP}
          warnBelow={scenario.winThreshold}
          strobeOnWarn
        />
        {/* During the decision phases the ticker shows what the cart
            leaves, so a buy ticks the number down as the brief asks; at
            every other time it is the engine's balance. */}
        <Readout
          label={hud.credits}
          value={phase === 'procure' || phase === 'harden' ? available - cost : shown.credits}
          basis={phase === 'procure' || phase === 'harden' ? 'cart' : 'balance'}
          chosen={phase === 'procure' || phase === 'harden'}
          chosenDelta={chosenSpend}
        />
        <Readout label={hud.coverage} value={coverage(shown.assets)} max={METER_CAP} />
        <Readout label={hud.link} value={shown.meters.linkAvailability} max={METER_CAP} />
        <Readout label={hud.data} value={shown.meters.dataIntegrity} max={METER_CAP} />
        <Readout label={hud.sensor} value={shown.meters.sensorIntegrity} max={METER_CAP} />
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        {hudStatusLine(shown, DIFFICULTIES[shown.difficulty].label, displayTurn)}
      </p>
      <details className="mt-1 text-sm font-sans text-ink-dim">
        <summary className="cursor-pointer">What these numbers mean</summary>
        <ul className="list-disc ml-6 mt-1 text-ink">
          <li>
            MAI: overall mission health, a weighted blend of Coverage, Link, Data, and Sensor. Finish at{' '}
            {scenario.winThreshold} or higher to win. Below {scenario.collapseThreshold} at any point, the mission
            collapses.
          </li>
          <li>
            Coverage: how much of the mission area the fleet can see, capped at 100. Each sat adds{' '}
            {COVERAGE_PER_SAT}, each drone {COVERAGE_PER_DRONE}. At {scenario.slaBonus.coverageMin} or more, the
            coverage SLA pays +{scenario.slaBonus.credits} credits a turn.
          </li>
          <li>Link: command and data links available. Jamming, link intrusion, and time spoofing drive it down.</li>
          <li>
            Data: mission data you can trust, kept confidential and intact. Ransomware, phishing, replay,
            eavesdropping, insider exfiltration, firmware implants, and the BLACKOUT CHAIN drive it down.
          </li>
          <li>
            Sensor: sensors telling the truth. LiDAR dazzle, injection and blinding, GNSS spoofing, training-data
            poisoning, firmware implants, and the BLACKOUT CHAIN drive it down.
          </li>
          <li>
            Damaged meters recover +{scenario.recovery.base} a turn, or +{scenario.recovery.withIrRetainer} with the
            incident response retainer.
          </li>
          <li>
            Credits: the budget. Income +{incomeFor(shown.difficulty, scenario.incomePerTurn)} a turn plus any SLA bonus. Repairs come out of it,
            and below zero the program folds.
          </li>
          <li>
            Conditions: some attacks (jamming, spoofing, eavesdropping, ransomware) stay active for a hidden{' '}
            {conditionDurationRange}, pressing the meters every turn until they lift. They stack.
          </li>
          <li>
            Surge authority: hold one or more (cap {SURGE_TOKEN_CAP}). Spend one in any decision phase to clear a
            condition. Earn one by holding the win line under two or more conditions; the IR retainer grants one on
            purchase.
          </li>
          <li>
            Commendations: end a turn at or above the win line with conditions active, or fully counter an attack, for
            credit and, under heavier pressure, meter bonuses.
          </li>
          <li>Deployments arrive after a lead time; sats can slip a turn. Watch the in-transit line.</li>
        </ul>
      </details>
      {shown.flags.lidarFallback && (
        <details className="mt-2 border border-hero-magenta/60 bg-hero-magenta/10 p-2">
          <summary className="cursor-pointer font-bold text-hero-magenta">{CHAIN_ARMED_LINE}</summary>
          <p className="mt-1 text-sm text-hero-magenta">
            GNSS is jammed, so the next LiDAR attack lands harder (+{CHAIN_BONUS} severity) unless sensor fusion
            cross-checks are in place or every drone flies Tier A sensors.
          </p>
        </details>
      )}
      {/* Reading diet (brief v0.5 section 5): the fleet, the countermeasure
          list, the in-transit line and the surge detail are reference, not
          the decision, so they sit one tap away rather than on screen
          before the first input. */}
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-phosphor">Posture detail</summary>
        <p className="mt-2 text-xs text-ink-dim">
          Fleet: {shown.assets.filter((a) => a.integrity > 0).length} operational assets (
          {shown.assets
            .filter((a) => a.integrity > 0)
            .map((a) => `${kindLabels[a.kind]} ${a.tier}`)
            .join(', ') || 'none'}
          )
        </p>
        <p className="mt-1 text-xs text-hero-blue">
          Countermeasures: {shown.counters.length > 0
            ? shown.counters
                .map((id) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id)
                .join('; ')
            : 'none'}
        </p>
        {(shown.pipeline.length > 0 || shown.pendingCounters.length > 0) && (
          <p className="mt-1 text-xs text-ink-dim">
            In transit:{' '}
            {[
              ...shown.pipeline.map(
                (p) => `${kindLabels[p.kind]} ${p.tier} (ETA ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'})`,
              ),
              ...shown.pendingCounters.map(
                (p) =>
                  `${scenario.countermeasures.find((c) => c.id === p.id)?.name ?? p.id} retrofit (ETA ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'})`,
              ),
            ].join('; ')}
          </p>
        )}
        <p className="mt-2 text-xs font-mono">
          <span className="text-alert-amber">
            Surge authority: {shown.surgeTokens} of {SURGE_TOKEN_CAP}
          </span>
          <span className="text-ink-dim"> (spend one in any phase to clear an active condition)</span>
          {shown.intelBoostTurns > 0 && (
            <span className="text-hero-blue"> | allied intel boost active ({shown.intelBoostTurns} more turn{shown.intelBoostTurns === 1 ? '' : 's'})</span>
          )}
        </p>
      </details>
      {activeConditions}
      {/* Saving and exporting belong to a campaign in progress; muting does
          not. The toggles rode this row when it was first built and
          vanished the moment the engine returned won or lost, which is
          exactly when the longest cues of the whole game play: the
          deciding turn's playback runs with status already decided, so a
          player reaching the BLACKOUT CHAIN or the defeat sting had no
          mute control on screen and no way back to one short of starting
          a new campaign. Principle 4 calls the effects toggle an
          accessibility path, and an accessibility path that disappears at
          the loudest moment is not one. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-phosphor/15">
        {state.status === 'playing' && (
          <>
            <button className={`${btn} text-xs py-0.5`} onClick={saveSlot}>
              Save
            </button>
            <button className={`${btn} text-xs py-0.5`} onClick={exportCode}>
              Export code
            </button>
          </>
        )}
        <SoundToggles prefs={soundPrefs} onChange={setSoundPrefs} />
        {state.status === 'playing' && <span className="text-xs text-ink-dim">Autosaved each turn.</span>}
      </div>
      {notice && <p className="mt-1 font-mono text-xs text-alert-amber">{notice}</p>}
    </section>
  )

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

  return (
    <>
      {/* The game, marked inert while the overlay is open. aria-modal is a
          promise to a screen reader that nothing behind the dialog is
          reachable; inert is what keeps it. */}
      <main
        className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto"
        {...(glossaryFocus ? { inert: true, 'aria-hidden': true } : {})}
      >
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
      {statusPanel}

      {phase === 'brief' && (
        <section className="mt-4">
          <h2 className={h2cls}>1. Intel brief, turn {state.turn}</h2>
          {/* Reading diet (brief v0.5 section 5): a headline of eight words
              or fewer, one threat-vector line, and the technique tag. The
              full forecast is one tap away, and the turn-1 job framing sits
              with it rather than in front of the first decision. */}
          <div className="mt-2">
            <TransmissionBar cueKey={state.turn}>
              <p className="mt-1 font-mono text-base sm:text-lg text-phosphor">
                <Teletype text={brief.headline} cueKey={state.turn} />
              </p>
            </TransmissionBar>
            <p className="mt-2 text-sm">{brief.vector}</p>
            {brief.tag && (
              <p className="mt-1 font-mono text-xs text-ink-dim">
                Technique:{' '}
                {/* OPENS THE GLOSSARY ENTRY, not the framework site (brief
                    section 5, and principle 1: "the GLOSSARY remains the
                    deep-reading layer"). Until Round 6e this was an external
                    anchor with target=_blank, which sent the player out of
                    the game on their first hop; the citation it went to is
                    still one tap away, on the entry itself.
                    The tag text IS the glossary key, both built by
                    techniqueLabel, so this resolves by construction. */}
                <button
                  type="button"
                  className="underline text-ink hover:text-phosphor"
                  data-technique-tag={brief.tag}
                  onClick={() => setGlossaryFocus(brief.tag ?? null)}
                >
                  {brief.tag}
                </button>
              </p>
            )}
            <details className="mt-3 border border-phosphor/20 bg-panel p-2">
              <summary className="cursor-pointer font-mono text-xs text-phosphor">Expand full brief</summary>
              {/* Round 7b: `brief.full`, not `state.forecast.lines`. The
                  field existed on six branches of briefCopy and was read by
                  nobody while this reached past it to the engine's own
                  prose, which below top intel was a re-wording of the
                  summary above it. It also matters that state.forecast
                  rides inside save codes: an engine-side prose fix would
                  never reach a campaign restored from an older code. */}
              <ul className="list-disc ml-6 mt-2 font-mono text-sm">
                {brief.full.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          </div>
          <button className={`${btn} mt-4`} onClick={() => setPhase('procure')}>
            To procurement
          </button>
        </section>
      )}

      {phase === 'procure' && (
        <section className="mt-4">
          <h2 className={h2cls}>2. Procure and deploy</h2>
          <p className={`mt-2 text-sm font-mono ${denialFlash}`}>
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {(['sat', 'rpoSat', 'drone', 'groundStation'] as AssetKind[]).map((kind) => (
              <li key={kind} className="mt-2">
                {kindLabels[kind]} <span className="text-ink-dim text-sm">({assetEffects[kind]})</span>:{' '}
                {(kind === 'groundStation' ? (['B'] as TrustTier[]) : (['B', 'A'] as TrustTier[])).map((tier) => (
                  <button
                    key={tier}
                    className={`${denied?.id === `${kind}-${tier}` ? `${tileBtnDenied} ${denialShake}` : tileBtn} ml-2 text-sm`}
                    onClick={() => addAsset(kind, tier)}
                  >
                    {kind === 'groundStation'
                      ? `Buy (${assetPrice(scenario, kind, tier)})`
                      : `Buy Tier ${tier} (${assetPrice(scenario, kind, tier)})`}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-dim">
            Tier B sensor packages are cheap with a hidden supply-chain risk: only Tier B hardware can host the
            firmware implant. Tier A packages cost more on sats and drones, are immune to the implant, and an all
            Tier A drone fleet breaks the BLACKOUT CHAIN. Ground stations carry no sensor package.
          </p>
          {actions.buyAssets.length > 0 && (
            <ul className="list-disc ml-6 mt-2 font-mono text-sm text-hero-blue">
              {actions.buyAssets.map((buy: AssetBuy, i: number) => (
                <li key={i} className={arrived?.index === i ? manifestCue : undefined}>
                  {kindLabels[buy.kind]} Tier {buy.tier} ({assetPrice(scenario, buy.kind, buy.tier)}){' '}
                  <button className={`${btn} px-1 py-0 text-xs`} onClick={() => removeAsset(i)}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* The refusal has to be attributable to the control the player
              touched, which means this tile has to carry it: afford() sets
              denied.id to 'intel' here, and nothing in the tree matched
              that id, so a refused intel upgrade buzzed and flashed the
              spend line while the control itself sat still.
              TWO channels, not one. The shake is motion and disappears
              under the preference; the border is colour and does not,
              which is how every other refusable control in this component
              already works (the fleet tiles swap to tileBtnDenied, the
              countermeasure tiles add a magenta border). The first version
              of this fix carried the shake alone, so it did nothing at all
              for a reduced-motion player, in the round that made reduced
              motion a first-class path. */}
          <p
            className={`mt-2 dc-tile ${
              denied?.id === 'intel' ? `${denialShake} border border-hero-magenta/60` : 'border border-transparent'
            }`}
          >
            <label>
              <input
                type="checkbox"
                checked={actions.buyIntelLevel}
                disabled={state.intelLevel >= 3}
                onChange={(e) => {
                  const intelPrice = state.intelLevel !== 3 ? scenario.prices.intelLevels[state.intelLevel] : 0
                  if (e.target.checked && !afford(intelPrice, 'intel')) return
                  play('buy-click')
                  setActions({ ...actions, buyIntelLevel: e.target.checked })
                }}
              />{' '}
              Raise intel to level {Math.min(3, state.intelLevel + 1)} (
              {state.intelLevel !== 3 ? scenario.prices.intelLevels[state.intelLevel] : 'maxed'}) for a sharper
              forecast of the coming turn
            </label>
          </p>
          <button className={`${btn} mt-4`} onClick={() => setPhase('harden')}>
            To hardening
          </button>
        </section>
      )}

      {phase === 'harden' && (
        <section className="mt-4">
          <h2 className={h2cls}>3. Harden and configure</h2>
          <p className={`mt-2 text-sm font-mono ${denialFlash}`}>
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {scenario.countermeasures
              .filter((cm) => cm.id !== 'intelInvestment' && cm.id !== 'irRetainer')
              .map((cm) => (
                <li
                  key={cm.id}
                  className={`dc-tile mt-3 border border-transparent p-1 ${
                    denied?.id === `cm-${cm.id}` ? `${denialShake} border-hero-magenta/60` : ''
                  } ${actions.buyCounters.includes(cm.id) ? 'border-hero-blue/40 bg-hero-blue/5' : ''}`}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={state.counters.includes(cm.id) || actions.buyCounters.includes(cm.id)}
                      disabled={state.counters.includes(cm.id)}
                      onChange={() => toggleCounter(cm.id)}
                    />{' '}
                    {cm.name} ({cm.cost})
                    {state.counters.includes(cm.id) && <span className="text-hero-blue font-mono"> [ACTIVE]</span>}
                  </label>
                  <p className="text-sm ml-6 text-hero-blue">
                    Answers: {cm.counters.map((id) => shortEventName(id)).join(', ') || 'posture-wide'}
                  </p>
                  <p className="text-sm ml-6 text-ink-dim">{cm.blurb}</p>
                  {cm.spartaCms.length > 0 && (
                    <p className="ml-6 font-mono text-xs text-ink-dim">
                      SPARTA:{' '}
                      {cm.spartaCms.map((ref, j) => (
                        <span key={ref.id}>
                          {j > 0 ? '; ' : ''}
                          <a className="underline" href={ref.url} target="_blank" rel="noreferrer">
                            {ref.id} {ref.name}
                          </a>{' '}
                          ({ref.tier})
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            {/* Same as the intel tile, including the colour channel that
                survives reduced motion: afford() sets denied.id to
                'cm-irRetainer' and the countermeasure list filters this one
                out, so nothing carried the refusal for it. */}
            <li
              className={`mt-3 dc-tile ${
                denied?.id === 'cm-irRetainer'
                  ? `${denialShake} border border-hero-magenta/60`
                  : 'border border-transparent'
              }`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={state.irRetainer || actions.buyIrRetainer}
                  disabled={state.irRetainer}
                  onChange={(e) => {
                    const price = scenario.countermeasures.find((c) => c.id === 'irRetainer')?.cost ?? 0
                    if (e.target.checked && !afford(price, 'cm-irRetainer')) return
                    play('buy-click')
                    setActions({ ...actions, buyIrRetainer: e.target.checked })
                  }}
                />{' '}
                Incident response retainer (
                {scenario.countermeasures.find((c) => c.id === 'irRetainer')?.cost}
                ){state.irRetainer && <span className="text-hero-blue font-mono"> [ACTIVE]</span>}
              </label>
              <p className="text-sm ml-6 text-hero-blue">
                Answers: everything, indirectly. Every damaged meter recovers +{scenario.recovery.withIrRetainer} a
                turn instead of +{scenario.recovery.base}.
              </p>
              {(scenario.countermeasures.find((c) => c.id === 'irRetainer')?.spartaCms ?? []).length > 0 && (
                <p className="ml-6 font-mono text-xs text-ink-dim">
                  SPARTA:{' '}
                  {(scenario.countermeasures.find((c) => c.id === 'irRetainer')?.spartaCms ?? []).map((ref, j) => (
                    <span key={ref.id}>
                      {j > 0 ? '; ' : ''}
                      <a className="underline" href={ref.url} target="_blank" rel="noreferrer">
                        {ref.id} {ref.name}
                      </a>{' '}
                      ({ref.tier})
                    </span>
                  ))}
                </p>
              )}
            </li>
          </ul>
          {!affordable && (
            <p className="mt-2 font-bold font-mono text-alert-amber">Planned spend exceeds credits. Trim the cart.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* The turn is the one irreversible action in the game, so it
                asks for a deliberate gesture rather than a tap that can
                land by accident on a phone (brief section 4). A keyboard
                or assistive activation fires at once. */}
            <HoldButton
              className={`${tileBtn} min-h-11 px-4`}
              disabled={!affordable}
              onConfirm={resolve}
              label={`4. Hold to resolve turn ${state.turn}`}
              holdingLabel={`Hold... resolving turn ${state.turn}`}
            />
            <button className={tileBtn} onClick={() => setPhase('procure')}>
              Back to procurement
            </button>
          </div>
          {/* The adversary phase plays back beat by beat unless the speed is
              instant, which resolves straight to the aftermath as v1.0 did.
              The control lives here as well as in the playback view, because
              instant never mounts that view and would otherwise be a choice
              with no way back. */}
          <div className="mt-3 pt-3 border-t border-phosphor/15">
            <SpeedSelect speed={speed} onChange={setSpeed} />
            <p className="mt-1 font-mono text-xs text-ink-dim">
              {speed === 'instant'
                ? 'Results appear at once, with no beat-by-beat playback.'
                : 'The adversary phase plays out beat by beat. Tap to advance, or skip at any point.'}
            </p>
          </div>
        </section>
      )}

      {/* The adversary phase enters through a dim. It plays on the way in
          and blocks nothing: the engine resolved the turn before this
          renders (principle 3). */}
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

      {phase === 'aftermath' && lastRecord && (
        <section className="mt-4">
          <h2 className={h2cls}>5. Aftermath, turn {lastRecord.turn}</h2>
          {/* The playback was the report, so the aftermath opens on one
              verdict line; the engine's full ledger is one tap away (brief
              v0.5 section 5). */}
          <p className="mt-2 text-base text-ink">{verdictFor(lastRecord, scenario)}</p>
          {lastRecord.commendations.length > 0 && (
            <div
              className={`mt-2 border border-hero-blue/50 bg-hero-blue/5 p-2 ${reducedMotion ? '' : 'dc-ribbon-in'}`}
            >
              <p className="text-xs font-bold text-hero-blue uppercase tracking-widest">Commendations</p>
              {lastRecord.commendations.map((c, i) => (
                <p key={i} className="text-sm mt-1 text-hero-blue">
                  {c}
                </p>
              ))}
            </div>
          )}
          {/* The playback was the report; the per-event ledger with its
              severity math, counterfactuals and citations stays one tap
              away (brief v0.5 section 5). */}
          {/* At instant speed there was no playback, so the aftermath is
              the only report of the turn and opens with the ledger already
              expanded. */}
          <details className="mt-2 border border-phosphor/20 bg-panel p-2" open={speed === 'instant'}>
            <summary className="cursor-pointer font-mono text-xs text-phosphor">
              Details: turn ledger ({lastRecord.events.length} event{lastRecord.events.length === 1 ? '' : 's'},{' '}
              {lastRecord.notes.length} note{lastRecord.notes.length === 1 ? '' : 's'})
            </summary>
            {lastRecord.notes.map((n, i) => (
              <p key={i} className="mt-1 font-mono text-sm">
                {n}
              </p>
            ))}
            {lastRecord.events.length === 0 && <p className="mt-2">No adversary activity this turn.</p>}
            {lastRecord.events.map((ev, i) => {
              const def = scenario.events.find((e) => e.id === ev.eventId)
              const isOpportunity = (def?.kind ?? 'threat') === 'opportunity'
              const landed = ev.effectiveSeverity > 0
              if (isOpportunity) {
                return (
                  <div key={i} className="border p-3 mt-2 border-hero-blue/50 bg-hero-blue/5">
                    <h3 className="font-bold font-mono text-hero-blue">Opportunity: {ev.name}</h3>
                    {ev.notes.map((n, j) => (
                      <p key={j} className="text-sm mt-1 text-hero-blue">
                        {n}
                      </p>
                    ))}
                    {def && <p className="text-sm mt-1 text-ink-dim">{def.blurb}</p>}
                  </div>
                )
              }
              return (
                <div
                  key={i}
                  className={`border p-3 mt-2 ${landed ? 'border-hero-magenta/50 bg-hero-magenta/5' : 'border-phosphor/30 bg-panel'}`}
                >
                  <h3 className="font-bold font-mono flex items-center gap-2">
                    {def && <img src={vectorIcons[def.vector]} alt="" aria-hidden="true" className="w-6 h-6" />}
                    <span className={landed ? 'text-hero-magenta' : 'text-phosphor'}>{ev.name}</span>
                    <span className="ml-auto flex gap-2">
                      {def?.layers.map((layer) => (
                        <span key={layer} className="flex flex-col items-center">
                          <img src={layerBadges[layer]} alt="" className="h-7 w-auto" />
                          <span className="font-mono text-[9px] text-ink-dim leading-none mt-0.5">{layer}</span>
                        </span>
                      ))}
                    </span>
                  </h3>
                  <p className={`text-sm font-mono mt-1 ${landed ? 'text-hero-magenta' : 'text-ink-dim'}`}>
                    Severity {ev.baseSeverity} base {ev.chainBonus > 0 ? `+ ${ev.chainBonus} chain ` : ''}
                    {ev.mitigation > 0 ? `- ${ev.mitigation} mitigated ` : ''}= {ev.effectiveSeverity} effective.
                    {ev.repairCost > 0 ? ` Repairs: ${ev.repairCost} credits.` : ''}
                  </p>
                  {ev.notes.map((n, j) => (
                    <p key={j} className="text-sm mt-1">
                      {n}
                    </p>
                  ))}
                  {landed && <p className="text-sm mt-1 font-bold text-alert-amber">{whatWouldHaveHelped(ev)}</p>}
                  {ev.firedTechniqueRefs.length > 0 && (
                    <p className="text-sm mt-1">
                      Techniques:{' '}
                      {ev.firedTechniqueRefs.map((ref, j) => (
                        <span key={j}>
                          {j > 0 ? '; ' : ''}
                          <a className="underline text-ink" href={ref.url} target="_blank" rel="noreferrer">
                            {techniqueLabel(ref)}, {ref.name}
                          </a>{' '}
                          <span className="text-ink-dim font-mono text-xs">[{ref.status}]</span>
                        </span>
                      ))}
                    </p>
                  )}
                  {(def?.learnMoreCards ?? []).map((card, j) => (
                    <details key={j} className="mt-2 border border-phosphor/20 bg-panel p-2">
                      <summary className="cursor-pointer text-sm font-mono text-phosphor">
                        Learn more: {card.title}
                      </summary>
                      <p className="text-sm mt-2">{card.body}</p>
                      <ul className="list-disc ml-6 mt-2 text-sm">
                        {card.sources.map((src, k) => (
                          <li key={k}>
                            <a className="underline text-ink" href={src.url} target="_blank" rel="noreferrer">
                              {src.title}
                            </a>{' '}
                            <span className="text-ink-dim font-mono text-xs">
                              [{src.type}] [{src.status}]
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )
            })}
          </details>
          <button className={`${btn} mt-4`} onClick={nextTurn}>
            {state.status === 'playing' ? `To turn ${state.turn} intel brief` : 'View final report'}
          </button>
        </section>
      )}
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
