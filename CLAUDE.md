# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read AGENTS.md first

`AGENTS.md` at the repo root is the canonical, detailed LLM context file for this project: production topology, all ports/services, nginx routing, secrets rotation procedure, the full deploy checklist, and the microfront migration history. Read it before doing any infra, deploy, or cross-repo work — this file only covers what AGENTS.md doesn't (day-to-day commands and architecture orientation) plus a few things that postdate its last update.

**Known drift from AGENTS.md** (repo has moved past it): a 4th microfront, `late-micro-dashboard` (`/dashboard` route, gated by `RequireAuth`), and the shared `packages/late-theme` package now exist but aren't documented there. `services/deployd/main.py` also grew a live deploy-status dashboard (`dashboard_ws.py`, `dashboard_state.py`, `dashboard_history.py`) not mentioned in AGENTS.md. Trust the code over AGENTS.md when they disagree.

## What this repo is

The React shell (`late-web-ui`) for late.kodingvibes.com plus the Icecast streaming infra and the auto-deploy webhook receiver (`services/deployd`). The shell itself is deliberately thin — it's a router + auth gate + shared chrome (header, MiniPlayer, theme) around three independently-versioned microfronts that live in **separate repos** and are not checked out here: `late-micro-radio`, `late-micro-chat`, `late-micro-dashboard`.

## Commands

All frontend commands run from `late-web-ui/`:

```bash
npm install
npm run dev            # vite dev server, :5173
npm run build          # tsc -b && vite build, writes dist/version.json from src/lib/version.ts
npm run lint           # tsc --noEmit (no eslint configured — this IS the lint step)
npm run test           # vitest run
npm run test:watch     # vitest watch mode
npm run coverage       # vitest run --coverage
npm run coverage:check # coverage with enforced thresholds (lines/statements 70%, functions 70%, branches 60%)
```

Run a single test file: `npx vitest run src/pages/Home.test.tsx` (from `late-web-ui/`).

Theme contrast self-check (standalone script, not wired into any npm script):
```bash
npx tsx packages/late-theme/verify.ts   # WCAG AA check across all accents × light/dark
```

Root `package.json` only has semantic-release scripts (`npm run release`, `npm run release:dry`) — there is no root build/test/lint; everything real lives under `late-web-ui/`.

## Git conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `perf:`, `revert:`, `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `BREAKING CHANGE:` in the footer or `feat!:`/`fix!:` for a major bump. Required for semantic-release to compute the version (see Versioning below) — not just a style preference here.
- **This repo is a fork — contribute via pull request, not a direct push to `main`.** Branch, commit, push the branch, then open a PR into `main`. This overrides the general default of pushing straight to a working branch; other kodingvibes repos may not work this way.
- **No AI attribution, ever.** Never add `Co-Authored-By: Claude` (or any AI) to commits, never add a "Generated with Claude Code" line or similar to PR descriptions, and never credit or mention an AI in commits, PR text, code, comments, or docs.
- **Never open a PR unless explicitly asked to in that turn.** Don't run `gh pr create` proactively — the branch and commits can be ready and pushed; the PR itself waits for an explicit ask.
- **PR descriptions: Spanish, STAR structure.** Write the PR body in Spanish, organized as Situación / Tarea / Acción / Resultado (what prompted the change, what needed to happen, what was actually done, what it fixes or produces). Commit messages themselves stay Conventional Commits (English, as above) — the Spanish/STAR rule is for the PR description only.

## Versioning — never hand-edit

Every managed repo (this one, both micros, both backend services) uses semantic-release keyed off Conventional Commits (`feat:`, `fix:`, `perf:`, `BREAKING CHANGE:`/`!`, `chore:`/`docs:`/etc. for no bump). Never manually bump `package.json` version, `late-web-ui/src/lib/version.ts`, or `CHANGELOG.md` — the `release.yml` workflow does this on push to `main` via `.releaserc.json` (which also runs `scripts/sync-version.js` to keep `late-web-ui/package.json` and `version.ts` in sync with the root version). Write commits so the automation computes the right bump.

## Architecture

### Shell + microfronts, one shared React instance

The shell (`late-web-ui/src`) renders route slots; the actual feature UI for `/icecast`, `/irc`, and `/dashboard` is downloaded and mounted at runtime from separate repos' built bundles (`/micro/{radio,chat,dashboard}/latest/entry.js`). See `late-web-ui/vite.config.ts`'s `microfrontsPlugin` — it reads each micro's `latest.json` at **shell build time** and injects versioned `<script>`/`<link>` tags with a `?v=` cache-busting query into `index.html`. Because that version is baked in at shell build time, **the shell must be rebuilt after every micro deploy** or Safari/iOS can keep serving a stale bundle (see AGENTS.md's "Update notice" section for the full cache story).

React/ReactDOM are never bundled per-microfront — `scripts/extract-vendor.sh` builds one shared `/vendor/vendor.js`, and all three apps resolve `react`/`react-dom` externally against it (see the `external` list in `vite.config.ts`). This is why there's only one React instance in the page and hooks/refs work across microfront boundaries.

Micros signal readiness by setting a global on `window` when their bundle executes (`window.RadioEngine`, `window.ChatEngine` + `window.LateSession`, `window.DashboardEngine` — declared in `late-web-ui/src/types/window.d.ts`). `App.tsx`'s `MicroLoader` polls for the relevant global and shows a spinner until it appears — there's no other "micro is ready" signal.

### Auth

`RequireAuth` (`late-web-ui/src/components/RequireAuth.tsx`) gates `/dashboard` and `/profile`. It installs `window.LateSession` (read by the micros), handles the `?token=`/`?logout=1` SSO callback params, and validates the saved session against `late-auth-service` (`/api/auth/me`, a separate repo/service — see AGENTS.md). `sanitizeNext()` only allows same-origin `?next=` redirect targets to avoid open-redirect via the SSO bridge.

### Theming

`packages/late-theme` is a local (non-npm-published) workspace package aliased as `@late/theme` in both `vite.config.ts` and `vitest.config.ts` (`resolve.alias`, pointing at `../packages/late-theme` — not a real npm link). It exports accent color tokens (`ACCENT_VARS`), CSS (`tokens.css`, `animations.css`), and types. `late-web-ui/src/providers/theme-provider.tsx` applies the active accent/mode as CSS custom properties on `<html>`, persists to `localStorage`, and re-exposes the resolved theme as `window.LateTheme` (plus a `late:theme-change` event) so the microfronts — which each embed the same tokens — can stay in sync with the shell without their own theme provider. Any new accent added to `late-theme/accents.ts` should pass `verify.ts`'s contrast check before use.

### Deploy automation

`services/deployd/main.py` is a FastAPI webhook receiver (production-only; runs as `late-deployd.service`) that listens for GitHub push events on `main` across six repos (this one, two micros, two backend services — see the `REPOS` dict) and runs the matching deploy action per repo. It also serves a small live dashboard over WebSocket (`dashboard_ws.py`/`dashboard_state.py`/`dashboard_history.py`) showing recent deploys. This code only runs on the production host; there's nothing to run locally for it beyond reading/editing the Python.

### `ponytail:` comments

The codebase uses inline `// ponytail: ...` comments to mark a deliberate simplification along with its known ceiling/upgrade path (e.g. polling `window.RadioEngine` every 80ms instead of a proper ready event, single-file contrast check instead of a test suite). Treat these as intentional, documented trade-offs, not TODOs to silently "fix."
