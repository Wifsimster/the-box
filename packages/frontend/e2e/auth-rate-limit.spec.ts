import { test, expect, type APIRequestContext } from '@playwright/test'

interface RateLimitedEndpoint {
    method: 'POST'
    path: string
    max: number
    body: () => unknown
    label: string
}

const ENDPOINTS: RateLimitedEndpoint[] = [
    {
        method: 'POST',
        path: '/api/auth/forgot-password',
        max: 5,
        body: () => ({ email: `rate-limit-canary-${Date.now()}@invalid.test` }),
        label: 'forgot-password',
    },
    {
        method: 'POST',
        path: '/api/auth/send-verification-email',
        max: 5,
        body: () => ({ email: `rate-limit-canary-${Date.now()}@invalid.test` }),
        label: 'send-verification-email',
    },
    {
        method: 'POST',
        path: '/api/auth/sign-up/email',
        max: 10,
        body: () => ({ email: `rate-limit-canary-${Date.now()}@invalid.test` }),
        label: 'sign-up',
    },
]

async function authRouteAvailable(request: APIRequestContext, path: string): Promise<boolean> {
    const r = await request.post(path, { data: {}, failOnStatusCode: false })
    return r.status() !== 404
}

test.describe('Public auth endpoints — rate-limit canaries', () => {
    for (const ep of ENDPOINTS) {
        test(`${ep.label}: a burst of ${ep.max * 2 + 1} requests trips the IP rate-limiter (429)`, async ({
            request,
        }) => {
            if (!(await authRouteAvailable(request, ep.path))) {
                test.skip(true, `${ep.path} not mounted in this backend`)
            }

            let saw429 = false
            for (let i = 0; i < ep.max * 2 + 1; i++) {
                const res = await request.post(ep.path, {
                    data: ep.body(),
                    failOnStatusCode: false,
                })
                if (res.status() === 429) {
                    saw429 = true
                    const retryAfter = res.headers()['retry-after']
                    expect(
                        retryAfter,
                        `429 response missing Retry-After header on ${ep.path}`,
                    ).toBeTruthy()
                    break
                }
            }

            expect(
                saw429,
                `expected at least one 429 within ${ep.max * 2 + 1} requests to ${ep.path}; the rate-limit middleware in index.ts may have been removed or moved below the route handler`,
            ).toBe(true)
        })
    }
})
