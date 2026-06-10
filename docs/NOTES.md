# Implementation Notes

Concrete lessons learned during implementation — the traps hit, how they were resolved,
and anything that differs from the original plan.

---

## 1. pgvector Embedding Format

**Problem**: supabase-js `insert()` does not serialise JS arrays to the pgvector wire format.
Passing a raw `number[]` silently stores `null` in the `embedding` column.

**Fix**: Always `JSON.stringify` before inserting:
```typescript
embedding: JSON.stringify(embeddings[index])
// ✗  embedding: embeddings[index]
// ✓  embedding: JSON.stringify(embeddings[index])
```

The same applies to the `query_embedding` RPC parameter:
```typescript
client.rpc('match_document_chunks', {
  query_embedding: JSON.stringify(queryEmbedding),
  ...
})
```

**Where**: `apps/api/src/rag/rag.service.ts:61`, `:86`

---

## 2. NestJS SSE Requires a Synchronous Observable Return

**Problem**: `@Sse()` handlers in NestJS must return an `Observable` synchronously. An `async`
function that `await`s before returning breaks the response handshake — the SSE connection
never opens.

**Fix**: Create a `Subject` synchronously, kick off the async pipeline in a non-blocking
`.catch()` chain, and return `subject.asObservable()` immediately:
```typescript
streamChat(dto, user): Observable<MessageEvent> {
  const subject = new Subject<MessageEvent>();
  this.runStream(dto, user, subject).catch(err => subject.error(err));
  return subject.asObservable(); // returned before runStream resolves
}
```

**Where**: `apps/api/src/chat/chat.service.ts:27-34`

---

## 3. Browser EventSource Cannot POST

**Problem**: The browser `EventSource` API only supports GET requests. The chat endpoint needs
a POST body (question, optional conversationId). Using `EventSource` directly would require
encoding the question in the URL — ugly and length-limited.

**Fix**: Use `fetch()` with `ReadableStream` and parse the raw SSE byte stream manually with
`eventsource-parser`:
```typescript
const response = await fetch('/chat/stream', { method: 'POST', body: JSON.stringify(dto) });
const reader = response.body.getReader();
const parser = createParser((event) => { /* dispatch by event.event type */ });
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  parser.feed(decoder.decode(value, { stream: true }));
}
```

**Where**: `apps/web/lib/hooks/use-chat-stream.ts`

---

## 4. eventsource-parser v2 API

**Problem**: `eventsource-parser` v2 changed its `createParser` signature. The v1 form
`createParser({ onEvent })` no longer works — the function now takes a callback directly.
Additionally, the callback receives a union type `ParsedEvent | ReconnectInterval`, so
the `event.type !== 'event'` guard is required to narrow to `ParsedEvent`.

**Fix**:
```typescript
// ✗ v1 — broken in v2
createParser({ onEvent(event) { ... } })

// ✓ v2
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser';
createParser((event: ParsedEvent | ReconnectInterval) => {
  if (event.type !== 'event') return;
  // event is now ParsedEvent — has .event and .data
})
```

**Where**: `apps/web/lib/hooks/use-chat-stream.ts:60`

---

## 5. Supabase RLS — Two Client Modes

RLS only fires when the request arrives authenticated. The service role key bypasses it
entirely. Two distinct paths are intentional:

| Client | Key used | RLS? | When to use |
|---|---|---|---|
| `getAuthClient(jwt)` | anon key + user JWT header | Yes | All user-facing queries |
| `getAdminClient()` | service role key | No | Internal ops: indexing, admin tasks |

**Critical**: document chunk *writes* during indexing use `getAdminClient()` because the
indexing job runs server-side after RLS-controlled document creation. The user's JWT is
still threaded through `indexDocument()` for future use but the actual Supabase writes use
the admin client. Chunk *reads* during retrieval use `getAuthClient(jwt)` so the SQL function
filters by `filter_user_id = auth.uid()`.

**Where**: `apps/api/src/supabase/supabase.service.ts`, `apps/api/src/rag/rag.service.ts`

---

## 6. Async Document Indexing (Fire-and-Forget)

Indexing a document involves an embedding API call (network latency) and a bulk insert.
Blocking the `POST /documents` response on this would make document creation feel slow.

The indexing is deliberately fire-and-forget:
```typescript
// In DocumentsService.create():
this.ragService.indexDocument(doc.id, doc.content, userId, jwt).catch((err) => {
  console.error(`Failed to index document ${doc.id}:`, err);
});
return doc; // returned immediately
```

**Trade-off**: the document is available in the UI immediately, but the chunks are not yet
searchable. For the typical use-case (create doc, then ask questions minutes later) this is
acceptable. For a production system, consider a job queue (BullMQ, pg-boss) to track indexing
state and expose it in the UI.

**Where**: `apps/api/src/documents/documents.service.ts:52-56`, `:76-80`

---

## 7. TypeScript Strict Mode — DTO Property Initializers

NestJS DTOs decorated with `class-validator` decorators trigger a TS strict error:
`Property has no initializer and is not definitely assigned in the constructor`.

Fix by using the definite assignment assertion (`!`):
```typescript
@IsString()
title!: string;
```

This is safe because class-validator validates presence at runtime before the value is used.
An empty `@IsString() title: string` initialised to `undefined` would never reach service
code — it would be rejected at the validation pipe.

**Where**: `apps/api/src/documents/dto/create-document.dto.ts`, `chat/dto/chat-stream.dto.ts`

---

## 8. `@supabase/ssr` v0.3 Requires `get`/`set`/`remove`, Not `getAll`/`setAll`

**Problem**: `@supabase/ssr` v0.3.0's `createServerClient` storage internally calls
`cookies.get(name)` to read the session. The `getAll`/`setAll` API only exists in v0.4+.
Using only `getAll`/`setAll` means `cookies.get` is undefined, so `getUser()` always
returns `AuthSessionMissingError` even with a valid cookie present.

**Fix**: Use the `get`/`set`/`remove` API:
```typescript
createServerClient(url, key, {
  cookies: {
    get(name: string) { return request.cookies.get(name)?.value; },
    set(name: string, value: string, options: Record<string, unknown>) { ... },
    remove(name: string, options: Record<string, unknown>) { ... },
  },
});
```

**Where**: `apps/web/lib/supabase/middleware.ts`, `apps/web/lib/supabase/server.ts`

---

## 9. IVFFlat Index and the `probes` Setting

The IVFFlat index (`lists=100`) trades recall for speed. With default `probes=1`, only 1% of
index cells are scanned per query — fast but lossy. Setting `probes=10` inside the SQL
function raises recall significantly at minimal cost for typical knowledge-base scale:

```sql
SET LOCAL ivfflat.probes = 10;
```

`SET LOCAL` scopes the change to the current transaction, so it does not affect other queries.

**Where**: `supabase/migrations/20240101000008_create_match_chunks_function.sql:20`

---

## 10. ChunkingService — Overlap is Applied Post-Merge

The three-pass structure of `ChunkingService.chunk()` matters:

1. `recursiveSplit()` — splits by separator priority, no knowledge of minimum size
2. `mergeSmallChunks()` — merges adjacent chunks below `MIN_CHUNK` (200 chars)
3. `addOverlap()` — prepends 200 chars from the previous chunk to each subsequent chunk

Overlap is added *after* merging so that the overlap is applied to final logical units, not
to fragments that will be joined anyway. Applying overlap before merging would corrupt the
merge step (it checks `length <= CHUNK_SIZE`, so pre-overlapped text could push merged chunks
over the limit).

**Where**: `apps/api/src/rag/chunking.service.ts`

---

## 11. NestJS Module Dependency Graph

The module dependency order matters for circular dependency prevention:

```
AiModule (global)
  └─ used by RagModule
       └─ used by DocumentsModule
       └─ used by ChatModule
SupabaseModule (global)
  └─ used by RagModule, DocumentsModule, ChatModule
AuthModule
  └─ used by DocumentsModule, ChatModule (via JwtAuthGuard)
```

`AiModule` and `SupabaseModule` are marked `@Global()`, so they do not need to be imported
by every consuming module — they are available project-wide once imported in `AppModule`.

---

## 12. Post-Login Redirect Must Use `window.location.assign`, Not `router.push`

**Problem**: After `supabase.auth.signInWithPassword()` succeeds client-side, calling
`router.push('/documents')` + `router.refresh()` keeps the user on `/auth/login`.
`router.push` fires an RSC fetch that the middleware intercepts, but Next.js App Router
does not follow middleware redirects within RSC payload fetches the same way a full
navigation would.

**Fix**: Use a hard redirect after sign-in:
```typescript
await supabase.auth.signInWithPassword({ email, password });
window.location.assign('/documents'); // forces a full page load — cookies travel with it
```

The middleware then sees the session cookie on the fresh request and allows the
`/documents` route. For post-mutation redirects within authenticated pages (e.g. after
creating a document), `router.push` works correctly because the middleware session is
already established.

**Where**: `apps/web/components/features/auth/auth-form.tsx:29`

---

## 13. Supabase Local Now Issues ES256 JWTs (Not HS256)

**Problem**: Supabase local v2.189+ signs access tokens with **ES256** (ECDSA P-256),
not HS256. The NestJS `JwtStrategy` was configured with `secretOrKey: SUPABASE_JWT_SECRET`
(the symmetric HS256 secret), which rejects all ES256 tokens with a 401.

**Fix**: Obtain the EC public key from the JWKS endpoint and configure the strategy to
use it when present:
```bash
curl http://127.0.0.1:54321/auth/v1/.well-known/jwks.json
# Convert x/y coords to PEM via node crypto.createPublicKey({ key: jwk, format: 'jwk' })
```
```typescript
// jwt.strategy.ts
const publicKey = configService.get<string>('SUPABASE_JWT_PUBLIC_KEY');
super({
  secretOrKey: publicKey ? Buffer.from(publicKey.replace(/\\n/g, '\n')) : secret,
  algorithms: publicKey ? ['ES256'] : ['HS256'],
});
```

Add `SUPABASE_JWT_PUBLIC_KEY` to `.env` (optional; falls back to HS256 for older Supabase):
```bash
SUPABASE_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
```

**Where**: `apps/api/src/auth/jwt.strategy.ts`, `.env`

---

## 14. React Hydration Race in Playwright Tests

**Problem**: After navigating to a Next.js Client Component page (`/documents/new`),
Playwright can call `fill()` before React has hydrated the controlled inputs. The fill
sets the DOM value but React's `onChange` does not fire. On the next React render (e.g.,
triggered by a button click), React overwrites the DOM value with its state (`""`),
making the form appear empty and silently submitting blank data.

**Symptom**: Screenshots show placeholder text in all fields immediately after clicking
"Create document", and the URL stays at `/documents/new`.

**Fix**: Add `await page.waitForLoadState('networkidle')` after navigation and before
filling any controlled inputs:
```typescript
await page.goto('/documents/new');
await page.waitForLoadState('networkidle'); // ← wait for React hydration
await page.getByLabel('Title').fill('My Document');
```

**Where**: `apps/web/e2e/documents.spec.ts`

---

## 15. NestJS SSE — `done` Event Must Have Non-Empty Data

**Problem**: NestJS's `SseStream._transform` skips the `data:` field when `message.data` is
falsy (empty string). Per the SSE spec, an event with an empty data buffer is discarded by
the browser's SSE parser. The `done` event `{ type: 'done', data: '' }` was never dispatched
to the `eventsource-parser` callback, so `setIsStreaming(false)` was never called and the
Send button stayed permanently disabled after a successful response.

**Fix**: Use a non-empty `data` value:
```typescript
// ✗ data: '' is falsy → SseStream omits the data: field → event discarded by SSE parser
subject.next({ type: 'done', data: '' } as MessageEvent);

// ✓
subject.next({ type: 'done', data: 'done' } as MessageEvent);
```

**Where**: `apps/api/src/chat/chat.service.ts`

---

## 16. NestJS SSE — Use `subject.complete()` Instead of `subject.error()` on Errors

**Problem**: When the chat stream fails (e.g., AI API call throws), calling `subject.error(err)`
on the RxJS Subject does not reliably close the HTTP SSE stream. The browser's `fetch` reader
stays blocked in `reader.read()` indefinitely, keeping `isStreaming: true`.

**Fix**: In the error path, emit the `done` event and call `subject.complete()`:
```typescript
} catch (err) {
  try {
    subject.next({ type: 'done', data: 'done' } as MessageEvent);
    subject.complete();
  } catch { /* subject may already be completed */ }
  throw err;
}
```

**Where**: `apps/api/src/chat/chat.service.ts`

---

## 17. TanStack Query Devtools Overlaps UI Elements

**Problem**: The TanStack Query devtools floating button defaults to `bottom-right`, which
overlaps the chat Send button. Playwright cannot click the Send button because the devtools
SVG intercepts pointer events.

**Fix**: Move devtools to `bottom-left`:
```typescript
<ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
```

**Where**: `apps/web/components/providers/query-provider.tsx`

---

## 18. Playwright `[role="main"]` vs `main` Selector

**Problem**: `page.locator('[role="main"]')` is a CSS attribute selector — it matches elements
with an explicit `role="main"` HTML attribute. It does NOT match the `<main>` HTML element,
which has an implicit ARIA role of "main" but no `role="main"` attribute.

**Fix**: Use the CSS tag selector or `getByRole`:
```typescript
// ✗ CSS attribute selector — won't find implicit ARIA roles
await expect(page.locator('[role="main"]')).toContainText(...)

// ✓ CSS tag selector
await expect(page.locator('main')).toContainText(...)

// ✓ Playwright ARIA role query
await expect(page.getByRole('main')).toContainText(...)
```

**Where**: `apps/web/e2e/chat.spec.ts`

---

## 19. Chat Send Button Requires Non-Empty Input

**Problem**: The Send button is `disabled={!value.trim() || isStreaming}`. After sending a
message, the input is cleared. So even after `isStreaming` becomes `false`, the button stays
disabled because the textarea is empty. A Playwright test asserting `toBeEnabled()` right after
streaming will always fail.

**Fix**: Fill the textarea before asserting the button is enabled:
```typescript
await expect(page.locator('main')).toContainText(/expected response/i, { timeout: 90000 });
await textarea.fill('follow-up');
await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 10000 });
```

**Where**: `apps/web/e2e/chat.spec.ts`

---

## 20. Knowledge-Base Index Injected Into Every System Prompt

**Problem**: "What documents do I have?" (and similar meta-questions) return unhelpful answers
because they have near-zero semantic similarity to document chunk content — RAG retrieves
nothing, so the model has no context.

**Fix**: Before building the system prompt, fetch all user documents (title, tags, created_at)
and inject them as a `<knowledge_base_index>` section that is *always* present regardless of
RAG results:

```typescript
// In chat.service.ts runStream():
const { data: allDocs } = await client
  .from('documents')
  .select('id, title, tags, created_at')
  .order('created_at', { ascending: false });
// ...
const systemPrompt = this.buildSystemPrompt(chunks, allDocs ?? []);
```

The system prompt now has two context layers:
1. `<knowledge_base_index>` — every document title/tags/date (always present)
2. `<retrieved_chunks>` — semantically relevant excerpts (only when RAG finds matches)

Instructions tell the model to use the index for meta-questions and chunks for content questions.

**Where**: `apps/api/src/chat/chat.service.ts`

---

## 21. Test Results (Final)

All unit tests pass:

```
PASS  src/ai/ai.service.spec.ts
PASS  src/rag/chunking.service.spec.ts
PASS  src/documents/documents.service.spec.ts

Test Suites: 3 passed
Tests:       21 passed
```

All 13 Playwright E2E tests also pass (with Supabase local + valid AI credentials):

```
13 passed (32.4s)
  ✓ auth.spec.ts (5 tests)
  ✓ chat.spec.ts (3 tests)
  ✓ documents.spec.ts (4 tests)
  ✓ rls-isolation.spec.ts (1 test)
```

Integration tests (`test/*.integration.spec.ts`) require a running Supabase instance and valid
AI credentials. See `ARCH.md` for the test strategy and `docs/GUIDE.md` for how to run them.
