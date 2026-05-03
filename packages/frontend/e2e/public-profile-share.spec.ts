import { test, expect, type APIRequestContext } from '@playwright/test'
import { E2E_USER_EMAIL } from './helpers/game-helpers'

// Public profile is the only logged-out share surface in the app
// (`/u/:username`, route declared in App.tsx:156, backed by
// GET /api/user/public/:username in user.routes.ts:16). If a friend
// pastes the URL into Discord and it 500s, redirects to login, or leaks
// a private field in the JSON, the organic-acquisition loop quietly
// stops working — and visual-regression won't catch any of those.
//
// This spec is deliberately conservative on PII assertions: the deeper
// PII audit is tracked in the meeting plan as Vague 3 #11 (pending a
// Leo+Shug pairing on the actual response shape). What we lock in here
// is the *minimum*: the email address must never appear in the public
// payload, and three obvious back-end-only fields must never leak.

const PUBLIC_USERNAME = 'e2e_user'

async function publicProfileApiAvailable(request: APIRequestContext): Promise<boolean> {
    const r = await request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
        failOnStatusCode: false,
    })
    return r.status() !== 404 || (await r.text()).includes('USER_NOT_FOUND')
    // 200 = found, 4xx with USER_NOT_FOUND in body = route mounted but
    // user missing; 404 with empty body = route not mounted at all.
}

test.describe('Public profile share — API contract', () => {
    test('GET /api/user/public/:username returns 200 in incognito and exposes only whitelisted fields', async ({
        browser,
        request,
    }) => {
        if (!(await publicProfileApiAvailable(request))) test.skip(true, 'public profile route not mounted')

        // Use a brand-new context so there is zero session leakage from
        // any other spec. The point of the public route is "works for
        // strangers", so no cookies must be required.
        const ctx = await browser.newContext()
        const res = await ctx.request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
            failOnStatusCode: false,
        })
        expect(res.status(), 'public profile must be reachable without auth').toBe(200)

        const body = (await res.json()) as { success: boolean; data: Record<string, unknown> }
        expect(body.success).toBe(true)
        expect(body.data, 'public profile payload missing').toBeTruthy()

        // Positive assertions: the social-card essentials must be present
        // so a share preview has something to render. We don't assert on
        // the *value* of displayName (translatable / user-editable), only
        // that the field exists.
        for (const required of ['username', 'displayName', 'totalScore', 'gamesPlayed']) {
            expect(
                body.data,
                `public profile is missing the '${required}' field — share preview will be empty`,
            ).toHaveProperty(required)
        }

        // Negative assertions: defensive baseline against accidental leaks.
        // If a future migration adds a field to userRepository.findByUsername
        // that includes one of these, the public endpoint must NOT mirror it.
        // Vague 3 #11 will tighten this list after a payload audit; until
        // then the bare minimum.
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
        // 404 = route worked, told us nothing useful (good). 500 would
        // imply the lookup crashed — failure mode for the share loop is
        // a broken link, not a stack trace.
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

        // Probe the API first; if the user isn't seeded the page renders
        // a not-found state which is a different test case.
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
        // The crucial assertion: we are NOT on /login. A redirect to
        // /login = the page is auth-gated by mistake, killing the share
        // loop for unauthenticated visitors entirely.
        await expect(page).not.toHaveURL(/\/login/)

        // The username should appear somewhere in the DOM (display name
        // or @handle). We assert on the *seeded username* string, not on
        // any translatable label, so this stays FR↔EN safe.
        // Wait briefly for the CSR fetch to complete before asserting.
        const usernameLocator = page.locator(`text=${PUBLIC_USERNAME}`).first()
        await expect(usernameLocator).toBeVisible({ timeout: 10_000 })

        // Defensive: the email must not appear in the rendered DOM.
        const dom = await page.content()
        expect(
            dom.toLowerCase().includes(E2E_USER_EMAIL.toLowerCase()),
            `public profile page renders the user's email — privacy leak`,
        ).toBe(false)

        await ctx.close()
    })
})
