# Premium (Stripe test mode)

Players can subscribe to The Box Premium (monthly or annual) or become a lifetime supporter. The pricing page sends them to Stripe Checkout, Stripe calls back the signed webhook, and the subscription then shows in Profile → Subscription with a "Manage subscription" link to the Billing Portal.

## Sub-features

- `prem-pricing` shows the pricing page with prices from `GET /api/billing/prices` (Stripe lookup keys `the_box_premium_monthly` / `_annual`).
- `prem-checkout` creates a Checkout session (`POST /api/billing/checkout`) and redirects to Stripe.
- `prem-webhook` rejects unsigned calls and applies signed ones to the subscription (`POST /api/billing/webhook`).
- `prem-portal` opens the Billing Portal from the profile (`POST /api/billing/portal`).
- `prem-status` shows the current plan in Profile → Subscription (`GET /api/billing/me`).

## How to get to it (user POV)

- The header navigation link `Premium` (`/en/premium`, also `/fr/abonnement`).
- Profile → Subscription tab (`/en/profile?tab=subscription`).

## Driving it with control-thebox

Preconditions:

- A fresh `$C launch` and `$C login`.
- **No Stripe key.** The harness forces `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to empty. Never paste a live key (`sk_live_`). The Stripe client logs `mode: live|test` from the key prefix.

- **Pricing page renders (safe today).** Run `$C goto /en/premium`, then `$C screenshot --name premium`. The "The Box Premium" title renders. Run `$C network-log --filter /api/billing`: with no key, `/api/billing/prices` returns an error, and the page should show its error or fallback state instead of crashing. Record what it shows.
- **Webhook rejects unsigned calls (safe today).** Run `curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/billing/webhook -H 'content-type: application/json' -d '{}'`. Expect a 4xx and never a 2xx. This mirrors `e2e/billing-webhook-smoke.spec.ts`.
- **Checkout and portal: blocked.** These need a Stripe **test** account: an `sk_test_` key, the two lookup keys configured, and `stripe listen --forward-to localhost:3000/api/billing/webhook` for the webhook secret. Once a human provides those through an env file outside the repo, extend `launch` with an opt-in `--stripe-test` flag that refuses any key not starting with `sk_test_`. Until then, report these sub-features as not verified.

## Gotchas

- `npm run stripe:check` talks to the real Stripe API with whatever key is set. Do not run it from the harness.
- Checkout redirects leave `localhost`. The CDP page will sit on `checkout.stripe.com` until you navigate back with `$C goto`.
- `STRIPE_CHECKOUT_SUCCESS_URL` defaults to production-like URLs in `.env.example`. Set it to `http://localhost:5173/fr/premium?checkout=success` when Stripe test mode is wired.
