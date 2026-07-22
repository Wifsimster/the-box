import { test, expect, type Page } from '@playwright/test'

/**
 * Regression: end-of-game dialog ordering on the last-needed screenshot.
 *
 * Bug: when the player made the final correct guess while skipped positions
 * still remained, the game set `gamePhase='result'` (the per-screenshot
 * ResultCard, z-40) AND `showCompletionChoice=true` (the CompletionChoiceModal,
 * a z-50 portal) at the same time. The modal rendered on top of the result
 * card, so the player could never see whether that last guess was correct.
 *
 * Fix: the result card is shown FIRST (queued via `pendingCompletionChoice`);
 * the completion-choice modal only opens once the player advances from the
 * result. This spec asserts that ordering.
 *
 * The daily-game backend (challenge / session / screenshot / guess) is fully
 * network-mocked so the test is deterministic and runs against the frontend
 * dev server alone — no Postgres/Redis/backend required. The completion-choice
 * scenario ("visited all positions, one still skipped, last guess correct") is
 * seeded through the dev-only `window.__gameStore` test seam.
 */

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const FAKE_USER = {
  id: 'e2e-completion-user',
  email: 'completion@test.local',
  name: 'Completion Tester',
  username: 'completion',
  displayName: 'Completion Tester',
  emailVerified: true,
  image: null,
  role: 'user',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
}

const CORRECT_GAME = {
  id: 42,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3',
  aliases: ['Witcher 3'],
  releaseYear: 2015,
  developer: 'CD Projekt Red',
  publisher: 'CD Projekt',
}

function jsonOk(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data }),
  }
}

async function mockDailyGameBackend(page: Page) {
  const today = new Date().toISOString().slice(0, 10)

  // Better Auth session — a logged-in user so the guest gate never appears.
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          id: 'sess-1',
          userId: FAKE_USER.id,
          token: 'tok',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
        user: FAKE_USER,
      }),
    })
  )

  // Today's challenge exists; no prior session → fresh start via the intro.
  await page.route('**/api/game/today*', (route) =>
    route.fulfill(
      jsonOk({
        challengeId: 1,
        date: today,
        totalScreenshots: 10,
        hasPlayed: false,
        userSession: null,
      })
    )
  )

  // Start the challenge session.
  await page.route('**/api/game/start/*', (route) =>
    route.fulfill(
      jsonOk({
        sessionId: 'sid-1',
        tierSessionId: 'tsid-1',
        totalScreenshots: 10,
        sessionStartedAt: `${today}T00:00:00.000Z`,
      })
    )
  )

  // Any screenshot request → a valid response for the requested position.
  await page.route('**/api/game/screenshot*', (route) => {
    const url = new URL(route.request().url())
    const position = Number(url.searchParams.get('position') ?? '1')
    route.fulfill(
      jsonOk({
        screenshotId: 1000 + position,
        position,
        imageUrl: TRANSPARENT_PNG,
        timeLimitSeconds: 45,
      })
    )
  })

  // Every guess is correct but the session is NOT complete (a skipped position
  // still remains) — exactly the state that used to stack the two dialogs.
  await page.route('**/api/game/guess', (route) =>
    route.fulfill(
      jsonOk({
        isCorrect: true,
        correctGame: CORRECT_GAME,
        scoreEarned: 100,
        totalScore: 900,
        screenshotsFound: 9,
        nextPosition: 10,
        isCompleted: false,
        matchPrecision: 'exact',
      })
    )
  )
}

/**
 * Seed the "visited all positions, one still skipped" state directly on the
 * store, keeping the CURRENT position (1) in progress so the next guess is the
 * final correct one that triggers the completion choice.
 */
async function seedAllVisitedOneSkipped(page: Page) {
  await page.evaluate(() => {
    const store = (
      window as unknown as {
        __gameStore?: { setState: (s: Record<string, unknown>) => void }
      }
    ).__gameStore
    if (!store) throw new Error('window.__gameStore is not exposed')

    const positionStates: Record<number, unknown> = {
      1: { position: 1, status: 'in_progress', isCorrect: false },
      10: { position: 10, status: 'skipped', isCorrect: false },
    }
    for (let i = 2; i <= 9; i++) {
      positionStates[i] = { position: i, status: 'correct', isCorrect: true }
    }

    store.setState({
      currentPosition: 1,
      totalScreenshots: 10,
      positionStates,
    })
  })
}

test.describe('End-of-game dialog ordering', () => {
  test('shows the last result before the completion choice (not stacked)', async ({
    page,
  }) => {
    await mockDailyGameBackend(page)

    await page.goto('/en/play')

    // Start the daily game from the intro screen.
    const startButton = page.getByRole('button', {
      name: /start|commencer|play/i,
    })
    await expect(startButton).toBeVisible({ timeout: 15000 })
    await startButton.click()

    // Wait until we're actually in the playing phase with a screenshot loaded.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __gameStore?: { getState: () => { gamePhase: string } }
                }
              ).__gameStore?.getState().gamePhase
          ),
        { timeout: 15000 }
      )
      .toBe('playing')

    // Seed the completion-choice scenario, then make the final correct guess.
    await seedAllVisitedOneSkipped(page)

    const guessInput = page.getByPlaceholder(/game name/i).first()
    await expect(guessInput).toBeEnabled()
    await guessInput.fill('The Witcher 3')
    await page.getByRole('button', { name: /submit guess/i }).click()

    // 1) The per-screenshot result appears first and clearly shows the outcome.
    const resultDialog = page.getByRole('dialog', { name: /round result/i })
    await expect(resultDialog).toBeVisible()
    await expect(resultDialog.getByText(/correct/i).first()).toBeVisible()

    // 2) The completion-choice modal is NOT stacked on top of the result — the
    //    regression assertion: its title must be absent while the result shows.
    const completionTitle = page.getByText('Nice Work!', { exact: true })
    await expect(completionTitle).toBeHidden()

    // 3) Advancing from the result reveals the completion-choice modal.
    await resultDialog.getByRole('button', { name: /continue/i }).click()

    await expect(completionTitle).toBeVisible()
    await expect(
      page.getByRole('button', { name: /see results/i })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /continue playing/i })
    ).toBeVisible()

    // 4) The result card is gone once the choice modal is up (clean hand-off).
    await expect(resultDialog).toBeHidden()
  })
})
