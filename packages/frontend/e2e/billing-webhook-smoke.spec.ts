import { test, expect, type APIRequestContext } from '@playwright/test'

async function billingMounted(request: APIRequestContext): Promise<boolean> {
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
