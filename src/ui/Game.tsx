// Text-first game shell, restyled in R2 per design brief v0.2: phosphor
// terminal chrome, hero-derived state accents (blue = friendly/defense,
// magenta = hostile/threat, amber = alerts), monospace HUD over sans body.
// All game logic is unchanged from R1.5.

import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ADVERSARY, SQUADRON } from '../config'
import {
  LocalScoreSink,
  LocalStorageStore,
  SaveError,
  captureGame,
  decodeSaveCode,
  encodeSaveCode,
  type RestoredGame,
  type SaveMeta,
} from '../persistence'
import { reportData, shareText } from './reportCard'
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
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT, assetPrice, coverage, maiScore } from '../engine/scoring'
import type {
  AssetBuy,
  AssetKind,
  CountermeasureId,
  Difficulty,
  GameState,
  Layer,
  ResolvedEvent,
  TrustTier,
  TurnActions,
  Vector,
} from '../engine/types'

import Wordmark from './Wordmark'
import defeatSphereUrl from './assets/defeat-sphere.webp'
import winSphereUrl from './assets/win-sphere.webp'
import heroUrl from './assets/hero.webp'
import heroPlaceholderUrl from './assets/hero-placeholder.webp'
import frameUrl from './assets/constellation-frame.svg'
import iconRf from './assets/icon-rf.svg'
import iconLidar from './assets/icon-lidar.svg'
import iconSupplyChain from './assets/icon-supply-chain.svg'
import iconInsider from './assets/icon-insider.svg'
import iconCyber from './assets/icon-cyber.svg'
import iconDebris from './assets/icon-debris.svg'
import badgeOrbit from './assets/badge-orbit.svg'
import badgeAir from './assets/badge-air.svg'
import badgeGround from './assets/badge-ground.svg'

// The animation is decoration; nothing about it may take the game down.
// A failed chunk fetch (stale index.html after a redeploy, flaky network)
// falls back to the still reference frame instead of rejecting the tree.
const FrameStill = () => <img src={frameUrl} alt="" aria-hidden="true" className="w-64 h-64 opacity-90" />
const Constellation = lazy(() =>
  import('./Constellation').catch(() => ({ default: FrameStill as unknown as (typeof import('./Constellation'))['default'] })),
)

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const DEFAULT_SEED = 20260711

const EMPTY_ACTIONS: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  buyIntelLevel: false,
  buyIrRetainer: false,
}

type Phase = 'brief' | 'procure' | 'harden' | 'aftermath'

const kindLabels: Record<AssetKind, string> = {
  sat: 'Imaging sat',
  rpoSat: 'RPO servicing sat',
  drone: 'Drone',
  groundStation: 'Ground station',
}

// Plain-language effect of buying each asset kind, shown at the point of
// purchase so the reason for every buy is legible.
const assetEffects: Record<AssetKind, string> = {
  sat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.sat.min} to ${DEPLOY_ETA.sat.max} turns to orbit`,
  rpoSat: `+${COVERAGE_PER_SAT} coverage, ${DEPLOY_ETA.rpoSat.min} to ${DEPLOY_ETA.rpoSat.max} turns to orbit; hosts the docking LiDAR (no extra effect in this build)`,
  drone: `+${COVERAGE_PER_DRONE} coverage, deploys next turn; flies the LiDAR mapping sorties`,
  groundStation: `no coverage, ${DEPLOY_ETA.groundStation.min} to ${DEPLOY_ETA.groundStation.max} turns to stand up; ground ops capacity with no game effect in this build`,
}

const vectorIcons: Record<Vector, string> = {
  rf: iconRf,
  optical: iconLidar,
  supplyChain: iconSupplyChain,
  human: iconInsider,
  cyber: iconCyber,
  environmental: iconDebris,
}

const layerBadges: Record<Layer, string> = {
  ORBIT: badgeOrbit,
  AIR: badgeAir,
  GROUND: badgeGround,
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 hover:bg-phosphor/10 disabled:opacity-40 disabled:cursor-not-allowed'
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
  const [slots, setSlots] = useState<SaveMeta[]>(() => saveStore.list())
  const recordedRef = useRef(false)

  const scenario = DEFAULT_SCENARIO

  // Autosave every turn/phase change while playing, for refresh-safe
  // resume. On game over, record the score once and clear the autosave so
  // a finished run is not offered for resume.
  useEffect(() => {
    if (!state) return
    if (state.status === 'playing') {
      saveStore.autosave(state, phase)
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
  const jobFraming = (
    <div className={`${panel} mt-4`}>
      <p className={h2cls}>Your job</p>
      <p className="mt-1">
        1. Finish turn {scenario.totalTurns} with the Mission Assurance Index (MAI) at {scenario.winThreshold} or
        higher.
      </p>
      <p className="mt-1">
        2. You start above the win line. {ADVERSARY} spends {scenario.totalTurns} turns eroding it.
      </p>
      <p className="mt-1">
        3. Spend credits each turn on fleet and defenses to slow the erosion. MAI below {scenario.collapseThreshold}{' '}
        or a budget forced below zero ends the campaign early.
      </p>
      <p className="mt-1 text-ink-dim">
        Some attacks become active conditions that press every turn until they lift. Deployments take turns to
        arrive. Spend surge authority to clear a condition, and hold the win line under pressure for commendations.
      </p>
    </div>
  )

  const constellationVisual = prefersReducedMotion ? (
    <FrameStill />
  ) : (
    <Suspense fallback={<FrameStill />}>
      <Constellation size={256} />
    </Suspense>
  )

  const beginGame = (next: GameState, nextPhase: Phase) => {
    recordedRef.current = false
    setState(next)
    setActions(EMPTY_ACTIONS)
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
    saveStore.save(state, phase, name)
    setSlots(saveStore.list())
    flash('Saved to a slot.')
  }

  const exportCode = async () => {
    if (!state) return
    const code = encodeSaveCode(captureGame(state, phase, new Date().toISOString()))
    flash((await copyToClipboard(code)) ? 'Save code copied to clipboard.' : 'Copy failed; select and copy manually.')
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
  const displayTurn = phase === 'aftermath' && lastRecord ? lastRecord.turn : Math.min(state.turn, scenario.totalTurns)

  const resolve = () => {
    // The engine is the authority on affordability. If the UI gate and the
    // engine ever disagree, surface the reason instead of dying silently:
    // a throw inside an event handler never reaches an error boundary.
    try {
      const next = resolveTurn(state, actions, turnRng(state.seed, state.turn))
      setState(next)
      setActions(EMPTY_ACTIONS)
      setPhase('aftermath')
    } catch (e) {
      flash(e instanceof Error ? `Turn could not resolve: ${e.message}` : 'Turn could not resolve.')
    }
  }

  const nextTurn = () => setPhase('brief')

  const addAsset = (kind: AssetKind, tier: TrustTier) =>
    setActions({ ...actions, buyAssets: [...actions.buyAssets, { kind, tier }] })
  const removeAsset = (index: number) =>
    setActions({ ...actions, buyAssets: actions.buyAssets.filter((_, i) => i !== index) })
  const toggleCounter = (id: (typeof scenario.countermeasures)[number]['id']) =>
    setActions({
      ...actions,
      buyCounters: actions.buyCounters.includes(id)
        ? actions.buyCounters.filter((c) => c !== id)
        : [...actions.buyCounters, id],
    })

  const shortEventName = (id: string) => scenario.events.find((e) => e.id === id)?.name.split(' (')[0] ?? id

  // Surge authority (item 4): queue one live condition to be cleared when
  // the turn resolves. The reducer applies it before condition pressure, so
  // a queued condition never presses again. Toggle to change the mind.
  const toggleSurge = (instanceId: string) =>
    setActions({ ...actions, spendSurgeOn: actions.spendSurgeOn === instanceId ? undefined : instanceId })

  // Item 1 UI: active-conditions panel with per-condition elapsed counters.
  // Only high intel estimates how many turns a condition has left; otherwise
  // the remaining span stays hidden, as the mechanic intends.
  const showsDurationEstimate = effectiveIntel(state) >= 3
  const canSurge = state.surgeTokens > 0 && phase !== 'aftermath'
  const activeConditions =
    state.conditions.length > 0 ? (
      <div className="mt-2 border border-hero-magenta/40 bg-hero-magenta/5 p-2">
        <p className="text-xs font-bold text-hero-magenta uppercase tracking-widest">
          Active conditions ({state.conditions.length}), sustained pressure each turn
        </p>
        <ul className="mt-1">
          {state.conditions.map((c) => {
            const queued = actions.spendSurgeOn === c.instanceId
            const elapsed = state.turn - c.startedTurn
            return (
              <li key={c.instanceId} className="text-xs mt-1 flex flex-wrap items-center gap-2">
                <span className={queued ? 'text-ink-dim line-through' : 'text-hero-magenta'}>{c.name}</span>
                <span className="text-ink-dim">
                  live since turn {c.startedTurn} ({elapsed} turn{elapsed === 1 ? '' : 's'})
                  {showsDurationEstimate ? `, intel estimates ~${c.remainingTurns} left` : ', duration unknown'}
                </span>
                {queued ? (
                  <button className={`${btn} px-1 py-0 text-xs`} onClick={() => toggleSurge(c.instanceId)}>
                    surge queued, undo
                  </button>
                ) : (
                  canSurge &&
                  !actions.spendSurgeOn && (
                    <button className={`${btn} px-1 py-0 text-xs`} onClick={() => toggleSurge(c.instanceId)}>
                      surge clear
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
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
      <p className="font-bold text-phosphor">
        MAI {maiScore(state)} (win line {scenario.winThreshold}, collapse below {scenario.collapseThreshold})
      </p>
      <p className="mt-1 text-sm">
        Turn {displayTurn} of {scenario.totalTurns} | Credits {state.credits} | Coverage {coverage(state.assets)} |
        Link {state.meters.linkAvailability} | Data {state.meters.dataIntegrity} | Sensor{' '}
        {state.meters.sensorIntegrity} | Intel level {state.intelLevel} | {DIFFICULTIES[state.difficulty].label}
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
            Credits: the budget. Income +{incomeFor(state.difficulty, scenario.incomePerTurn)} a turn plus any SLA bonus. Repairs come out of it,
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
      {state.flags.lidarFallback && (
        <p className="font-bold mt-2 border border-hero-magenta/60 bg-hero-magenta/10 text-hero-magenta p-2">
          BLACKOUT CHAIN ARMED: GNSS is jammed and {SQUADRON} is navigating on LiDAR alone. The next LiDAR attack
          lands harder (+{CHAIN_BONUS} severity) unless sensor fusion cross-checks are in place or every drone flies
          Tier A sensors.
        </p>
      )}
      <p className="mt-2 text-xs text-ink-dim">
        Fleet: {state.assets.filter((a) => a.integrity > 0).length} operational assets (
        {state.assets
          .filter((a) => a.integrity > 0)
          .map((a) => `${kindLabels[a.kind]} ${a.tier}`)
          .join(', ') || 'none'}
        )
      </p>
      <p className="mt-1 text-xs text-hero-blue">
        Countermeasures: {state.counters.length > 0
          ? state.counters
              .map((id) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id)
              .join('; ')
          : 'none'}
      </p>
      {(state.pipeline.length > 0 || state.pendingCounters.length > 0) && (
        <p className="mt-1 text-xs text-ink-dim">
          In transit:{' '}
          {[
            ...state.pipeline.map(
              (p) => `${kindLabels[p.kind]} ${p.tier} (ETA ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'})`,
            ),
            ...state.pendingCounters.map(
              (p) =>
                `${scenario.countermeasures.find((c) => c.id === p.id)?.name ?? p.id} retrofit (ETA ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'})`,
            ),
          ].join('; ')}
        </p>
      )}
      <p className="mt-2 text-xs font-mono">
        <span className="text-alert-amber">
          Surge authority: {state.surgeTokens} of {SURGE_TOKEN_CAP}
        </span>
        <span className="text-ink-dim"> (spend one in any phase to clear an active condition)</span>
        {state.intelBoostTurns > 0 && (
          <span className="text-hero-blue"> | allied intel boost active ({state.intelBoostTurns} more turn{state.intelBoostTurns === 1 ? '' : 's'})</span>
        )}
      </p>
      {activeConditions}
      {state.status === 'playing' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-phosphor/15">
          <button className={`${btn} text-xs py-0.5`} onClick={saveSlot}>
            Save
          </button>
          <button className={`${btn} text-xs py-0.5`} onClick={exportCode}>
            Export code
          </button>
          <span className="text-xs text-ink-dim">Autosaved each turn. Reload resumes here.</span>
        </div>
      )}
      {notice && <p className="mt-1 font-mono text-xs text-alert-amber">{notice}</p>}
    </section>
  )

  // The deciding turn's aftermath still renders before the report card.
  if (state.status !== 'playing' && phase !== 'aftermath') {
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
        <div className="relative z-10 mt-6 flex flex-wrap gap-2">
          <button className={btn} onClick={copyResult}>
            Copy result
          </button>
          <button className={btn} onClick={exportCode}>
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
      {statusPanel}

      {phase === 'brief' && (
        <section className="mt-4">
          <h2 className={h2cls}>1. Intel brief, turn {state.turn}</h2>
          {state.turn === 1 && state.history.length === 0 && jobFraming}
          <ul className="list-disc ml-6 mt-2 font-mono text-sm">
            {state.forecast.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button className={`${btn} mt-4`} onClick={() => setPhase('procure')}>
            To procurement
          </button>
        </section>
      )}

      {phase === 'procure' && (
        <section className="mt-4">
          <h2 className={h2cls}>2. Procure and deploy</h2>
          <p className="mt-2 text-sm font-mono">
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {(['sat', 'rpoSat', 'drone', 'groundStation'] as AssetKind[]).map((kind) => (
              <li key={kind} className="mt-2">
                {kindLabels[kind]} <span className="text-ink-dim text-sm">({assetEffects[kind]})</span>:{' '}
                {(kind === 'groundStation' ? (['B'] as TrustTier[]) : (['B', 'A'] as TrustTier[])).map((tier) => (
                  <button key={tier} className={`${btn} ml-2 text-sm`} onClick={() => addAsset(kind, tier)}>
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
                <li key={i}>
                  {kindLabels[buy.kind]} Tier {buy.tier} ({assetPrice(scenario, buy.kind, buy.tier)}){' '}
                  <button className={`${btn} px-1 py-0 text-xs`} onClick={() => removeAsset(i)}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2">
            <label>
              <input
                type="checkbox"
                checked={actions.buyIntelLevel}
                disabled={state.intelLevel >= 3}
                onChange={(e) => setActions({ ...actions, buyIntelLevel: e.target.checked })}
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
          <p className="mt-2 text-sm font-mono">
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {scenario.countermeasures
              .filter((cm) => cm.id !== 'intelInvestment' && cm.id !== 'irRetainer')
              .map((cm) => (
                <li key={cm.id} className="mt-3">
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
            <li className="mt-3">
              <label>
                <input
                  type="checkbox"
                  checked={state.irRetainer || actions.buyIrRetainer}
                  disabled={state.irRetainer}
                  onChange={(e) => setActions({ ...actions, buyIrRetainer: e.target.checked })}
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
          <button className={`${btn} mt-4`} disabled={!affordable} onClick={resolve}>
            4. Resolve turn {state.turn}
          </button>
          <button className={`${btn} mt-4 ml-2`} onClick={() => setPhase('procure')}>
            Back to procurement
          </button>
        </section>
      )}

      {phase === 'aftermath' && lastRecord && (
        <section className="mt-4">
          <h2 className={h2cls}>5. Aftermath, turn {lastRecord.turn}</h2>
          {lastRecord.notes.map((n, i) => (
            <p key={i} className="mt-1 font-mono text-sm">
              {n}
            </p>
          ))}
          {lastRecord.commendations.length > 0 && (
            <div className="mt-2 border border-hero-blue/50 bg-hero-blue/5 p-2">
              <p className="text-xs font-bold text-hero-blue uppercase tracking-widest">Commendations</p>
              {lastRecord.commendations.map((c, i) => (
                <p key={i} className="text-sm mt-1 text-hero-blue">
                  {c}
                </p>
              ))}
            </div>
          )}
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
                  {def && <img src={vectorIcons[def.vector]} alt={`${def.vector} vector`} className="w-6 h-6" />}
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
                          {ref.framework} {ref.id}, {ref.name}
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
          <button className={`${btn} mt-4`} onClick={nextTurn}>
            {state.status === 'playing' ? `To turn ${state.turn} intel brief` : 'View final report'}
          </button>
        </section>
      )}
    </main>
  )
}
