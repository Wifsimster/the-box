import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser, loginAsAdmin } from './helpers/game-helpers'

// Admin geo authz boundary: every /api/admin/geo* endpoint MUST 403 a
// non-admin (and 401 an unauthenticated client). Without this suite, a
// regression that swaps `adminMiddleware` for `authMiddleware` (or for
// `optionalAuthMiddleware`) would ship green and let any logged-in user
// nuke the geo dataset.

// Routes touched by the admin geo UI. Each entry is `{ method, path, body? }`.
// Keep this list grouped + commented so the next person adding a route
// remembers to extend it.
const ADMIN_GEO_ENDPOINTS: Array<{
    method: 'GET' | 'POST' | 'DELETE'
    path: string
    body?: unknown
}> = [
    // --- /api/admin/geo-fetch (separate router) ---
    { method: 'GET', path: '/api/admin/geo-fetch/status' },
    { method: 'GET', path: '/api/admin/geo-fetch/games' },
    { method: 'POST', path: '/api/admin/geo-fetch/start', body: { all: false } },
    { method: 'POST', path: '/api/admin/geo-fetch/cancel' },
    { method: 'GET', path: '/api/admin/geo-fetch/1' },
    { method: 'POST', path: '/api/admin/geo-fetch/1/retry' },
    { method: 'POST', path: '/api/admin/geo-fetch/1/fandom/retry' },
    { method: 'GET', path: '/api/admin/geo-fetch/1/maps' },
    { method: 'POST', path: '/api/admin/geo-fetch/1/maps/1/select' },
    { method: 'DELETE', path: '/api/admin/geo-fetch/1/cooldown' },

    // --- /api/admin/geo (lives in admin.routes.ts) ---
    { method: 'POST', path: '/api/admin/geo/run' },
    { method: 'POST', path: '/api/admin/geo/run/1' },
    { method: 'POST', path: '/api/admin/geo/run/1/fandom' },
    { method: 'GET', path: '/api/admin/geo/run/state' },
    { method: 'POST', path: '/api/admin/geo/reimport', body: { gameId: 1 } },
    {
        method: 'POST',
        path: '/api/admin/geo/curated/bulk',
        body: { items: [{ gameId: 1, curated: true }] },
    },
    { method: 'DELETE', path: '/api/admin/geo/tombstone/1/fandom' },
    { method: 'DELETE', path: '/api/admin/geo/meta/1' },
    {
        method: 'POST',
        path: '/api/admin/geo/maps/manual',
        body: {
            gameId: 1,
            imageUrl: 'https://example.com/x.png',
            widthPx: 1024,
            heightPx: 1024,
            license: 'CC-BY-4.0',
        },
    },
    {
        method: 'POST',
        path: '/api/admin/geo/maps/wand',
        body: { gameId: 1, wandUrl: 'https://wand.com/maps/x' },
    },
    {
        method: 'POST',
        path: '/api/admin/screenshot-reports/reactivate',
        body: { geoScreenshotCandidateId: 1 },
    },

    // --- destructive nuke endpoint ---
    {
        method: 'POST',
        path: '/api/admin/scraping/reset',
        body: { confirm: 'RESET' },
    },
]

// Probe whether the geo router boots; if the API is missing entirely
// (older backend), skip the suite so the suite stays useful but the
// regression we care about — admin authz being weakened — still trips.
async function geoRoutesAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get('/api/geo/games', { failOnStatusCode: false })
    return r.status() < 500 // 200, 401, 429 — anything that says "I'm here"
}

test.describe('Admin Geo authz boundary', () => {
    test('unauthenticated requests get 401', async ({ request }) => {
        if (!(await geoRoutesAvailable(request))) test.skip(true, 'geo off')
        for (const ep of ADMIN_GEO_ENDPOINTS) {
            const res =
                ep.method === 'GET'
                    ? await request.get(ep.path, { failOnStatusCode: false })
                    : ep.method === 'DELETE'
                        ? await request.delete(ep.path, { failOnStatusCode: false })
                        : await request.post(ep.path, {
                            data: ep.body ?? {},
                            failOnStatusCode: false,
                        })
            // Any of 401 (unauthenticated) or 403 (forbidden) is acceptable;
            // anything else (200, 400, 500) is a regression because the
            // request body could land before the auth check.
            expect(
                [401, 403],
                `${ep.method} ${ep.path} should reject unauthenticated callers (got ${res.status()})`,
            ).toContain(res.status())
        }
    })

    test('a non-admin user gets 403 on every admin geo endpoint', async ({ page, request }) => {
        if (!(await geoRoutesAvailable(request))) test.skip(true, 'geo off')

        // Login as a normal user via UI so cookies flow into the request
        // context for free.
        await loginAsUser(page)
        const failures: string[] = []
        for (const ep of ADMIN_GEO_ENDPOINTS) {
            const res =
                ep.method === 'GET'
                    ? await page.request.get(ep.path, { failOnStatusCode: false })
                    : ep.method === 'DELETE'
                        ? await page.request.delete(ep.path, { failOnStatusCode: false })
                        : await page.request.post(ep.path, {
                            data: ep.body ?? {},
                            failOnStatusCode: false,
                        })
            // A regular user must never reach an admin endpoint. 401 also
            // acceptable (e.g. session expired) but 200/400/500 = leak.
            if (![401, 403].includes(res.status())) {
                failures.push(`${ep.method} ${ep.path} → ${res.status()}`)
            }
        }
        expect(
            failures,
            `Admin geo endpoints leaking to non-admin users:\n${failures.join('\n')}`,
        ).toEqual([])
    })

    // Sanity: a real admin still gets a non-403 (e.g. 200, 400 on missing
    // body) on at least the read endpoints. This prevents accidentally
    // locking out the admin role too.
    test('an admin user is not blanket-forbidden', async ({ page, request }) => {
        if (!(await geoRoutesAvailable(request))) test.skip(true, 'geo off')
        await loginAsAdmin(page)
        const status = await page.request
            .get('/api/admin/geo-fetch/status', { failOnStatusCode: false })
            .then((r) => r.status())
        expect(status).toBe(200)
    })
})

// Public free-play surface: must be rate-limited (429 after a burst) so a
// scraper can't extract every promoted answer in a tight loop. We don't
// require a hard cap here — the test fires a generous burst and asserts
// at least one 429 lands.
test.describe('Public geo free-play rate limit', () => {
    test('free-play guess is rate-limited per IP', async ({ request }) => {
        if (!(await geoRoutesAvailable(request))) test.skip(true, 'geo off')

        // 60 requests to /free-play/guess should exceed the 30/min window.
        // Body is intentionally invalid (so we don't actually consume any
        // application state) but the limiter runs BEFORE the validation
        // middleware so 429 still fires.
        let saw429 = false
        for (let i = 0; i < 60; i++) {
            const r = await request.post('/api/geo/free-play/guess', {
                data: { metaId: 1, geoMapId: 1, guess: { x: 0.5, y: 0.5 } },
                failOnStatusCode: false,
            })
            if (r.status() === 429) {
                saw429 = true
                break
            }
        }
        expect(saw429, 'expected /api/geo/free-play/guess to return 429 within 60 calls').toBe(true)
    })
})
