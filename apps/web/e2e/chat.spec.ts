import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const USER_EMAIL = `chat-e2e-${Date.now()}@test.com`;
const USER_PASSWORD = 'password123';

const LEBANON_CONTENT = readFileSync(
  join(__dirname, 'fixtures', 'lebanon.txt'),
  'utf-8',
);

async function loginUser(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(USER_EMAIL);
  await page.getByLabel('Password').fill(USER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/documents/, { timeout: 10000 });
}

test.describe('Chat', () => {
  test.beforeAll(async () => {
    // Register user
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await supabase.auth.signUp({ email: USER_EMAIL, password: USER_PASSWORD });

    // Sign in to get JWT, then seed a Lebanon document via the API
    const { data } = await supabase.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${API_URL}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Lebanon (Wikipedia)',
        content: LEBANON_CONTENT,
        tags: ['geography', 'history', 'middle-east'],
      }),
    });

    // Give the async indexer time to embed and store chunks
    await new Promise((r) => setTimeout(r, 8000));
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('shows empty chat state', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText(/ask your knowledge base|ask a question/i)).toBeVisible();
  });

  test('can navigate to chat via sidebar', async ({ page }) => {
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/chat/);
  });

  test('lists known documents when asked', { timeout: 120000 }, async ({ page }) => {
    await page.goto('/chat');

    const textarea = page.getByPlaceholder(/ask a question/i);
    await textarea.fill('What documents do I have?');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('What documents do I have?')).toBeVisible();
    // The knowledge-base index is always injected — the model should name the Lebanon doc
    await expect(page.locator('main')).toContainText(/lebanon/i, { timeout: 90000 });
    await textarea.fill('follow-up');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 10000 });
  });

  test('answers factual questions from document content', { timeout: 120000 }, async ({ page }) => {
    await page.goto('/chat');

    const textarea = page.getByPlaceholder(/ask a question/i);
    await textarea.fill('What is the capital of Lebanon?');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('What is the capital of Lebanon?')).toBeVisible();
    // Answer must be Beirut — it is stated explicitly in the seeded document
    await expect(page.locator('main')).toContainText(/beirut/i, { timeout: 90000 });
    await textarea.fill('follow-up');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 10000 });
  });
});
