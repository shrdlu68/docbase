# Architecture: Constraints, Decisions, and Justifications

---

## Constraints

These were fixed before any design work began. Decisions had to work within them.

| Constraint | Impact |
|---|---|
| npm only (no pnpm) | Turborepo workspace syntax uses `*` version references, not `workspace:*` |
| Node 20 (system) | Async iterators, `using` declarations, and ESM all available natively |
| Supabase for auth + DB | JWT format is dictated; RLS is the primary authorization mechanism |
| OpenAI-compatible AI | A single SDK covers all providers; no Anthropic SDK |
| `vector(1536)` in schema | Embedding model must produce 1536-dimensional vectors unless schema is migrated |

---

## Decision 1 — Monorepo with Turborepo

**Decision**: Turborepo + npm workspaces over a flat multi-repo setup.

**Justification**:
- Shared types (`@docbase/types`) and config (`@docbase/config`) are referenced directly via
  TypeScript path aliases. No publish step; changes in `packages/types` are immediately visible
  in both apps.
- Turbo's task pipeline enforces correct build ordering (`build` before `test`) and caches
  unchanged outputs. A cold `turbo run build` builds everything; subsequent runs skip unchanged
  packages.
- The `globalEnv` list in `turbo.json` ensures environment variable changes properly bust the
  cache — without it, a changed `AI_MODEL` would not trigger a rebuild.

**Alternative considered**: separate repos with published npm packages. Rejected because the
iteration cost (publish → bump → install) is too high during initial development.

---

## Decision 2 — Supabase for Auth, Database, and RLS

**Decision**: Supabase (hosted PostgreSQL + pgvector + auth) rather than self-managed Postgres
with a separate auth library.

**Justification**:
- Row Level Security is enforced at the database layer. Even if application code has a bug that
  constructs the wrong query, a user cannot read another user's data because the anon-key client
  will only ever see rows where `user_id = auth.uid()`.
- Supabase auth issues JWTs signed with `SUPABASE_JWT_SECRET`. The NestJS `JwtStrategy` validates
  these directly — no Supabase auth SDK is needed on the API side.
- `pgvector` is a first-class Supabase extension. No separate vector store is needed.

**RLS enforcement rule**: `getAuthClient(jwt)` is used for *all* user-facing queries.
`getAdminClient()` is used *only* for server-side internal operations (chunk indexing) where
the user's identity is already established earlier in the call chain.

**Never do this**:
```typescript
// ✗ bypasses RLS — user could see other users' data
const client = this.supabaseService.getAdminClient();
const { data } = await client.from('documents').select('*');
```

---

## Decision 3 — Single AI Abstraction (AiService)

**Decision**: One `AiService` class backed by the OpenAI SDK with a configurable `baseURL`,
rather than provider-specific services or an adapter interface.

**Justification**:
- Every production provider worth using (Groq, Together, OpenRouter, Ollama) exposes an
  OpenAI-compatible endpoint. A configurable `baseURL` handles all of them without any
  conditional logic.
- No adapter interface is needed today. If a provider requires fundamentally different
  behaviour (e.g., Anthropic native, Google Vertex), an interface can be extracted then.
  YAGNI until that moment.

**Provider swap**: change two env vars, restart. No code changes required:

| Provider | `AI_BASE_URL` | `AI_MODEL` | Notes |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Default |
| Groq | `https://api.groq.com/openai/v1` | `llama3-70b-8192` | Fast inference |
| Together | `https://api.together.xyz/v1` | `mistralai/Mixtral-8x7B-Instruct-v0.1` | |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3-haiku` | Access Anthropic via OpenAI SDK |
| Ollama | `http://localhost:11434/v1` | `llama3` | `AI_API_KEY=ollama`; see embedding note below |

**Ollama + embeddings**: `nomic-embed-text` produces 768-dimensional vectors.
The schema defines `vector(1536)`. To use Ollama for embeddings, run a migration that
changes the column and function signature to `vector(768)`, and update `EMBEDDING_MODEL`.
Do not mix embedding models across indexed documents.

---

## Decision 4 — RAG Architecture

### Chunking strategy

**Decision**: Recursive character splitting with paragraph → sentence → word → character
separator priority, 2000-char target size, 200-char minimum, 200-char overlap.

**Justification**:
- Paragraph boundaries (`\n\n`) are the strongest semantic signals. Splitting there preserves
  context better than arbitrary length splits.
- The 200-char overlap ensures a question whose answer spans a chunk boundary still retrieves
  both halves via cosine similarity — one chunk will contain the tail of the preceding chunk.
- 2000 chars (~400 tokens) leaves headroom in the 1536-token context limit of
  `text-embedding-ada-002` while keeping chunks large enough to be semantically coherent.

**Known limit**: the overlap is prepended verbatim from the previous chunk's trailing 200 chars.
This means the overlap text is re-stored in the database. It trades storage (approx. +10% per
document) for retrieval quality. Acceptable at knowledge-base scale.

### Vector index

**Decision**: IVFFlat with `lists=100`, `probes=10`.

**Justification**:
- IVFFlat is the pragmatic default for pgvector up to ~1M vectors. HNSW is faster at query
  time but slower to build and uses more memory — not necessary at this scale.
- `lists=100` follows the rule of thumb: `sqrt(n)` where n is expected row count (~10,000
  chunks). More lists = finer partitioning = faster queries but worse recall if probes are low.
- `probes=10` (10% of cells scanned) gives good recall without meaningfully affecting query
  latency at knowledge-base scale. The `SET LOCAL` in the SQL function scopes this setting to
  the transaction so it does not pollute the connection pool state.

### Indexing is admin-client, retrieval is auth-client

The indexing pipeline (`RagService.indexDocument`) uses `getAdminClient()` for the delete and
insert operations. This is correct because:
1. The document already exists — its ownership was verified when it was created via the
   auth client.
2. The RLS policy on `document_chunks` allows insert only when the parent document belongs to
   the current user. The admin client bypasses this check, but the document_id is always
   derived from a document the user owns (the API has already confirmed this above in the call
   chain).
3. The embedding API call is network I/O; using the admin client avoids re-validating the JWT
   in a background task where the original request context is gone.

Retrieval uses `getAuthClient(jwt)` because the `match_document_chunks` function accepts
`filter_user_id` — but this is defence-in-depth, not the primary guard. The primary guard is
that the SQL function joins to `documents` and the auth client's RLS would block cross-user
access at the row level regardless.

---

## Decision 5 — SSE over WebSockets for Streaming

**Decision**: Server-Sent Events (SSE) rather than WebSockets for the chat stream.

**Justification**:
- SSE is unidirectional (server → client), which exactly matches the use case: the client
  sends a question (one message), the server streams tokens (many messages). WebSockets add
  bidirectional complexity for no benefit here.
- NestJS has first-class `@Sse()` support returning an `Observable`. The integration is a
  single decorator with no extra server setup.
- SSE works over HTTP/1.1. WebSockets require a protocol upgrade, which is more complex to
  configure behind proxies and load balancers.

**Trade-off**: Browser `EventSource` only supports GET. The chat endpoint needs a POST body.
This is solved on the client by using `fetch()` + `ReadableStream` + `eventsource-parser`
to decode the raw SSE format manually. See `NOTES.md §3` for the implementation detail.

---

## Decision 6 — Next.js App Router with Server Components for Auth

**Decision**: App Router (Next.js 14) with Server Components for the protected layout and
initial data fetches.

**Justification**:
- The `(app)/layout.tsx` is a Server Component that calls `supabase.auth.getUser()`. This
  runs on the server and is not visible to the client, so the session check is unforgeable.
- Document list and detail pages are Server Components that fetch directly from Supabase with
  the SSR client. This means zero loading states for initial navigation — the page is fully
  rendered before the first byte reaches the browser.
- Mutations (create, update, delete) are Client Components using TanStack Query. This gives
  optimistic updates and precise cache invalidation without round-tripping through Server
  Actions.

**Pattern**: Server Component for reads, Client Component for writes. The boundary is explicit
by the presence or absence of `'use client'` at the top of a file.

---

## Decision 7 — Conversation Persistence

**Decision**: Persist every message (user and assistant) to the `messages` table with a
`conversation_id` FK.

**Justification**:
- The `HISTORY_LIMIT=10` messages are injected into every prompt, giving the model continuity
  across a session.
- The assistant response is saved *after* streaming completes (accumulated from tokens). This
  means the database row is consistent — it never contains a partial response.
- Conversations are created lazily: the first message creates the conversation, and its title
  is derived from the first question (truncated to 60 chars). No explicit "new conversation"
  creation step is required from the client.

---

## Decision 8 — No ORM

**Decision**: Use the Supabase JS client directly instead of Prisma, TypeORM, or Drizzle.

**Justification**:
- The Supabase client generates types from the schema (`supabase gen types`) and has a
  query builder that covers all required operations (select, insert, update, delete, rpc).
- Adding an ORM layer would require a second schema definition (Prisma schema or TypeORM
  entities) that must be kept in sync with the Supabase migrations. This is unnecessary
  duplication.
- Migrations are managed by the Supabase CLI (`supabase db reset`, `supabase migration new`).
  They are plain SQL, which is readable, composable, and version-controlled without any
  ORM-specific tooling.

---

## Database Schema

```
auth.users (managed by Supabase)
    │
    ├── documents
    │   ├── id          UUID PK
    │   ├── user_id     UUID → auth.users (CASCADE DELETE)
    │   ├── title       TEXT
    │   ├── content     TEXT
    │   ├── tags        TEXT[]
    │   ├── created_at  TIMESTAMPTZ
    │   └── updated_at  TIMESTAMPTZ (auto via trigger)
    │        │
    │        └── document_chunks
    │            ├── id           UUID PK
    │            ├── document_id  UUID → documents (CASCADE DELETE)
    │            ├── content      TEXT
    │            ├── chunk_index  INTEGER
    │            ├── embedding    vector(1536)
    │            └── created_at   TIMESTAMPTZ
    │
    ├── conversations
    │   ├── id          UUID PK
    │   ├── user_id     UUID → auth.users (CASCADE DELETE)
    │   ├── title       TEXT
    │   └── created_at  TIMESTAMPTZ
    │        │
    │        └── messages
    │            ├── id                UUID PK
    │            ├── conversation_id   UUID → conversations (CASCADE DELETE)
    │            ├── role              TEXT CHECK ('user'|'assistant')
    │            ├── content           TEXT
    │            └── created_at        TIMESTAMPTZ

Functions:
  match_document_chunks(query_embedding, match_count, filter_user_id)
    → cosine similarity search with IVFFlat probes=10, user-scoped

Indexes:
  document_chunks_embedding_idx  USING ivfflat (embedding vector_cosine_ops) lists=100
```

**Cascade rules**: Deleting a user deletes their documents. Deleting a document deletes its
chunks (the index stays consistent automatically). Deleting a conversation deletes its messages.

---

## Security Model

| Threat | Mitigation |
|---|---|
| Unauthenticated API access | `JwtAuthGuard` on all routes except `/health` |
| Cross-user data access | RLS policies on all tables + `filter_user_id` in SQL function |
| JWT forgery | Supabase signs JWTs with `SUPABASE_JWT_SECRET`; NestJS `JwtStrategy` verifies |
| Service role key exposure | Key is server-only; never sent to client; not in `NEXT_PUBLIC_*` vars |
| Prompt injection via document content | Documents are owned by the user asking the question; a user can only inject into their own context |

**Not addressed** (out of scope for v1):
- Rate limiting on the chat endpoint
- Chunk deduplication after re-indexing
- Embedding model poisoning (inserting adversarial documents to manipulate another user's search results — impossible here due to per-user RLS, but relevant in multi-tenant shared-index scenarios)
