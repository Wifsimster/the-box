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
- Backend server is running: `npm run dev:backend` (in root directory)
- Database is seeded with test data if needed
- Port 5173 is available (or update `playwright.config.ts`)

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

## Test Data

Tests use dynamically generated data with timestamps to avoid conflicts:
- Username: `testuser{timestamp}`
- Email: `testuser{timestamp}@example.com`
- Password: `SecurePass123!`

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
