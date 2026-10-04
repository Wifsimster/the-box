---
name: verify
description: Launch and drive The Box (daily video-game screenshot guessing web app, React + Express) like a player, on a throwaway local DB with fake users, and capture proof (screenshots, ARIA snapshots, API bodies, DB rows, console/network logs). Use to prove any user-visible change or reproduce a bug before claiming it fixed.
---

# Verify The Box

Primary surface: the web UI at `http://localhost:5173` (Vite dev server, proxies `/api` and `/socket.io` to the backend on `:3000`). Secondary surfaces, not covered by the harness yet: the public API / SSE (`/api/public`), the MCP package `geo-agent-mcp`, and the Remotion package `marketing-video`.

Everything goes through one CLI, `control-thebox`, which prints one JSON object per call (`ok`, data, and on failure `error` + `fix`). Run it from the repo root:

```bash
C=.claude/skills/verify/scripts/control-thebox.mjs   # or: node $C ...
$C --help                 # command list
$C <command> --help       # flags, side effects, what it proves
```

Prerequisites: `npm ci` at the repo root, Docker, and the Playwright Chromium matching the repo's Playwright version (`cd packages/frontend && npx playwright install chromium`). `doctor` reports a missing browser.

## Launch

```bash
$C launch --dry-run   # prints ports, containers and steps; touches nothing
$C launch             # ~15 s warm
```

`launch` does the following, in order:

1. Starts two Docker containers: `thebox-verify-pg` (Postgres 16 on `127.0.0.1:55432`, tmpfs, so the data dies with the container) and `thebox-verify-redis` (`127.0.0.1:56379`). Both carry the label `thebox-verify=1`.
2. Builds `@the-box/types`, then runs `db:migrate` and the repo's own `e2e:seed`. The seed creates the fake users `e2e_user@test.local` / `e2e_admin@test.local` (password `test123`), the games `E2E Test Game 1..3` and today's challenge.
3. Renders 15 fake screenshot PNGs into `uploads/verify-fixtures/` (verification scaffolding; teardown removes it).
4. Starts the backend (`tsx src/index.ts`) and Vite (`--strictPort`) as detached process groups. Logs go to `.verify-run/logs/`.
5. Starts a headless Chromium daemon (CDP on `:9333`) that every later command attaches to. It holds one persistent page and records console, HTTP and WebSocket traffic to JSONL.

`launch` is ready when it returns `"ok": true`, which means it has already waited for `/health`, Vite and the CDP port. It forces `STRIPE_*`, `RESEND_API_KEY`, `RAWG_API_KEY` and `VAPID_*` to empty values and disables the email crons, so nothing reaches a real third party.

Isolation: there is one instance per host. The Vite proxy hardcodes `localhost:3000`, so ports 3000, 5173, 9333, 55432 and 56379 are fixed. `launch` refuses to start when any of them is busy or when `.verify-run/state.json` exists. Never point the CLI at an instance you did not launch. Never run `compose.local.yml` alongside it: that file binds 5432 and 6379, and the host's 5432 already belongs to another project.

## Doctor

```bash
$C doctor   # read-only; exit 0 only if every check passes
```

`doctor` checks:

- the recorded PIDs are alive and the labelled containers are running
- `/healthz` reports `db` and `redis` as true
- Vite answers and the CDP port is open
- the Playwright Chromium is installed
- both fake users and today's challenge exist
- `GET /api/game/preview/image` returns an image (`screenshotsServable`)
- the git SHA of the checkout

Run `doctor` first whenever anything looks off, and read its `hints`.

## Drive

Use roles and accessible names, which come from `packages/frontend/public/locales/en/translation.json`. Find them with `$C snapshot` rather than guessing CSS.

| Goal | Command |
|---|---|
| Log in through `/en/login` (fills the form, dismisses the daily-reward modal) | `$C login [--as user\|admin]` |
| Navigate | `$C goto /en/leaderboard` |
| One guess through the real input (`textbox "Game name..."`, `button "Submit guess"`) | `$C play guess --correct` / `--wrong` / `--answer "<text>"` |
| Play every remaining position to completion | `$C play finish` |
| Add a passkey from Profile → Security, then sign in with it from `/en/login` (CDP virtual authenticator) | `$C passkey add`, then `$C passkey signin` |
| Leaderboard page compared against `GET /api/leaderboard/today` | `$C leaderboard` |
| Click by role and name | `$C click --role button --name "^Skip$"` |
| Keyboard | `$C key Enter` |
| ARIA tree (also saved as `.aria.yml`) | `$C snapshot [--name x] [--selector main]` |
| PNG | `$C screenshot --name x [--full-page]` |
| Browser console since launch | `$C console --level error --last 20` |
| HTTP and WebSocket log | `$C network-log --filter /api/game --status-min 400` / `--filter socket.io` |
| Recorded run, credentials, evidence dir | `$C info` |

Commands with side effects accept `--dry-run`: `launch`, `teardown`, `login`, `click`, `play` and `passkey add|signin`. `play --dry-run` reports the position and the answer it would type. It never clicks Start, because Start inserts a `game_sessions` row, as confirmed by observing the DB during the pilot.

`--correct` reads the right answer for the current position from the throwaway DB. It is a test oracle only: the guess itself is typed and submitted through the UI.

The feature map in [`features/README.md`](features/README.md) has one recipe per feature. A proof that drives one entry point does not cover the others listed there.

## Evidence

- Location: `.verify-evidence/<runId>/` at the repo root (gitignored), or `$THEBOX_EVIDENCE_DIR/<runId>/`. Every screenshot and snapshot is named `<timestamp>_<label>`. `play` writes `play-before-posN.png`, `play-after-posN.png`, and a `.json` holding the API response and the persisted `guesses` row.
- Teardown copies `.verify-run/logs/*.log`, `console.jsonl` and `network.jsonl` into `<runId>/run-logs/` before deleting the scratch state.
- Proof standards:
  - Drive the real user path: the login form, the guess input and the result card. Do not call test-only endpoints or set store state.
  - Capture the action and the resulting state: before/after screenshots plus the HTTP response.
  - Check the side effect with a second read: the `guesses` and `game_sessions` rows, the leaderboard API compared with what the page shows, `user_achievements` rows.
  - For a bug, reproduce it on the same surface first, then show it gone.
- In a git worktree the evidence dies with `git worktree remove`. Copy it, or set `THEBOX_EVIDENCE_DIR` outside the checkout, before removing the worktree.

## Cleanup

```bash
$C teardown --dry-run   # lists PIDs, labelled containers and paths it would remove
$C teardown
```

`teardown` does the following:

- kills only the process groups recorded in `state.json`, never by process name
- removes only containers labelled `thebox-verify=1`
- deletes `uploads/verify-fixtures/` and `.verify-run/`
- reports `portsStillOpen`, which must be empty
- never deletes the evidence

Run it after every failed iteration too, so a broken attempt does not leave processes or ports behind.

## Helpers

- `scripts/control-thebox.mjs` is the only helper. It is a Node ESM script with no dependencies beyond the repo's `@playwright/test`, Docker and `psql` inside the Postgres container. Every subcommand has `--help`.

## Gotchas

- **The 45 s timer per screenshot keeps running while you are idle on `/en/play`.** Leave the page between steps, or a position times out and the input stays disabled (`play` waits up to 15 s for the input, then fails with a hint).
- **A correct guess opens a result card** ("Next Round (4s)", which auto-advances). `play finish` clicks it. If you drive by hand, press `Enter` or click `Next Round`.
- **The leaderboard only lists completed, non-catch-up sessions.** Run `play finish` before `leaderboard`.
- **A "Daily Reward" modal appears after login and on later navigations.** `login`, `play` and `leaderboard` claim or close it. A claim is a real side effect on the fake user's inventory.
- **The UTC day matters.** The seed creates the challenge for the current UTC date. If the date rolls over mid-run, `doctor` fails `todayChallenge`: relaunch.
- **Ports are fixed** (see Isolation). Do not edit the Vite proxy to work around a busy port. Find who owns the port instead.
