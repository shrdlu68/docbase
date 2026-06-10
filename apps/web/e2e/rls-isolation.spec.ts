import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const ts = Date.now();
const USER_A = { email: `rls-a-${ts}@test.com`, password: 'password123' };
const USER_B = { email: `rls-b-${ts}@test.com`, password: 'password123' };

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/documents/, { timeout: 10000 });
}

test.describe('RLS Isolation', () => {
  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await supabase.auth.signUp({ email: USER_A.email, password: USER_A.password });
    await supabase.auth.signUp({ email: USER_B.email, password: USER_B.password });
  });

  test('user A document is not visible to user B', async ({ browser }: { browser: Browser }) => {
    // User A creates a document
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    await loginAs(pageA, USER_A.email, USER_A.password);
    await pageA.getByRole('link', { name: 'New document' }).click();
    await pageA.getByLabel('Title').fill('User A Secret Document');
    await pageA.getByLabel('Content').fill('This is User A private content that B should not see.');
    await pageA.getByRole('button', { name: 'Create document' }).click();
    await expect(pageA).toHaveURL(/\/documents\/[a-z0-9-]+$/, { timeout: 10000 });

    await contextA.close();

    // User B logs in and should NOT see User A's document
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await loginAs(pageB, USER_B.email, USER_B.password);
    await expect(pageB.getByText('User A Secret Document')).not.toBeVisible({ timeout: 5000 });

    await contextB.close();
  });
});
