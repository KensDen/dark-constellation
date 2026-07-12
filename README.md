# DARK CONSTELLATION

![Split-sphere key art banner](public/readme-banner.webp)

A turn-based space and drone cybersecurity strategy sim. Fully client-side, deployed as a static site on GitHub Pages.

Play it: https://kensden.github.io/dark-constellation/

Status: Round 2, visual identity. Phosphor terminal chrome over the R1 playable skeleton: committed SVG assets (wordmark, event-vector icons, layer badges), the owner-supplied split-sphere hero, hero-derived state colors (blue for friendly and defense, magenta for hostile and threat), and a live three.js constellation on the title screen.

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

Runs typecheck, production build, the determinism and content test suites, and repo hygiene checks. Must be green before a round closes.

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
