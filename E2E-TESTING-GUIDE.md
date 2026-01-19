# E2E Testing Guide

This guide explains how to run end-to-end tests for The Box application.

## Prerequisites

Before running E2E tests, ensure you have:

1. ✅ **Docker Desktop** running (for PostgreSQL)
2. ✅ **Node.js 24+** installed
3. ✅ **All dependencies** installed (`npm install` in root)
4. ✅ **Playwright browsers** installed (`npx playwright install` in `packages/frontend`)

## Quick Start (Recommended)

### Windows

```cmd
run-e2e-tests.bat
```

### macOS/Linux

```bash
chmod +x run-e2e-tests.sh
./run-e2e-tests.sh
```

The script will:
- ✅ Start PostgreSQL automatically
- ✅ Check if backend is running
- ✅ Run all E2E tests
- ✅ Open the test report

## Manual Setup (Full Control)

If you prefer to manually control each service:

### Step 1: Start PostgreSQL

```bash
docker-compose up -d
```

Verify it's running:
```bash
docker-compose ps
```

### Step 2: Start Backend (Terminal 1)

```bash
npm run dev:backend
```

Wait until you see:
```
Server listening on port 3000
✓ Socket.IO server initialized
```

### Step 3: Run E2E Tests (Terminal 2)

```bash
# Run all E2E tests
npm run test:e2e -w @the-box/frontend

# Run only daily game tests
cd packages/frontend
npx playwright test e2e/daily-game.spec.ts

# Run in UI mode (interactive)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run in debug mode
npm run test:e2e:debug
```

### Step 4: View Test Report

```bash
cd packages/frontend
npx playwright show-report
```

## Test User Credentials

The tests use these default credentials (can be overridden with environment variables):

### Regular User
- **Email**: `testuser@example.com`
- **Password**: `testpass123`

### Admin User
- **Email**: `admin@example.com`
- **Password**: `admin123`

**Note**: These users must exist in your database. Run the seed command to create them automatically:

```bash
npm run db:seed -w @the-box/backend
```

This runs the `create_test_users.ts` seed file which creates both test users with the credentials above.

## Environment Variables

Create a `.env.test` file in `packages/frontend/`:

```env
TEST_USER_EMAIL=testuser@example.com
TEST_USER_PASSWORD=testpass123
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASSWORD=admin123
```

## Test Suites

### Daily Game Tests (`daily-game.spec.ts`)

23 comprehensive tests covering:
- Game start flow (intro, starting, session loading)
- Gameplay mechanics (navigation, guessing, skipping, hints)
- End game flow (end button, confirmation, results)
- Results page (score, guess results, navigation)
- Error handling (auth, invalid data)
- Mobile responsiveness

### Registration Tests (`registration.spec.ts`)

Validation and registration flow tests.

### Admin User Management Tests (`admin-users.spec.ts`)

Admin panel functionality tests.

## Troubleshooting

### "Backend is not running" Error

**Problem**: Tests fail with login errors or "Server error. Please try again later"

**Solution**:
1. Ensure backend is running: `npm run dev:backend`
2. Check backend is listening on port 3000: `curl http://localhost:3000/api/health`
3. Check backend logs for errors

### "Database connection failed" Error

**Problem**: Backend can't connect to PostgreSQL

**Solution**:
1. Start PostgreSQL: `docker-compose up -d`
2. Verify it's running: `docker-compose ps`
3. Check connection settings in `packages/backend/.env`
4. Run migrations: `npm run db:migrate`

### "Test user not found" Error

**Problem**: Authentication fails because test users don't exist

**Solution**:
1. Run the seed command to create test users: `npm run db:seed -w @the-box/backend`
2. Or register test users manually through `/register` page
3. Use different credentials via environment variables

### Tests Timeout or Hang

**Problem**: Tests wait indefinitely or timeout

**Solution**:
1. Increase timeout in `playwright.config.ts`
2. Check network connectivity
3. Ensure all services are healthy
4. Clear browser state: `rm -rf packages/frontend/test-results`

### "Cannot find module @playwright/test" Error

**Problem**: Playwright not installed

**Solution**:
```bash
cd packages/frontend
npm install
npx playwright install
npx playwright install-deps
```

## CI/CD Integration

For continuous integration environments:

```yaml
# Example GitHub Actions workflow
- name: Start PostgreSQL
  run: docker-compose up -d postgres

- name: Wait for PostgreSQL
  run: |
    until docker-compose exec -T postgres pg_isready; do
      echo "Waiting for PostgreSQL..."
      sleep 2
    done

- name: Start Backend
  run: |
    npm run dev:backend &
    sleep 10

- name: Install Playwright Browsers
  run: |
    cd packages/frontend
    npx playwright install --with-deps chromium

- name: Run E2E Tests
  run: npm run test:e2e -w @the-box/frontend
  env:
    CI: true
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

- name: Upload Test Results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: packages/frontend/playwright-report/
```

## Test Development Tips

### Writing New Tests

1. Create test file in `packages/frontend/e2e/`
2. Use helper functions from `helpers/game-helpers.ts`
3. Follow existing patterns for consistency
4. Generate unique test data to avoid conflicts

### Debugging Tests

```bash
# Run specific test with debug
npx playwright test e2e/daily-game.spec.ts -g "should start game" --debug

# Run in headed mode to see browser
npm run test:e2e:headed

# Use UI mode for interactive debugging
npm run test:e2e:ui
```

### Helper Functions

Use helpers from `e2e/helpers/game-helpers.ts`:

```typescript
import { loginAsUser, startDailyGame, submitGuess } from './helpers/game-helpers'

test('my test', async ({ page }) => {
  await loginAsUser(page)
  await page.goto('/en/play')
  await startDailyGame(page)
  await submitGuess(page, 'Super Mario Bros')
  // ... assertions
})
```

## Performance Tips

- Run tests in parallel: `npx playwright test --workers=4`
- Run specific browsers: `npx playwright test --project=chromium`
- Use headed mode only when debugging: `--headed`
- Clear test results periodically: `rm -rf test-results`

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Files](./packages/frontend/e2e/)
- [Test Helpers](./packages/frontend/e2e/helpers/)
- [Playwright Config](./packages/frontend/playwright.config.ts)
