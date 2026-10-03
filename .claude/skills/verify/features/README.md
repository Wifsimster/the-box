# The Box verification map

This directory is the maintained source for verifying the user-visible behavior of The Box. Read this index before driving the app, then use the matching feature file as the recipe. `C=.claude/skills/verify/scripts/control-thebox.mjs` throughout.

## Baseline preconditions

- `$C launch` has returned `"ok": true` and `$C doctor` exits 0.
- The database is the throwaway `thebox-verify-pg` container, seeded by `npm run e2e:seed`. It contains the fake users `e2e_user@test.local` / `e2e_admin@test.local` (password `test123`), the games `E2E Test Game 1..3` (5 fixture screenshots each), and one challenge for today's UTC date with 10 positions.
- Stripe, Resend, RAWG and VAPID keys are empty. No real third party is reachable from this instance.
- Never drive an instance that this run did not start.

## Driving conventions

- Start every recipe from a fresh `launch` unless its preconditions say otherwise. A finished daily game cannot be replayed on the same DB.
- Prefer ARIA roles and accessible names (`$C snapshot` shows them) over CSS. Labels come from `packages/frontend/public/locales/en/translation.json`. Use the `/en/...` routes so the names are English.
- Every command is literal: keep quoted names and flags unchanged.
- Use `--dry-run` first on anything that writes, when you only need to know what would happen.

## Proof and skip reporting

- Capture the user action and the resulting state: a before/after screenshot plus the HTTP response, not just the final screen.
- Every mutation needs a second, read-only view: a DB row (`docker exec thebox-verify-pg psql -U thebox -d thebox -c ...`), the API, or another page.
- Record the feature ID and entry point with every artifact. Evidence lives in `.verify-evidence/<runId>/`.
- An entry point you could not reach is reported with the command attempted and the unmet precondition, never as verified through another path.

## Feature entry contract

Each feature file has an H1 and one paragraph, then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-thebox` (opens with `Preconditions:`), `Gotchas`.

## Features

- [Daily guess](./daily-guess.md) covers the classic daily challenge: start, correct and wrong guesses, skip, result card, completion and the results page. **Driven end to end in the pilot run.**
- [Leaderboard](./leaderboard.md) covers the daily and monthly rankings and the player's own rank. **Driven in the pilot run.**
- [Achievements](./achievements.md) covers unlock on guess or completion, the real-time toast over the socket.io `/notifications` namespace, and the profile listing. **DB rows and toast observed in the pilot run.**
- [Auth and passkeys](./auth-passkeys.md) covers email/password login and registration, the TOTP challenge, and passkey enrollment and sign-in. Password login is driven by `$C login`. Passkeys are not driven yet.
- [Premium (Stripe test mode)](./premium-stripe.md) covers the pricing page, checkout redirect and webhook. It is **not drivable** without a Stripe `sk_test_` key. It documents what is safe today.
