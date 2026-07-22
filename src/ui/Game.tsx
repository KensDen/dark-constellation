// Text-first game shell, restyled in R2 per design brief v0.2: phosphor
// terminal chrome, hero-derived state accents (blue = friendly/defense,
// magenta = hostile/threat, amber = alerts), monospace HUD over sans body.
// All game logic is unchanged from R1.5.

import { Suspense, lazy, useState } from 'react'
import { ADVERSARY, GAME_TITLE, SQUADRON } from '../config'
import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  EVENT_COUNT,
  SOURCE_COUNT,
  TECHNIQUE_REF_COUNT,
  UNVERIFIED_REF_COUNT,
} from '../content'
import {
  CHAIN_BONUS,
  MITIGATION_PER_COUNTER,
  SSA_MITIGATION_BONUS,
  TIER_A_FLEET_SHARE,
  newGame,
  resolveTurn,
} from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT, assetPrice, coverage, maiScore } from '../engine/scoring'
import type {
  AssetBuy,
  AssetKind,
  CountermeasureId,
  GameState,
  Layer,
  ResolvedEvent,
  TrustTier,
  TurnActions,
  Vector,
} from '../engine/types'

import wordmarkUrl from './assets/wordmark.svg'
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
  sat: `+${COVERAGE_PER_SAT} coverage`,
  rpoSat: `+${COVERAGE_PER_SAT} coverage, hosts the docking LiDAR (no extra effect in this build)`,
  drone: `+${COVERAGE_PER_DRONE} coverage, flies the LiDAR mapping sorties`,
  groundStation: 'no coverage; ground ops capacity with no game effect in this build',
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

export default function Game() {
  const [state, setState] = useState<GameState | null>(null)
  const [phase, setPhase] = useState<Phase>('brief')
  const [actions, setActions] = useState<TurnActions>(EMPTY_ACTIONS)
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED))

  const scenario = DEFAULT_SCENARIO

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
    </div>
  )

  const constellationVisual = prefersReducedMotion ? (
    <FrameStill />
  ) : (
    <Suspense fallback={<FrameStill />}>
      <Constellation size={256} />
    </Suspense>
  )

  const start = () => {
    const seed = Number.parseInt(seedInput, 10)
    setState(newGame(scenario, Number.isFinite(seed) ? seed : DEFAULT_SEED))
    setActions(EMPTY_ACTIONS)
    setPhase('brief')
  }

  if (!state) {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <h1>
          <img src={wordmarkUrl} alt={GAME_TITLE} className="w-full max-w-xl mx-auto" />
        </h1>
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
        <p className="mt-4">{scenario.briefIntro}</p>
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
        <div className="mt-6 flex justify-center">{constellationVisual}</div>
        <p className="mt-6 text-sm text-ink-dim">
          Content loaded from data: {EVENT_COUNT} threat events, {COUNTERMEASURE_COUNT} countermeasures,{' '}
          {TECHNIQUE_REF_COUNT} framework techniques, {SOURCE_COUNT} cited sources.
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
    scenario.incomePerTurn +
    (coverage(state.assets) >= scenario.slaBonus.coverageMin ? scenario.slaBonus.credits : 0)
  const available = state.credits + turnIncome
  const cost = plannedCost(state, actions)
  const affordable = cost <= available
  const lastRecord = state.history[state.history.length - 1]
  const displayTurn = phase === 'aftermath' && lastRecord ? lastRecord.turn : Math.min(state.turn, scenario.totalTurns)

  const resolve = () => {
    const next = resolveTurn(state, actions, turnRng(state.seed, state.turn))
    setState(next)
    setActions(EMPTY_ACTIONS)
    setPhase('aftermath')
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
        {state.meters.sensorIntegrity} | Intel level {state.intelLevel}
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
            Credits: the budget. Income +{scenario.incomePerTurn} a turn plus any SLA bonus. Repairs come out of it,
            and below zero the program folds.
          </li>
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
    </section>
  )

  // The deciding turn's aftermath still renders before the report card.
  if (state.status !== 'playing' && phase !== 'aftermath') {
    // Authoritative technique-to-vector map from the content deck: the
    // FIRST event carrying a ref defines its icon, so a technique shared
    // across events (EX-0016.03 on both the jam and the chain) keeps its
    // primary vector regardless of which event fired last.
    const refVector = new Map<string, Vector>()
    for (const evDef of scenario.events) {
      for (const ref of evDef.techniqueRefs) {
        const key = `${ref.framework} ${ref.id}`
        if (!refVector.has(key)) refVector.set(key, evDef.vector)
      }
    }
    const burned = new Map<string, string>()
    const resisted = new Map<string, string>()
    for (const rec of state.history) {
      for (const ev of rec.events) {
        const def = scenario.events.find((e) => e.id === ev.eventId)
        for (const ref of ev.firedTechniqueRefs) {
          burned.set(`${ref.framework} ${ref.id}`, ref.name)
        }
        if (ev.effectiveSeverity === 0) {
          for (const ref of def?.techniqueRefs ?? []) {
            resisted.set(`${ref.framework} ${ref.id}`, ref.name)
          }
        }
      }
    }
    const won = state.status === 'won'
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <h1>
          <img src={wordmarkUrl} alt={GAME_TITLE} className="w-full max-w-md" />
        </h1>
        <h2
          className={`mt-6 font-mono font-bold text-2xl tracking-widest ${won ? 'text-hero-blue' : 'text-hero-magenta'}`}
        >
          {won ? 'MISSION ASSURED' : 'MISSION FAILED'}
        </h2>
        <p className="mt-2">
          {won
            ? `The architecture held through turn ${scenario.totalTurns}.`
            : state.lossReason === 'insolvency'
              ? 'Budget insolvency. The program ran out of credits before it ran out of threats.'
              : state.lossReason === 'maiCollapse'
                ? 'Mission Assurance Index collapse. The architecture came apart under the campaign.'
                : `End of campaign below the win threshold of ${scenario.winThreshold}.`}
        </p>
        <p className="mt-4 font-mono text-xl text-phosphor">
          Final MAI: {lastRecord?.maiScore ?? 0}
          <span className="text-ink-dim text-sm">
            {' '}
            | turns survived {state.history.length} of {scenario.totalTurns} | seed {state.seed}
          </span>
        </p>
        <h3 className={`${h2cls} mt-6`}>Technique report card</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {[...burned.entries()].map(([id, name]) => (
            <div key={id} className="border border-hero-magenta/50 bg-hero-magenta/5 p-2 font-mono text-xs">
              <p className="text-hero-magenta font-bold flex items-center gap-2">
                {refVector.has(id) && (
                  <img src={vectorIcons[refVector.get(id) as Vector]} alt="" className="w-5 h-5" />
                )}
                COMPROMISED
              </p>
              <p className="mt-1">{id}</p>
              <p className="text-ink-dim font-sans">{name}</p>
            </div>
          ))}
          {[...resisted.entries()].map(([id, name]) => (
            <div key={id} className="border border-hero-blue/50 bg-hero-blue/5 p-2 font-mono text-xs">
              <p className="text-hero-blue font-bold flex items-center gap-2">
                {refVector.has(id) && (
                  <img src={vectorIcons[refVector.get(id) as Vector]} alt="" className="w-5 h-5" />
                )}
                RESILIENT
              </p>
              <p className="mt-1">{id}</p>
              <p className="text-ink-dim font-sans">{name}</p>
            </div>
          ))}
          {burned.size === 0 && resisted.size === 0 && (
            <p className="text-ink-dim">No technique fired or was shut out this run.</p>
          )}
        </div>
        <div className="mt-6 pt-3 border-t border-phosphor/30 flex flex-wrap items-center justify-between gap-2">
          <img src={wordmarkUrl} alt="" aria-hidden="true" className="h-5 w-auto" />
          <p className="font-mono text-xs text-ink-dim">
            {won ? 'assured' : 'failed'} at MAI {lastRecord?.maiScore ?? 0} | seed {state.seed} |
            kensden.github.io/dark-constellation
          </p>
        </div>
        <button className={`${btn} mt-6`} onClick={() => setState(null)}>
          New campaign
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <h1>
        <img src={wordmarkUrl} alt={GAME_TITLE} className="w-full max-w-md" />
      </h1>
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
          {lastRecord.events.length === 0 && <p className="mt-2">No adversary activity this turn.</p>}
          {lastRecord.events.map((ev, i) => {
            const def = scenario.events.find((e) => e.id === ev.eventId)
            const landed = ev.effectiveSeverity > 0
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
