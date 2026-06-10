/**
 * Integration tests for document CRUD and RLS isolation.
 * Requires `supabase start` and a running API.
 *
 * Run with: jest --config test/jest-e2e.json
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

async function registerAndLogin(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await supabase.auth.signUp({ email, password });
  const { data } = await supabase.auth.signInWithPassword({ email, password });
  return data.session?.access_token ?? '';
}

describe('Documents Integration (requires supabase start)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let docId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const ts = Date.now();
    tokenA = await registerAndLogin(`user-a-${ts}@test.com`, 'password123');
    tokenB = await registerAndLogin(`user-b-${ts}@test.com`, 'password123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /documents without token returns 401', async () => {
    await request(app.getHttpServer()).get('/documents').expect(401);
  });

  it('creates a document', async () => {
    const res = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Test Doc', content: 'Hello world content', tags: ['test'] })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Test Doc');
    docId = res.body.id;
  });

  it('lists documents for user A', async () => {
    const res = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((d: { id: string }) => d.id === docId)).toBe(true);
  });

  it('user B cannot see user A documents (RLS)', async () => {
    const res = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(res.body.some((d: { id: string }) => d.id === docId)).toBe(false);
  });

  it('user B cannot fetch user A document by ID', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('updates the document', async () => {
    const res = await request(app.getHttpServer())
      .put(`/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Updated Title' })
      .expect(200);

    expect(res.body.title).toBe('Updated Title');
  });

  it('deletes the document', async () => {
    await request(app.getHttpServer())
      .delete(`/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });
});
