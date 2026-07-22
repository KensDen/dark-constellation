// HOW TO PLAY (R3.5): a static walkthrough of a single turn reflecting the
// R3.25 dynamics. No guided tutorial in v1; this is a read-and-play page.
// Numbers derive from the scenario and engine constants.

import { DEFAULT_SCENARIO } from '../content'
import { SURGE_START_TOKENS } from '../engine/reducer'

const s = DEFAULT_SCENARIO

const STEPS: { label: string; body: string }[] = [
  {
    label: '1. Intel brief',
    body: `Read the forecast for the coming turn. At intel level 0 it is blank; each level of intel investment sharpens it, from a segment hint up to named likely events. Raise intel in the procure phase.`,
  },
  {
    label: '2. Procure and deploy',
    body: `Spend credits on fleet and sensor packages. Deployments take turns to arrive, so buy ahead of the threat. Tier A costs more but is immune to the supply-chain implant and helps break the BLACKOUT CHAIN.`,
  },
  {
    label: '3. Harden and configure',
    body: `Buy countermeasures. Each one lists the threats it answers and its SPARTA controls. Most are instant; the sensor-fusion retrofit takes a turn to come online, so buy it before the chain, not during it.`,
  },
  {
    label: '4. Manage conditions',
    body: `Active conditions press your meters every turn until they lift. Buy a counter to blunt one, or spend a surge authority token in any decision phase to clear one outright. You start with ${SURGE_START_TOKENS}.`,
  },
  {
    label: '5. Resolve',
    body: `${DEFAULT_SCENARIO.name} plays its events. Each is scored: base severity, plus any chain bonus, minus your mitigation. What lands damages meters and assets, and some attacks become new conditions.`,
  },
  {
    label: '6. Aftermath',
    body: `See what happened, why it landed, and what would have helped. Hold the win line under pressure to earn commendations. Then advance to the next brief. Survive all ${s.totalTurns} turns above the win line to win.`,
  },
]

export default function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">HOW TO PLAY</h1>
        <button className={btn} onClick={onBack}>
          Back to menu
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        A campaign is {s.totalTurns} turns. Each turn moves through these phases. There is no dominant strategy:
        budget, trust, and redundancy trade off against each other.
      </p>
      <ol className="mt-4">
        {STEPS.map((step) => (
          <li key={step.label} className="mt-3 border border-phosphor/20 bg-panel p-3">
            <p className="font-mono text-sm text-phosphor">{step.label}</p>
            <p className="text-sm mt-1">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-dim">
        For the full rules, including the BLACKOUT CHAIN, deployment timing, and commendations, see the FIELD MANUAL.
        For every technique and countermeasure, see the GLOSSARY.
      </p>
      <button className={`${btn} mt-6`} onClick={onBack}>
        Back to menu
      </button>
    </main>
  )
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
