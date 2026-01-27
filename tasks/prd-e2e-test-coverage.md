# PRD: E2E Test Coverage for Regression Prevention

## Introduction

Add comprehensive E2E test coverage using Playwright to prevent regressions on main features of The Box application. This includes tests for critical user paths (authentication, gameplay, results), infrastructure improvements (CI pipeline, test data seeding), and coverage for currently untested features (leaderboards, achievements, daily login rewards, user profile).

## Goals

- Prevent regressions on critical user flows before code reaches production
- Achieve test coverage for all main application features
- Establish reliable CI pipeline with Playwright running on every PR
- Create reproducible test environment with database seeding scripts
- Keep test suite fast by focusing on critical paths (Chromium-only for PRs)

## User Stories

### US-001: Create E2E database seeding script
**Description:** As a developer, I need a script to reset and seed the database with test data so that E2E tests run in a predictable environment.

**Acceptance Criteria:**
- [ ] Create `packages/backend/scripts/e2e-seed.ts` script
- [ ] Script creates test users: `e2e_user@test.local` (password: `test123`) and `e2e_admin@test.local` (password: `test123`)
- [ ] Script creates a daily challenge for today with at least 10 screenshots
- [ ] Script can be run via `npm run e2e:seed` from backend package
- [ ] Script is idempotent (can run multiple times safely)
- [ ] Typecheck passes

### US-002: Add authentication E2E tests (login flow)
**Description:** As a QA engineer, I want login flow tests so that authentication regressions are caught automatically.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/auth.spec.ts`
- [ ] Test: displays login form with email and password fields
- [ ] Test: successful login redirects to home page
- [ ] Test: shows error for invalid credentials
- [ ] Test: shows error for non-existent user
- [ ] Test: logout clears session and redirects to home
- [ ] All tests use seeded `e2e_user@test.local` account
- [ ] Typecheck passes

### US-003: Add authentication E2E tests (password reset flow)
**Description:** As a QA engineer, I want password reset flow tests so that forgot password functionality is verified.

**Acceptance Criteria:**
- [ ] Add tests to `packages/frontend/e2e/auth.spec.ts`
- [ ] Test: forgot password page displays email input
- [ ] Test: submitting valid email shows success message
- [ ] Test: submitting invalid email format shows validation error
- [ ] Typecheck passes

### US-004: Add leaderboard E2E tests
**Description:** As a QA engineer, I want leaderboard tests so that ranking display regressions are caught.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/leaderboard.spec.ts`
- [ ] Test: leaderboard page loads and displays player rankings
- [ ] Test: can switch between daily and monthly leaderboard tabs
- [ ] Test: current user is highlighted if on leaderboard
- [ ] Test: leaderboard shows rank, username, and score columns
- [ ] Typecheck passes

### US-005: Add achievements E2E tests
**Description:** As a QA engineer, I want achievement display tests so that the achievements page works correctly.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/achievements.spec.ts`
- [ ] Test: achievements page loads for logged-in user
- [ ] Test: displays locked and unlocked achievements
- [ ] Test: achievement cards show name, description, and unlock status
- [ ] Test: redirects to login if not authenticated
- [ ] Typecheck passes

### US-006: Add daily login rewards E2E tests
**Description:** As a QA engineer, I want daily login reward tests so that the reward claim flow works correctly.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/daily-login.spec.ts`
- [ ] Test: daily reward modal appears after login (if reward available)
- [ ] Test: can claim daily reward by clicking claim button
- [ ] Test: modal shows streak information
- [ ] Test: modal can be closed
- [ ] Typecheck passes

### US-007: Add user profile E2E tests
**Description:** As a QA engineer, I want profile page tests so that user stats display correctly.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/profile.spec.ts`
- [ ] Test: profile page loads and displays user info (username, avatar)
- [ ] Test: displays total score and streak information
- [ ] Test: displays achievement count
- [ ] Test: redirects to login if not authenticated
- [ ] Typecheck passes

### US-008: Add game history E2E tests
**Description:** As a QA engineer, I want game history tests so that past game display works correctly.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/history.spec.ts`
- [ ] Test: history page loads for logged-in user
- [ ] Test: displays list of past games with dates and scores
- [ ] Test: can click on a game to see details
- [ ] Test: shows empty state when no history
- [ ] Typecheck passes

### US-009: Update CI workflow for mandatory E2E tests
**Description:** As a developer, I want E2E tests to be required to pass on PRs so that regressions are blocked.

**Acceptance Criteria:**
- [ ] Update `.github/workflows/ci.yml` to remove `continue-on-error: true` from e2e job
- [ ] E2E tests run with Chromium only on regular PRs
- [ ] Add database seeding step before E2E tests
- [ ] Typecheck passes

### US-010: Add full browser matrix for release branches
**Description:** As a developer, I want full browser coverage on release branches so that cross-browser issues are caught before release.

**Acceptance Criteria:**
- [ ] Create `.github/workflows/e2e-full.yml` for full browser matrix
- [ ] Runs on pushes to `main` and `release/*` branches
- [ ] Tests run on Chromium, Firefox, and WebKit
- [ ] Uploads test artifacts for all browsers
- [ ] Typecheck passes

### US-011: Add shared test fixtures and helpers
**Description:** As a developer, I need shared fixtures so that tests are DRY and maintainable.

**Acceptance Criteria:**
- [ ] Create `packages/frontend/e2e/fixtures/auth.fixture.ts` with authenticated page fixture
- [ ] Update existing helpers in `helpers/game-helpers.ts` to use E2E seeded users
- [ ] Add `TEST_E2E_USER_EMAIL` and `TEST_E2E_ADMIN_EMAIL` environment variables
- [ ] Document fixtures in `packages/frontend/e2e/README.md`
- [ ] Typecheck passes

### US-012: Update Playwright config for E2E environment
**Description:** As a developer, I need Playwright configured for reliable E2E testing.

**Acceptance Criteria:**
- [ ] Update `packages/frontend/playwright.config.ts` with E2E environment variables
- [ ] Add globalSetup for database seeding (optional, can also run manually)
- [ ] Configure test timeout appropriate for CI (30 seconds)
- [ ] Ensure screenshots and traces are captured on failure
- [ ] Typecheck passes

## Functional Requirements

- FR-1: E2E seed script must create deterministic test data with known credentials
- FR-2: All E2E tests must use seeded test users, not create new users dynamically
- FR-3: Authentication tests must verify login, logout, and password reset flows
- FR-4: Leaderboard tests must verify both daily and monthly rankings display
- FR-5: Achievement tests must verify locked/unlocked states display correctly
- FR-6: Daily login tests must verify reward modal and claim functionality
- FR-7: Profile tests must verify user stats and achievement summary
- FR-8: History tests must verify past game listing and detail navigation
- FR-9: CI must run E2E tests and fail the build if tests fail
- FR-10: Release branches must run full browser matrix (Chromium, Firefox, WebKit)

## Non-Goals

- Visual regression testing (screenshot comparison) - can be added later
- Performance testing or load testing
- Mobile viewport tests beyond basic responsiveness
- Testing every edge case - focus on happy paths for critical features
- Testing admin panel extensively (basic coverage exists)
- Testing static pages (FAQ, Terms, Privacy, etc.)

## Technical Considerations

- Use existing `game-helpers.ts` patterns for new helper functions
- Leverage Playwright's built-in fixtures for authenticated states
- Database seeding runs via backend script, not Playwright globalSetup (more reliable)
- Tests should be independent and not rely on order of execution
- Use Page Object Model pattern if tests become complex (not required initially)
- CI workflow uses `npm run e2e:seed` before running tests

## Success Metrics

- All critical user paths have E2E test coverage
- E2E tests complete in under 5 minutes on CI (Chromium only)
- Zero flaky tests (tests pass consistently on retry)
- PRs cannot merge if E2E tests fail
- Release branches verified on all 3 major browsers

## Open Questions

- Should we add test coverage reports to PRs (e.g., via comments)?
- Should we implement test parallelization across multiple CI workers?
- Do we need to test Socket.io real-time updates for leaderboards?
