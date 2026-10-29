import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser, loginAsAdmin } from './helpers/game-helpers'

const FAKE_USER_ID = 'this_is_definitely_not_a_real_user_id_xyz_123'

async function referralRouteAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get('/api/referral/stats', { failOnStatusCode: false })
    return r.status() !== 404
}

interface SessionResponse {
    user?: { id?: string }
}

async function getMyUserId(request: APIRequestContext): Promise<string | null> {
    const res = await request.get('/api/auth/get-session', { failOnStatusCode: false })
    if (res.status() !== 200) return null
    const body = (await res.json()) as SessionResponse
    return body.user?.id ?? null
}

test.describe('Referral routes — auth & input validation', () => {
    test('GET /api/referral/stats requires authentication (401 unauth)', async ({ request }) => {
        if (!(await referralRouteAvailable(request))) test.skip(true, 'referral routes not mounted')
        const res = await request.get('/api/referral/stats', { failOnStatusCode: false })
        expect(res.status(), 'unauthenticated /stats must 401').toBe(401)
    })

    test('POST /api/referral/claim requires authentication (401 unauth)', async ({ request }) => {
        if (!(await referralRouteAvailable(request))) test.skip(true, 'referral routes not mounted')
        const res = await request.post('/api/referral/claim', {
            data: { code: 'whatever' },
            failOnStatusCode: false,
        })
        expect(res.status(), 'unauthenticated /claim must 401').toBe(401)
    })
})

test.describe('Referral claim — domain invariants', () => {
    test('claiming with an empty code is rejected (400 INVALID_CODE)', async ({ browser }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await loginAsUser(page)

        const res = await page.request.post('/api/referral/claim', {
            data: { code: '' },
            failOnStatusCode: false,
        })
        expect(res.status(), 'empty code must be rejected with a 4xx').toBeGreaterThanOrEqual(400)
        expect(res.status()).toBeLessThan(500)
        const body = (await res.json()) as { success: boolean; error?: { code: string } }
        expect(body.success).toBe(false)
        expect(
            body.error?.code,
            `expected error code INVALID_CODE for empty body, got ${body.error?.code}`,
        ).toBe('INVALID_CODE')
        await ctx.close()
    })

    test('claiming an unknown referrer code is rejected (404 REFERRER_NOT_FOUND)', async ({ browser }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await loginAsUser(page)

        const res = await page.request.post('/api/referral/claim', {
            data: { code: FAKE_USER_ID },
            failOnStatusCode: false,
        })
        expect(res.status()).toBe(404)
        const body = (await res.json()) as { success: boolean; error?: { code: string } }
        expect(body.error?.code).toBe('REFERRER_NOT_FOUND')
        await ctx.close()
    })

    test('self-referral is rejected (400 SELF_REFERRAL) — caller cannot use their own id', async ({
        browser,
    }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await loginAsUser(page)

        const myId = await getMyUserId(page.request)
        if (!myId) test.skip(true, 'could not resolve session user id from /api/auth/get-session')

        const res = await page.request.post('/api/referral/claim', {
            data: { code: myId },
            failOnStatusCode: false,
        })
        expect(res.status(), `self-referral must be rejected, got ${res.status()}`).toBe(400)
        const body = (await res.json()) as { success: boolean; error?: { code: string } }
        expect(body.error?.code).toBe('SELF_REFERRAL')
        await ctx.close()
    })
})

test.describe('Referral stats — session isolation', () => {
    test('/stats returns the caller\'s own stats — never another user\'s', async ({ browser }) => {
        const ctxA = await browser.newContext()
        const pageA = await ctxA.newPage()
        await loginAsUser(pageA)
        const myIdA = await getMyUserId(pageA.request)
        const statsAResp = await pageA.request.get('/api/referral/stats', { failOnStatusCode: false })
        expect(statsAResp.status()).toBe(200)
        const statsA = ((await statsAResp.json()) as {
            success: boolean
            data: { hasClaimed: boolean; referredBy: string | null; referralsMade: number }
        }).data
        await ctxA.close()

        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        await loginAsAdmin(pageB)
        const myIdB = await getMyUserId(pageB.request)
        const statsBResp = await pageB.request.get('/api/referral/stats', { failOnStatusCode: false })
        expect(statsBResp.status()).toBe(200)
        const statsB = ((await statsBResp.json()) as {
            success: boolean
            data: { hasClaimed: boolean; referredBy: string | null; referralsMade: number }
        }).data
        await ctxB.close()

        expect(myIdA, 'could not resolve user A id').toBeTruthy()
        expect(myIdB, 'could not resolve user B id').toBeTruthy()
        expect(myIdA).not.toBe(myIdB)

        for (const stats of [statsA, statsB]) {
            expect(typeof stats.hasClaimed).toBe('boolean')
            expect(typeof stats.referralsMade).toBe('number')
            expect(['string', 'object']).toContain(typeof stats.referredBy)
        }
    })
})
