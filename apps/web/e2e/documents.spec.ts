import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const USER_EMAIL = `docs-e2e-${Date.now()}@test.com`;
const USER_PASSWORD = 'password123';

async function loginUser(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(USER_EMAIL);
  await page.getByLabel('Password').fill(USER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/documents/, { timeout: 10000 });
}

test.describe('Document CRUD', () => {
  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await supabase.auth.signUp({ email: USER_EMAIL, password: USER_PASSWORD });
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('shows empty state when no documents', async ({ page }) => {
    await expect(page.getByText('No documents yet.')).toBeVisible();
  });

  test('can create a document', async ({ page }) => {
    await page.getByRole('link', { name: 'New document' }).click();
    await expect(page).toHaveURL(/\/documents\/new/);
    // Wait for React hydration before filling controlled inputs
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Title').fill('E2E Test Document');
    await page.getByLabel('Content').fill(
      'This is a test document created by Playwright E2E tests. It has enough content to be indexed.',
    );
    await page.getByLabel('Tags (comma-separated)').fill('e2e, test');

    await page.getByRole('button', { name: 'Create document' }).click();
    // UUID is 36 chars — won't match /documents/new
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(page.getByText('E2E Test Document')).toBeVisible();
  });

  test('can edit a document', async ({ page }) => {
    await page.goto('/documents');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page).toHaveURL(/\/edit/);
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Title').clear();
    await page.getByLabel('Title').fill('Updated E2E Document');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Updated E2E Document')).toBeVisible({ timeout: 10000 });
  });

  test('can delete a document', async ({ page }) => {
    await page.goto('/documents');

    // Mock the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();

    // Document should be removed from the list
    await expect(page.getByText('Updated E2E Document')).not.toBeVisible({ timeout: 5000 });
  });
});
