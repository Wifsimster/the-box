# E2E Tests with Playwright

This directory contains end-to-end tests for The Box application using Playwright.

## Setup

1. **Install dependencies** (if npm install had issues, run manually):
   ```bash
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   cd packages/frontend
   npx playwright install
   ```

## Running Tests

### Prerequisites

Before running the tests, ensure:
- Database is running: `docker-compose up -d`
- Backend server is running: `npm run dev:backend` (in root directory)
- Database is seeded: `npm run e2e:seed -w @the-box/backend`
- Port 5173 is available (or update `playwright.config.ts`)

The frontend dev server is started automatically by Playwright.

### Run All Tests

```bash
# From the root directory
npm run test:e2e -w @the-box/frontend

# Or from packages/frontend directory
npm run test:e2e
```

### Interactive UI Mode

Run tests with Playwright's interactive UI:

```bash
npm run test:e2e:ui
```

### Headed Mode (See Browser)

Run tests with visible browser:

```bash
npm run test:e2e:headed
```

### Debug Mode

Run tests in debug mode with Playwright Inspector:

```bash
npm run test:e2e:debug
```

### Run Specific Tests

```bash
# Run a specific test file
npx playwright test e2e/registration.spec.ts

# Run a specific test by name
npx playwright test -g "should successfully register a new user"
```

## Test Structure

### Registration Tests (`registration.spec.ts`)

Comprehensive test suite for the user registration flow:

#### Positive Tests
- ✅ Display all form fields correctly
- ✅ Successfully register with valid data
- ✅ Trim whitespace from inputs
- ✅ Navigate between register and login pages

#### Validation Tests
- ✅ Username too short (< 3 chars)
- ✅ Username too long (> 50 chars)
- ✅ Invalid email format
- ✅ Password too short (< 8 chars)
- ✅ Password mismatch
- ✅ Empty required fields

#### Error Handling Tests
- ✅ Duplicate username
- ✅ Duplicate email
- ✅ Submit button disabled during submission

### Daily Game Tests (`daily-game.spec.ts`)

Comprehensive test suite for the daily party game flow:

#### Game Start Flow
- ✅ Display daily intro screen
- ✅ Start game when clicking start button
- ✅ Load existing game session

#### Gameplay Tests
- ✅ Display 10 progress dots
- ✅ Display score
- ✅ Type guesses in input field
- ✅ Submit guesses
- ✅ Skip screenshots
- ✅ Navigate between positions using progress dots
- ✅ Show result card after guessing
- ✅ Display hint buttons (year, publisher)

#### End Game Flow
- ✅ Show end game button after visiting all positions
- ✅ Display confirmation dialog when ending game
- ✅ Navigate to results page after confirming
- ✅ Stay on game page when canceling
- ✅ Fix for stuck state on page 10 (bug fix)

#### Results Page
- ✅ Display final score
- ✅ Display all 10 guess results
- ✅ Show navigation buttons (leaderboard, home)
- ✅ Navigate to leaderboard
- ✅ Navigate to home

#### Error Handling
- ✅ Redirect to login if not authenticated
- ✅ Show error for invalid game data

#### Mobile Responsiveness
- ✅ Display correctly on mobile viewport
- ✅ Interact with game on mobile

### Admin User Management Tests (`admin-users.spec.ts`)

Tests for admin panel user management functionality (see file for details).

## Configuration

The Playwright configuration is in `playwright.config.ts`:

- **Base URL**: `http://localhost:5173`
- **Test Directory**: `./e2e`
- **Browsers**: Chromium, Firefox, WebKit
- **Auto-start dev server**: Yes (configured in webServer)

### Customizing Configuration

Edit `playwright.config.ts` to:
- Change base URL
- Add/remove browsers
- Adjust timeouts
- Configure screenshots and traces
- Update reporter settings

## Test Users

E2E tests use two seeded accounts (created by `npm run e2e:seed`):

| Role  | Email                    | Password |
|-------|--------------------------|----------|
| User  | e2e_user@test.local      | test123  |
| Admin | e2e_admin@test.local     | test123  |

These credentials are defined in:
- `packages/backend/scripts/e2e-seed.ts` - Creates the accounts
- `e2e/helpers/game-helpers.ts` - Helper constants
- `e2e/fixtures/auth.fixture.ts` - User fixture
- `e2e/fixtures/admin.fixture.ts` - Admin fixture

### Environment Variable Overrides

You can override test credentials via environment variables:

```bash
export TEST_USER_EMAIL="custom@example.com"
export TEST_USER_PASSWORD="custompass"
export TEST_ADMIN_EMAIL="admin@example.com"
export TEST_ADMIN_PASSWORD="admin123"
```

## Fixtures

Use Playwright fixtures for tests that require authentication.

### Authenticated User Fixture

```typescript
import { test, expect } from './fixtures/auth.fixture'

test('my authenticated test', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in as e2e_user@test.local
  await authenticatedPage.goto('/en/profile')
  await expect(authenticatedPage.locator('h1')).toBeVisible()
})
```

### Admin User Fixture

```typescript
import { test, expect } from './fixtures/admin.fixture'

test('my admin test', async ({ adminPage }) => {
  // adminPage is already logged in as e2e_admin@test.local
  await adminPage.goto('/en/admin')
  await expect(adminPage.locator('h1')).toBeVisible()
})
```

## Test Helpers

The `helpers/game-helpers.ts` file provides reusable functions for common game operations:

### Authentication Helpers
- `loginAsUser(page)` - Login as regular user
- `loginAsAdmin(page)` - Login as admin
- `registerTestUser(page, username?, email?, password?)` - Register new test user
- `logout(page)` - Logout current user

### Game Flow Helpers
- `waitForGameLoad(page)` - Wait for game to load
- `startDailyGame(page)` - Start game from intro screen
- `navigateToPosition(page, position)` - Navigate to specific position (1-10)
- `visitAllPositions(page)` - Visit all 10 positions
- `submitGuess(page, gameName)` - Submit a guess
- `skipScreenshot(page)` - Skip current screenshot
- `endGame(page, confirm)` - End game with optional confirmation

### Utility Helpers
- `getCurrentScore(page)` - Get current score value
- `isOnPosition(page, position)` - Check current position
- `clickHint(page, 'year' | 'publisher')` - Click hint button

### Example Usage

```typescript
import { test } from '@playwright/test'
import { loginAsUser, startDailyGame, submitGuess } from './helpers/game-helpers'

test('should submit a guess', async ({ page }) => {
  await loginAsUser(page)
  await page.goto('/en/play')
  await startDailyGame(page)
  await submitGuess(page, 'Super Mario Bros')
  // Assert results...
})
```

## Troubleshooting

### Tests fail with "Target closed"
- Ensure backend is running on port 3000
- Check that frontend can connect to backend API

### Tests fail with "Timeout"
- Increase timeout in specific tests if needed
- Check network connectivity
- Verify selectors match your UI

### "Cannot find module '@playwright/test'"
- Run `npm install` in packages/frontend
- Run `npx playwright install`

### Database conflicts (duplicate users)
- Clear test database between runs
- Tests use timestamps to generate unique usernames/emails
- Consider implementing test database cleanup in `beforeEach` hooks

## CI/CD Integration

For CI environments:
- Tests automatically retry 2 times on failure
- Use 1 worker to avoid race conditions
- Screenshots and traces captured on failure
- HTML report generated in `playwright-report/`

### GitHub Actions Example

```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e -w @the-box/frontend
  env:
    CI: true
```

## Writing New Tests

1. Create new `.spec.ts` file in `e2e/` directory
2. Import test utilities:
   ```typescript
   import { test, expect } from '@playwright/test';
   ```
3. Use Playwright's auto-waiting and assertions
4. Follow existing patterns for consistency
5. Generate unique test data to avoid conflicts

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Selectors](https://playwright.dev/docs/selectors)
- [Playwright Assertions](https://playwright.dev/docs/test-assertions)
