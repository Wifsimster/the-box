# Leaderboard

Players see today's ranking (and a monthly ranking of players or of countries) of completed daily sessions, ordered by score and then completion time. Logged-in players also see their own position ("You're #1 of 1"). The page is public.

## Sub-features

- `lb-today` lists today's ranking of completed sessions.
- `lb-monthly` lists the monthly ranking (`/api/leaderboard/monthly/:year/:month`).
- `lb-countries` ranks countries by their players' average score this month (`/api/leaderboard/monthly/:year/:month/countries`). A country joins at 5 players.
- `lb-self` shows the logged-in player's own rank banner.
- `lb-public` loads without logging in.
- `lb-guests` counts guests who finished today without an account under the Daily board ("+ 1 guest also played without an account, so they're not ranked."). Guests are never ranked.

## How to get to it (user POV)

- The header navigation link `Results` (`/en/leaderboard`; the page heading is still `Leaderboard`).
- The results page after finishing a game.
- A direct URL: `/en/leaderboard` or `/fr/leaderboard`.

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch` and `$C login`.
- At least one completed session today: run `$C play finish` first, because an unfinished session never appears.

- **Empty state.** Before finishing a game, run `$C leaderboard`. The result has `api.entries: 0`, and the page shows "No results yet" with a `link "Open today's box"` back to `/en`.
- **Ranked.** After `$C play finish`, run `$C leaderboard`. The Daily tab itself fetches `/api/leaderboard/<YYYY-MM-DD>`; `$C leaderboard` compares the page with `/api/leaderboard/today`, which returns the same data. The result has `api.status 200` and `entries: 1`, `sample[0]` shows `username: e2e_user` with `totalScore` matching `session.total_score` from `play finish`, and `visibleOnPage.e2e_user: true`. The screenshot shows "You're #1 of 1" and the score.
- **Monthly.** The tablist shows only `tab "Daily"` and `tab "Monthly"`. Run `$C click --role tab --name "^Monthly$"`, then `$C snapshot --selector main`. The page fetches `/api/leaderboard/monthly/<year>/<month>`, and the panel has a `group "Rank the month by"` with `radio "Players"` (checked) and `radio "Countries"`.
- **Countries.** Run `$C click --role radio --name "^Countries$"` and `$C screenshot --name lb-countries`. The page fetches `/api/leaderboard/monthly/<year>/<month>/countries`. With the seeded data it shows "No country has 5 players this month yet." and a `link "Set my country"` to `/en/profile?tab=account`.
- **Achievements ranking.** It is no longer in the tablist. `$C goto "/en/leaderboard?tab=achievements"` adds and selects `tab "Achievements"` ("Top Achievement Hunters").
- **Public.** Prove it in a logged-out context: either `curl -s localhost:3000/api/leaderboard/today` from the host, or relaunch without running `login`. Then run `$C leaderboard`. The page loads and is not redirected to `/login`.

## Gotchas

- **There is no socket.io push for the leaderboard.** The page fetches REST data on load (see `docs/realtime.md`). To verify "live" behavior, reload and compare.
- Catch-up sessions and anonymous play are excluded from the ranking (`leaderboard.repository.ts`). To see the guest line, finish a game logged out (`play finish` works for a guest): the Daily tab then shows "+ 1 guest also played without an account, so they're not ranked.", and the guest's `/en/results` shows "You'd be #R of N today".
- A dialog (changelog, reward opened from the badge) can cover the page. `$C leaderboard` dismisses it before the screenshot.
