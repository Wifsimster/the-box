import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : 4,
    reporter: process.env.CI ? [['html'], ['github']] : 'html',
    use: {
        baseURL: 'http://localhost:5173',

        storageState: './e2e/consent-storage-state.json',

        trace: 'on-first-retry',

        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },


        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },

    ],

    webServer: process.env.CI
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://localhost:5173',
              reuseExistingServer: true,
              stdout: 'ignore',
              stderr: 'pipe',
          },
});
