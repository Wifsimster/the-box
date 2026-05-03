import { test, expect, type APIRequestContext } from '@playwright/test'

// Rate-limit canaries on the public auth endpoints. Three middleware
// mounts in packages/backend/src/index.ts (lines 140-142):
//   /api/auth/forgot-password         5 / 15min per IP
//   /api/auth/send-verification-email 5 / 15min per IP
//   /api/auth/sign-up                 10 / 15min per IP
//
// All three are unauthenticated and IP-keyed (rate-limit.middleware.ts
// :35). Without these limits, a credential-stuffing burst, an account-
// enumeration scrape via reset-password, or a verification-email
// flooding attack would each ship green. The geo free-play test
// already exercises the same pattern (see geo-admin-authz.spec.ts:150)
// — this extends the coverage to the auth surface.
//
// We send invalid bodies on purpose so a request that slips through
// the limiter still gets rejected by validation (400) without creating
// a user or sending an email. The limiter middleware runs BEFORE the
// route handler in index.ts, so once a bucket is full, every
// subsequent request 429s before the handler runs at all.
//
// Re-runs within the 15-minute window stay green: the bucket is
// already at max, so even a single request 429s.

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
        // Better-auth expects `email`. We pass a syntactically valid
        // address that we know isn't seeded, so the worst case (a
        // request that slips through during the first window) returns
        // a generic "if the account exists..." response without
        // mutating state.
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
        // Better-auth's email/password sign-up handler. The rate-limit
        // mount is on /api/auth/sign-up which prefix-matches this path.
        path: '/api/auth/sign-up/email',
        max: 10,
        // Intentionally malformed: missing required fields. The handler
        // will 400 if the limiter passes, so no user is created. We
        // include a unique email so a passing request doesn't collide
        // with seed users.
        body: () => ({ email: `rate-limit-canary-${Date.now()}@invalid.test` }),
        label: 'sign-up',
    },
]

async function authRouteAvailable(request: APIRequestContext, path: string): Promise<boolean> {
    const r = await request.post(path, { data: {}, failOnStatusCode: false })
    // Anything other than 404 means the path is mounted (200, 400,
    // 401, 429 — all confirm "the app handled this").
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

            // Burst. We send max*2 + 1 so even if a previous test run
            // (or a sibling test in the same window) consumed some of
            // the bucket, the limit still trips during this burst. We
            // also stop early on the first 429 to keep the suite fast.
            let saw429 = false
            for (let i = 0; i < ep.max * 2 + 1; i++) {
                const res = await request.post(ep.path, {
                    data: ep.body(),
                    failOnStatusCode: false,
                })
                if (res.status() === 429) {
                    saw429 = true
                    // Cross-check the response shape — the limiter
                    // middleware sets a Retry-After header and returns
                    // a structured error envelope (rate-limit.middleware
                    // .ts:46-52). If a future regression replaces it
                    // with a generic 429 from a CDN, we still pass on
                    // the status but at least notice the body shape
                    // diverged.
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
