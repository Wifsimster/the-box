# Achievements

Players unlock achievements (first guess, first correct, no hints needed, podium, …) as a side effect of playing. The unlock is pushed in real time as an "Achievement Unlocked!" toast over the socket.io `/notifications` namespace. The achievements are then listed on the player's own profile (Overview tab).

## Sub-features

- `ach-unlock` awards achievements on a guess or on completion (`user_achievements` rows).
- `ach-toast` shows the real-time "Achievement Unlocked!" toast (socket.io `/notifications`, emitted by `POST /api/game/guess`).
- `ach-list` lists earned and locked achievements on the profile's Overview tab, with the filter tabs `All`, `Unlocked` and `Locked`. There is no category filter.

## How to get to it (user POV)

- Play the daily game: toasts appear top right during and after the game.
- Open the profile (`/en/profile`, user menu `e2e_user` → Profile). The Overview tab (the default) shows the heading `Achievements (59)` and the filter tabs. The Activity tab shows game history, not achievements.

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch` and `$C login`. The fake user has no achievements yet.

- **Unlock.** Run `$C play finish`. Then read the rows: `docker exec thebox-verify-pg psql -U thebox -d thebox -c "select a.key, ua.earned_at from user_achievements ua join achievements a on a.id = ua.achievement_id"`. In the pilot this returned 13 rows; on 2026-10-05 it returned 23 (`first_guess`, `first_correct`, `no_hints_needed`, `podium_finish`, `champion`, …). The count depends on how the game was played.
- **Toast.** The `play-finished.png` / `play-after-pos*.png` screenshots show the "Achievement Unlocked! First Try" toast. For the socket proof, run `$C network-log --filter socket.io`. This needs a daemon from a launch after the WebSocket logging landed: it lists `WS open` on `/socket.io/?EIO=4&transport=websocket` and incoming frames containing the achievement payload.
- **List.** Run `$C goto /en/profile`, `$C snapshot --selector main`, then `$C screenshot --name ach-profile --full-page`. The earned names (for example "No Hints Needed") appear as earned, and the filter tabs read `All 23/59`, `Unlocked 23`, `Locked 36` (with 23 rows).

## Gotchas

- Most unlocks fire at completion (all at the same `earned_at`). One correct guess only unlocks `first_guess` / `first_correct`.
- Toasts disappear after a few seconds. Take the screenshot right after the action (`play` already does).
- The emit goes only to that user's `/notifications` room. A second browser context logged in as someone else must not receive it, which is a useful negative check.
- The public profile `/en/u/:username` does not list achievements. It shows the player's stats and "Recent games" only.
