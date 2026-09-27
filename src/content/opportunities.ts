// Opportunity events (R3.25): rare beneficial draws from the same deck
// flow as the threats. All fiction, no framework refs required; the zod
// schema relaxes sourcing requirements for kind 'opportunity'. Effects are
// interpreted by the engine through the benefit field.

import type { ThreatEvent } from '../engine/types'
import { PLAYER_ORG } from '../config'

export const OPPORTUNITIES: ThreatEvent[] = [
  {
    id: 'appropriations-rider',
    name: 'Emergency appropriations rider',
    kind: 'opportunity',
    layers: ['GROUND'],
    vector: 'human',
    baseSeverity: 1,
    counters: [],
    effect: { meters: [], assetDamage: false, repairCostPerSeverity: 0 },
    benefit: { credits: 25 },
    techniqueRefs: [],
    blurb:
      `A disaster-response funding bill picks up a rider for constellation assurance, and ${PLAYER_ORG} is on the distribution list. Budgets are a battlespace too; this turn, it broke your way.`,
    learnMoreCards: [],
  },
  {
    id: 'allied-ssa-datashare',
    name: 'Allied SSA data share',
    kind: 'opportunity',
    layers: ['GROUND'],
    vector: 'human',
    baseSeverity: 1,
    counters: [],
    effect: { meters: [], assetDamage: false, repairCostPerSeverity: 0 },
    benefit: { intelBoostTurns: 2 },
    techniqueRefs: [],
    blurb:
      `A partner nation opens its space tracking feed to ${PLAYER_ORG} for the surge period. Someone else's sensors, your warning time.`,
    learnMoreCards: [],
  },
  {
    id: 'rideshare-slot',
    name: 'Commercial rideshare slot',
    kind: 'opportunity',
    layers: ['ORBIT'],
    vector: 'environmental',
    baseSeverity: 1,
    counters: [],
    effect: { meters: [], assetDamage: false, repairCostPerSeverity: 0 },
    benefit: { expediteTurns: 1 },
    techniqueRefs: [],
    blurb:
      'A launch broker calls: a rideshare manifest slot opened up on short notice. One deployment in transit gets to skip the queue.',
    learnMoreCards: [],
  },
]
