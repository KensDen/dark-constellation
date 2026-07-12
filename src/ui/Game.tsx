// Text-first game shell (R1): the full 12-turn loop with bare functional
// layout only. Visual identity is R2 and deliberately absent here.

import { useState } from 'react'
import { GAME_TITLE, SQUADRON } from '../config'
import { COUNTERMEASURE_COUNT, DEFAULT_SCENARIO, EVENT_COUNT, TECHNIQUE_REF_COUNT } from '../content'
import { newGame, resolveTurn } from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { assetPrice, coverage, maiScore } from '../engine/scoring'
import type { AssetBuy, AssetKind, GameState, TrustTier, TurnActions } from '../engine/types'

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
        <p className="mt-4">
          Scenario: {scenario.name}. {scenario.totalTurns} turns. Win at Mission Assurance Index{' '}
          {scenario.winThreshold} or better; collapse below {scenario.collapseThreshold} or insolvency ends the
          campaign.
        </p>
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

  const statusPanel = (
    <section className="mt-4 border p-2">
      <h2 className="font-bold">Posture</h2>
      <p>
        Turn {displayTurn} of {scenario.totalTurns} | Credits {state.credits} | MAI{' '}
        {maiScore(state)} | Coverage {coverage(state.assets)} | Link {state.meters.linkAvailability} | Data{' '}
        {state.meters.dataIntegrity} | Sensor {state.meters.sensorIntegrity} | Intel level {state.intelLevel}
      </p>
      {state.flags.lidarFallback && (
        <p className="font-bold mt-1">
          BLACKOUT CHAIN RISK: GNSS denied. {SQUADRON} is navigating on LiDAR odometry alone.
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
                {kindLabels[kind]}:{' '}
                {(['B', 'A'] as TrustTier[]).map((tier) => (
                  <button key={tier} className="border px-2 ml-2" onClick={() => addAsset(kind, tier)}>
                    Buy Tier {tier} ({assetPrice(scenario, kind, tier)})
                  </button>
                ))}
              </li>
            ))}
          </ul>
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
              {state.intelLevel !== 3 ? scenario.prices.intelLevels[state.intelLevel] : 'maxed'})
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
