# Implementation Plan

This is the original plan that was executed to build Docbase. It serves as a record of intent
and scope, and as a reference for understanding why the codebase is shaped the way it is.

---

## Skills

Before writing any code, install and apply the project's agent skills from [skills.sh](https://www.skills.sh/).
Skills are installed locally under `.agents/skills/` and symlinked into `.claude/skills/` for Claude Code.

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/millionco/react-doctor --skill react-doctor
npx skills add https://github.com/supabase/agent-skills --skill supabase-postgres-best-practices
```

### When to apply each skill

| Skill | When |
|---|---|
| `react-doctor` | After completing any React feature or bug fix — run `npx react-doctor@latest --verbose` and resolve errors before committing |
| `supabase-postgres-best-practices` | When writing or reviewing migrations — check indexes, RLS policies, and query patterns |
| `frontend-design` | When building or redesigning UI — commit to a distinctive aesthetic direction before writing components |

---

## Goal

Build a full-stack AI knowledge base from scratch. Users create and manage documents, then ask
questions about them via a RAG-powered chat interface. Evaluated on monorepo architecture,
code quality, DB design, RAG quality, AI abstraction, and frontend UX.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | Turborepo + npm workspaces | Task pipeline caching; pnpm not available |
| Frontend | Next.js 14 (App Router) | SSR auth, Server Components for initial data fetch |
| Styling | Tailwind CSS | Utility-first, no runtime overhead |
| Data fetching | TanStack Query | Optimistic updates, cache invalidation |
| Backend | NestJS | Decorator-driven DI, structured module system |
| Database | Supabase (PostgreSQL + pgvector) | Managed Postgres with built-in auth and RLS |
| AI | OpenAI SDK with configurable baseURL | One SDK covers OpenAI, Groq, Together, Ollama |
| Unit tests | Jest | Standard NestJS toolchain |
| E2E tests | Playwright | Cross-browser, async-friendly |
| Containers | Dockerfile per app + docker-compose | Multi-stage builds for slim production images |

---

## Repository Structure

```
/
├── apps/
│   ├── api/                   # NestJS
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── ai/            # AiService (OpenAI SDK, configurable baseURL)
│   │   │   ├── auth/          # JwtAuthGuard, @GetUser decorator
│   │   │   ├── chat/          # ChatController (SSE), ChatService
│   │   │   ├── documents/     # CRUD + triggers RAG indexing
│   │   │   ├── health/        # GET /health
│   │   │   ├── rag/           # ChunkingService, EmbeddingService, RagService
│   │   │   └── supabase/      # SupabaseService (anon+auth client factory)
│   │   └── test/
│   │       ├── documents.integration.spec.ts
│   │       └── rag.integration.spec.ts
│   └── web/                   # Next.js 14 App Router
│       ├── Dockerfile
│       ├── app/
│       │   ├── (app)/         # Protected routes
│       │   │   ├── documents/ # list, new, [id], [id]/edit
│       │   │   └── chat/
│       │   └── auth/login/
│       ├── components/
│       │   ├── features/      # auth, chat, documents, layout
│       │   ├── providers/     # QueryProvider
│       │   └── ui/            # button, input, spinner primitives
│       ├── e2e/               # Playwright specs
│       └── lib/
│           ├── api/           # API client + documents helper
│           ├── hooks/         # use-chat-stream (SSE parser)
│           └── supabase/      # client.ts, server.ts, middleware.ts
├── packages/
│   ├── types/                 # Shared TS interfaces
│   └── config/                # Shared ESLint + tsconfig bases
├── supabase/
│   └── migrations/            # 8 ordered .sql files
├── .env.example
├── .nvmrc
├── .prettierrc
├── docker-compose.yml
├── Makefile
├── turbo.json
└── package.json
```

---

## Implementation Phases

### Phase 1 — Monorepo Scaffold
Root `package.json` with workspaces (`apps/*`, `packages/*`), `turbo.json` with
`build → test → lint` pipeline, `.nvmrc`, `.prettierrc`, `.gitignore`, `.env.example`,
`Makefile` with `setup`, `dev`, `test`, `build` targets.

### Phase 2 — Database (Supabase Migrations)
Eight migrations applied in order:

| # | File | Purpose |
|---|---|---|
| 1 | `enable_pgvector` | `CREATE EXTENSION IF NOT EXISTS vector` |
| 2 | `create_documents` | uuid pk, user_id → auth.users, title, content, tags[], timestamps |
| 3 | `create_document_chunks` | uuid pk, document_id FK, content, chunk_index, `embedding vector(1536)` |
| 4 | `create_rls_policies` | FOR ALL USING (user_id = auth.uid()) on documents; chunk access via JOIN |
| 5 | `create_vector_index` | USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100) |
| 6 | `create_conversations` | uuid pk, user_id, title, created_at |
| 7 | `create_messages` | uuid pk, conversation_id FK, role check, content, created_at |
| 8 | `create_match_chunks_function` | Cosine similarity search with SET LOCAL ivfflat.probes = 10 |

### Phase 3 — Shared Packages
`packages/types/src/`: `document.ts`, `conversation.ts`, `ai.ts`, `api.ts`, re-exported via `index.ts`.
`packages/config/`: `tsconfig.base.json`, `tsconfig.nestjs.json`, `tsconfig.nextjs.json`, `eslint-base.js`.

### Phase 4 — NestJS API Core
- `SupabaseModule` (global): `getAdminClient()` (service role, bypasses RLS),
  `getAuthClient(jwt)` (anon key + user JWT for RLS enforcement)
- `AuthModule`: `JwtStrategy` validates against `SUPABASE_JWT_SECRET`, `JwtAuthGuard`,
  `@GetUser()` extracts `{ userId, email, jwt }`
- `DocumentsModule`: CRUD via `getAuthClient(jwt)`, triggers `RagService.indexDocument()` async
- `ConfigModule` (global): Joi schema validates all env vars at startup
- `HealthModule`: `GET /health` via `@nestjs/terminus`

### Phase 5 — RAG Pipeline
**ChunkingService**: Recursive character splitting (2000-char target, 200-char min, 200-char
overlap). Separator priority: `'\n\n'` → `'. '` → `' '` → `''` (hard split).

**EmbeddingService**: Thin wrapper over `AiService.embed()`. Exists to separate concerns — RAG
code calls `EmbeddingService`, which calls `AiService`, which calls the provider.

**RagService**: `indexDocument()` — delete-then-insert (idempotent on update),
admin client for writes. `retrieveChunks()` — embeds query, calls `match_document_chunks` RPC
via auth client (RLS enforced).

**AiService**: Single OpenAI SDK instance with configurable `baseURL`. Methods: `chat()`,
`chatStream()` (AsyncIterable), `embed()` (batched, max 100/req).

### Phase 6 — Chat with Streaming + Citations
**ChatController**: `@Sse()` on `POST /chat/stream`. NestJS SSE requires an `Observable` return.

**ChatService**: Returns an `Observable<MessageEvent>` synchronously by wiring a `Subject`. The
async pipeline (`runStream`) fires in a `.catch()` chain without blocking the Observable return.

**SSE event sequence**:
```
sources  → { type: 'sources', data: JSON.stringify(Citation[]) }
chunk    → { type: 'chunk',   data: token }   (one per LLM token)
done     → { type: 'done',    data: '' }
```

### Phase 7 — Next.js Frontend Foundation
Supabase SSR via `@supabase/ssr`. Middleware refreshes sessions on every request and redirects
unauthenticated users to `/auth/login`. Root layout injects `QueryProvider`. The `(app)/`
route group has a Server Component layout that fetches the current user from Supabase.

### Phase 8 — Documents UI
Server Component list page fetches directly from Supabase (RLS applies). `DocumentList` is a
Client Component that manages optimistic deletes. `DocumentEditor` is shared by `/new` and
`/[id]/edit`, using TanStack Query mutations. Character count shows estimated chunk count.

### Phase 9 — Chat UI
`use-chat-stream` hook: `fetch()` POST → `ReadableStream` → `eventsource-parser` → React state.
Browser `EventSource` is not used because it only supports GET. `ChatMessage` renders streaming
cursor during streaming and collapsible citations when done. `ChatInput` sends on Enter, newline
on Shift+Enter.

### Phase 10 — Tests
**Unit (Jest)**:
- `chunking.service.spec.ts`: empty/whitespace, short text, split at CHUNK_SIZE, overlap, small-chunk merge, hard-split (no separators)
- `ai.service.spec.ts`: correct baseURL/model wired from config (mock OpenAI constructor), batch count
- `documents.service.spec.ts`: findAll, findOne 404, create + async indexing, remove

**Integration (Jest + supertest)** — require `supabase start`:
- `documents.integration.spec.ts`: full auth → CRUD → cross-user RLS block
- `rag.integration.spec.ts`: create doc → wait → verify chunk rows + embeddings

**E2E (Playwright)**:
- `auth.spec.ts`: redirect, register, login, bad credentials
- `documents.spec.ts`: create, edit, delete
- `chat.spec.ts`: send message, receive streaming response
- `rls-isolation.spec.ts`: two-browser-context cross-user isolation

### Phase 11 — Docker + Reproducibility
Multi-stage Dockerfiles (node:20-alpine build → slim runner). Next.js uses `output: 'standalone'`
for the production image. `docker-compose.yml` wires api + web with health checks; Supabase
local stack is managed separately via the CLI. `Makefile` provides `setup`, `dev`, `test`,
`build` targets.

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

# AI Provider (OpenAI-compatible)
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-ada-002   # must match vector(1536)

# App
API_PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Provider swap examples** (documented in ARCH.md):
- Groq: `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=llama3-70b-8192`
- Ollama: `AI_BASE_URL=http://localhost:11434/v1`, `AI_API_KEY=ollama`, `AI_MODEL=llama3`,
  `EMBEDDING_MODEL=nomic-embed-text` — requires schema migration to change `vector(1536)`

---

## Verification Milestones

| Milestone | Check |
|---|---|
| Phase 1 | `npm install` clean; turbo resolves workspace packages |
| Phase 2 | `supabase db reset` applies all 8 migrations; RLS visible in Studio |
| Phase 4 | `GET /health` → 200; `GET /documents` without token → 401 |
| Phase 5 | Create doc via API → `document_chunks` rows appear in Studio |
| Phase 6 | `curl -N -X POST /chat/stream` receives sources → chunk → done events |
| Phase 7 | `/` redirects to `/auth/login`; login persists on reload |
| Phase 8 | Document CRUD works end-to-end in browser |
| Phase 9 | Streaming response visible character-by-character; citations shown |
| Phase 10 | `npm test` passes (21 unit tests green) |
| Phase 11 | `docker compose up` → both services healthy |

---

## Stretch Goals

**Included**: Streaming AI responses (Phase 6), persistent conversation history (Phase 6 + Phase 2
migrations), source citations with similarity scores (Phase 6 + Phase 9).

**Excluded**: File upload (PDF/TXT), usage/token tracking view, Anthropic native SDK support
(use OpenRouter with `anthropic/claude-*` model string instead — same OpenAI-compatible path).
