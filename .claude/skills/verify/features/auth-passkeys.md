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
- **Passkeys: not driven yet.** Headless Chromium has no authenticator. The next step is to add a `passkey` subcommand that creates a CDP virtual authenticator (`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator {protocol: 'ctap2', transport: 'internal', hasUserVerification: true, isUserVerified: true}`) on the daemon page. Then: Security tab → `Add a passkey` → name it → `security.passkey.registerSuccess` toast ("Passkey registered.") → log out → `Sign in with a passkey`. The RP ID is the hostname of `API_URL` (`localhost`) and the origin is `CORS_ORIGIN` (`http://localhost:5173`). Both already match the harness.

## Gotchas

- The submit button regex must be anchored (`^(log ?in|sign in)$`), or it also matches "Sign in with a passkey".
- The auth endpoints are rate limited (see the `auth-rate-limit` spec). Repeated bad-password loops will start returning 429.
- The fake users are inserted directly by `e2e-seed.ts` with a Better Auth-compatible scrypt hash. If Better Auth changes its hash format, `login` fails with 401 while registration still works.
- Logging in shows the daily-login reward modal. `login` claims or closes it, which is a side effect on the fake user.
