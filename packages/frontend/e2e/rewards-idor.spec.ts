import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser, loginAsAdmin } from './helpers/game-helpers'

const IDOR_SOURCE_REF = 'milestone:e2e_idor_test_grant'

interface RewardGrant {
    id: string
    sourceRef: string
    unlockedAt: string | null
}

interface UnclaimedResponse {
    success: boolean
    data: RewardGrant[]
}

async function rewardsRouteAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get('/api/rewards/unclaimed', { failOnStatusCode: false })
    return r.status() !== 404
}

test.describe('Rewards IDOR boundary on /api/rewards/:id/claim', () => {
    test('user B (admin) cannot claim a reward grant owned by user A', async ({
        browser,
        request,
    }) => {
        if (!(await rewardsRouteAvailable(request))) test.skip(true, 'rewards routes not mounted')

        const ctxA = await browser.newContext()
        const pageA = await ctxA.newPage()
        await loginAsUser(pageA)

        const unclaimedRes = await pageA.request.get('/api/rewards/unclaimed', {
            failOnStatusCode: false,
        })
        expect(
            unclaimedRes.status(),
            `user A could not list their own unclaimed rewards (auth or wiring broken)`,
        ).toBe(200)
        const unclaimed = (await unclaimedRes.json()) as UnclaimedResponse
        const seededGrant = unclaimed.data.find((g) => g.sourceRef === IDOR_SOURCE_REF)
        if (!seededGrant) {
            test.skip(
                true,
                `IDOR seed grant ('${IDOR_SOURCE_REF}') missing — re-run npm run e2e:seed in packages/backend`,
            )
        }
        const grantId = seededGrant!.id
        expect(seededGrant!.unlockedAt, 'IDOR seed grant must be unlocked to be claimable').not.toBeNull()
        await ctxA.close()

        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        await loginAsAdmin(pageB)

        const claimRes = await pageB.request.post(`/api/rewards/${grantId}/claim`, {
            failOnStatusCode: false,
        })

        expect(
            claimRes.status(),
            `attacker B successfully claimed user A's grant (got ${claimRes.status()}) — IDOR leak`,
        ).not.toBe(200)
        expect(
            claimRes.status(),
            `cross-user claim returned an unexpected status — expected 404 or 403, got ${claimRes.status()}`,
        ).toBeGreaterThanOrEqual(400)
        expect(claimRes.status()).toBeLessThan(500)

        const ctxA2 = await browser.newContext()
        const pageA2 = await ctxA2.newPage()
        await loginAsUser(pageA2)
        const ownClaimRes = await pageA2.request.post(`/api/rewards/${grantId}/claim`, {
            failOnStatusCode: false,
        })
        expect(
            ownClaimRes.status(),
            `user A could not claim their own grant after attacker attempt — ownership filter is over-strict`,
        ).toBe(200)
        await ctxA2.close()
        await ctxB.close()
    })

    test('unauthenticated POST to /api/rewards/:id/claim is rejected (no IDOR via missing session)', async ({
        request,
    }) => {
        if (!(await rewardsRouteAvailable(request))) test.skip(true, 'rewards routes not mounted')

        const fakeUuid = '00000000-0000-0000-0000-000000000000'
        const res = await request.post(`/api/rewards/${fakeUuid}/claim`, {
            failOnStatusCode: false,
        })
        expect(
            res.status(),
            `unauthenticated claim must be rejected before DB lookup (got ${res.status()})`,
        ).toBe(401)
    })
})
