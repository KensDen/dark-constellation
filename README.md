# DARK CONSTELLATION

![Split-sphere key art banner](public/readme-banner.webp)

A turn-based space and drone cybersecurity strategy sim. Fully client-side, deployed as a static site on GitHub Pages.

Play it: https://kensden.github.io/dark-constellation/

Status: Round 3.25, dynamics. The full threat deck ships with every framework ref and source live-verified, and the round adds persistent conditions (attacks that press for a hidden span and stack), resilience and mitigation commendations, deployment lead times with an in-transit pipeline, spendable surge authority to clear a condition, and three rare opportunity events. Retuned so play is genuinely uncertain: across 300-seed sweeps (npm run sweep) prepared play wins around 83 percent, a reasonable-but-imperfect line lands near 53 percent, and passive play near zero. All counts derive from content data at build time.

All organizations, vendors, and threat actors in the game fiction are original and fictional.

## Stack

Vite, React, TypeScript, Tailwind. No backend, no analytics, no telemetry, no secrets.

## Development

```
npm install
npm run dev
```

## Validation battery

```
node scripts/battery.mjs
```

Runs typecheck, production build, the determinism and content test suites, the content link check (every source URL in the deck must resolve; skips gracefully offline), and repo hygiene checks. Must be green before a round closes.

The determinism test replays fixed-seed full games and compares a hash of the event log against the committed snapshot in `tests/determinism.snap.json`. After a deliberate engine or content change, regenerate it with `UPDATE_SNAPSHOTS=1 npx vitest run` and commit the diff knowingly.

## OPSEC gate (required before pushing)

A pre-push hook scans everything a push would publish: each outgoing commit's tree content, file paths, commit message, and author/committer identity, plus pushed ref names, tag objects, and the current working tree. Any deny-listed hit blocks the push. Run `scripts/hooks/pre-push` directly for a full sweep of local history and refs.

One-time setup after cloning:

```
git config core.hooksPath scripts/hooks
cp .opsec-terms.example .opsec-terms
```

Then edit `.opsec-terms` and add the private deny-list, one term per line. That file is git-ignored and must never be committed. The hook fails closed: no deny-list, no entries, no push.

Limits: matching is case-insensitive fixed-string over UTF-8 text. Terms of 4 characters or fewer match on word boundaries only, so short abbreviations do not false-positive inside base64 hashes. Binary and non-UTF-8 files are not scanned; keep them out of the repo or review them by hand.

## First push checklist

1. Populate `.opsec-terms` with the real deny-list (the starter file holds only a test canary).
2. Confirm `git config user.name` and `git config user.email` are the identity you want published.
3. Enable Pages with the GitHub Actions source, either in the repo settings (Settings, Pages, Source: GitHub Actions) or via `gh api repos/OWNER/dark-constellation/pages -X POST -f build_type=workflow`.
4. Push main. The deploy-pages workflow builds, runs the battery, and publishes.
