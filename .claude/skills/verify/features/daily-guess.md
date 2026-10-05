# Daily guess

A player opens today's challenge and identifies the game behind each of 10 screenshots by typing its name. Each screenshot has a 45-second budget. A correct guess shows a result card with points and moves on. A wrong guess keeps the position open. The session ends on the results page once all 10 positions are resolved. A guest can play too, but the intro warns that the score will not be saved; the recipes below use a logged-in player.

## Sub-features

- `guess-start` opens the intro and starts today's session (this creates the session).
- `guess-correct` accepts a correct typed name, scores it, and shows the result card.
- `guess-wrong` rejects a wrong name with 0 points and keeps the position open.
- `guess-skip` moves to another position without answering.
- `guess-timeout` counts the position as a permanent miss when its 45 s budget runs out.
- `guess-complete` ends the session after 10 resolved positions and shows the results summary.

## How to get to it (user POV)

- The header navigation link `Daily Guess` (`/en/play`).
- The home page call to action (`/en`).
- A direct URL: `/fr/play` (French, default locale) or `/en/play`.
- The progress dots (`group "Screenshot progress"`) jump between visited positions.

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch`, and `$C doctor` exits 0.
- `$C login` returned `"ok": true` for `e2e_user@test.local`.

- **Start.** Open the game. Run `$C play guess --correct --dry-run`. On the intro it reports `wouldClickStart: true` and the answer for position 1, without creating a session.
- **Correct guess.** Run `$C play guess --correct`. The JSON shows `response.status 200` with `data.isCorrect: true`, `scoreEarned > 0` and `nextPosition`, and `persistedGuess.is_correct: true`. `play-after-posN.png` shows the "Correct!" result card with "Next Round".
- **Wrong guess.** Run `$C play guess --wrong`. The response has `isCorrect: false` and `scoreEarned: 0`, and `nextPosition` equals the current position. `persistedGuess.guessed_text` is `Definitely Not A Game`. The masked-title hint (`button "After 1 try"`) unlocks after this.
- **Skip.** Run `$C click --role button --name "^Skip$"`, then `$C snapshot --selector main`. The `(current)` progress dot has moved. Skip is hidden on the last screenshot (position 10).
- **Complete.** Run `$C play finish`. Every step reports `isCorrect: true` and `session.is_completed: true`, and `finalUrl` ends with `/en/results`. `play-finished.png` lists all 10 rows with their attempts. The wrong attempt shows struck through.
- **Proof.** Keep the `play-*.png` and `.json` files and the `play-finished.png`. Run a second read: `docker exec thebox-verify-pg psql -U thebox -d thebox -c "select position, guessed_text, is_correct, score_earned from guesses order by id"`.

## Gotchas

- The timer runs while the page sits on `/en/play`. Pause by navigating away (`$C goto /en`). A timed-out position disables the input, and `play` then fails after 15 s with a hint.
- Once today's session is complete it cannot be replayed on the same DB. Relaunch for a fresh one.
- **Known product bug ([#394](https://github.com/Wifsimster/the-box/issues/394), seen 2026-10-05).** When the result card's "Next Round" countdown reaches 0 on its own, the page is replaced by "Oops! Something went wrong" (`useEffectEvent` called during rendering). It hits a lone `play guess --correct` after about 4 s, and can hit `play finish`. Recover with `$C goto /en/play`: the session resumes at the next open position, and `play finish` then completes it. Remove this item once #394 is fixed.
- `--correct` uses the DB as an answer oracle. The guess is still typed into the real input. Never "prove" scoring by POSTing to `/api/game/guess` directly.
- Matching is fuzzy (`matchPrecision` in the response). To test near-misses, use `--answer "e2e test game 1"` and check `matchPrecision`.
