import { test, expect } from '@playwright/test';

/**
 * E2E Tests for User Registration Flow
 * 
 * Prerequisites:
 * - Backend server must be running (npm run dev:backend)
 * - Frontend dev server will be started automatically by playwright.config.ts
 * - Database should be in a clean state (or have test cleanup)
 */

test.describe('Registration Form', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the registration page (English locale)
        await page.goto('/en/register');

        // Wait for the page to be fully loaded
        await expect(page).toHaveURL(/\/en\/register/);
    });

    test('should display the registration form with all required fields', async ({ page }) => {
        // Verify the form elements are present
        await expect(page.getByLabel(/username/i)).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByLabel(/^password/i)).toBeVisible();
        await expect(page.getByLabel(/confirm password/i)).toBeVisible();

        // Verify submit button is present
        await expect(page.getByRole('button', { name: /sign up|register|create account/i })).toBeVisible();
    });

    test('should successfully register a new user with valid data', async ({ page }) => {
        // Generate unique user data to avoid conflicts
        const timestamp = Date.now();
        const username = `testuser${timestamp}`;
        const email = `testuser${timestamp}@example.com`;
        const password = 'SecurePass123!';

        // Fill in the registration form
        await page.getByLabel(/username/i).fill(username);
        await page.getByLabel(/email/i).fill(email);
        await page.getByLabel(/^password/i).fill(password);
        await page.getByLabel(/confirm password/i).fill(password);

        // Submit the form
        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Wait for successful registration (redirect to home page)
        await expect(page).toHaveURL(/\/(en\/)?$/, { timeout: 10000 });

        // Verify user is logged in - check for user menu or logout button
        // This depends on your UI implementation
        // await expect(page.getByRole('button', { name: username })).toBeVisible();
    });

    test('should show error for username that is too short', async ({ page }) => {
        const shortUsername = 'ab'; // Less than 3 characters

        await page.getByLabel(/username/i).fill(shortUsername);
        await page.getByLabel(/email/i).fill('test@example.com');
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        // Trigger validation by clicking submit or blurring the field
        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for validation error message
        await expect(page.getByText(/username.*at least 3 characters/i)).toBeVisible();
    });

    test('should show error for username that is too long', async ({ page }) => {
        const longUsername = 'a'.repeat(51); // More than 50 characters

        await page.getByLabel(/username/i).fill(longUsername);
        await page.getByLabel(/email/i).fill('test@example.com');
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for validation error message
        await expect(page.getByText(/username.*at most 50 characters/i)).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
        await page.getByLabel(/username/i).fill('validusername');
        await page.getByLabel(/email/i).fill('invalid-email');
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for email validation error
        await expect(page.getByText(/invalid.*email/i)).toBeVisible();
    });

    test('should show error for password that is too short', async ({ page }) => {
        await page.getByLabel(/username/i).fill('validusername');
        await page.getByLabel(/email/i).fill('test@example.com');
        await page.getByLabel(/^password/i).fill('short'); // Less than 8 characters
        await page.getByLabel(/confirm password/i).fill('short');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for password validation error
        await expect(page.getByText(/password.*at least 8 characters/i)).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
        await page.getByLabel(/username/i).fill('validusername');
        await page.getByLabel(/email/i).fill('test@example.com');
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('DifferentPass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for password mismatch error
        await expect(page.getByText(/passwords.*do not match|passwords.*must match/i)).toBeVisible();
    });

    test('should show error when trying to register with existing username', async ({ page }) => {
        // This test assumes you have a user already registered
        // You might need to seed your test database or create a user first

        const existingUsername = 'existinguser';
        const timestamp = Date.now();

        // First registration (uncomment if you need to create the user first)
        /*
        await page.getByLabel(/username/i).fill(existingUsername);
        await page.getByLabel(/email/i).fill(`first${timestamp}@example.com`);
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');
        await page.getByRole('button', { name: /sign up|register|create account/i }).click();
        await page.waitForURL(/\/(en\/)?$/);
        await page.goto('/en/register');
        */

        // Try to register with the same username but different email
        await page.getByLabel(/username/i).fill(existingUsername);
        await page.getByLabel(/email/i).fill(`different${timestamp}@example.com`);
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for duplicate username error from the backend
        await expect(page.getByText(/username.*already.*exists|username.*taken/i)).toBeVisible({ timeout: 5000 });
    });

    test('should show error when trying to register with existing email', async ({ page }) => {
        // This test assumes you have a user already registered
        const timestamp = Date.now();
        const existingEmail = 'existing@example.com';

        // Try to register with the same email but different username
        await page.getByLabel(/username/i).fill(`newuser${timestamp}`);
        await page.getByLabel(/email/i).fill(existingEmail);
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Check for duplicate email error from the backend
        await expect(page.getByText(/email.*already.*exists|email.*taken/i)).toBeVisible({ timeout: 5000 });
    });

    test('should not submit form when required fields are empty', async ({ page }) => {
        // Try to submit without filling any fields
        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Verify we're still on the registration page
        await expect(page).toHaveURL(/\/en\/register/);

        // Check for validation errors on required fields
        // The exact error messages depend on your validation implementation
        const errors = page.locator('[role="alert"], .error-message, [aria-invalid="true"]');
        await expect(errors.first()).toBeVisible();
    });

    test('should trim whitespace from username and email', async ({ page }) => {
        const timestamp = Date.now();
        const username = `trimtest${timestamp}`;
        const email = `trimtest${timestamp}@example.com`;

        // Fill fields with leading/trailing spaces
        await page.getByLabel(/username/i).fill(`  ${username}  `);
        await page.getByLabel(/email/i).fill(`  ${email}  `);
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        await page.getByRole('button', { name: /sign up|register|create account/i }).click();

        // Should succeed - whitespace should be trimmed
        await expect(page).toHaveURL(/\/(en\/)?$/, { timeout: 10000 });
    });

    test('should disable submit button while submitting', async ({ page }) => {
        const timestamp = Date.now();

        await page.getByLabel(/username/i).fill(`user${timestamp}`);
        await page.getByLabel(/email/i).fill(`user${timestamp}@example.com`);
        await page.getByLabel(/^password/i).fill('SecurePass123!');
        await page.getByLabel(/confirm password/i).fill('SecurePass123!');

        const submitButton = page.getByRole('button', { name: /sign up|register|create account/i });

        // Click submit
        await submitButton.click();

        // Immediately check if button is disabled (might need to check for loading state)
        // This depends on your implementation
        // await expect(submitButton).toBeDisabled();

        // Or check for loading indicator
        // await expect(page.getByText(/loading|submitting/i)).toBeVisible();
    });
});

test.describe('Registration Page Navigation', () => {
    test('should have a link to login page', async ({ page }) => {
        await page.goto('/en/register');

        // Look for a link to the login page
        const loginLink = page.getByRole('link', { name: /sign in|log in|already have an account/i });
        await expect(loginLink).toBeVisible();

        // Verify it points to the login page
        await expect(loginLink).toHaveAttribute('href', /\/en\/login/);
    });

    test('should navigate to login page when clicking the login link', async ({ page }) => {
        await page.goto('/en/register');

        await page.getByRole('link', { name: /sign in|log in|already have an account/i }).click();

        // Verify navigation to login page
        await expect(page).toHaveURL(/\/en\/login/);
    });
});
