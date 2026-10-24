// Pre-launch rehearsal: a fresh copy of exactly what will be uploaded, filled with realistic dummy
// photos, built like GitHub builds it, then tested on 17 phone, tablet and computer screens.
// Run with: npm run test:rehearsal
import { defineConfig, devices } from '@playwright/test';

const device = (name, overrides = {}) => ({ name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), use: { ...devices[name], ...overrides } });
const sized = (label, base, width, height) => ({ name: label, use: { ...devices[base], viewport: { width, height } } });

export default defineConfig({
  testDir: 'tests/rehearsal',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4500/website/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/rehearsal/serve.mjs',
    url: 'http://127.0.0.1:4500/website/',
    timeout: 1_200_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
  projects: [
    device('iPhone SE'),
    device('iPhone 14'),
    device('iPhone 14 Pro Max'),
    device('iPhone 14 landscape'),
    device('Galaxy S9+'),
    device('Galaxy S8'),
    device('Pixel 7'),
    device('Pixel 7 landscape'),
    device('iPad Mini'),
    device('iPad Pro 11'),
    device('iPad Pro 11 landscape'),
    device('Galaxy Tab S4'),
    sized('laptop-1280-chrome', 'Desktop Chrome', 1280, 720),
    sized('laptop-1366-firefox', 'Desktop Firefox', 1366, 768),
    sized('laptop-1440-safari', 'Desktop Safari', 1440, 900),
    sized('desktop-1920-chrome', 'Desktop Chrome', 1920, 1080),
    sized('desktop-2560-firefox', 'Desktop Firefox', 2560, 1440),
  ],
});
