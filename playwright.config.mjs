// End-to-end tests in real browser engines: Chrome, Firefox and Safari (WebKit),
// on laptop, phone and tablet screens. Run with: npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4400/woodwork-test/',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/servers/fixture-server.mjs',
      url: 'http://127.0.0.1:4400/woodwork-test/',
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      command: 'node tests/e2e/servers/real-server.mjs',
      url: 'http://127.0.0.1:4401/',
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
  projects: [
    { name: 'laptop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'laptop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'laptop-safari', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone-android', use: { ...devices['Pixel 7'] } },
    { name: 'phone-iphone', use: { ...devices['iPhone 14'] } },
    { name: 'tablet-ipad', use: { ...devices['iPad Mini'] } },
  ],
});
