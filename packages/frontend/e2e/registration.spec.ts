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
        // Wait for form to be fully loaded
        await page.waitForSelector('form');
        
        // Verify the form elements are present using placeholders and roles
        await expect(page.getByPlaceholder(/your_username|username/i)).toBeVisible();
        await expect(page.getByPlaceholder(/you@example.com|email/i)).toBeVisible();
        
        // Check for password fields by name attribute
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
        
        // Verify submit button is present
        await expect(page.getByRole('button', { name: /register|sign up|create account/i })).toBeVisible();
    });

    test('should successfully register a new user with valid data', async ({ page }) => {
        // Wait for form to be fully loaded
        await page.waitForSelector('form');
        
        // Generate unique user data to avoid conflicts
        const timestamp = Date.now();
        const username = `testuser${timestamp}`;
        const email = `testuser${timestamp}@example.com`;
        const password = 'SecurePass123!';

        // Fill in the registration form using placeholders
        await page.getByPlaceholder(/your_username/i).fill(username);
        await page.getByPlaceholder(/you@example.com/i).fill(email);
        
        // Get password fields by role and filter by type
        const passwordFields = page.getByRole('textbox', { name: /password/i }).filter({ has: page.locator('input[type="password"]') });
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill(password);
        await passwordInputs.nth(1).fill(password);

        // Submit the form
        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Wait for successful registration (redirect to home page)
        // Note: This test assumes the backend is running and registration works
        // If registration fails, we'll see an error message on the page
        await page.waitForTimeout(2000); // Give time for async operations
        
        // Check if we're redirected or if there's an error
        const currentUrl = page.url();
        const hasError = await page.locator('[role="alert"], p.text-destructive').first().isVisible().catch(() => false);
        
        if (hasError) {
            const errorText = await page.locator('[role="alert"], p.text-destructive').first().textContent();
            throw new Error(`Registration failed with error: ${errorText}`);
        }
        
        // If still on register page after 2 seconds, registration likely failed silently
        if (currentUrl.includes('/register')) {
            // Wait a bit more for potential redirect
            await page.waitForTimeout(3000);
            if (page.url().includes('/register')) {
                throw new Error('Registration did not redirect - likely failed silently');
            }
        }
        
        // If we got here, we should be redirected
        await expect(page).toHaveURL(/\/(en\/)?$/, { timeout: 5000 });

        // Verify user is logged in - check for user menu or logout button
        // This depends on your UI implementation
        // await expect(page.getByRole('button', { name: username })).toBeVisible();
    });

    test('should show error for username that is too short', async ({ page }) => {
        await page.waitForSelector('form');
        
        const shortUsername = 'ab'; // Less than 3 characters

        await page.getByPlaceholder(/your_username/i).fill(shortUsername);
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        // Trigger validation by clicking submit or blurring the field
        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for validation error message
        await expect(page.getByText(/username.*at least 3 characters/i)).toBeVisible();
    });

    test('should show error for username that is too long', async ({ page }) => {
        await page.waitForSelector('form');
        
        const longUsername = 'a'.repeat(51); // More than 50 characters

        await page.getByPlaceholder(/your_username/i).fill(longUsername);
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for validation error message
        await expect(page.getByText(/username.*at most 50 characters/i)).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
        await page.waitForSelector('form');
        
        await page.getByPlaceholder(/your_username/i).fill('validusername');
        await page.getByPlaceholder(/you@example.com/i).fill('invalid-email');
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for email validation error - check both the error message and form message
        const emailError = page.locator('p.text-destructive, [role="alert"]').filter({ hasText: /invalid.*email|please enter a valid email/i }).first();
        await expect(emailError).toBeVisible();
    });

    test('should show error for password that is too short', async ({ page }) => {
        await page.waitForSelector('form');
        
        await page.getByPlaceholder(/your_username/i).fill('validusername');
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('short'); // Less than 8 characters
        await passwordInputs.nth(1).fill('short');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for password validation error
        await expect(page.getByText(/password.*at least 8 characters/i)).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
        await page.waitForSelector('form');
        
        await page.getByPlaceholder(/your_username/i).fill('validusername');
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('DifferentPass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for password mismatch error
        await expect(page.getByText(/passwords.*do not match|passwords.*must match/i)).toBeVisible();
    });

    test('should show error when trying to register with existing username', async ({ page }) => {
        await page.waitForSelector('form');
        
        // This test assumes you have a user already registered
        // You might need to seed your test database or create a user first

        const existingUsername = 'existinguser';
        const timestamp = Date.now();

        // First registration (uncomment if you need to create the user first)
        /*
        await page.getByPlaceholder(/your_username/i).fill(existingUsername);
        await page.getByPlaceholder(/you@example.com/i).fill(`first${timestamp}@example.com`);
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');
        await page.getByRole('button', { name: /register|sign up|create account/i }).click();
        await page.waitForURL(/\/(en\/)?$/);
        await page.goto('/en/register');
        */

        // Try to register with the same username but different email
        await page.getByPlaceholder(/your_username/i).fill(existingUsername);
        await page.getByPlaceholder(/you@example.com/i).fill(`different${timestamp}@example.com`);
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for duplicate username error from the backend - could be in error message or form error
        const usernameError = page.locator('[role="alert"], p.text-destructive').filter({ hasText: /username.*already.*exists|username.*taken|account.*exists/i }).first();
        await expect(usernameError).toBeVisible({ timeout: 5000 });
    });

    test('should show error when trying to register with existing email', async ({ page }) => {
        await page.waitForSelector('form');
        
        // This test assumes you have a user already registered
        const timestamp = Date.now();
        const existingEmail = 'existing@example.com';

        // Try to register with the same email but different username
        await page.getByPlaceholder(/your_username/i).fill(`newuser${timestamp}`);
        await page.getByPlaceholder(/you@example.com/i).fill(existingEmail);
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Check for duplicate email error from the backend - could be in error message or form error
        const emailError = page.locator('[role="alert"], p.text-destructive').filter({ hasText: /email.*already.*exists|email.*taken|account.*exists/i }).first();
        await expect(emailError).toBeVisible({ timeout: 5000 });
    });

    test('should not submit form when required fields are empty', async ({ page }) => {
        await page.waitForSelector('form');
        
        // Try to submit without filling any fields
        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Verify we're still on the registration page
        await expect(page).toHaveURL(/\/en\/register/);

        // Check for validation errors on required fields
        // The exact error messages depend on your validation implementation
        const errors = page.locator('[role="alert"], .error-message, [aria-invalid="true"], p.text-destructive');
        await expect(errors.first()).toBeVisible();
    });

    test('should trim whitespace from username and email', async ({ page }) => {
        await page.waitForSelector('form');
        
        const timestamp = Date.now();
        const username = `trimtest${timestamp}`;
        const email = `trimtest${timestamp}@example.com`;

        // Fill fields with leading/trailing spaces
        await page.getByPlaceholder(/your_username/i).fill(`  ${username}  `);
        await page.getByPlaceholder(/you@example.com/i).fill(`  ${email}  `);
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        // Should succeed - whitespace should be trimmed
        // Note: This test assumes the backend is running and registration works
        await page.waitForTimeout(2000); // Give time for async operations
        
        // Check if we're redirected or if there's an error
        const currentUrl = page.url();
        const hasError = await page.locator('[role="alert"], p.text-destructive').first().isVisible().catch(() => false);
        
        if (hasError) {
            const errorText = await page.locator('[role="alert"], p.text-destructive').first().textContent();
            throw new Error(`Registration failed with error: ${errorText}`);
        }
        
        // If still on register page after 2 seconds, registration likely failed silently
        if (currentUrl.includes('/register')) {
            // Wait a bit more for potential redirect
            await page.waitForTimeout(3000);
            if (page.url().includes('/register')) {
                throw new Error('Registration did not redirect - likely failed silently');
            }
        }
        
        // If we got here, we should be redirected
        await expect(page).toHaveURL(/\/(en\/)?$/, { timeout: 5000 });
    });

    test('should disable submit button while submitting', async ({ page }) => {
        await page.waitForSelector('form');
        
        const timestamp = Date.now();

        await page.getByPlaceholder(/your_username/i).fill(`user${timestamp}`);
        await page.getByPlaceholder(/you@example.com/i).fill(`user${timestamp}@example.com`);
        
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        const submitButton = page.getByRole('button', { name: /register|sign up|create account/i });

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
        await page.waitForSelector('form');

        // Look for a link to the login page in the main content area (not header)
        const mainContent = page.locator('main');
        const loginLink = mainContent.getByRole('link', { name: /login/i });
        await expect(loginLink).toBeVisible();

        // Verify it points to the login page
        await expect(loginLink).toHaveAttribute('href', /\/en\/login/);
    });

    test('should navigate to login page when clicking the login link', async ({ page }) => {
        await page.goto('/en/register');
        await page.waitForSelector('form');

        // There are two login links - one in header, one in form. Click the one in the form area
        const mainContent = page.locator('main');
        await mainContent.getByRole('link', { name: /login/i }).click();

        // Verify navigation to login page
        await expect(page).toHaveURL(/\/en\/login/);
    });
});
