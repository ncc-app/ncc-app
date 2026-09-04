import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness Baseline', () => {
  // Simulate a mobile phone viewport
  test.use({ viewport: { width: 375, height: 812 } });

  test('Login page fits on mobile without horizontal scrolling', async ({ page }) => {
    await page.goto('/login');
    
    // Check if anything is overflowing horizontally
    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    
    expect(isOverflowing).toBeFalsy();
  });
});
