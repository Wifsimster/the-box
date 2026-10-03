# Auth and passkeys

Players register and sign in with email and password (Better Auth). They can add TOTP two-factor and passkeys (WebAuthn) from the profile's Security tab, and can sign in with a passkey from the login page. The first registered user of an empty database becomes admin.

## Sub-features

- `auth-login` signs in with email or username and password at `/en/login`.
- `auth-register` creates an account at `/en/register`.
- `auth-logout` signs out from the user menu.
- `auth-totp` enrolls TOTP and answers the challenge at `/en/two-factor`.
- `auth-passkey-add` adds a passkey from Profile → Security (`button "Add a passkey"`).
- `auth-passkey-login` signs in with a passkey from the login page (`Sign in with a passkey`).

## How to get to it (user POV)

- The header `Sign in` link → `/en/login`. The link to `/en/register` sits under the form.
- The user menu (`button "e2e_user"`) → Profile → Security tab (`/en/profile?tab=security`, `data-testid=profile-tab-security`).
- Any protected route (`/en/play`, `/en/profile`) redirects a logged-out visitor to `/en/login`.

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch`. The browser is logged out (fresh profile).

- **Login.** Run `$C login --dry-run`, then `$C login`. The result has `signInStatus: 200` and a `url` no longer ending in `/login`. Confirm with `$C snapshot --selector banner`, which shows `button "e2e_user"`.
- **Bad password.** Run `$C goto /en/login` and fill the form with `$C click`/`$C key`. A dedicated `login --password` flag does not exist yet, so this is a harness gap. The expected result is an alert, a 401 on `/api/auth/sign-in/email` (`$C network-log --filter /api/auth`), and the URL staying on `/en/login`.
- **Admin.** Run `$C login --as admin`, then `$C goto /en/admin`. The admin panel renders. With `--as user` it does not.
- **Add a passkey.** Run `$C login`, then `$C passkey add [--name "<device>"]`. The command attaches a CDP virtual authenticator (`ctap2`, `internal`, resident key, user verified), opens `/en/profile?tab=security`, clicks `button "Add a passkey"`, types the name in `textbox "Device name ..."` and clicks `button "Continue"`. Pass criteria: `verifyRegistrationStatus: 200`, `toastShown: true` ("Passkey registered."), and `dbRows` holds one more `passkey` row than `dbRowsBefore`. Screenshots: `passkey-add-dialog`, `passkey-added` (the list shows the new device name).
- **Sign in with a passkey.** Run `$C passkey signin`. It logs out through the user menu (`button "e2e_user"` → `menuitem "Logout"`) when a session exists, opens `/en/login`, imports the saved credential into a fresh virtual authenticator and clicks `button "Sign in with a passkey"`. Pass criteria: `verifyAuthenticationStatus: 200`, `sessionEmail` equals the fake user (read from `/api/auth/get-session`), the URL left `/login`, and `dbCounterAfter` is `dbCounterBefore + 1`. Screenshots: `passkey-signin-before` (header shows `Login`/`Register`) and `passkey-signin-after` (header shows `e2e_user`).
- **Second read.** Run `$C passkey list` (saved credential ids and DB rows) and `$C network-log --filter /api/auth/passkey`. The log shows `generate-register-options`, `verify-registration`, `generate-authenticate-options` and `verify-authentication`, all 200.
- **Delete.** The trash button (`button "Delete – <name>"`) and its confirm dialog are not wrapped in a command yet. Drive them with `$C click`.

## Gotchas

- The submit button regex must be anchored (`^(log ?in|sign in)$`), or it also matches "Sign in with a passkey".
- The auth endpoints are rate limited (see the `auth-rate-limit` spec). Repeated bad-password loops will start returning 429.
- The fake users are inserted directly by `e2e-seed.ts` with a Better Auth-compatible scrypt hash. If Better Auth changes its hash format, `login` fails with 401 while registration still works.
- Logging in shows the daily-login reward modal. `login` claims or closes it, which is a side effect on the fake user.
- A CDP virtual authenticator dies with the CDP session that created it, and every `control-thebox` call opens its own session. `passkey add` therefore exports the credential (a fake key for the throwaway RP `localhost`) to `.verify-run/passkey-credentials.json`, and `passkey signin` imports it. Teardown deletes the file.
- The server rejects a sign counter that does not increase (`verify-authentication` returns 400): this is the cloned-authenticator check. `passkey signin` saves the bumped counter after each sign-in. If you edit the credential file by hand or reuse an old copy, sign-in fails with 400. That is the product working, not a harness bug.
- `passkey signin` checks the URL and the session. The URL changes before the login card unmounts, so the command waits for `button "Sign in with a passkey"` to detach before it takes the "after" screenshot.
