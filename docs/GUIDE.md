# Codebase Navigation Guide

A practical reference for working in this repo — where things live, how to run everything,
and how to add new features without breaking what exists.

---

## Quick Start

```bash
# 1. Copy environment variables and fill them in
cp .env.example .env

# 2. Install deps + start Supabase + apply migrations
make setup

# 3. Start all services in watch mode
make dev
#  → API:    http://localhost:3001
#  → Web:    http://localhost:3000
#  → Studio: http://localhost:54323

# Run unit tests
cd apps/api && npm test

# Run E2E tests (requires both services running)
cd apps/web && npx playwright test
```

---

## Where Things Live

### Monorepo root

| File / Dir | Purpose |
|---|---|
| `package.json` | Workspace root — lists `apps/*` and `packages/*` workspaces |
| `turbo.json` | Task pipeline definitions and `globalEnv` cache keys |
| `Makefile` | Human-facing commands: `setup`, `dev`, `test`, `build` |
| `.env.example` | Every variable with descriptions; copy to `.env` to configure |
| `supabase/migrations/` | Ordered SQL migrations — apply with `supabase db reset` |
| `docker-compose.yml` | Wires `api` and `web` containers; Supabase runs separately via CLI |

### Shared packages

| Package | Path | What it exports |
|---|---|---|
| `@docbase/types` | `packages/types/src/` | TS interfaces: Document, Chunk, Conversation, Message, Citation, ChatStreamRequest, RetrievedChunk, ChatCompletionMessage |
| `@docbase/config` | `packages/config/` | `tsconfig.base.json`, `tsconfig.nestjs.json`, `tsconfig.nextjs.json`, `eslint-base.js` |

Both apps reference these via TypeScript path aliases (`@docbase/types`), not via npm
installation. Changes take effect immediately.

### API (`apps/api/src/`)

```
app.module.ts         Root module — imports everything, owns Joi config validation
main.ts               Bootstrap: CORS, ValidationPipe, Swagger
│
├── supabase/
│   └── supabase.service.ts   getAdminClient() / getAuthClient(jwt) — the only place
│                              where Supabase clients are created
│
├── auth/
│   ├── jwt.strategy.ts       Validates Supabase JWTs; extracts { userId, email, jwt }
│   ├── jwt-auth.guard.ts     Apply with @UseGuards(JwtAuthGuard)
│   └── get-user.decorator.ts @GetUser() param decorator
│
├── ai/
│   └── ai.service.ts         chat() / chatStream() / embed() — single OpenAI SDK instance
│
├── rag/
│   ├── chunking.service.ts   chunk(text) → string[]  (recursive split + merge + overlap)
│   ├── embedding.service.ts  embedChunks() / embedQuery() — thin wrapper over AiService
│   └── rag.service.ts        indexDocument() / retrieveChunks()
│
├── documents/
│   ├── documents.controller.ts   GET/POST/PUT/DELETE /documents[/:id]
│   ├── documents.service.ts      CRUD + async indexing trigger
│   └── dto/                      CreateDocumentDto, UpdateDocumentDto
│
├── chat/
│   ├── chat.controller.ts    POST /chat/stream (@Sse), GET /chat/conversations[/:id/messages]
│   ├── chat.service.ts       streamChat() Subject pattern, runStream() pipeline
│   └── dto/chat-stream.dto.ts
│
└── health/
    └── health.controller.ts  GET /health — 200 if API is alive
```

### Web (`apps/web/`)

```
middleware.ts               Runs on every request: refresh session, redirect unauth → /auth/login
app/
  layout.tsx                Root layout — injects QueryProvider
  page.tsx                  Redirects / → /documents
  auth/login/page.tsx       AuthForm — login + register
  (app)/
    layout.tsx              Server Component: fetches user, renders AppSidebar
    documents/
      page.tsx              Server Component list (direct Supabase fetch)
      new/page.tsx          Renders DocumentEditor (no initial document)
      [id]/page.tsx         Document detail view
      [id]/edit/page.tsx    Renders DocumentEditor (prefetched document)
    chat/page.tsx           Renders ChatInterface

components/
  ui/                       button.tsx, input.tsx, spinner.tsx — primitives, no business logic
  providers/
    query-provider.tsx      QueryClient setup + devtools
  features/
    auth/auth-form.tsx      Login / register form (Client Component)
    layout/app-sidebar.tsx  Nav sidebar + logout (Client Component)
    documents/
      document-list.tsx     Optimistic delete, Client Component
      document-editor.tsx   Create / update form, TanStack Query mutation
    chat/
      chat-interface.tsx    Conversation container, auto-scroll
      chat-message.tsx      Streaming cursor + collapsible citations
      chat-input.tsx        Textarea, Enter → send, Shift+Enter → newline

lib/
  supabase/
    client.ts               Browser Supabase client (createBrowserClient)
    server.ts               Server Supabase client (createServerClient + cookies)
    middleware.ts           Session refresh + redirect logic
  api/
    client.ts               apiGet / apiPost / apiPut / apiDelete / apiStream
                            All methods attach Bearer token from current Supabase session
    documents.ts            documentsApi.{list,get,create,update,delete}
                            estimateChunkCount(content) → number
  hooks/
    use-chat-stream.ts      useChatStream() hook — manages streaming state, parses SSE

e2e/
  auth.spec.ts              register, login, logout, bad credentials
  documents.spec.ts         CRUD flow
  chat.spec.ts              message + streaming response
  rls-isolation.spec.ts     two-context cross-user isolation
```

---

## API Reference

Base URL: `http://localhost:3001`
Auth: `Authorization: Bearer <supabase_access_token>` on all routes except `/health`.
Swagger UI: `http://localhost:3001/api/docs`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | 200 if API is alive |
| `GET` | `/documents` | List all documents for current user |
| `POST` | `/documents` | Create document; triggers async indexing |
| `GET` | `/documents/:id` | Get single document |
| `PUT` | `/documents/:id` | Update document; re-indexes if content changed |
| `DELETE` | `/documents/:id` | Delete document (chunks cascade) |
| `POST` | `/chat/stream` | SSE stream — sources → chunk* → done |
| `GET` | `/chat/conversations` | List conversations |
| `GET` | `/chat/conversations/:id/messages` | List messages in a conversation |

### Chat stream request body

```json
{
  "question": "string (required)",
  "conversationId": "uuid (optional — creates new conversation if omitted)"
}
```

### Chat SSE event sequence

```
event: sources
data: [{"documentId":"…","documentTitle":"…","chunkContent":"…","similarity":0.87}]

event: chunk
data: token text

event: chunk
data: more token text
...

event: done
data:
```

---

## Database Access Patterns

### From the API

```typescript
// ✓ User-facing read — RLS applies
const client = this.supabaseService.getAuthClient(user.jwt);
const { data } = await client.from('documents').select('*');

// ✓ Internal write (indexing) — admin bypasses RLS deliberately
const admin = this.supabaseService.getAdminClient();
await admin.from('document_chunks').insert(rows);

// ✗ Never use admin for reads that should be user-scoped
```

### From Next.js (server)

```typescript
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient(); // reads session from cookies
const { data } = await supabase.from('documents').select('*'); // RLS applies
```

### From Next.js (client / mutations)

```typescript
import { documentsApi } from '@/lib/api/documents';
// These proxy through the NestJS API, which enforces auth and RLS
await documentsApi.create({ title, content, tags });
```

---

## Adding a New Feature

### New API endpoint

1. Create `apps/api/src/<feature>/<feature>.module.ts`, `.service.ts`, `.controller.ts`
2. Decorate the controller with `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth()`
3. Use `@GetUser() user: AuthUser` to get the current user, then call
   `this.supabaseService.getAuthClient(user.jwt)` for all queries
4. Import the module in `apps/api/src/app.module.ts`

### New database table

1. `supabase migration new <description>` — creates a timestamped file in `supabase/migrations/`
2. Write the `CREATE TABLE` statement; always add `ENABLE ROW LEVEL SECURITY` and the
   appropriate `CREATE POLICY` statements
3. Add the TypeScript interface to `packages/types/src/`
4. `supabase db reset` to apply locally

### New shared type

Edit `packages/types/src/<category>.ts` and re-export from `packages/types/src/index.ts`.
Changes are immediately visible in both apps — no build step required.

### New frontend page (protected)

Create `apps/web/app/(app)/<route>/page.tsx`. The `(app)/layout.tsx` parent already handles
auth checking. If the page needs initial server data, import `createClient` from
`@/lib/supabase/server` and fetch there. If it needs mutations, make it a Client Component
and use TanStack Query or `documentsApi`.

---

## Running Tests

### Unit tests (no external dependencies)

```bash
cd apps/api
npm test                    # run once
npm run test:watch          # watch mode
npm run test:cov            # with coverage report
```

Tests live alongside source files as `*.spec.ts`. The jest config in `apps/api/package.json`
maps `@docbase/types` to the TypeScript source directly so no build step is needed.

### Integration tests (requires Supabase)

```bash
supabase start              # starts local Supabase stack
supabase db reset           # applies all migrations fresh

cd apps/api
npx jest --config test/jest-e2e.json
```

These tests create real users and documents against the local Supabase instance.

### E2E tests (requires both services running)

```bash
# Terminal 1
make dev

# Terminal 2
cd apps/web
npx playwright test         # headless
npx playwright test --ui    # Playwright UI mode
npx playwright show-report  # view last run report
```

Set `PLAYWRIGHT_BASE_URL` to test against a staging environment.

### Test file map

| File | Type | Tests |
|---|---|---|
| `apps/api/src/rag/chunking.service.spec.ts` | Unit | Empty input, short text, split, overlap, merge, hard-split |
| `apps/api/src/ai/ai.service.spec.ts` | Unit | baseURL wiring, model wiring, batch count |
| `apps/api/src/documents/documents.service.spec.ts` | Unit | findAll, findOne 404, create + indexing trigger, remove |
| `apps/api/test/documents.integration.spec.ts` | Integration | Full CRUD + RLS cross-user block |
| `apps/api/test/rag.integration.spec.ts` | Integration | Create doc → verify chunks indexed |
| `apps/web/e2e/auth.spec.ts` | E2E | Redirect, register, login, bad credentials |
| `apps/web/e2e/documents.spec.ts` | E2E | Create, edit, delete |
| `apps/web/e2e/chat.spec.ts` | E2E | Send message, receive streaming response |
| `apps/web/e2e/rls-isolation.spec.ts` | E2E | Two-context cross-user isolation |

---

## Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL (`http://localhost:54321` for local) |
| `SUPABASE_ANON_KEY` | Yes | Public anon key — safe in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin key — server-only, never expose |
| `SUPABASE_JWT_SECRET` | Yes | Used by NestJS `JwtStrategy` to verify tokens |
| `AI_BASE_URL` | No | OpenAI-compatible base URL (default: `https://api.openai.com/v1`) |
| `AI_API_KEY` | Yes | API key for the AI provider |
| `AI_MODEL` | No | Chat model name (default: `gpt-4o-mini`) |
| `EMBEDDING_MODEL` | No | Embedding model name (default: `text-embedding-ada-002`) — must match `vector(1536)` |
| `API_PORT` | No | NestJS port (default: `3001`) |
| `NEXT_PUBLIC_API_URL` | No | URL that the browser uses to reach the API (default: `http://localhost:3001`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Exposed to browser for Supabase SSR |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Exposed to browser for Supabase SSR |

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` must never appear in any `NEXT_PUBLIC_*`
variable or in client-side code.

---

## Docker

```bash
# Build and start both containers
docker compose up --build

# Build only (no start)
make build

# View logs
docker compose logs -f api
docker compose logs -f web
```

Supabase is not included in `docker-compose.yml` — it is managed separately by the Supabase
CLI. For production, point `SUPABASE_URL` at a cloud Supabase project.

The API image uses a slim node:20-alpine runner with only production deps.
The web image uses Next.js `output: 'standalone'` — only the server bundle and referenced
`node_modules` are included, not the full `node_modules` directory.

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Embeddings are `null` in DB | Passing `number[]` directly instead of `JSON.stringify(vector)` | See NOTES.md §1 |
| SSE connection never opens | `@Sse` handler is `async` or returns a Promise | Return `subject.asObservable()` synchronously |
| Chat sends GET instead of POST | Using browser `EventSource` | Use `fetch()` + `ReadableStream` |
| 401 on all document endpoints | Missing `Authorization` header | Ensure `apiGet/apiPost` in `lib/api/client.ts` reads the Supabase session |
| Config validation fails on startup | Missing required env var | Check the Joi schema in `app.module.ts`; every required var must be in `.env` |
| Turbo cache not busting on env change | Env var missing from `globalEnv` in `turbo.json` | Add it to the `globalEnv` array |
| Cross-user data visible | Using `getAdminClient()` for a user-facing read | Switch to `getAuthClient(jwt)` |
