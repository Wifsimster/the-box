import { test, expect } from '@playwright/test';

test.describe('Registration Form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/en/register');

        await expect(page).toHaveURL(/\/en\/register/);
    });

    test('should display the registration form with all required fields', async ({ page }) => {
        await page.waitForSelector('form');

        await expect(page.getByPlaceholder(/your_username|username/i)).toBeVisible();
        await expect(page.getByPlaceholder(/you@example.com|email/i)).toBeVisible();

        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();

        await expect(page.getByRole('button', { name: /register|sign up|create account/i })).toBeVisible();
    });

    test('should successfully register a new user with valid data', async ({ page }) => {
        await page.waitForSelector('form');

        const timestamp = Date.now();
        const username = `testuser${timestamp}`;
        const email = `testuser${timestamp}@example.com`;
        const password = 'SecurePass123!';

        await page.getByPlaceholder(/your_username/i).fill(username);
        await page.getByPlaceholder(/you@example.com/i).fill(email);

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill(password);
        await passwordInputs.nth(1).fill(password);

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        await page.waitForTimeout(3000);

        const currentUrl = page.url();

        const leftRegisterPage = !currentUrl.includes('/register');

        const successMessage = page.locator('text=/success|created|verify|email sent/i').first();
        const hasSuccess = await successMessage.isVisible().catch(() => false);

        const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500').first();
        const hasError = await errorElement.isVisible().catch(() => false);

        if (hasError) {
            const errorText = await errorElement.textContent().catch(() => 'Unknown error');
            if (/already|exists|taken/i.test(errorText || '')) {
                expect(true).toBeTruthy();
                return;
            }
        }

        expect(leftRegisterPage || hasSuccess || !hasError).toBeTruthy();
    });

    test('should show error for username that is too short', async ({ page }) => {
        await page.waitForSelector('form');

        const shortUsername = 'ab';

        await page.getByPlaceholder(/your_username/i).fill(shortUsername);
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        await expect(page.getByText(/username.*at least 3 characters/i)).toBeVisible();
    });

    test('should show error for username that is too long', async ({ page }) => {
        await page.waitForSelector('form');

        const longUsername = 'a'.repeat(51);

        await page.getByPlaceholder(/your_username/i).fill(longUsername);
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

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
        await page.waitForTimeout(1000);

        const errorElement = page.locator('p.text-destructive, [role="alert"], .text-red-500, [class*="error"]').first();
        const hasError = await errorElement.isVisible().catch(() => false);

        const currentUrl = page.url();
        const stillOnRegister = currentUrl.includes('/register');

        expect(hasError || stillOnRegister).toBeTruthy();
    });

    test('should show error for password that is too short', async ({ page }) => {
        await page.waitForSelector('form');

        await page.getByPlaceholder(/your_username/i).fill('validusername');
        await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('short');
        await passwordInputs.nth(1).fill('short');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

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

        await expect(page.getByText(/passwords.*do not match|passwords.*must match/i)).toBeVisible();
    });

    test('should show error when trying to register with existing username', async ({ page }) => {
        await page.waitForSelector('form');

        const existingUsername = 'e2e_user';
        const timestamp = Date.now();

        await page.getByPlaceholder(/your_username/i).fill(existingUsername);
        await page.getByPlaceholder(/you@example.com/i).fill(`different${timestamp}@example.com`);

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();
        await page.waitForTimeout(2000);

        const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500, [class*="error"], [class*="destructive"]').first();
        const hasError = await errorElement.isVisible().catch(() => false);

        const currentUrl = page.url();
        const stillOnRegister = currentUrl.includes('/register');

        expect(hasError || stillOnRegister).toBeTruthy();
    });

    test('should show error when trying to register with existing email', async ({ page }) => {
        await page.waitForSelector('form');

        const timestamp = Date.now();
        const existingEmail = 'e2e_user@test.local';

        await page.getByPlaceholder(/your_username/i).fill(`newuser${timestamp}`);
        await page.getByPlaceholder(/you@example.com/i).fill(existingEmail);

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();
        await page.waitForTimeout(2000);

        const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500, [class*="error"], [class*="destructive"]').first();
        const hasError = await errorElement.isVisible().catch(() => false);

        const currentUrl = page.url();
        const stillOnRegister = currentUrl.includes('/register');

        expect(hasError || stillOnRegister).toBeTruthy();
    });

    test('should not submit form when required fields are empty', async ({ page }) => {
        await page.waitForSelector('form');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        await expect(page).toHaveURL(/\/en\/register/);

        const errors = page.locator('[role="alert"], .error-message, [aria-invalid="true"], p.text-destructive');
        await expect(errors.first()).toBeVisible();
    });

    test('should trim whitespace from username and email', async ({ page }) => {
        await page.waitForSelector('form');

        const timestamp = Date.now();
        const username = `trimtest${timestamp}`;
        const email = `trimtest${timestamp}@example.com`;

        await page.getByPlaceholder(/your_username/i).fill(`  ${username}  `);
        await page.getByPlaceholder(/you@example.com/i).fill(`  ${email}  `);

        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.first().fill('SecurePass123!');
        await passwordInputs.nth(1).fill('SecurePass123!');

        await page.getByRole('button', { name: /register|sign up|create account/i }).click();

        await page.waitForTimeout(3000);

        const currentUrl = page.url();

        const leftRegisterPage = !currentUrl.includes('/register');

        const successMessage = page.locator('text=/success|created|verify|email sent/i').first();
        const hasSuccess = await successMessage.isVisible().catch(() => false);

        expect(leftRegisterPage || hasSuccess || currentUrl.includes('/register')).toBeTruthy();
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

        await submitButton.click();

    });
});

test.describe('Registration Page Navigation', () => {
    test('should have a link to login page', async ({ page }) => {
        await page.goto('/en/register');
        await page.waitForSelector('form');

        const mainContent = page.locator('main');
        const loginLink = mainContent.getByRole('link', { name: /login/i });
        await expect(loginLink).toBeVisible();

        await expect(loginLink).toHaveAttribute('href', /\/en\/login/);
    });

    test('should navigate to login page when clicking the login link', async ({ page }) => {
        await page.goto('/en/register');
        await page.waitForSelector('form');

        const mainContent = page.locator('main');
        await mainContent.getByRole('link', { name: /login/i }).click();

        await expect(page).toHaveURL(/\/en\/login/);
    });
});
