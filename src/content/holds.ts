// THE POLICY ENGINE'S HOLDS (v2.0 R2, Ken's mechanic of 14 November 2026:
// the human tie-break). Fiction, like the fleet and the adversary: no
// framework technique is claimed for a hold. What each check tests is
// ordinary, public security practice, said plainly: a signature on an
// order, a change on file, a firmware image against its seal, an
// allowlist, a command counter that never repeats, where training data
// came from, a certificate's chain, whether a link is encrypted.
//
// The term the debrief names, Human in Command, is the European
// Commission High-Level Expert Group on AI's (Ethics Guidelines for
// Trustworthy AI, 2019): the ability to oversee a system's overall
// activity and to decide when and how to use it, which includes
// overriding a decision it has made (HUMAN_IN_COMMAND below).
//
// Each check reads clean or dirty in its own words. The engine decides
// which read dirty (src/engine/holds.ts): none on a false positive, one or
// two on a compromise. House rules: numerals, no em or en dashes.

import type { HoldTemplate } from '../engine/types'

export const HOLDS: HoldTemplate[] = [
  {
    id: 'retask',
    kinds: ['drone'],
    action: 'Retasked in flight to a new search grid',
    rule: 'The new route leaves the filed flight corridor.',
    checks: [
      { label: 'Order signed by', clean: 'Flight ops key, current', dirty: 'No valid signature' },
      { label: 'Change filed with ops', clean: 'Filed 20 minutes ago: the flood crest moved', dirty: 'Nothing on file' },
      { label: 'Autopilot firmware', clean: 'Matches its sealed image', dirty: 'Does not match its sealed image' },
    ],
    meter: 'sensorIntegrity',
    ifOverridden: 'The order was not ours. The drone flew a route someone else chose.',
    ifStood: 'The order was good. The drone stayed in its corridor and the new grid went unsearched.',
  },
  {
    id: 'model-update',
    kinds: ['drone'],
    action: 'The update agent is sending it a new terrain model',
    rule: 'A model change outside the approved change window.',
    checks: [
      { label: 'Training data', clean: 'Every file matches the approved set', dirty: 'Includes files with no recorded source' },
      { label: 'Holdout tests', clean: 'Passed this evening', dirty: 'Skipped' },
      { label: 'Change approval', clean: 'Emergency change, signed by the model lead', dirty: 'No approval on record' },
    ],
    meter: 'sensorIntegrity',
    ifOverridden: 'The model was not clean. The squadron now sees what bad data taught it.',
    ifStood: 'The model was good. The squadron flew on the old one and missed the new flood line.',
  },
  {
    id: 'command-burst',
    kinds: ['sat', 'rpoSat'],
    action: 'Received a burst of pointing commands',
    rule: 'More commands than the limit for 1 pass.',
    checks: [
      { label: 'Command counters', clean: 'In sequence, none repeated', dirty: 'Repeat values already used' },
      { label: 'Uplink source', clean: 'Our ground station, authenticated', dirty: 'A dish that did not authenticate' },
      { label: 'Pass plan', clean: 'A retarget approved for this pass', dirty: 'No retarget planned for this pass' },
    ],
    meter: 'dataIntegrity',
    ifOverridden: 'The commands were not ours. The satellite pointed where someone else told it to.',
    ifStood: 'The commands were good. The satellite sat out the pass and missed its window.',
  },
  {
    id: 'relay-switch',
    kinds: ['sat', 'drone'],
    action: 'Switched its downlink to a different relay',
    rule: 'A relay it has never used before.',
    checks: [
      { label: 'Relay certificate', clean: 'Chains to our own authority', dirty: 'Self-signed' },
      { label: 'Primary relay', clean: 'Down for weather, logged', dirty: 'Up and idle' },
      { label: 'Link encryption', clean: 'On, keys negotiated as normal', dirty: 'Turned off for this link' },
    ],
    meter: 'dataIntegrity',
    ifOverridden: 'The relay was not ours. Tonight’s frames went through someone else’s dish.',
    ifStood: 'The relay was good. With the primary down, tonight’s frames never came home.',
  },
  {
    id: 'bulk-transfer',
    kinds: ['groundStation'],
    action: 'The archive agent began a bulk transfer of imagery',
    rule: 'Far more data than a normal night.',
    checks: [
      { label: 'Destination', clean: 'County emergency office, on the allowlist', dirty: 'An address not on the allowlist' },
      { label: 'Job', clean: 'Scheduled yesterday, ticket attached', dirty: 'No schedule and no ticket' },
      { label: 'Account', clean: 'The archive service account, from its own host', dirty: 'An operator login from a new device' },
    ],
    meter: 'dataIntegrity',
    ifOverridden: 'The transfer was not ours. Imagery left for a destination nobody approved.',
    ifStood: 'The transfer was good. The county’s relief maps did not arrive tonight.',
  },
]

// Where the term comes from, for the debrief and the Dossier.
export const HUMAN_IN_COMMAND = {
  term: 'Human in Command',
  source: 'European Commission High-Level Expert Group on AI, Ethics Guidelines for Trustworthy AI (2019)',
  url: 'https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai',
} as const
