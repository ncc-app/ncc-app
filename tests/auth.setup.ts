import { test as setup } from '@playwright/test';
import * as fs from 'fs';

const authFileSuperAdmin = 'playwright/.auth/superadmin.json';
const authFileMember = 'playwright/.auth/member.json';

if (!fs.existsSync('playwright/.auth')) {
  fs.mkdirSync('playwright/.auth', { recursive: true });
}

const SUPERADMIN_EMAIL = 'superadmin@test.com';
const SUPERADMIN_PASS = 'password123';
const MEMBER_EMAIL = 'member@test.com';
const MEMBER_PASS = 'password123';

async function seedUser(request: any, email: string, password: string, role: string) {
  // 1. Create User in Auth Emulator using Playwright's reliable request API
  let uid = '';
  const signUpRes = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key', {
    data: { email, password, returnSecureToken: true }
  });
  const signUpData = await signUpRes.json();

  if (signUpData.error && signUpData.error.message === 'EMAIL_EXISTS') {
    const signInRes = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key', {
      data: { email, password, returnSecureToken: true }
    });
    uid = (await signInRes.json()).localId;
  } else if (signUpData.localId) {
    uid = signUpData.localId;
  } else {
    throw new Error('Failed to create user in Auth Emulator: ' + JSON.stringify(signUpData));
  }

  // 2. Create User Profile in Firestore Emulator
  const dbRes = await request.patch(`http://127.0.0.1:8080/v1/projects/ncc-app-200cdt/databases/(default)/documents/users/${uid}`, {
    headers: {
      'Authorization': 'Bearer owner'
    },
    data: {
      name: `projects/ncc-app-200cdt/databases/(default)/documents/users/${uid}`,
      fields: {
        email: { stringValue: email },
        role: { stringValue: role },
        status: { stringValue: 'active' }
      }
    }
  });
  if (!dbRes.ok()) {
    throw new Error('Failed to save to Firestore Emulator: ' + await dbRes.text());
  }
}

setup('authenticate as superadmin', async ({ page, request }) => {
  await seedUser(request, SUPERADMIN_EMAIL, SUPERADMIN_PASS, 'superadmin');

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(SUPERADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(SUPERADMIN_PASS);
  await page.locator('button[type="submit"]').click();
  
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: authFileSuperAdmin });
});

setup('authenticate as member', async ({ page, request }) => {
  await seedUser(request, MEMBER_EMAIL, MEMBER_PASS, 'member');

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(MEMBER_EMAIL);
  await page.locator('input[type="password"]').fill(MEMBER_PASS);
  await page.locator('button[type="submit"]').click();
  
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: authFileMember });
});
