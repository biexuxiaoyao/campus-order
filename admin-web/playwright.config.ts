import { defineConfig } from '@playwright/test';

const AUTH_FILE = 'tests/.auth.json';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: { baseURL: 'http://localhost:5173', headless: true },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: undefined as any },
    },
    {
      name: 'admin-web',
      testMatch: /admin-b2b-flow\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: AUTH_FILE },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
