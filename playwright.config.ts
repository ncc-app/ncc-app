import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // 1. Setup project runs authentication first
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    // 2. Public pages (no auth required)
    {
      name: 'public-pages',
      testMatch: /public-pages\.spec\.ts/,
      use: { ...devices['Mobile Chrome'] },
    },
    
    // 3. Superadmin Tests
    {
      name: 'superadmin',
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, /public-pages\.spec\.ts/], // Run all other tests
      use: { 
        ...devices['Desktop Chrome'],
        // Use the saved superadmin session
        storageState: 'playwright/.auth/superadmin.json',
      },
    },
    
    // 4. Member Tests
    {
      name: 'member',
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, /public-pages\.spec\.ts/], 
      use: { 
        ...devices['Desktop Chrome'],
        // Use the saved member session
        storageState: 'playwright/.auth/member.json',
      },
    },
  ],
  webServer: {
    command: 'npm run test:serve',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_USE_FIREBASE_EMULATOR: 'true'
    }
  },
});
