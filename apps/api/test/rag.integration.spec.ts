/**
 * Integration test: create document → verify chunks are indexed.
 * Requires supabase start + running API + valid AI credentials.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe('RAG Integration (requires supabase start + AI credentials)', () => {
  let app: INestApplication;
  let token: string;
  let docId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const ts = Date.now();
    await supabase.auth.signUp({ email: `rag-test-${ts}@test.com`, password: 'password123' });
    const { data } = await supabase.auth.signInWithPassword({
      email: `rag-test-${ts}@test.com`,
      password: 'password123',
    });
    token = data.session?.access_token ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a document and eventually indexes chunks', async () => {
    const longContent = `
      This is a comprehensive guide to setting up the application.
      First, you need to install all dependencies by running npm install.
      Then configure your environment variables according to the .env.example file.
      The application requires a running Supabase instance for the database.
      You can start Supabase locally using the supabase CLI.
      Once Supabase is running, apply the database migrations.
      After migrations, start the API server with npm run dev.
      The API will be available on port 3001 by default.
    `
      .trim()
      .repeat(5);

    const res = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Setup Guide', content: longContent, tags: ['setup'] })
      .expect(201);

    docId = res.body.id;
    expect(docId).toBeDefined();

    // Wait for async indexing
    await new Promise((r) => setTimeout(r, 5000));

    // Check chunks via admin client
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: chunks } = await adminClient
      .from('document_chunks')
      .select('*')
      .eq('document_id', docId);

    expect(chunks?.length).toBeGreaterThan(0);
    expect(chunks?.[0].embedding).toBeTruthy();
  }, 30000);
});
