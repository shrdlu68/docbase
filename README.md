# Docbase — AI-Powered Knowledge Base

A full-stack RAG (Retrieval-Augmented Generation) application. Users store documents in a personal knowledge base and query them through a streaming AI chat interface that cites its sources.

---

## Walkthroughs

| | Link |
|---|---|
| **App demo** (features, chat, citations) | _[Loom link — https://www.loom.com/share/056d08df6f8341719bcdeecf1c8d6d00]_ |
| **AI-assisted development workflow** | _[Loom link — https://www.loom.com/share/002a9dda584241fc8ae4c08a1cc01abb]_ |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Frontend | Next.js 14 (App Router), Tailwind CSS, TanStack Query |
| Backend | NestJS |
| Database | Supabase (PostgreSQL + pgvector) with Row Level Security |
| AI | OpenAI SDK with configurable `baseURL` — works with any OpenAI-compatible provider |
| Testing | Jest (unit + integration), Playwright (E2E) |

---

## Quick Start

**Prerequisites**: Node 20, [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
# 1. Clone
git clone <repo-url> && cd docbase

# 2. Bootstrap (installs deps, starts Supabase, applies all migrations)
make setup

# 3. Configure environment
#    make setup created .env from .env.example — fill in your AI_API_KEY,
#    then paste the Supabase keys printed by 'supabase start' above.
#    (anon key, service_role key, JWT secret)
$EDITOR .env

# 4. Start both services
make dev
#  → API:    http://localhost:3001
#  → Web:    http://localhost:3000
#  → Studio: http://localhost:54323
```

See [`docs/GUIDE.md`](docs/GUIDE.md) for the full reference (API endpoints, test commands, Docker, adding features).
See [`docs/ENV.md`](docs/ENV.md) for every environment variable and how to obtain its value.

---

## Swapping AI Providers

The AI layer uses a single OpenAI SDK instance with a configurable `baseURL`. No code changes are needed — edit `.env` and restart the API:

```bash
# Groq — fast, free tier
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=llama3-70b-8192

# Ollama — fully local
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llama3

# OpenRouter — access Anthropic/Google/Meta via one key
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-...
AI_MODEL=anthropic/claude-3-haiku
```

The default config uses `gpt-4o-mini` for chat and `text-embedding-ada-002` for embeddings. The DB uses a dimensionless `vector` column — any embedding model works without a schema migration.

For one-command switching between OpenAI and a local Ollama instance:

```bash
make use-ollama   # patches .env for llama3.2 + nomic-embed-text, saves OpenAI key
make use-openai   # restores .env to gpt-4o-mini + ada-002
# then restart the API and re-index documents
```

---

## Architecture Decisions

Eight documented decisions in [`docs/ARCH.md`](docs/ARCH.md). The most consequential:

### 1. Turborepo monorepo
Shared types (`@docbase/types`) and config (`@docbase/config`) are referenced via TypeScript path aliases — no publish step, changes are immediately visible in both apps. Turbo's task pipeline caches unchanged outputs and enforces build ordering.

### 2. Supabase + Row Level Security
RLS is enforced at the database layer. Even if application code constructs a wrong query, a user cannot read another user's data because the anon-key client only sees rows where `user_id = auth.uid()`. pgvector is a first-class Supabase extension — no separate vector store needed.

Two client modes are used deliberately:
- `getAuthClient(jwt)` — for all user-facing queries; RLS applies
- `getAdminClient()` — only for background indexing writes where the user's identity was already established upstream

### 3. Single AI abstraction
One `AiService` backed by the OpenAI SDK covers every provider worth using today. No adapter interface needed: every production provider (Groq, Together, OpenRouter, Ollama) exposes an OpenAI-compatible endpoint. If a fundamentally different provider (Anthropic native, Vertex) is required, the interface extraction is straightforward.

### 4. RAG chunking strategy
Recursive character splitting: paragraph → sentence → word → character separator priority, 2000-char target, 200-char minimum, 200-char overlap. Overlap is applied _after_ merging small chunks, so it lands on final logical units not on fragments. 200-char overlap ensures answers that span a chunk boundary still retrieve both halves.

### 5. SSE over WebSockets
Chat streaming is unidirectional (server → client), which exactly matches SSE semantics. NestJS has first-class `@Sse()` support. The trade-off: browser `EventSource` only supports GET. Solved on the client with `fetch()` + `ReadableStream` + `eventsource-parser`.

### 6. Knowledge-base index in every prompt
RAG retrieves chunks by cosine similarity, which breaks for meta-questions like _"what documents do I have?"_ — they have near-zero similarity to any document content. The system prompt always injects a `<knowledge_base_index>` listing every document title, tags, and date, alongside the retrieved chunks. This makes both meta-questions and content questions answerable.

Full reasoning for all decisions: [`docs/ARCH.md`](docs/ARCH.md).

---

## What I Would Improve

Given more time, in priority order:

**1. File upload (PDF, TXT, Markdown)**
Currently users paste text. A file upload endpoint with a parsing layer (pdf-parse, remark) would cover most real-world knowledge-base content.

**2. Indexing status in the UI**
Document indexing is fire-and-forget. A user who uploads a large document and immediately asks about it gets no results. A job queue (BullMQ or pg-boss) with a status column on the `documents` table would let the UI show an "indexing…" indicator.

**3. Re-ranking**
The top-5 cosine similarity results are passed directly to the model. A cross-encoder re-ranker (Cohere Rerank, a local BAAI/bge-reranker) would improve precision — especially for long documents where many chunks score similarly.

**4. Streaming conversation selector**
The chat UI has no conversation history sidebar. Users can continue a conversation within a session (the `conversationId` is threaded through SSE), but there's no way to return to a previous conversation. The API already has `GET /chat/conversations` and `GET /chat/conversations/:id/messages`.

**5. Rate limiting and token budgets**
The chat endpoint has no rate limiting. A per-user token counter (stored in Supabase, decremented per streaming response) would be necessary before any multi-tenant deployment.

**6. Hybrid search**
Pure vector search misses keyword matches. Combining pgvector cosine similarity with PostgreSQL full-text search (`ts_rank`) in a weighted hybrid query would improve recall for queries that contain proper nouns, version numbers, or other terms that embeddings handle poorly.

---

## Project Structure

```
apps/
  api/          NestJS — auth, documents, RAG pipeline, SSE chat
  web/          Next.js 14 — documents UI, streaming chat, citations
packages/
  types/        Shared TypeScript interfaces
  config/       Shared tsconfig and ESLint bases
supabase/
  migrations/   9 ordered SQL migrations (pgvector, tables, RLS, functions, dimensionless vector)
docs/
  ARCH.md       Architecture decisions with justifications
  GUIDE.md      Setup, API reference, test map, Docker, adding features
  ENV.md        Every environment variable explained
  DATABASE.md   Schema reference
  NOTES.md      Implementation lessons (gotchas hit and how they were resolved)
```

---

## Running Tests

```bash
# Unit tests (no external deps)
cd apps/api && npm test

# E2E tests (requires make dev running)
cd apps/web && npx playwright test

# Headed, slowed down for human observation
cd apps/web && SLOWMO=800 npx playwright test --headed
```

21 unit tests, 14 Playwright E2E tests (auth, documents, chat with live AI, RLS isolation).

---

## License

MIT
