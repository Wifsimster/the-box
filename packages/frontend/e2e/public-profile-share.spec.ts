import { test, expect, type APIRequestContext } from '@playwright/test'
import { E2E_USER_EMAIL } from './helpers/game-helpers'

const PUBLIC_USERNAME = 'e2e_user'

async function publicProfileApiAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
        failOnStatusCode: false,
    })
    return r.status() !== 404 || (await r.text()).includes('USER_NOT_FOUND')
}

test.describe('Public profile share — API contract', () => {
    test('GET /api/user/public/:username returns 200 in incognito and exposes only whitelisted fields', async ({
        browser,
        request,
    }) => {
        if (!(await publicProfileApiAvailable(request))) test.skip(true, 'public profile route not mounted')

        const ctx = await browser.newContext()
        const res = await ctx.request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
            failOnStatusCode: false,
        })
        expect(res.status(), 'public profile must be reachable without auth').toBe(200)

        const body = (await res.json()) as { success: boolean; data: Record<string, unknown> }
        expect(body.success).toBe(true)
        expect(body.data, 'public profile payload missing').toBeTruthy()

        for (const required of ['username', 'displayName', 'totalScore', 'gamesPlayed']) {
            expect(
                body.data,
                `public profile is missing the '${required}' field — share preview will be empty`,
            ).toHaveProperty(required)
        }

        const payloadJson = JSON.stringify(body.data).toLowerCase()
        expect(
            payloadJson.includes(E2E_USER_EMAIL.toLowerCase()),
            `public profile payload contains the user's email address — GDPR / phishing risk`,
        ).toBe(false)
        for (const forbidden of ['email', 'password', 'role']) {
            expect(
                body.data,
                `public profile payload exposes private field '${forbidden}'`,
            ).not.toHaveProperty(forbidden)
        }

        await ctx.close()
    })

    test('GET /api/user/public/:username returns 404 for an unknown user (and does NOT 500)', async ({
        browser,
        request,
    }) => {
        if (!(await publicProfileApiAvailable(request))) test.skip(true, 'public profile route not mounted')

        const ctx = await browser.newContext()
        const res = await ctx.request.get('/api/user/public/this_user_definitely_does_not_exist', {
            failOnStatusCode: false,
        })
        expect(
            res.status(),
            `unknown public username should 404, got ${res.status()}`,
        ).toBe(404)
        await ctx.close()
    })
})

test.describe('Public profile share — page renders for logged-out visitors', () => {
    test('navigating to /en/u/:username in incognito does NOT redirect to login', async ({ browser }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()

        const probe = await page.request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
            failOnStatusCode: false,
        })
        if (probe.status() !== 200) {
            test.skip(
                true,
                `public profile API not returning 200 for ${PUBLIC_USERNAME} — re-run npm run e2e:seed`,
            )
        }

        await page.goto(`/en/u/${PUBLIC_USERNAME}`)
        await expect(page).not.toHaveURL(/\/login/)

        const usernameLocator = page.locator(`text=${PUBLIC_USERNAME}`).first()
        await expect(usernameLocator).toBeVisible({ timeout: 10_000 })

        const dom = await page.content()
        expect(
            dom.toLowerCase().includes(E2E_USER_EMAIL.toLowerCase()),
            `public profile page renders the user's email — privacy leak`,
        ).toBe(false)

        await ctx.close()
    })
})
