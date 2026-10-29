import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

interface DailyLoginStatus {
    canClaim: boolean
    currentStreak: number
    todayReward?: { day: number; reward?: { items?: Array<{ itemKey: string; quantity: number }> } }
}

interface InventoryShape {
    powerups?: Record<string, number>
}

async function dailyLoginRouteAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get('/api/daily-login/status', { failOnStatusCode: false })
    return r.status() !== 404
}

test.describe('Daily-login claim — cross-state invariant', () => {
    test('successful claim updates BOTH the daily-login state AND the inventory atomically', async ({
        browser,
        request,
    }) => {
        if (!(await dailyLoginRouteAvailable(request))) test.skip(true, 'daily-login routes not mounted')

        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await loginAsUser(page)

        const statusBeforeRes = await page.request.get('/api/daily-login/status', {
            failOnStatusCode: false,
        })
        expect(statusBeforeRes.status()).toBe(200)
        const statusBefore = ((await statusBeforeRes.json()) as { data: DailyLoginStatus }).data

        if (!statusBefore.canClaim) {
            test.skip(
                true,
                'daily-login already claimed today — re-run npm run e2e:seed in packages/backend to reset',
            )
        }

        const inventoryBeforeRes = await page.request.get('/api/inventory', { failOnStatusCode: false })
        expect(
            inventoryBeforeRes.status(),
            'inventory endpoint should be reachable for an authenticated user',
        ).toBe(200)
        const inventoryBefore = ((await inventoryBeforeRes.json()) as { data: InventoryShape }).data
        const powerupsBefore = inventoryBefore.powerups ?? {}

        const expectedItems = statusBefore.todayReward?.reward?.items ?? []

        const RETIRED_ITEM_KEYS = [
            'hint_year',
            'hint_publisher',
            'hint_developer',
            'hint_genre',
            'timer_extension',
        ]
        for (const item of expectedItems) {
            expect(
                RETIRED_ITEM_KEYS,
                `daily-login granted '${item.itemKey}', a retired legacy key — grant rewiring regressed`,
            ).not.toContain(item.itemKey)
        }
        if (expectedItems.length === 0) {
            test.skip(true, 'today\'s daily reward has no items — cross-state diff would be hollow')
        }

        const claimRes = await page.request.post('/api/daily-login/claim', { failOnStatusCode: false })
        expect(claimRes.status(), 'claim should succeed when canClaim=true').toBe(200)

        const statusAfterRes = await page.request.get('/api/daily-login/status', {
            failOnStatusCode: false,
        })
        const statusAfter = ((await statusAfterRes.json()) as { data: DailyLoginStatus }).data
        expect(
            statusAfter.canClaim,
            'canClaim must flip to false after a successful claim — otherwise UI would show "claim" forever',
        ).toBe(false)
        expect(
            statusAfter.currentStreak,
            'streak must be at least the pre-claim value (incremented by 1 normally; equal if grace-period rules apply)',
        ).toBeGreaterThanOrEqual(statusBefore.currentStreak)

        const inventoryAfterRes = await page.request.get('/api/inventory', { failOnStatusCode: false })
        const inventoryAfter = ((await inventoryAfterRes.json()) as { data: InventoryShape }).data
        const powerupsAfter = inventoryAfter.powerups ?? {}

        for (const item of expectedItems) {
            const before = powerupsBefore[item.itemKey] ?? 0
            const after = powerupsAfter[item.itemKey] ?? 0
            expect(
                after - before,
                `inventory delta for '${item.itemKey}' should be +${item.quantity}, got +${after - before}. Claim updated daily-login state but not inventory — cross-state desync.`,
            ).toBe(item.quantity)
        }

        const reclaimRes = await page.request.post('/api/daily-login/claim', { failOnStatusCode: false })
        expect(
            reclaimRes.status(),
            'a second claim on the same day must be rejected (otherwise inventory would double-grant)',
        ).toBeGreaterThanOrEqual(400)

        await ctx.close()
    })
})
