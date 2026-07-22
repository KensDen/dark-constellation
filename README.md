# DARK CONSTELLATION

![Split-sphere key art banner](public/readme-banner.webp)

**A turn-based space and drone cybersecurity strategy sim.** You are the mission assurance
architect for a smallsat constellation and a drone squadron. Design, procure, and harden the
architecture under budget while an adversary campaign escalates across 12 turns.

Play it: https://kensden.github.io/dark-constellation/

Status: v1.0. Feature complete for v1.

## How to play

Each turn you read an intel brief, spend credits on fleet and countermeasures, then watch the
adversary play its hand and see what your posture absorbed. Finish turn 12 with the Mission
Assurance Index at 70 or higher to win; let it collapse, or run the budget below zero, and the
campaign ends early. There is no dominant strategy: coverage, trust, and redundancy trade off
against each other, and the cheap sensor package that saved credits in turn 2 is the one the
supply-chain implant is looking for in turn 5.

## The mechanics in brief

- **Mission Assurance Index.** A weighted blend of Coverage, Link availability, Data integrity,
  and Sensor integrity. It is the score and the loss condition at once.
- **Active conditions.** Jamming, spoofing, eavesdropping, and ransomware do not resolve and
  vanish. They persist for a hidden span, press the meters every turn, and stack.
- **The BLACKOUT CHAIN.** The signature move: deny GNSS so the drones fall back to LiDAR
  odometry, then attack the only sensor they have left. Layered sensing breaks it. Single-sensor
  dependence is a vulnerability an adversary can manufacture on demand.
- **Trust tiers.** Commodity sensor packages are cheap and can host a firmware implant. Assured
  packages cost more and cannot.
- **Deployment lead time.** Satellites take turns to reach orbit and can slip. Buy ahead of the
  threat, not into it.
- **Surge authority and commendations.** Spend a token to clear a condition outright; hold the
  win line under sustained pressure to earn credits, meter recovery, and more authority.
- **Difficulty.** Easy, Standard, and Expert apply documented multipliers to condition pressure
  and the economy. Standard is the tuned campaign.

## The sourcing promise

Every threat in the deck maps to a published framework technique, and every reference was
verified against the live framework site rather than recalled: **18 threat events**, **19
distinct framework techniques** across SPARTA, MITRE ATT&CK, MITRE ATLAS, and an NSA advisory,
**14 cited sources**, and **0 unverified references**. Each of the **12 countermeasures** maps to
its SPARTA countermeasure controls with their published defense-in-depth tiers (**20 distinct
SPARTA CMs**). The in-game GLOSSARY derives all **52 entries** directly from that content data,
with no hand-maintained text.

All organizations, vendors, constellations, and threat actors in the fiction are invented. Where
the scenario is inspired by real incidents, it cites institutional analysis rather than naming
individuals or companies. Only public sources are used.

## Tech notes

- React, TypeScript, Tailwind, Vite. Static build on GitHub Pages.
- **Deterministic engine.** `resolveTurn(state, actions, rng)` is pure: no wall clock, no ambient
  randomness. A seeded PRNG with per-turn streams means the same seed and the same actions always
  produce the same game, which is what makes replays and save codes trustworthy. A committed
  snapshot test guards it.
- **Content is data.** Threats, countermeasures, and scenarios are zod-validated modules. Every
  count shown in the UI derives from that data at build time, and the counts quoted in this README
  are checked against the same data by a test in the battery, so the prose cannot drift from the
  deck.
- **No backend, no telemetry, no analytics, no secrets.** Saves and scores live in your browser's
  local storage. Save codes are portable base64 strings you can paste anywhere. The scoreboard
  and save layers sit behind interfaces so a remote implementation could drop in later, but no
  remote SDK is imported.
- A validation battery gates every round: typecheck and build, determinism and content tests,
  a copy-style scan, a local OPSEC tripwire, and an online link check of every cited source.

## Not in v1

Deliberately out of scope, recorded here as future work:

- Sound design and a sound toggle
- A remote, shared leaderboard
- A daily seeded challenge with shareable results
- A red-teaming crossover scenario, attacking the AI-enabled ground segment

## Credits

Design, code, writing, and direction by Kendall Connell.

**Artwork: AI-generated, human-directed.** The key art, intro, and outcome backdrops were
generated with AI tools under the author's direction and selection. The interface art (wordmark,
event icons, layer badges, constellation frame) was authored as original vector work for this
project.

## Licensing

- **Code: MIT.** Source, build configuration, tests, and tooling. See [LICENSE](LICENSE).
- **Artwork and written content: copyright 2026 Kendall Connell, all rights reserved.** Not
  covered by the MIT license.
- **Display typeface:** a subset of Press Start 2P by CodeMan38, used under the SIL Open Font
  License 1.1. The license travels with the font at
  [src/ui/assets/fonts/OFL.txt](src/ui/assets/fonts/OFL.txt), and ships with the deployed site at
  `/legal/OFL.txt`. Because subsetting makes it a Modified Version, the bundled binary is renamed
  to the neutral family name `DC Display`; the original copyright and Reserved Font Name notice are
  retained verbatim.

## Development

```
npm install
npm run dev
```

### Validation battery

```
node scripts/battery.mjs
```

Runs typecheck, production build, the determinism, content, and persistence test suites, a
copy-style scan, and the online content link check. Must be green before a round closes.

The determinism test replays fixed-seed full games on Standard difficulty and compares a hash of
the event log against the committed snapshot in `tests/determinism.snap.json`. After a deliberate
engine or content change, regenerate it with `UPDATE_SNAPSHOTS=1 npx vitest run` and commit the
diff knowingly.

Balance sweeps (not a pass/fail gate):

```
npm run sweep
```

### OPSEC gate (required before pushing)

A pre-push hook scans everything a push would publish: each outgoing commit's tree content, file
paths, commit message, and author identity, plus pushed ref names, tag objects, and the working
tree. Any deny-listed hit blocks the push.

One-time setup after cloning:

```
git config core.hooksPath scripts/hooks
cp .opsec-terms.example .opsec-terms
```

Then edit `.opsec-terms` and add the private deny-list, one term per line. That file is
git-ignored and must never be committed. The hook fails closed: no deny-list, no entries, no push.

Limits: matching is case-insensitive fixed-string over UTF-8 text. Terms of 4 characters or fewer
match on word boundaries only, so short abbreviations do not false-positive inside base64 hashes.
Binary and non-UTF-8 files are not scanned; keep them out of the repo or review them by hand.
