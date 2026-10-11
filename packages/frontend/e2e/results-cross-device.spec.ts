import { test, expect, type APIRequestContext } from '@playwright/test'

// Regression: a session finished on device B, then the results page opened
// on device A whose persisted store (localStorage `game-session`) still holds
// the partial score it last saw. The page used to show that stale score and
// rank it with `/leaderboard/today/percentile?score=<stale>`, which counted
// the player's own finished session above them: "Rank #2 of 1 players".
//
// Uses a fresh account so it never touches the shared e2e_user session.
// Device B drives the game over the API (setup only); device A is the real
// results page in a separate browser context (own cookies + localStorage).

const ORIGIN = 'http://localhost:5173'
const PASSWORD = 'SecurePass123!'
const GAME_NAMES = ['E2E Test Game 1', 'E2E Test Game 2', 'E2E Test Game 3']

async function api<T>(request: APIRequestContext, method: 'get' | 'post', path: string, data?: unknown): Promise<T> {
  const res = await request[method](path, { data, headers: { Origin: ORIGIN }, failOnStatusCode: false })
  expect(res.ok(), `${method.toUpperCase()} ${path} -> ${res.status()} ${await res.text()}`).toBe(true)
  const body = (await res.json()) as { data?: T } & T
  return (body.data ?? body) as T
}

test.describe('Results page — session finished on another device', () => {
  test('shows the server score and a coherent rank, not the stale local state', async ({ browser }) => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    const email = `xdevice${stamp}@test.local`
    const username = `xdev${stamp}`.slice(0, 20)

    // ---- Device B: register, play one correct guess, end the session ----
    const deviceB = await browser.newContext()
    const b = deviceB.request
    await api(b, 'post', '/api/auth/sign-up/email', { email, password: PASSWORD, name: username, username })

    const today = await api<{ challengeId: number; date: string }>(b, 'get', '/api/game/today')
    const started = await api<{ sessionId: string; tierSessionId: string; totalScreenshots: number }>(
      b, 'post', `/api/game/start/${today.challengeId}`,
    )
    const shot = await api<{ screenshotId: number }>(
      b, 'get', `/api/game/screenshot?sessionId=${started.sessionId}&position=1`,
    )
    let correct = false
    for (const guessText of GAME_NAMES) {
      const r = await api<{ isCorrect: boolean }>(b, 'post', '/api/game/guess', {
        tierSessionId: started.tierSessionId,
        screenshotId: shot.screenshotId,
        position: 1,
        guessText,
        roundTimeTakenMs: 1500,
      })
      if (r.isCorrect) { correct = true; break }
    }
    expect(correct, 'one of the seeded E2E game names must match position 1').toBe(true)
    const ended = await api<{ totalScore: number }>(b, 'post', '/api/game/end', { sessionId: started.sessionId })
    const serverScore = ended.totalScore
    expect(serverScore).toBeGreaterThan(1)
    await deviceB.close()

    // ---- Device A: same account, stale persisted store from before B finished ----
    // A stale score below every ranked session is the case that produced
    // "Rank #N+1 of N".
    const staleScore = 1
    const deviceA = await browser.newContext()
    await api(deviceA.request, 'post', '/api/auth/sign-in/email', { email, password: PASSWORD })
    await deviceA.addInitScript(
      ([sessionId, tierSessionId, challengeId, challengeDate, totalScreenshots, totalScore]) => {
        if (localStorage.getItem('game-session')) return
        localStorage.setItem('game-session', JSON.stringify({
          state: {
            sessionId, tierSessionId, challengeId, challengeDate, totalScreenshots, totalScore,
            positionStates: {}, currentPosition: 2, screenshotsFound: 1,
            guessResults: [], positionAttempts: {},
          },
          version: 0,
        }))
      },
      [started.sessionId, started.tierSessionId, today.challengeId, today.date, started.totalScreenshots, staleScore] as const,
    )
    const page = await deviceA.newPage()

    const standingResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/leaderboard/session/${started.sessionId}/standing`),
      { timeout: 15000 },
    ).catch(() => null)
    await page.goto('/en/results')
    const main = page.locator('main')
    await expect(main.getByText(`${serverScore} pts`, { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(main.getByText(`${staleScore} pts`, { exact: true })).toHaveCount(0)

    const rankLine = main.getByText(/^Rank #\d+ of \d+ players$/)
    await expect(rankLine).toBeVisible({ timeout: 15000 })
    const [, rank, total] = (await rankLine.textContent())!.match(/#(\d+) of (\d+)/)!.map(Number)
    expect(rank).toBeLessThanOrEqual(total)
    // The banner shows the server's standing for this session (not one
    // recomputed from a locally cached score).
    const fetched = await standingResponse
    expect(fetched, 'the results page must fetch the session standing').not.toBeNull()
    const fetchedStanding = ((await fetched!.json()) as { data: { rank: number; totalPlayers: number } }).data
    expect(rank).toBe(fetchedStanding.rank)
    expect(total).toBe(fetchedStanding.totalPlayers)

    // API level: the standing comes from the stored score and keeps rank <= total.
    const standing = await api<{ totalScore: number; rank: number; totalPlayers: number; ranked: boolean }>(
      deviceA.request, 'get', `/api/leaderboard/session/${started.sessionId}/standing`,
    )
    expect(standing.totalScore).toBe(serverScore)
    expect(standing.ranked).toBe(true)
    expect(standing.rank).toBeLessThanOrEqual(standing.totalPlayers)

    // The bare-score endpoint must keep the invariant too.
    const bare = await api<{ rank: number; totalPlayers: number }>(
      deviceA.request, 'get', `/api/leaderboard/today/percentile?score=${staleScore}`,
    )
    expect(bare.rank).toBeLessThanOrEqual(bare.totalPlayers)

    // The stale local score is reconciled with the server record.
    await expect
      .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('game-session') ?? '{}')?.state?.totalScore))
      .toBe(serverScore)

    await deviceA.close()
  })
})
