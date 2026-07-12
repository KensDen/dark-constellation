// Text-first game shell (R1): the full 12-turn loop with bare functional
// layout only. Visual identity is R2 and deliberately absent here.

import { useState } from 'react'
import { ADVERSARY, GAME_TITLE, SQUADRON } from '../config'
import { COUNTERMEASURE_COUNT, DEFAULT_SCENARIO, EVENT_COUNT, TECHNIQUE_REF_COUNT } from '../content'
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
  ResolvedEvent,
  TrustTier,
  TurnActions,
} from '../engine/types'

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
    <div className="border p-2 mt-4">
      <p className="font-bold">Your job</p>
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

  const start = () => {
    const seed = Number.parseInt(seedInput, 10)
    setState(newGame(scenario, Number.isFinite(seed) ? seed : DEFAULT_SEED))
    setActions(EMPTY_ACTIONS)
    setPhase('brief')
  }

  if (!state) {
    return (
      <main className="min-h-screen p-8 max-w-3xl">
        <h1 className="text-2xl font-bold">{GAME_TITLE}</h1>
        <p className="mt-4">{scenario.briefIntro}</p>
        {jobFraming}
        <p className="mt-4">Scenario: {scenario.name}.</p>
        <div className="mt-4">
          <label>
            Seed:{' '}
            <input
              className="border px-1"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              aria-label="game seed"
            />
          </label>
          <button className="border px-2 ml-2" onClick={start}>
            Start campaign
          </button>
        </div>
        <p className="mt-6 text-sm">
          Content loaded from data: {EVENT_COUNT} threat events, {COUNTERMEASURE_COUNT} countermeasures,{' '}
          {TECHNIQUE_REF_COUNT} framework techniques. R1 skeleton subset; the full deck lands in R3.
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
    <section className="mt-4 border p-2">
      <h2 className="font-bold">Posture</h2>
      <p className="font-bold">
        MAI {maiScore(state)} (win line {scenario.winThreshold}, collapse below {scenario.collapseThreshold})
      </p>
      <p className="mt-1">
        Turn {displayTurn} of {scenario.totalTurns} | Credits {state.credits} | Coverage {coverage(state.assets)} |
        Link {state.meters.linkAvailability} | Data {state.meters.dataIntegrity} | Sensor{' '}
        {state.meters.sensorIntegrity} | Intel level {state.intelLevel}
      </p>
      <details className="mt-1 text-sm">
        <summary>What these numbers mean</summary>
        <ul className="list-disc ml-6 mt-1">
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
          <li>Link: command and data links available. Jamming drives it down.</li>
          <li>
            Data: mission data you can trust. Ransomware, phishing, firmware implants, and the BLACKOUT CHAIN drive
            it down.
          </li>
          <li>
            Sensor: sensors telling the truth. LiDAR injection, firmware implants, and the BLACKOUT CHAIN drive it
            down.
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
        <p className="font-bold mt-1">
          BLACKOUT CHAIN ARMED: GNSS is jammed and {SQUADRON} is navigating on LiDAR alone. The next LiDAR attack
          lands harder (+{CHAIN_BONUS} severity) unless sensor fusion cross-checks are in place or every drone flies
          Tier A sensors.
        </p>
      )}
      <p className="mt-1 text-sm">
        Fleet: {state.assets.filter((a) => a.integrity > 0).length} operational assets (
        {state.assets
          .filter((a) => a.integrity > 0)
          .map((a) => `${kindLabels[a.kind]} ${a.tier}`)
          .join(', ') || 'none'}
        )
      </p>
      <p className="mt-1 text-sm">
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
    const burned = new Map<string, string>()
    const resisted = new Map<string, string>()
    for (const rec of state.history) {
      for (const ev of rec.events) {
        for (const ref of ev.firedTechniqueRefs) burned.set(`${ref.framework} ${ref.id}`, ref.name)
        if (ev.effectiveSeverity === 0) {
          const def = scenario.events.find((e) => e.id === ev.eventId)
          for (const ref of def?.techniqueRefs ?? []) resisted.set(`${ref.framework} ${ref.id}`, ref.name)
        }
      }
    }
    return (
      <main className="min-h-screen p-8 max-w-3xl">
        <h1 className="text-2xl font-bold">{GAME_TITLE}</h1>
        <h2 className="mt-4 text-xl font-bold">
          {state.status === 'won' ? 'MISSION ASSURED' : 'MISSION FAILED'}
        </h2>
        <p className="mt-2">
          {state.status === 'won'
            ? `The architecture held through turn ${scenario.totalTurns}.`
            : state.lossReason === 'insolvency'
              ? 'Budget insolvency. The program ran out of credits before it ran out of threats.'
              : state.lossReason === 'maiCollapse'
                ? 'Mission Assurance Index collapse. The architecture came apart under the campaign.'
                : `End of campaign below the win threshold of ${scenario.winThreshold}.`}
        </p>
        <p className="mt-2">
          Final MAI: {lastRecord?.maiScore ?? 0}. Turns survived: {state.history.length} of {scenario.totalTurns}.
        </p>
        <h3 className="mt-4 font-bold">Techniques that burned you ({burned.size})</h3>
        <ul className="list-disc ml-6">
          {[...burned.entries()].map(([id, name]) => (
            <li key={id}>
              {id}: {name}
            </li>
          ))}
          {burned.size === 0 && <li>None. Nothing landed with effect.</li>}
        </ul>
        <h3 className="mt-4 font-bold">Techniques you shut out ({resisted.size})</h3>
        <ul className="list-disc ml-6">
          {[...resisted.entries()].map(([id, name]) => (
            <li key={id}>
              {id}: {name}
            </li>
          ))}
          {resisted.size === 0 && <li>None mitigated to zero this run.</li>}
        </ul>
        <button className="border px-2 mt-6" onClick={() => setState(null)}>
          New campaign
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{GAME_TITLE}</h1>
      {statusPanel}

      {phase === 'brief' && (
        <section className="mt-4">
          <h2 className="font-bold">1. Intel brief, turn {state.turn}</h2>
          {state.turn === 1 && state.history.length === 0 && jobFraming}
          <ul className="list-disc ml-6 mt-2">
            {state.forecast.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <button className="border px-2 mt-4" onClick={() => setPhase('procure')}>
            To procurement
          </button>
        </section>
      )}

      {phase === 'procure' && (
        <section className="mt-4">
          <h2 className="font-bold">2. Procure and deploy</h2>
          <p className="mt-2 text-sm">
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {(['sat', 'rpoSat', 'drone', 'groundStation'] as AssetKind[]).map((kind) => (
              <li key={kind} className="mt-1">
                {kindLabels[kind]} ({assetEffects[kind]}):{' '}
                {(kind === 'groundStation' ? (['B'] as TrustTier[]) : (['B', 'A'] as TrustTier[])).map((tier) => (
                  <button key={tier} className="border px-2 ml-2" onClick={() => addAsset(kind, tier)}>
                    {kind === 'groundStation' ? `Buy (${assetPrice(scenario, kind, tier)})` : `Buy Tier ${tier} (${assetPrice(scenario, kind, tier)})`}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            Tier B sensor packages are cheap with a hidden supply-chain risk: only Tier B hardware can host the
            firmware implant. Tier A packages cost more on sats and drones, are immune to the implant, and an all
            Tier A drone fleet breaks the BLACKOUT CHAIN. Ground stations carry no sensor package.
          </p>
          {actions.buyAssets.length > 0 && (
            <ul className="list-disc ml-6 mt-2">
              {actions.buyAssets.map((buy: AssetBuy, i: number) => (
                <li key={i}>
                  {kindLabels[buy.kind]} Tier {buy.tier} ({assetPrice(scenario, buy.kind, buy.tier)}){' '}
                  <button className="border px-1" onClick={() => removeAsset(i)}>
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
          <button className="border px-2 mt-4" onClick={() => setPhase('harden')}>
            To hardening
          </button>
        </section>
      )}

      {phase === 'harden' && (
        <section className="mt-4">
          <h2 className="font-bold">3. Harden and configure</h2>
          <p className="mt-2 text-sm">
            Planned spend: {cost} of {available} credits available (current {state.credits} plus {turnIncome} turn
            income).
          </p>
          <ul className="mt-2">
            {scenario.countermeasures
              .filter((cm) => cm.id !== 'intelInvestment' && cm.id !== 'irRetainer')
              .map((cm) => (
                <li key={cm.id} className="mt-2">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.counters.includes(cm.id) || actions.buyCounters.includes(cm.id)}
                      disabled={state.counters.includes(cm.id)}
                      onChange={() => toggleCounter(cm.id)}
                    />{' '}
                    {cm.name} ({cm.cost}){state.counters.includes(cm.id) ? ' [owned]' : ''}
                  </label>
                  <p className="text-sm ml-6 font-bold">
                    Answers: {cm.counters.map((id) => shortEventName(id)).join(', ') || 'posture-wide'}
                  </p>
                  <p className="text-sm ml-6">{cm.blurb}</p>
                </li>
              ))}
            <li className="mt-2">
              <label>
                <input
                  type="checkbox"
                  checked={state.irRetainer || actions.buyIrRetainer}
                  disabled={state.irRetainer}
                  onChange={(e) => setActions({ ...actions, buyIrRetainer: e.target.checked })}
                />{' '}
                Incident response retainer (
                {scenario.countermeasures.find((c) => c.id === 'irRetainer')?.cost}
                ){state.irRetainer ? ' [owned]' : ''}
              </label>
              <p className="text-sm ml-6 font-bold">
                Answers: everything, indirectly. Every damaged meter recovers +{scenario.recovery.withIrRetainer} a
                turn instead of +{scenario.recovery.base}.
              </p>
            </li>
          </ul>
          {!affordable && <p className="mt-2 font-bold">Planned spend exceeds credits. Trim the cart.</p>}
          <button className="border px-2 mt-4" disabled={!affordable} onClick={resolve}>
            4. Resolve turn {state.turn}
          </button>
          <button className="border px-2 mt-4 ml-2" onClick={() => setPhase('procure')}>
            Back to procurement
          </button>
        </section>
      )}

      {phase === 'aftermath' && lastRecord && (
        <section className="mt-4">
          <h2 className="font-bold">5. Aftermath, turn {lastRecord.turn}</h2>
          {lastRecord.notes.map((n, i) => (
            <p key={i} className="mt-1">
              {n}
            </p>
          ))}
          {lastRecord.events.length === 0 && <p className="mt-2">No adversary activity this turn.</p>}
          {lastRecord.events.map((ev, i) => (
            <div key={i} className="border p-2 mt-2">
              <h3 className="font-bold">{ev.name}</h3>
              <p className="text-sm">
                Severity {ev.baseSeverity} base {ev.chainBonus > 0 ? `+ ${ev.chainBonus} chain ` : ''}
                {ev.mitigation > 0 ? `- ${ev.mitigation} mitigated ` : ''}= {ev.effectiveSeverity} effective.
                {ev.repairCost > 0 ? ` Repairs: ${ev.repairCost} credits.` : ''}
              </p>
              {ev.notes.map((n, j) => (
                <p key={j} className="text-sm mt-1">
                  {n}
                </p>
              ))}
              {ev.effectiveSeverity > 0 && (
                <p className="text-sm mt-1 font-bold">{whatWouldHaveHelped(ev)}</p>
              )}
              {ev.firedTechniqueRefs.length > 0 && (
                <p className="text-sm mt-1">
                  Learn more:{' '}
                  {ev.firedTechniqueRefs.map((ref, j) => (
                    <span key={j}>
                      {j > 0 ? '; ' : ''}
                      <a className="underline" href={ref.url} target="_blank" rel="noreferrer">
                        {ref.framework} {ref.id}, {ref.name}
                      </a>{' '}
                      [{ref.status}]
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))}
          <button className="border px-2 mt-4" onClick={nextTurn}>
            {state.status === 'playing' ? `To turn ${state.turn} intel brief` : 'View final report'}
          </button>
        </section>
      )}
    </main>
  )
}
