// The game shell. Since v1.2 Round 1 the play screen is a BOARD (board
// pass brief section 4): a pinned HUD, the threat banner, three layer
// panels of asset tiles, and a pinned action bar whose PROCURE opens a
// bottom sheet over the board. The start screen and the outcome screen
// are the v1.1 ones. All game logic is unchanged: this file still owns
// the cart, the affordability gate, the cues and the engine call, and the
// components under ./board only render what it hands them. Since v1.2 R5
// the outcome screen is the score screen, a chunk of its own, and a
// campaign may be a Daily Op; since v1.3 R4 it is the debrief
// (./Debrief, brief 5.6). The game-feel pass
// (Round 2) added a playback phase between resolve and aftermath. Since
// v1.3 Round 3 that phase is THE NIGHT (brief 5.5, ./night): EXECUTE
// resolves the turn in the engine, then the overlay, the strikes, the
// cards and END OF TURN play it back over the board, tapped through; the
// v1.1 director that played beats is retired. HARDEN, INTEL and SURGE
// left the bar in Round 0: defenses and intel are ordered in PROCURE, and
// SURGE is gone (D2).

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import {
  LocalDailyLedger,
  LocalScoreSink,
  LocalStorageStore,
  SaveError,
  addRunTime,
  beginRun,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  dossier,
  recordMet,
  recordNamed,
  runKey,
  type DailyOp,
  type DailyStanding,
  type RestoredGame,
  type SavePhase,
} from '../persistence'
import { copyToClipboard } from './clipboard'
import { chooseDifficulty, deviceDifficulty, newOperation, randomSeed } from './session'
import { DECK_LINE } from './systemControls'
import { LearnMore } from './learnMore'
import { DC_BTN } from './buttons'
import { useMusicState, useSound, useSoundPrefs } from '../audio'
import { useBadgePhases } from './cues/ConditionBadge'
import { WIDE_QUERY, useCueClass, useMediaQuery, usePageVisible, useReducedMotion } from './cues/motion'
import BoardHud from './board/BoardHud'
import AssetStrip, { type ChipModel } from './board/AssetStrip'
import Tonight from './board/Tonight'
import Orders, { type OrderId } from './board/Orders'
import Dock from './board/Dock'
import Procure from './board/Procure'
import type { SheetId } from './board/actions'
import { ACTIONS, fKeyOf, resolveLabel } from './board/actions'
import { callIndex, tonightSlots } from './board/boardModel'
import SystemSheet from './board/SystemSheet'
import { conditionsOn, tilesByLayer, turnBudget } from './board/board'
import { COUNT_SHARE, STRIKE_MS } from './board/strike'
import { DEFAULT_SCENARIO } from '../content'
import { briefActive, briefFree, orderCost, resolveTurn } from '../engine/reducer'
import { worstCase } from '../engine/worstCase'
import { defenseBonus } from '../engine/learning'
import { turnRng } from '../engine/rng'
import { assetPrice } from '../engine/scoring'
import { LAYERS, type AssetKind, type DebrisChoice, type Difficulty, type GameState, type ThreatEvent, type TurnActions } from '../engine/types'
import type { BoardView } from './night/Night'


// The GLOSSARY overlay's module, split out in the Round 1 fix batch. The
// overlay is an element of this component, so the split unmounts nothing:
// the campaign, the phase and the cart are exactly where they were while
// the chunk loads and after it closes. The dialog element itself is
// static and takes focus at once; only the entries arrive by chunk.
// A failed fetch of either overlay's chunk (the same stale index.html or
// flaky network as above) leaves the overlay with its own way out rather
// than rejecting the tree: the Glossary's and the Field Library's back
// button, the intel card's CLOSE.
type IntelCardProps = Parameters<(typeof import('./board/IntelCard'))['default']>[0]
const BackOnly = ({ backLabel, onBack }: { backLabel?: string; onBack?: () => void }) => (
  <button type="button" onClick={onBack} className="m-4 min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink">
    {backLabel?.toUpperCase()}
  </button>
)
const IntelUnavailable = ({ onClose }: IntelCardProps) => (
  <button type="button" onClick={onClose} className="m-4 min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink">
    CLOSE
  </button>
)
const Glossary = lazy(() => import('./Glossary').catch(() => ({ default: BackOnly })))
// The intel card (v1.2 R3, brief 4.8), for a tile or the threat banner,
// loaded on first open like the Glossary: it is an element of this
// component, so the split unmounts nothing.
const IntelCard = lazy(() => import('./board/IntelCard').catch(() => ({ default: IntelUnavailable })))
// The Field Library (v1.2 R5b, brief 7.3), filtered to one threat, opened
// from that threat's event card. The same module as the menu's FIELD
// LIBRARY screen, so one chunk.
const FieldLibrary = lazy(() => import('./FieldLibrary').catch(() => ({ default: BackOnly })))
// The wide board's columns (v1.2 R6, brief 4.6), fetched only on a screen
// 1024 wide and up. A failed fetch renders nothing and never reports
// ready, so the board keeps its phone layout and its tiles still open
// their intel cards.
const WideUnavailable = () => <></>
const WideBoard = lazy(() => import('./board/WideBoard').catch(() => ({ default: WideUnavailable })))
// THE NIGHT (v1.3 brief 5.5), in chunks of its own, all fetched as the
// board opens so EXECUTE never waits on them, and rendered from the loaded
// module rather than through React.lazy, whose first showing would hold
// the night back behind a Suspense reveal. A failed fetch leaves one
// button that ends the night, so a turn the engine resolved can always be
// left.
type NightModule = typeof import('./night/Night')
type NightProps = Parameters<NightModule['default']>[0]
let nightModule: NightModule | null = null
const loadNight = () => import('./night/Night').then((m) => (nightModule = m))
const NightUnavailable = ({ burn, choice, onCall, onDone }: NightProps) => (
  <button
    type="button"
    onClick={() => (burn && choice === null ? onCall('hold') : onDone())}
    className="mt-auto min-h-12 border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground"
  >
    CONTINUE
  </button>
)

// A dialog over the board (the intel card, the Glossary, the Field
// Library): focus goes in and comes back to what opened it, Escape closes
// it, and the game behind is inert. What opened it is what `opener` names,
// and only failing that whatever had focus: a tapped button is not focused
// on every browser (Safari leaves focus on the page), and focus at the
// moment a dialog opens can be anywhere another dialog left it. The Escape
// listener runs in the capture
// phase and stops there, so closing the dialog during playback does not
// also skip the playback. Once per opening: a re-render of the same
// dialog is not a new one. Returns where focus will go back to.
function useBoardDialog(open: boolean, ref: RefObject<HTMLDivElement | null>, opener: () => HTMLElement | null, close: () => void) {
  const back = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    const active = document.activeElement as HTMLElement | null
    back.current = opener() ?? (active && active !== document.body ? active : null)
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      back.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return back
}

// THE DEBRIEF (v1.3 brief 5.6, R4; the v1.2 score screen before it), in a
// chunk of its own. It holds everything the end of a run shows except the
// save code, which stays here, outside the chunk: a fetch that fails
// leaves a line saying so and the ways on, never a lost code (the Round
// 6d defect). The chunk is fetched as soon as a campaign ends, while its
// last turn plays back, so the debrief is usually there before it is
// asked for.
type DebriefProps = Parameters<(typeof import('./Debrief'))['default']>[0]
const DebriefUnavailable = ({ onPlayAgain, onTitle }: DebriefProps) => (
  <div className="flex flex-col gap-2">
    <p className="font-mono text-sm text-dc-warn">The debrief could not load. Your save code is below.</p>
    <button type="button" className={DC_BTN} onClick={onPlayAgain}>
      PLAY AGAIN
    </button>
    {onTitle && (
      <button type="button" className={DC_BTN} onClick={onTitle}>
        TITLE SCREEN
      </button>
    )}
  </div>
)
const Debrief = lazy(() => import('./Debrief').catch(() => ({ default: DebriefUnavailable })))

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


const EMPTY_ACTIONS: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  intelBrief: false,
}

// A stable empty list, so the badge hook's dependency does not change
// identity on every render of the start screen.
const EMPTY_CONDITIONS: GameState['conditions'] = []

// THE NIGHT is presentation only: it plays a turn the engine already
// resolved, and is never persisted as itself. A reload during it lands on
// END OF TURN (the save's 'aftermath'), which is what a night ends on;
// a reload before the debris call, when nothing is committed yet, lands
// back on the board deciding the same turn.
type Phase = SavePhase | 'night'

// The night EXECUTE opened: the state it resolved from, the engine's
// resolution with HOLD, and with BURN when tonight has a call to make.
interface NightSession {
  before: GameState
  hold: GameState
  burn: GameState | null
  choice: DebrisChoice | null
}

// The night saves as END OF TURN once the engine's turn is committed, and
// as the board it left while the debris call is still to make.
const persistPhase = (phase: Phase, state: GameState, night: NightSession | null): SavePhase =>
  phase === 'night' ? (night && state === night.before ? 'brief' : 'aftermath') : phase

// Which sheet is open. The sheet is presentation state, not a phase: the
// v1.1 phase 'procure' still arrives in a save, and it opens PROCURE on a
// board at 'brief'. ('harden', which opened HARDEN, left the save format
// with the sheet in v1.3 Round 0, when saves from before it stopped
// loading at all.)
type Sheet = SheetId
function arrive(phase: Phase | undefined): { phase: Phase; sheet: Sheet | null } {
  if (phase === 'procure') return { phase: 'brief', sheet: 'procure' }
  return { phase: phase ?? 'brief', sheet: null }
}

// Persistence singletons (R4). Local implementations behind the SaveStore
// and ScoreSink interfaces; the remote seam is v2 and not imported. The
// Daily Op's ledger of official results joined them in v1.2 R5.
const saveStore = new LocalStorageStore()
const scoreSink = new LocalScoreSink()
const dailyLedger = new LocalDailyLedger()

export default function Game({
  onExit,
  onScoreboard,
  onCredits,
  initial,
}: {
  onExit?: () => void
  onScoreboard?: () => void
  onCredits?: () => void
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
  // What PROCURE was opened from (v1.3 brief 5.4): a move, whose
  // defenses it highlights, or the drone FIRST ORDERS points at.
  const [focus, setFocus] = useState<{ move: ThreatEvent } | { kind: AssetKind } | null>(null)
  // The WORST CASE sum, shown on a tap (brief section 4 rule 5).
  const [showWorst, setShowWorst] = useState(false)
  // Nonces that pulse the dock's line, the intel row, and the move cards.
  const [pulseWorst, setPulseWorst] = useState(0)
  const [pulseIntel, setPulseIntel] = useState(0)
  const [pulseMoves, setPulseMoves] = useState(0)
  const executeRef = useRef<HTMLButtonElement | null>(null)
  const [actions, setActions] = useState<TurnActions>(EMPTY_ACTIONS)
  const [notice, setNotice] = useState('')
  // The GLOSSARY entry a technique tag opened, as an OVERLAY rather than a
  // route. Routing to the glossary screen would unmount Game, and the
  // autosave carries the turn and phase but not the procurement cart, so
  // reading one technique mid-buy would silently empty it. An overlay
  // keeps the player in the game in the literal sense as well as the
  // navigational one.
  const [glossaryFocus, setGlossaryFocus] = useState<string | null>(null)
  const glossaryRef = useRef<HTMLDivElement | null>(null)
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
  // THE NIGHT (v1.3 brief 5.5): the session EXECUTE opened, and what it
  // tells the board to show (the board between events, the strike, the
  // score's fall). `state` is always the engine's output.
  const [night, setNight] = useState<NightSession | null>(null)
  const [view, setView] = useState<BoardView | null>(null)
  // How much of the budget's change on screen is the player's own orders,
  // so the HUD does not read tonight's orders as damage. Declared for the
  // one change that lands them, as the night opens, and no longer: the
  // HUD reads that change in the same commit (a child's effect runs before
  // this one), and every later change in the night (a burn's fuel, an
  // opportunity, the close) is read as what it is.
  const [chosenSpend, setChosenSpend] = useState(0)
  useEffect(() => {
    if (phase === 'night' && view) setChosenSpend(0)
  }, [phase, view])
  // Cue state. These sit with the other top-level hooks because the start
  // screen returns early below, and hook order cannot depend on whether a
  // campaign is in progress.
  const reducedMotion = useReducedMotion()
  // The wide board (v1.2 R6): its columns load only while this holds, and
  // lay out once their module has mounted, which is also when its
  // stylesheet is in. Until then, and for good if the fetch fails, the
  // board is the phone board: tiles open their cards and the F keys stay
  // the browser's.
  const wide = useMediaQuery(WIDE_QUERY)
  const [wideReady, setWideReady] = useState(false)
  const laidOut = wide && wideReady
  // The tile the inspector shows. Not the intel card's state: selecting a
  // tile leaves the board live, the night running and the keys on.
  const [inspected, setInspected] = useState<string | null>(null)
  // The board's idle life, and every other animation on it, pauses while
  // the tab is hidden (v1.2 R2, brief 5.3): one class on the board root,
  // which src/index.css turns into a pause for everything under it.
  const pageVisible = usePageVisible()
  // The procurement phase's own sounds (brief section 6, rows "Buy fleet or
  // countermeasure" and "Cannot afford"). The night's sounds are the
  // night's own (./night); these tiles are the only cues the player
  // triggers while deciding, which is why they live with the controls.
  const play = useSound()
  // The two audio toggles ride the save row, which is the only chrome the
  // campaign screen carries in every phase.
  const [soundPrefs, setSoundPrefs] = useSoundPrefs()
  // The ORDERED tile an order just added, so it slides into the strip (brief
  // section 4: "item slides into the manifest"); cleared when it goes.
  const [arrived, setArrived] = useState<{ index: number; nonce: number } | null>(null)
  const manifestCue = useCueClass(arrived?.nonce ?? null, 'dc-manifest-in', reducedMotion, 320)
  // THE STRIKE (brief 5.5 item 1). Its length sets every duration on the
  // board (the CSS reads it as --dc-beat); the night times it.
  const beatMs = STRIKE_MS
  const strike = phase === 'night' ? (view?.strike ?? null) : null
  // The struck tile, brought into view in the scrolling column as the
  // reticle locks on (brief 5.5 item 1); not under reduced motion, where
  // there is no strike.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const strikeTile = strike && 'assetId' in strike ? strike.assetId : undefined
  useLayoutEffect(() => {
    if (!strikeTile || reducedMotion) return
    bodyRef.current?.querySelector(`[data-asset-id="${strikeTile}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [strikeTile, reducedMotion])
  // The intel card (v1.2 R3, brief 4.8): a tile's, or the threat banner's,
  // a board dialog (useBoardDialog).
  const [intel, setIntel] = useState<{ kind: 'tile'; assetId: string } | { kind: 'banner' } | null>(null)
  const intelRef = useRef<HTMLDivElement | null>(null)
  const intelOpen = intel !== null
  const intelOpener = useBoardDialog(
    intelOpen,
    intelRef,
    // On the wide board a tile's card opens from the inspector's INTEL
    // CARD, so focus goes back there rather than to the tile, where the
    // next Enter would let the selection go (v1.2 R6).
    () =>
      intel?.kind === 'tile'
        ? ((laidOut ? document.querySelector<HTMLElement>('[data-inspector-intel]') : null) ??
          document.querySelector<HTMLElement>(`button[data-asset-id="${intel.assetId}"]`))
        : document.querySelector<HTMLElement>('button[aria-label="Threat intel"]'),
    () => setIntel(null),
  )
  // The Field Library at one threat (v1.2 R5b), opened by a card's "learn
  // more", a board dialog too. Focus comes back to the link that opened it,
  // or, when that link was on the intel card, which closes as the library
  // opens, to what opened the card. Decided when the link is used, never by
  // looking the link up again: the same threat can have a second link on
  // the board, inside a closed ledger where nothing can take focus.
  const [library, setLibrary] = useState<string | null>(null)
  const libraryRef = useRef<HTMLDivElement | null>(null)
  const libraryReturn = useRef<HTMLElement | null>(null)
  useBoardDialog(library !== null, libraryRef, () => libraryReturn.current, () => setLibrary(null))
  const learnMore = (eventId: string, from: HTMLElement) => {
    libraryReturn.current = intel ? intelOpener.current : from
    setIntel(null)
    setLibrary(eventId)
  }
  // During the night the HUD and the strip follow the board the night
  // shows, so a hit lands on its tile and the score falls on the event
  // that did it, rather than jumping to the engine's end state. Computed
  // here because hooks run before the early return below.
  // Until the night says what to show (its chunk may still be arriving),
  // the board stays as EXECUTE left it, never the engine's end state.
  const shownOrNull = phase === 'night' ? (view?.shown ?? night?.before ?? state) : state
  // The music bed follows the same state the HUD does, for the same
  // reason: the threat layer rises on the event that arms the chain. Null
  // is the start screen, which gets the base layer only.
  useMusicState(shownOrNull)
  const { badges } = useBadgePhases(
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
      saveStore.autosave(state, persistPhase(phase, state, night), daily)
    } else if (!recordedRef.current) {
      recordedRef.current = true
      saveStore.clearAutosave()
      const last = state.history[state.history.length - 1]
      const recordedAt = new Date().toISOString()
      // The scoreboard's practice half (M38): a Daily Op's finish is the
      // ledger's, below, and is not posted here.
      if (!daily)
        scoreSink.record({
        outcome: state.status,
        lossReason: state.lossReason,
        mai: last?.maiScore ?? 0,
        seed: state.seed,
        turnsSurvived: state.history.length,
        totalTurns: scenario.totalTurns,
        scenarioId: scenario.id,
        difficulty: state.difficulty,
        bonus: defenseBonus(state.bestStreak, state.saved),
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
            bonus: defenseBonus(state.bestStreak, state.saved),
            turns: state.history.length,
            recordedAt,
          }),
        )
      }
    }
  }, [state, phase, scenario, daily, night])

  // Fetch the debrief's chunk the moment a campaign ends, while its last
  // turn is still playing back. The same import the lazy declaration
  // makes, so it is the same chunk, fetched once.
  const finished = !!state && state.status !== 'playing'
  useEffect(() => {
    if (finished) import('./Debrief').catch(() => undefined)
  }, [finished])

  // THE RUN'S OWN RECORD (src/persistence/runRecord.ts): the Dossier as it
  // stood at turn 1, for FILED THIS GAME, and the time on the clock,
  // counted while the board is on screen and the tab visible.
  const runGame = state ? runKey(state.seed, state.difficulty, daily?.dateKey) : null
  const runFresh = !!state && state.status === 'playing' && state.history.length === 0
  useEffect(() => {
    if (runGame && runFresh) beginRun(runGame, dossier())
  }, [runGame, runFresh])
  const runPlaying = state?.status === 'playing'
  useEffect(() => {
    if (!runGame || !runPlaying || !pageVisible) return
    const started = performance.now()
    return () => addRunTime(runGame, performance.now() - started)
  }, [runGame, runPlaying, pageVisible])
  // The night's chunk, fetched as the board opens, while the player is
  // still deciding, so EXECUTE never waits on it.
  const [nightReady, setNightReady] = useState<'loading' | 'ready' | 'failed'>(() => (nightModule ? 'ready' : 'loading'))
  useEffect(() => {
    if (nightModule) return
    loadNight().then(
      () => setNightReady('ready'),
      () => setNightReady('failed'),
    )
  }, [])

  const flash = (msg: string) => setNotice(msg)

  // Item 1: the job framing (three numbered lines and a line of context), shown on the start screen and again
  // in the turn 1 brief so a skimming player can state the objective.
  // Round 7b: the lines come from ui/brief.ts, which is the module the
  // reading-diet budgets read. They used to be spelled here as JSX, and
  // the brief screen rendered them INSIDE the same disclosure as the
  // posture panel where no budget could see them.
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
  // nothing implements. Focus goes in, comes back out to the tag that
  // opened it, and the game behind is marked inert while it is open. Since
  // v1.2 R5b it is a board dialog like the intel card's (useBoardDialog):
  // playback holds while it is open, and its Escape stops in the capture
  // phase, so closing it never skips the turn it paused.
  useBoardDialog(
    glossaryFocus !== null,
    glossaryRef,
    () => document.querySelector<HTMLElement>(`[data-technique-tag="${glossaryFocus}"]`),
    () => setGlossaryFocus(null),
  )

  // Opening a sheet clears what PROCURE was last opened from; the same
  // button again closes it. PROCURE and SYSTEM are exclusive.
  const openSheet = (next: Sheet | null, from: typeof focus = null) => {
    setSheet(next)
    setFocus(next === 'procure' ? from : null)
  }
  const toggleSheet = (next: Sheet) => openSheet(sheet === next ? null : next)
  // A sheet opened from the wide board's inspector (v1.2 R6) covers the
  // inspector, so focus moves into the sheet, and back to the inspector's
  // button once the sheet closes and nothing else has taken it. A sheet
  // opened from the action bar leaves focus on the bar, which stays live.
  const sheetFrom = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const from = sheetFrom.current
    if (!from) return
    if (sheet) {
      bodyRef.current?.querySelector<HTMLElement>('[data-sheet] button')?.focus()
      return
    }
    sheetFrom.current = null
    const active = document.activeElement
    if (from.isConnected && (!active || active === document.body)) from.focus()
  }, [sheet])

  // The board's keys, on the one window listener the play screen has for
  // them, and not while the glossary is open: its own listener answers
  // then. Escape closes the sheet. The digits are the action bar's
  // hotkeys (R1b), resolved through the one action array: a step's digit
  // opens or closes its sheet, and EXECUTE's moves focus to the control
  // rather than committing, because a turn should not end on a stray
  // digit. On the wide board (v1.2 R6) the F keys do the same through the
  // same array, except with Shift, so a browser's Shift+F key still does
  // what it did, and they are taken from a checkbox a sheet left focused,
  // since they type nothing. Not on the debrief, which is not the
  // board.
  const decidingNow = state?.status === 'playing' && phase !== 'night' && phase !== 'aftermath'
  useEffect(() => {
    if (!state || glossaryFocus || intel || library) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!sheet) return
        e.preventDefault()
        openSheet(null)
        return
      }
      if (!decidingNow || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLInputElement | null
      const byF = laidOut && !e.shiftKey ? ACTIONS.find((a) => fKeyOf(a) === e.key) : undefined
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !(byF && /^(checkbox|radio)$/.test(target.type))) return
      // A held key acts once. A bound F key's repeats are still taken, so
      // a key held down never falls through to whatever the browser binds
      // it to, which for an F key can be a reload that takes the cart.
      if (e.repeat) {
        if (byF) e.preventDefault()
        return
      }
      const action = byF ?? ACTIONS.find((a) => a.hotkey === e.key)
      if (!action) return
      e.preventDefault()
      if (action.sheet) toggleSheet(action.sheet)
      else executeRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const beginGame = (next: GameState, nextPhase: Phase, nextDaily?: DailyOp) => {
    // A loaded code that is already over was not played here, so it neither
    // posts a score nor clears the autosave of the campaign it interrupts.
    recordedRef.current = next.status !== 'playing'
    const arrival = arrive(nextPhase)
    setState(next)
    setDaily(nextDaily)
    setStanding(null)
    setActions(EMPTY_ACTIONS)
    setNight(null)
    setView(null)
    setChosenSpend(0)
    setPhase(arrival.phase)
    openSheet(arrival.sheet)
    setShowWorst(false)
    setIntel(null)
    setInspected(null)
    setLibrary(null)
    setNotice('')
  }

  // NEW CAMPAIGN, and every restart SYSTEM offers (v1.3 R1): straight to
  // turn 1 of a new operation, on a fresh random seed unless one is given,
  // at the difficulty the player is on.
  const newCampaign = (difficulty: Difficulty = state?.difficulty ?? deviceDifficulty(), seed: number = randomSeed()) => {
    beginGame(newOperation(difficulty, seed).state, 'brief')
  }

  // Load from a pasted save code (R4 item 2), with graceful failure. From
  // SYSTEM since v1.3 R1.
  const loadCode = (code: string) => {
    try {
      const restored = decodeSaveCode(code)
      beginGame(restored.state, restored.phase as Phase, restored.daily)
    } catch (e) {
      flash(e instanceof SaveError ? e.message : 'That save code could not be read.')
    }
  }

  const exportCode = async () => {
    if (!state) return
    const code = encodeSaveCode(captureGame(state, persistPhase(phase, state, night), new Date().toISOString(), daily))
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

  // There is no start screen since v1.3 R1 (brief 5.1, M30): the title
  // starts every operation, PLAY on a fresh random seed and SYSTEM's Replay
  // a seed on a typed one, so Game always arrives with one.
  if (!state) return null

  // Funding and the coverage bonus arrive at the turn close since v1.3
  // Round 0 (brief 6.1), so this turn's spendable total is the balance,
  // and the orders are priced by the engine's own rule.
  const available = turnBudget(state)
  const cost = orderCost(state, actions)
  const lastRecord = state.history[state.history.length - 1]
  const displayTurn =
    phase === 'night' && night ? night.before.turn : phase === 'aftermath' && lastRecord ? lastRecord.turn : Math.min(state.turn, scenario.totalTurns)
  // Narrowed from the nullable value computed with the hooks above.
  const shown = shownOrNull ?? state

  // The engine's turn, committed: every event the turn drew, landed or
  // held, is met on this device (v1.2 R5b), and the threats the intel
  // brief named are met too (brief 6.9), in a key of their own so FILED
  // keeps meaning faced; the answer key reads both.
  const commit = (next: GameState) => {
    const record = next.history[next.history.length - 1]
    recordMet(record.events.map((e) => e.eventId))
    recordNamed(record.named)
    setState(next)
  }

  // EXECUTE (brief 5.5). The engine resolves the night at once. On a night
  // with the debris call it resolves both ways, since the engine takes the
  // call with the orders: the night plays the events up to the call from
  // either (they are the same), the player calls it, and only then is the
  // turn committed. Every other night is committed here.
  const execute = () => {
    // The engine is the authority on affordability. If the UI gate and the
    // engine ever disagree, surface the reason instead of dying silently:
    // a throw inside an event handler never reaches an error boundary.
    try {
      const hold = resolveTurn(state, { ...actions, debris: 'hold' }, turnRng(state.seed, state.turn))
      const burn = callIndex(hold) >= 0 ? resolveTurn(state, { ...actions, debris: 'burn' }, turnRng(state.seed, state.turn)) : null
      setNight({ before: state, hold, burn, choice: null })
      setView(null)
      setChosenSpend(hold.history[hold.history.length - 1].ledger.ordered)
      setActions(EMPTY_ACTIONS)
      openSheet(null)
      setIntel(null)
      // The orders are gone, so the entry the cue pointed at is too.
      setArrived(null)
      setPhase('night')
      if (!burn) commit(hold)
    } catch (e) {
      flash(e instanceof Error ? `Turn could not resolve: ${e.message}` : 'Turn could not resolve.')
    }
  }

  // BURN or HOLD: the night goes on with the resolution the call chose.
  const onCall = (choice: DebrisChoice) => {
    if (!night || night.choice !== null) return
    setNight({ ...night, choice })
    commit(choice === 'burn' && night.burn ? night.burn : night.hold)
  }

  // BEGIN TURN n+1, or DEBRIEF: off the night and onto the next board, or
  // the debrief once the operation is over.
  const nextTurn = () => {
    setNight(null)
    setView(null)
    setChosenSpend(0)
    setShowWorst(false)
    setPhase('brief')
  }

  // The engine is the authority on affordability; this keeps the orders
  // inside the same budget so the gate never has to refuse at EXECUTE.
  // PROCURE turns an order it cannot afford off; the buzz is for a call
  // that gets here anyway.
  const afford = (price: number): boolean => {
    if (cost + price <= available) return true
    play('denied-buzz')
    return false
  }

  // PROCURE orders one of each asset tonight: a tap adds it, a second tap
  // cancels it (brief 5.4).
  const toggleAsset = (kind: AssetKind) => {
    const at = actions.buyAssets.findIndex((b) => b.kind === kind)
    if (at >= 0) return removeAsset(at)
    if (!afford(assetPrice(scenario, kind))) return
    play('buy-click')
    setArrived({ index: actions.buyAssets.length, nonce: (arrived?.nonce ?? 0) + 1 })
    setActions({ ...actions, buyAssets: [...actions.buyAssets, { kind }] })
  }
  const removeAsset = (index: number) => {
    play('buy-click')
    // The cue points at an entry by index, so a removal invalidates it.
    setArrived(null)
    setActions({ ...actions, buyAssets: actions.buyAssets.filter((_, i) => i !== index) })
  }
  // The intel brief, from the TONIGHT card's row or from PROCURE. The row
  // does not refuse: an order there that leaves REMAINING below zero is
  // what turns EXECUTE off (brief 5.3 item 5).
  const toggleBrief = () => {
    play('buy-click')
    setActions({ ...actions, intelBrief: !actions.intelBrief })
  }
  // The IR retainer sits in PROCURE with the defenses (critique row M8),
  // and since v1.3 Round 0 it is ordered like one.
  const toggleCounter = (id: (typeof scenario.countermeasures)[number]['id']) => {
    const already = actions.buyCounters.includes(id)
    if (!already) {
      const price = scenario.countermeasures.find((c) => c.id === id)?.cost ?? 0
      if (!afford(price)) return
    }
    play('buy-click')
    setActions({ ...actions, buyCounters: already ? actions.buyCounters.filter((c) => c !== id) : [...actions.buyCounters, id] })
  }

  // THE BOARD'S STATE, derived. During the night the strip follows the
  // board the night shows, like the HUD, so a hit lands on the event that
  // did it rather than at the engine's end state.
  const deciding = phase !== 'night' && phase !== 'aftermath'
  // Whether tonight's moves are named: the cart while deciding (a brief
  // ordered there names them before EXECUTE), and the record of the night
  // being played after it.
  const briefedTonight = deciding
    ? briefActive(state, actions)
    : (state.history.find((h) => h.turn === shown.turn)?.briefed ?? briefFree(shown))
  const tiles = tilesByLayer(shown, actions.buyAssets)
  for (const layer of LAYERS) {
    for (const tile of tiles[layer]) {
      if (tile.kind === 'queued') {
        const i = tile.index
        tile.cue = arrived?.index === i ? manifestCue : undefined
      }
    }
  }
  // Condition chips per layer (brief 5.3 item 2), with the turns left
  // (brief 6.5: the player plans around the clock).
  const chipsOn = (layer: (typeof LAYERS)[number]): ChipModel[] =>
    conditionsOn(layer, badges, scenario).map((c) => ({ condition: c, remaining: c.remainingTurns }))

  // The last turn's night and its END OF TURN still render before the
  // debrief: DEBRIEF is the way there.
  if (state.status !== 'playing' && phase !== 'aftermath' && phase !== 'night') {
    return (
      <main data-debrief-screen className="mx-auto w-full max-w-[520px] px-4 pb-10 pt-safe">
        <div className="pt-4">
          {/* The debrief's own boundary: Game never suspends, so App's
              boundary never swaps the whole screen for a loading line, and
              the save code below renders whatever the chunk is doing. */}
          <Suspense fallback={<p className="font-mono text-[12px] text-dc-muted">Opening the debrief.</p>}>
            <Debrief state={state} daily={daily} standing={standing} onPlayAgain={() => newCampaign()} onTitle={onExit} />
          </Suspense>
        </div>
        {/* THE SAVE CODE REVEAL (Round 6e), at the foot of the debrief and
            folded (v1.3 R4: SYSTEM holds the save code in play, and the
            debrief's own ways on come first). Rendered, not merely
            copyable: a readonly textarea, the one element a phone will
            reliably let a player select and copy from, for the player
            whose clipboard API is gated. The copy button sends this
            string, not a freshly stamped one. Kept here rather than in
            the debrief's chunk, so it never waits on a fetch. */}
        <details data-save-code className="mt-4 bg-dc-panel">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 font-mono text-[11px] tracking-widest text-dc-muted [&::-webkit-details-marker]:hidden">
            <span>SAVE CODE</span>
            <span>details ›</span>
          </summary>
          <div className="px-3 pb-3">
            <p className="text-[13px] text-dc-muted">Paste it into SYSTEM on any device to read this debrief again.</p>
            <textarea
              id="outcome-save-code"
              data-outcome-save-code
              readOnly
              value={outcomeCode}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 h-20 w-full break-all border-2 border-dc-line bg-dc-ground px-2 py-1 font-mono text-[16px] text-dc-ink"
              aria-label="save code for this campaign"
            />
            <button type="button" className={`${DC_BTN} mt-2`} onClick={copyOutcomeCode}>
              COPY SAVE CODE
            </button>
          </div>
        </details>
        {notice && <p className="mt-2 font-mono text-sm text-dc-warn">{notice}</p>}
      </main>
    )
  }

  // What PROCURE's badge counts: each order queued tonight (QC G-025). The
  // brief is an order only on a night it is not free.
  const free = briefFree(state)
  const orders = actions.buyAssets.length + actions.buyCounters.length + (actions.intelBrief && !free ? 1 : 0)
  const sheetOpen = sheet !== null
  // How far the score fell on the move that just landed, floated off it.
  const maiDrop = phase === 'night' ? (view?.drop ?? null) : null
  // The night on screen: the one EXECUTE opened, or, after a reload,
  // END OF TURN alone for the turn the save closed on (QC G-067: nothing
  // of the next night shows until BEGIN TURN).
  const nightProps =
    phase === 'night' && night
      ? { before: night.before, hold: night.hold, burn: night.burn, choice: night.choice }
      : phase === 'aftermath' && lastRecord
        ? { before: null, hold: state, burn: null, choice: null }
        : null
  const worst = worstCase(state, actions)
  const slots = deciding ? tonightSlots(state, actions) : []
  const onOrder = (id: OrderId) => {
    if (id === 'drone') return openSheet('procure', { kind: 'drone' })
    if (id === 'worst') {
      setShowWorst(true)
      return setPulseWorst((n) => n + 1)
    }
    setPulseMoves((n) => n + 1)
  }

  return (
    <LearnMore.Provider value={learnMore}>
      {/* The game, marked inert while the overlay is open. aria-modal is a
          promise to a screen reader that nothing behind the dialog is
          reachable; inert is what keeps it. The pinned chrome and the
          sheets all sit inside this landmark for the same reason. */}
      <main
        data-board
        className={`relative flex flex-1 min-h-0 w-full max-w-[560px] mx-auto flex-col overflow-hidden bg-dc-ground text-dc-ink ${
          pageVisible ? '' : 'dc-board-hidden'
        }`}
        style={{ '--dc-beat': `${beatMs}ms` } as CSSProperties}
        data-wide={laidOut || undefined}
        {...(glossaryFocus || intelOpen || library ? { inert: true, 'aria-hidden': true } : {})}
      >
      <BoardHud
        shown={shown}
        displayTurn={displayTurn}
        drop={maiDrop}
        countMs={beatMs ? beatMs * COUNT_SHARE : undefined}
        dailyNumber={daily?.n}
        onSystem={() => toggleSheet('system')}
        systemOpen={sheet === 'system'}
        budget={{
          // The engine's balance. A buy is a decision, not damage, so the
          // tone is dropped while the player is choosing; REMAINING on the
          // dock is what the orders leave (QC G-102).
          value: shown.credits,
          basis: 'balance',
          chosen: deciding,
          chosenDelta: chosenSpend,
        }}
      />
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col">
        {/* THE WIDE BOARD'S LOG (v1.2 R6, brief 4.6), on a screen 1024
            wide and up: a direct child of the body, which wide.css makes
            the grid, so it takes the left column. */}
        {wide && (
          <Suspense fallback={null}>
            <WideBoard part="log" shown={shown} />
          </Suspense>
        )}
        <div data-board-body className="min-h-0 flex-1 overflow-y-auto px-3 py-1 flex flex-col gap-1.5">
          <AssetStrip
            tiles={tiles}
            chips={chipsOn}
            selectedKey={laidOut ? inspected : intel?.kind === 'tile' ? intel.assetId : null}
            onSelect={(key) => (laidOut ? setInspected(key) : setIntel(key ? { kind: 'tile', assetId: key } : null))}
            onCancelQueued={removeAsset}
            inspect={laidOut}
            hit={strike?.kind === 'hit' ? strike : null}
            held={strike?.kind === 'held' ? strike : null}
            // After turn 6, once END OF TURN shows the close (QC G-067),
            // not while the last night still plays.
            over={!deciding && state.status !== 'playing' && shown === state}
          />
          {/* THE NIGHT (brief 5.5), in the board's flow under the strip: its
              card fills the screen from there to the foot. */}
          {nightProps &&
            (nightModule ? (
              <nightModule.default key={`night-${displayTurn}`} {...nightProps} onCall={onCall} onBoard={setView} onDone={nextTurn} />
            ) : (
              nightReady === 'failed' && <NightUnavailable {...nightProps} onCall={onCall} onBoard={setView} onDone={nextTurn} />
            ))}
          {deciding && (
              <>
                <Tonight
                  state={state}
                  slots={slots}
                  brief={free ? 'free' : actions.intelBrief ? 'ordered' : 'none'}
                  briefPrice={scenario.prices.intelBrief}
                  onMove={(ev) => openSheet('procure', { move: ev })}
                  onToggleBrief={toggleBrief}
                  onIntel={() => setIntel({ kind: 'banner' })}
                  onTag={(tag) => setGlossaryFocus(tag)}
                  pulseIntel={pulseIntel}
                  pulseMoves={pulseMoves}
                  onReveal={() => setPulseIntel((n) => n + 1)}
                />
                <Orders state={state} actions={actions} onOrder={onOrder} />
              </>
          )}
          {/* The flash notice, when the SYSTEM sheet that carries it is not
              open. */}
          {notice && sheet !== 'system' && <p className="font-mono text-xs text-dc-warn">{notice}</p>}
        </div>
        {wide && (
          <Suspense fallback={null}>
            <WideBoard
              part="inspector"
              shown={shown}
              turn={state.turn}
              assetId={inspected}
              live={deciding}
              onProcure={(kind) => {
                sheetFrom.current = document.activeElement as HTMLElement | null
                openSheet('procure', { kind })
              }}
              onIntel={(assetId) => setIntel({ kind: 'tile', assetId })}
              onReady={setWideReady}
            />
          </Suspense>
        )}
        {/* THE SHEETS, over the dimmed board and under the dock, which
            stays live so EXECUTE is one tap away from inside PROCURE. The
            backdrop closes the sheet. */}
        {sheetOpen && <button type="button" aria-label="Close sheet" className="absolute inset-0 z-20 bg-dc-ground/80" onClick={() => openSheet(null)} />}
        {sheet === 'procure' && (
          <Procure
            state={state}
            actions={actions}
            focus={focus}
            onToggleAsset={toggleAsset}
            onToggleCounter={toggleCounter}
            onToggleBrief={toggleBrief}
            onClose={() => openSheet(null)}
            remaining={worst.remaining}
            cost={cost}
            orders={orders}
          />
        )}
        {sheet === 'system' && (
          <SystemSheet
            playing={state.status === 'playing'}
            difficulty={state.difficulty}
            restartsOperation
            onDifficulty={(d) => {
              chooseDifficulty(d)
              newCampaign(d)
            }}
            soundPrefs={soundPrefs}
            onSoundPrefs={setSoundPrefs}
            onExport={exportCode}
            onImport={loadCode}
            onReplaySeed={(seed) => newCampaign(state.difficulty, seed)}
            onScoreboard={() => onScoreboard?.()}
            onCredits={() => onCredits?.()}
            onTitle={onExit}
            deckLine={DECK_LINE}
            notice={notice}
            onClose={() => openSheet(null)}
          />
        )}
      </div>
      {/* The dock while deciding (brief 5.3 item 5). The night's cards carry
          their own way on, under the thumb. */}
      {deciding && (
      <Dock
        worst={worst}
        orders={orders}
        procureOpen={sheet === 'procure'}
        onProcure={() => toggleSheet('procure')}
        executeName={resolveLabel(state.turn)}
        executeRef={executeRef}
        onExecute={() => {
          play('execute-sweep')
          execute()
        }}
        showWorst={showWorst}
        onWorst={() => setShowWorst((v) => !v)}
        pulseWorst={pulseWorst}
      />
      )}
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
          className="fixed inset-0 z-50 overflow-y-auto bg-dc-ground outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Intel"
          data-intel-overlay
        >
          <Suspense fallback={<OverlayLoading />}>
            <IntelCard subject={intel} state={shown} turn={state.turn} briefed={briefedTonight} onClose={() => setIntel(null)} />
          </Suspense>
        </div>
      )}
      {glossaryFocus && (
        <div
          ref={glossaryRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-dc-ground outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Glossary"
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
      {library && (
        <div
          ref={libraryRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 overflow-y-auto bg-dc-ground outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Field Library"
          data-library-overlay
        >
          <Suspense fallback={<OverlayLoading />}>
            <FieldLibrary embedded focus={library} backLabel="Back to the game" onBack={() => setLibrary(null)} />
          </Suspense>
        </div>
      )}
    </LearnMore.Provider>
  )
}
