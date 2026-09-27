// Reference, one tap away, under the layer panels (v1.2 R1): what the
// HUD's numbers mean, and the posture detail. Both are disclosures the
// reading diet budgets by their summary text, so the two summaries are
// the DISCLOSURE_WORD_BUDGETS keys and nothing else renders inside them.
// The help list is the v1.1 copy word for word: its length is pinned.

import { incomeFor, SURGE_TOKEN_CAP } from '../../engine/reducer'
import { COVERAGE_PER_DRONE, COVERAGE_PER_SAT } from '../../engine/scoring'
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
