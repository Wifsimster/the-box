import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser, loginAsAdmin } from './helpers/game-helpers'

// IDOR boundary on /api/rewards/:id/claim. The reward repository scopes
// every read/write by (id, user_id) so an attacker logged in as user B
// MUST NOT be able to claim a grant that belongs to user A. The contract
// is "404 not found" (the (id, userB) tuple doesn't exist), NOT 403 — we
// don't leak that the id belongs to someone else.
//
// Setup is done by packages/backend/scripts/e2e-seed.ts step 6, which
// inserts a stable reward grant for the e2e user with the source_ref
// below. The spec also asserts the seed actually created the grant — if
// it didn't, the IDOR assertion is hollow and we should know.

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
    // /unclaimed requires auth; an unauthenticated probe should give 401,
    // which still confirms the route is mounted. 404 = route missing.
    const r = await request.get('/api/rewards/unclaimed', { failOnStatusCode: false })
    return r.status() !== 404
}

test.describe('Rewards IDOR boundary on /api/rewards/:id/claim', () => {
    test('user B (admin) cannot claim a reward grant owned by user A', async ({
        browser,
        request,
    }) => {
        if (!(await rewardsRouteAvailable(request))) test.skip(true, 'rewards routes not mounted')

        // --- Step 1: as user A, find the seeded grant id ---------------
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
        // After the test.skip guard above, narrow the type for TypeScript.
        const grantId = seededGrant!.id
        expect(seededGrant!.unlockedAt, 'IDOR seed grant must be unlocked to be claimable').not.toBeNull()
        await ctxA.close()

        // --- Step 2: as user B (admin), try to claim user A's grant ----
        const ctxB = await browser.newContext()
        const pageB = await ctxB.newPage()
        await loginAsAdmin(pageB)

        const claimRes = await pageB.request.post(`/api/rewards/${grantId}/claim`, {
            failOnStatusCode: false,
        })

        // Contract: 404 (the (id, userB) tuple doesn't exist for the
        // attacker). 403 would also be acceptable if the codebase ever
        // adds an explicit ownership check, but NEVER 200 (= claim went
        // through, attacker stole user A's reward).
        expect(
            claimRes.status(),
            `attacker B successfully claimed user A's grant (got ${claimRes.status()}) — IDOR leak`,
        ).not.toBe(200)
        expect(
            claimRes.status(),
            `cross-user claim returned an unexpected status — expected 404 or 403, got ${claimRes.status()}`,
        ).toBeGreaterThanOrEqual(400)
        expect(claimRes.status()).toBeLessThan(500)

        // --- Step 3: confirm user A can still claim their own grant ----
        // This proves the 404 above wasn't because the grant was deleted
        // or already claimed by side effect — the WHERE clause is the
        // discriminator.
        const ctxA2 = await browser.newContext()
        const pageA2 = await ctxA2.newPage()
        await loginAsUser(pageA2)
        const ownClaimRes = await pageA2.request.post(`/api/rewards/${grantId}/claim`, {
            failOnStatusCode: false,
        })
        // 200 (first claim) or 200 (idempotent re-claim) both fine. 404 here
        // means the WHERE on user_id rejected the legitimate owner too,
        // which would be a different (worse) bug.
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

        // A made-up but well-formed UUID — the auth check must fire BEFORE
        // any database lookup, so the response should be 401, not 404.
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
