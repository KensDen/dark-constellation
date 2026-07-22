// FIELD MANUAL (R3.5): the in-game explainer copy promoted to a full
// reference screen and extended to the R3.25 dynamics. Every number is
// interpolated from the engine's exported tuning constants and the scenario
// data, so the manual never drifts from the rules it describes.

import { ADVERSARY, SQUADRON } from '../config'
import { DEFAULT_SCENARIO } from '../content'
import {
  CHAIN_BONUS,
  CONDITION_PRESSURE_PER_SEVERITY,
  DEPLOY_ETA,
  FUSION_RETROFIT_TURNS,
  IR_RETAINER_BONUS_TOKENS,
  MITIGATION_COMMENDATION_CREDITS,
  RESILIENCE_CREDITS,
  SURGE_START_TOKENS,
  SURGE_TOKEN_CAP,
} from '../engine/reducer'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT } from '../engine/scoring'

const s = DEFAULT_SCENARIO
const durations = s.events.flatMap((e) => (e.duration ? [e.duration.min, e.duration.max] : []))
const durMin = durations.length ? Math.min(...durations) : 2
const durMax = durations.length ? Math.max(...durations) : 3

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="font-mono text-xs uppercase tracking-widest text-phosphor border-b border-phosphor/20 pb-1">
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm">{children}</div>
    </section>
  )
}

export default function FieldManual({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl text-phosphor">FIELD MANUAL</h1>
        <button className={btn} onClick={onBack}>
          Back to menu
        </button>
      </div>

      <Section title="The objective">
        <p>
          You are the mission assurance architect. Finish turn {s.totalTurns} with the Mission Assurance Index at{' '}
          {s.winThreshold} or higher. You start above the win line; {ADVERSARY} spends the campaign eroding it. MAI
          below {s.collapseThreshold} at any point, or a budget forced below zero, ends the campaign early.
        </p>
      </Section>

      <Section title="Mission Assurance Index">
        <p>
          MAI is a weighted blend of Coverage, Link availability, Data integrity, and Sensor integrity. Coverage is
          how much of the area the fleet sees (each sat {COVERAGE_PER_SAT}, each drone {COVERAGE_PER_DRONE}, capped at
          100); at {s.slaBonus.coverageMin} or more the coverage SLA pays +{s.slaBonus.credits} credits a turn. The
          other three meters are trust: jamming drives Link down, ransomware and eavesdropping drive Data down, LiDAR
          and spoofing attacks drive Sensor down. Damaged meters recover +{s.recovery.base} a turn, or +
          {s.recovery.withIrRetainer} with the incident response retainer.
        </p>
      </Section>

      <Section title="Active conditions">
        <p>
          Some attacks are not single strikes. Jamming, spoofing, eavesdropping, and ransomware become active
          conditions that last a hidden {durMin} to {durMax} turns, pressing the meters by{' '}
          {CONDITION_PRESSURE_PER_SEVERITY} per unmitigated severity every turn until they lift. Conditions stack, and
          the sustained pressure is what makes a campaign hard, not any one landing. Buying the right countermeasure
          while a condition is live reduces its remaining bite. Only high intel estimates how many turns a condition
          has left.
        </p>
      </Section>

      <Section title="The BLACKOUT CHAIN">
        <p>
          The signature move. {ADVERSARY} jams GNSS so {SQUADRON} falls back to LiDAR odometry, then injects into the
          only sensor the drones have left. While the jam condition lives, the next LiDAR attack lands at +{CHAIN_BONUS}{' '}
          severity, unless sensor fusion cross-checks are active or every drone flies Tier A sensors. Holding a second
          independent sensor in reserve breaks the chain.
        </p>
      </Section>

      <Section title="Deployment pipeline">
        <p>
          Assets take time to reach the field. Sats need {DEPLOY_ETA.sat.min} to {DEPLOY_ETA.sat.max} turns and can
          slip a turn; ground stations {DEPLOY_ETA.groundStation.min} to {DEPLOY_ETA.groundStation.max}; drones arrive
          the next turn. Countermeasures are instant except the sensor-fusion retrofit, which takes{' '}
          {FUSION_RETROFIT_TURNS} turn. Watch the in-transit line in Posture and buy ahead of the threat, not into it.
        </p>
      </Section>

      <Section title="Surge authority and commendations">
        <p>
          You hold surge authority tokens (start with {SURGE_START_TOKENS}, cap {SURGE_TOKEN_CAP}). Spend one in any
          decision phase to immediately clear an active condition. The incident response retainer grants +
          {IR_RETAINER_BONUS_TOKENS} on purchase, and you earn one by holding the win line under two or more
          conditions.
        </p>
        <p>
          Commendations reward composure under pressure. End a turn at or above the win line with conditions active
          for a resilience commendation, scaling with how many conditions you weathered (up to +
          {RESILIENCE_CREDITS[RESILIENCE_CREDITS.length - 1]} credits and meter bonuses). Fully counter an attack for
          a mitigation commendation of +{MITIGATION_COMMENDATION_CREDITS} credits.
        </p>
      </Section>

      <Section title="Opportunity events">
        <p>
          Not every turn is hostile. Rare opportunity events break your way: an emergency appropriations rider adds
          credits, an allied space-tracking data share sharpens your forecast for a couple of turns, and a commercial
          rideshare slot pulls one in-transit deployment forward. They are drawn from the same deck flow, weighted
          rare.
        </p>
      </Section>

      <Section title="Sensor trust tiers">
        <p>
          Tier B sensor packages are cheap but carry hidden supply-chain risk: only Tier B hardware can host the
          firmware implant. Tier A costs more, is immune to the implant, and an all Tier A drone fleet breaks the
          BLACKOUT CHAIN. Cheap sensors save credits now and bite later.
        </p>
      </Section>

      <button className={`${btn} mt-6`} onClick={onBack}>
        Back to menu
      </button>
    </main>
  )
}

const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 text-sm hover:bg-phosphor/10 disabled:opacity-40'
