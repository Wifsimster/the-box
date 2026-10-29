import { test, expect } from '@playwright/test'
import { loginAsUser, loginAsAdmin } from './helpers/game-helpers'
import { geoCommunityEnabled } from './helpers/features'

const ADMIN_GEO_ENDPOINTS: Array<{
    method: 'GET' | 'POST' | 'DELETE'
    path: string
    body?: unknown
}> = [
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

    {
        method: 'POST',
        path: '/api/admin/scraping/reset',
        body: { confirm: 'RESET' },
    },
]

test.describe('Admin Geo authz boundary', () => {
    test('unauthenticated requests get 401', async ({ request }) => {
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
            expect(
                [401, 403],
                `${ep.method} ${ep.path} should reject unauthenticated callers (got ${res.status()})`,
            ).toContain(res.status())
        }
    })

    test('a non-admin user gets 403 on every admin geo endpoint', async ({ page }) => {
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
            if (![401, 403].includes(res.status())) {
                failures.push(`${ep.method} ${ep.path} → ${res.status()}`)
            }
        }
        expect(
            failures,
            `Admin geo endpoints leaking to non-admin users:\n${failures.join('\n')}`,
        ).toEqual([])
    })

    test('an admin user is not blanket-forbidden', async ({ page }) => {
        await loginAsAdmin(page)
        const status = await page.request
            .get('/api/admin/geo-fetch/status', { failOnStatusCode: false })
            .then((r) => r.status())
        expect(status).toBe(200)
    })
})

test.describe('Public geo free-play rate limit', () => {
    test('free-play guess requires authentication for anonymous callers', async ({ request }) => {
        if (!(await geoCommunityEnabled(request)))
            test.skip(true, 'community geo surface disabled')

        const r = await request.post('/api/geo/free-play/guess', {
            data: { metaId: 1, geoMapId: 1, guess: { x: 0.5, y: 0.5 } },
            failOnStatusCode: false,
        })
        expect(r.status()).toBe(401)
    })
})
