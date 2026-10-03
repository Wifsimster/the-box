# Leaderboard

Players see today's ranking (and a monthly ranking) of completed daily sessions, ordered by score and then completion time. Logged-in players also see their own position ("You're #1 of 1"). The page is public.

## Sub-features

- `lb-today` lists today's ranking of completed sessions.
- `lb-monthly` lists the monthly ranking (`/api/leaderboard/monthly/:year/:month`).
- `lb-self` shows the logged-in player's own rank banner.
- `lb-public` loads without logging in.

## How to get to it (user POV)

- The header navigation link `Leaderboard` (`/en/leaderboard`).
- The results page after finishing a game.
- A direct URL: `/en/leaderboard` or `/fr/leaderboard`.

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch` and `$C login`.
- At least one completed session today: run `$C play finish` first, because an unfinished session never appears.

- **Empty state.** Before finishing a game, run `$C leaderboard`. The result has `api.entries: 0`, and the screenshot shows the empty "Today" card.
- **Ranked.** After `$C play finish`, run `$C leaderboard`. The result has `api.status 200` and `entries: 1`, `sample[0]` shows `username: e2e_user` with `totalScore` matching `session.total_score` from `play finish`, and `visibleOnPage.e2e_user: true`. The screenshot shows "You're #1 of 1" and the score.
- **Monthly.** The page has a switch with `Daily`, `Monthly`, `Achievements` and `Panorama` entries. Confirm their roles with `$C snapshot --selector main`. Then run `$C click --role tab --name "^Monthly$"` (use `--role button` if the snapshot shows buttons) and `$C screenshot --name lb-monthly`.
- **Public.** Prove it in a logged-out context: either `curl -s localhost:3000/api/leaderboard/today` from the host, or relaunch without running `login`. Then run `$C leaderboard`. The page loads and is not redirected to `/login`.

## Gotchas

- **There is no socket.io push for the leaderboard.** `docs/realtime.md` describes `join_challenge` and `leaderboard_update` events, but no code emits them (checked 2026-10-03: no `leaderboard_update` in `packages/backend/src` or `packages/frontend/src`). The page fetches REST data on load. To verify "live" behavior, reload and compare. The docs need fixing.
- Catch-up sessions and anonymous play are excluded (`leaderboard.repository.ts`).
- The daily-reward modal can cover the page. `$C leaderboard` dismisses it before the screenshot.
