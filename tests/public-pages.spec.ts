import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/alumni',
  '/contact',
  '/notifications',
  '/recruitment',
  '/resources',
  '/register',
  '/forgot-password'
];

test.describe('Public Pages - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const route of PUBLIC_ROUTES) {
    test('Route ' + route + ' should not have horizontal overflow on mobile', async ({ page }) => {
      await page.goto(route);
      // Wait for React to render (networkidle is unreliable with Firebase)
      await page.waitForTimeout(500);

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      
      expect(isOverflowing).toBe(false);
    });
  }
});
