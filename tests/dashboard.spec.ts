import { test, expect } from '@playwright/test';

test.describe('Dashboard Layout', () => {
  test('Dashboard loads properly without crashing', async ({ page }) => {
    // Firebase Auth uses IndexedDB, which Playwright storageState does NOT save.
    // So we must log in manually in the test.
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('superadmin@test.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    
    // We expect the URL to remain /dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
  });
});
