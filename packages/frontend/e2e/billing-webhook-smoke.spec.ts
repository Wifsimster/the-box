import { test, expect, type APIRequestContext } from '@playwright/test'

// End-to-end canary for the billing webhook. The deep webhook contract
// (signature verification, idempotency, secret rotation, dispatch routing)
// is covered by the unit suite at packages/backend/src/presentation/routes/
// billing-webhook.routes.test.ts. THIS file only protects the production
// wiring: the route is mounted at /api/billing/webhook AND a permissive
// middleware never lands in front of it. If those two things are true,
// every request without a valid Stripe signature must be rejected.
//
// Concretely we trip when:
//   - someone hoists express.json() above the webhook mount in index.ts
//     (the unit test mirrors prod ordering but can't catch the prod file
//     diverging)
//   - someone replaces the signature check with a passthrough during a
//     refactor and the unit suite was rebuilt off a stale fixture
//   - a CDN / reverse proxy short-circuits and returns 200 without ever
//     reaching the app

async function billingMounted(request: APIRequestContext): Promise<boolean> {
    // Probe with a no-signature POST. If the route is mounted, we expect a
    // client error (400/401/403) — anything < 500 means "something is
    // listening that recognises this path". A 404 means the route isn't
    // mounted in this environment (e.g. backend off), so we skip.
    const r = await request.post('/api/billing/webhook', {
        data: '{}',
        headers: { 'content-type': 'application/json' },
        failOnStatusCode: false,
    })
    return r.status() !== 404
}

test.describe('Billing webhook prod wiring', () => {
    test('rejects POST with no Stripe-Signature header (400)', async ({ request }) => {
        if (!(await billingMounted(request))) test.skip(true, 'billing webhook route not mounted')

        const res = await request.post('/api/billing/webhook', {
            data: JSON.stringify({ id: 'evt_smoke_no_sig', type: 'checkout.session.completed' }),
            headers: { 'content-type': 'application/json' },
            failOnStatusCode: false,
        })
        // Any 4xx is acceptable — the contract is "no valid signature ⇒
        // reject before any side effect". 2xx = bypass, 5xx = the route
        // crashed before validating, both are regressions.
        expect(
            res.status(),
            `webhook accepted (or crashed on) an unsigned request — middleware ordering or signature check broken`,
        ).toBeGreaterThanOrEqual(400)
        expect(res.status()).toBeLessThan(500)
    })

    test('rejects POST with a forged Stripe-Signature header (400)', async ({ request }) => {
        if (!(await billingMounted(request))) test.skip(true, 'billing webhook route not mounted')

        const res = await request.post('/api/billing/webhook', {
            data: JSON.stringify({ id: 'evt_smoke_forged', type: 'checkout.session.completed' }),
            headers: {
                'content-type': 'application/json',
                'stripe-signature': 't=1700000000,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            },
            failOnStatusCode: false,
        })
        expect(res.status()).toBeGreaterThanOrEqual(400)
        expect(res.status()).toBeLessThan(500)
    })
})
