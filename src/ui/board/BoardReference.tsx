// Reference, one tap away, under the layer panels (v1.2 R1): what the
// HUD's numbers mean, and the posture detail. Both are disclosures the
// reading diet budgets by their summary text, so the two summaries are
// the DISCLOSURE_WORD_BUDGETS keys and nothing else renders inside them.
// The help list was the v1.1 copy word for word until v1.3 Round 0 changed
// the rules under it (brief 6.1): every number is still read off the
// engine and the scenario. Its length is pinned.

import { ASSET_HEAL_PER_TURN, DEPLOY_TURNS } from '../../engine/reducer'
import { COVERAGE_PER_KIND } from '../../engine/scoring'
import type { GameState } from '../../engine/types'
import { postureDetailLines, type PostureTone } from '../brief'

// Posture detail's tones, by meaning rather than by position.
export const POSTURE_TONE: Record<PostureTone, string> = { dim: 'text-ink-dim', blue: 'text-hero-blue', amber: 'font-mono text-alert-amber' }

export default function BoardReference({ shown, conditionDurationRange }: { shown: GameState; conditionDurationRange: string }) {
  const scenario = shown.scenario
  return (
    <div className="border-t-2 border-dc-line pt-2 font-mono">
      <details className="text-sm font-sans text-ink-dim">
        <summary className="cursor-pointer font-mono text-xs text-phosphor">What these numbers mean</summary>
        <ul className="list-disc ml-6 mt-1 text-ink">
          <li>
            MAI: overall mission health, a weighted blend of Coverage, Link, Data, and Sensor. Finish at{' '}
            {scenario.winThreshold} or higher to win. Below {scenario.collapseThreshold} at a turn close, the mission
            collapses.
          </li>
          <li>
            Coverage: how much of the mission area the fleet can see, capped at 100. At full integrity each sat adds{' '}
            {COVERAGE_PER_KIND.sat}, the RPO sat {COVERAGE_PER_KIND.rpoSat}, each drone {COVERAGE_PER_KIND.drone} and
            each ground station {COVERAGE_PER_KIND.groundStation}; a damaged asset adds in proportion. At{' '}
            {scenario.slaBonus.coverageMin} or more at the turn close, the coverage bonus pays +{scenario.slaBonus.credits}.
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
            Credits: the budget. At each turn close repairs and {scenario.upkeepPerDefense} a defense come out first, and
            below zero the operation ends; then funding +{scenario.incomePerTurn} and any coverage bonus. A solvent close
            repairs damaged assets +{ASSET_HEAL_PER_TURN}.
          </li>
          <li>
            Conditions: some attacks (GNSS denial, jamming, spoofing, eavesdropping, data leaks, ransomware) stay active for{' '}
            {conditionDurationRange}, pressing the meters every turn until they lift. They stack.
          </li>
          <li>
            Defense streak: moves in a row with nothing through. The best streak and the points your defenses saved add
            a small bonus to the grade.
          </li>
          <li>
            Deployments arrive after a lead time: {DEPLOY_TURNS.drone} turn for a drone, {DEPLOY_TURNS.sat} for a sat.
            Watch the in-transit line.
          </li>
        </ul>
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-phosphor">Posture detail</summary>
        {postureDetailLines(shown).map((line, i) => (
          <p key={i} data-posture-tone={line.tone} className={`${i === 0 ? 'mt-2' : 'mt-1'} text-xs ${POSTURE_TONE[line.tone]}`}>
            {line.text}
          </p>
        ))}
      </details>
    </div>
  )
}
