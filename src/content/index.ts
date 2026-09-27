// Validated content entry point. Everything the UI or engine consumes
// passes through zod here; a content error fails the build and battery,
// never a player's session. All displayed counts derive from these
// arrays, never from literals (spec, working agreement).

import type { Scenario } from '../engine/types'
import { scenarioSchema } from './schemas'
import { FIRST_LIGHT } from './scenarios/firstLight'

function validate(scenario: Scenario): Scenario {
  const parsed = scenarioSchema.safeParse(scenario)
  if (!parsed.success) {
    throw new Error(`content validation failed for scenario ${scenario.id}:\n${parsed.error.message}`)
  }
  return scenario
}

export const SCENARIOS: Scenario[] = [validate(FIRST_LIGHT)]
export const DEFAULT_SCENARIO = SCENARIOS[0]

export const EVENT_COUNT = DEFAULT_SCENARIO.events.length
export const THREAT_EVENT_COUNT = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat').length
export const OPPORTUNITY_EVENT_COUNT = DEFAULT_SCENARIO.events.filter((e) => e.kind === 'opportunity').length
export const COUNTERMEASURE_COUNT = DEFAULT_SCENARIO.countermeasures.length
export const TECHNIQUE_REF_COUNT = new Set(
  DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs.map((r) => `${r.framework}:${r.id}`)),
).size
export const SOURCE_COUNT = new Set(
  DEFAULT_SCENARIO.events.flatMap((e) => e.learnMoreCards.flatMap((c) => c.sources.map((s) => s.url))),
).size
// References not yet confirmed against the live framework and source
// sites. Displayed while nonzero so the pending-verification state is
// visible in the UI, never implied away.
export const UNVERIFIED_REF_COUNT =
  new Set(
    DEFAULT_SCENARIO.events.flatMap((e) =>
      e.techniqueRefs.filter((r) => r.status !== 'verified').map((r) => `${r.framework}:${r.id}`),
    ),
  ).size +
  new Set(
    DEFAULT_SCENARIO.events.flatMap((e) =>
      e.learnMoreCards.flatMap((c) => c.sources.filter((s) => s.status !== 'verified').map((s) => s.url)),
    ),
  ).size
