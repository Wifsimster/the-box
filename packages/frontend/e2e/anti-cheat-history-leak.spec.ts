import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

// Anti-cheat regression suite for the history-leak vectors found in the
// subagents meeting (PR #260) and patched in the follow-up commit:
//
//   1. POST /api/game/end on a session with zero guesses must be
//      rejected — otherwise the player's own /api/user/history/:id
//      response leaks `unfoundGames` (all 10 game names) for free.
//   2. GET /api/user/public/:username must NOT include `sessionId` in
//      recentSessions — a stranger could otherwise pivot to
//      /api/leaderboard/session/:sessionId.
//   3. The session-detail and history endpoints must send
//      `Cache-Control: no-store` so a proxy can't serve a stale 200
//      across the day boundary while the anti-cheat gate flips.
//
// All tests are API-only (no UI) to stay fast and avoid coupling to the
// changing game UI. They skip cleanly if the relevant route isn't
// mounted — same shape as rewards-idor.spec.ts.

const PUBLIC_USERNAME = 'e2e_user'

async function routeMounted(request: APIRequestContext, path: string): Promise<boolean> {
    const r = await request.get(path, { failOnStatusCode: false })
    return r.status() !== 404 || (await r.text()).length > 0
}

test.describe('Anti-cheat — endGame rejects sessions with no progress', () => {
    test('POST /api/game/end on a freshly-started session returns 400 SESSION_HAS_NO_PROGRESS', async ({
        browser,
        request,
    }) => {
        if (!(await routeMounted(request, '/api/game/today'))) test.skip(true, 'game routes not mounted')

        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await loginAsUser(page)

        // Find today's challenge id. /api/game/today is public-ish but
        // returns the active challengeId we need to start a session.
        const todayRes = await page.request.get('/api/game/today', { failOnStatusCode: false })
        expect(todayRes.status(), 'GET /api/game/today must succeed for an authenticated user').toBe(200)
        const todayBody = (await todayRes.json()) as {
            success: boolean
            data: { challengeId?: number; id?: number }
        }
        const challengeId = todayBody.data.challengeId ?? todayBody.data.id
        expect(challengeId, 'today response must include a challenge id').toBeTruthy()

        // Start a fresh session and immediately try to forfeit it. The
        // server must refuse because no guesses have been submitted yet.
        const startRes = await page.request.post(`/api/game/start/${challengeId}`, {
            failOnStatusCode: false,
        })
        // Start may have already happened in a prior run; tolerate that
        // by reading the existing session id from the response. The new
        // gate fires on guessCount === 0, which is still true if the
        // user only started and never guessed in a previous run too.
        expect(
            [200, 201].includes(startRes.status()),
            `start should succeed, got ${startRes.status()}`,
        ).toBe(true)
        const startBody = (await startRes.json()) as {
            success: boolean
            data: { sessionId: string }
        }
        const sessionId = startBody.data.sessionId
        expect(sessionId, 'start response must include sessionId').toBeTruthy()

        const endRes = await page.request.post('/api/game/end', {
            data: { sessionId },
            failOnStatusCode: false,
        })

        // Either the session is freshly started with 0 guesses (the
        // case we care about — must 400 with SESSION_HAS_NO_PROGRESS)
        // OR a previous test run already completed it (400
        // SESSION_ALREADY_COMPLETED is also acceptable, the cheat path
        // is blocked either way). The forbidden outcome is 200 — that
        // would mean the gate is bypassed and unfoundGames would have
        // leaked.
        expect(
            endRes.status(),
            'endGame on a no-progress session must NOT succeed — unfoundGames would leak today\'s answers',
        ).toBe(400)
        const endBody = (await endRes.json()) as {
            success: boolean
            error?: { code?: string }
        }
        expect(endBody.success).toBe(false)
        expect(
            ['SESSION_HAS_NO_PROGRESS', 'SESSION_ALREADY_COMPLETED'].includes(
                endBody.error?.code ?? '',
            ),
            `unexpected error code: ${endBody.error?.code}`,
        ).toBe(true)

        await ctx.close()
    })
})

test.describe('Anti-cheat — public profile does not leak sessionId', () => {
    test('GET /api/user/public/:username recentSessions never includes sessionId', async ({
        browser,
        request,
    }) => {
        if (!(await routeMounted(request, `/api/user/public/${PUBLIC_USERNAME}`)))
            test.skip(true, 'public profile route not mounted')

        const ctx = await browser.newContext()
        const res = await ctx.request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
            failOnStatusCode: false,
        })
        expect(res.status(), 'public profile must be reachable without auth').toBe(200)

        const body = (await res.json()) as {
            success: boolean
            data: { recentSessions?: Array<Record<string, unknown>> }
        }
        const recent = body.data.recentSessions ?? []

        for (const entry of recent) {
            expect(
                entry,
                'recentSessions entry must NOT expose sessionId — would allow pivot to /api/leaderboard/session/:id',
            ).not.toHaveProperty('sessionId')
        }

        await ctx.close()
    })
})

test.describe('Anti-cheat — Cache-Control no-store on session detail routes', () => {
    test('GET /api/leaderboard/session/:nonexistent responds with Cache-Control: no-store', async ({
        request,
    }) => {
        const res = await request.get('/api/leaderboard/session/00000000-0000-0000-0000-000000000000', {
            failOnStatusCode: false,
        })
        // We don't care if it's 404 / 400 / 403 here — only that the
        // response header is set, so an intermediate proxy can never
        // cache *any* status across the day boundary.
        const cc = res.headers()['cache-control'] ?? ''
        expect(
            cc.includes('no-store'),
            `Cache-Control must include "no-store", got "${cc}"`,
        ).toBe(true)
    })

    test('GET /api/user/public/:username responds with Cache-Control: no-store', async ({
        request,
    }) => {
        const res = await request.get(`/api/user/public/${PUBLIC_USERNAME}`, {
            failOnStatusCode: false,
        })
        const cc = res.headers()['cache-control'] ?? ''
        expect(
            cc.includes('no-store'),
            `Cache-Control must include "no-store", got "${cc}"`,
        ).toBe(true)
    })
})
