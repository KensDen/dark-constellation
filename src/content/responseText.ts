// THE RESPONSES, IN WORDS (v1.7 R1): what the night offers when a move
// would land, by threat and response id (src/content/threats.ts carries
// the ids and what each does; src/engine/rules.ts the costs). Each is
// something an operator can do that night, in plain words, and stays
// inside what the threat's own card and its countermeasure already say:
// backup sources and graceful degradation for PNT, authentication and
// freshness checks for links, a second sensing modality for LiDAR,
// segmentation and offline backups for ransomware, and so on. No option
// makes a claim the deck's sources do not carry. tests/content.spec.ts
// holds every response to a line here and every line to a response.
//
// In a module of its own, which only the night's cards import, so the
// words ride the night's deferred chunk and not the first download.

export const RESPONSE_TEXT: Record<string, Record<string, string>> = {
  'pnt-jamming': {
    'backup-nav': 'Switch to the backup navigation source',
    'fly-degraded': 'Slow the squadron and fly degraded',
  },
  'uplink-jamming': {
    'backup-link': 'Switch to the backup link',
    'stored-plans': 'Fly the stored plans and re-task later',
  },
  'gnss-spoofing': {
    'cross-check': 'Cross-check other navigation sources and drop the false fix',
    'holding-pattern': 'Put the drone in a holding pattern',
  },
  'time-spoof': {
    'onboard-clock': 'Reject the feed and run on the onboard clock',
    'hold-commands': 'Hold stored commands until the time is verified',
  },
  'lidar-dazzle': {
    'other-sensors': 'Finish the approach on radar and camera',
    'abort-approach': 'Abort the approach and back away',
  },
  'lidar-injection': {
    'cross-check': 'Check the LiDAR against radar and camera',
    'slow-down': 'Slow down and widen the safety margins',
  },
  'lidar-blinding': {
    'other-sensors': 'Hand obstacle detection to radar and camera',
    'surveyed-routes': 'Slow down and keep to surveyed routes',
  },
  'training-data-poisoning': {
    'hold-retrain': 'Hold the retrain and audit the dataset',
    'roll-back': 'Roll back to the last verified model',
  },
  'supply-chain-implant': {
    'isolate-reflash': 'Isolate the sensor package and reflash verified firmware',
  },
  'rogue-ground-station': {
    'rotate-keys': 'Rotate the command keys now',
    'primary-only': 'Take commands from the primary station only',
  },
  'telemetry-replay': {
    'check-freshness': 'Check counters and timestamps and drop stale frames',
  },
  'downlink-eavesdropping': {
    'stop-clear': 'Stop sending sensitive data in the clear tonight',
  },
  'backhaul-exfil': {
    'link-down': 'Take the unencrypted backhaul link down',
    'reroute': 'Move sensitive traffic off that link',
  },
  'ground-ransomware': {
    'segment-restore': 'Cut the segments apart and restore from offline backups',
  },
  'ops-phishing': {
    'revoke-reset': 'Revoke the session and reset the credential',
  },
  'insider-exfil': {
    'suspend-account': 'Suspend the account and cut its access',
    'limit-audit': 'Limit the account and review the audit log',
  },
  'blackout-chain': {
    'ground-squadron': 'Ground the squadron until GNSS is back',
  },
}
