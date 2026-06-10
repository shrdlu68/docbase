# Database Reference

Schema, migration log, query patterns, and maintenance procedures.

---

## Migration Log

Migrations live in `supabase/migrations/` as ordered SQL files. Apply with:

```bash
supabase db reset       # drops and re-applies all migrations (local dev)
supabase db push        # applies pending migrations to a remote project
supabase migration new <name>  # generates the next timestamped file
```

| File | What it does |
|---|---|
| `20240101000001_enable_pgvector.sql` | `CREATE EXTENSION IF NOT EXISTS vector` |
| `20240101000002_create_documents.sql` | `documents` table + `updated_at` trigger |
| `20240101000003_create_document_chunks.sql` | `document_chunks` table with `embedding vector(1536)` |
| `20240101000004_create_rls_policies.sql` | All RLS policies for both tables |
| `20240101000005_create_vector_index.sql` | IVFFlat index on `document_chunks.embedding` |
| `20240101000006_create_conversations.sql` | `conversations` table + RLS |
| `20240101000007_create_messages.sql` | `messages` table + RLS |
| `20240101000008_create_match_chunks_function.sql` | `match_document_chunks()` SQL function |

---

## Table Definitions

### `documents`

```sql
CREATE TABLE documents (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  tags       TEXT[]      DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- auto-updated via trigger
);
```

RLS policies: users can SELECT/INSERT/UPDATE/DELETE their own rows (`user_id = auth.uid()`).

### `document_chunks`

```sql
CREATE TABLE document_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  chunk_index  INTEGER     NOT NULL,
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS policies: access permitted when a matching `documents` row has `user_id = auth.uid()`.
Chunks are written with the admin client during indexing (RLS bypassed); they are read via
the auth client through the `match_document_chunks` RPC (RLS enforced via `filter_user_id`).

Index:
```sql
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### `conversations`

```sql
CREATE TABLE conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: SELECT/INSERT/UPDATE/DELETE for own rows.

### `messages`

```sql
CREATE TABLE messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: access via JOIN to `conversations` where `user_id = auth.uid()`.

---

## SQL Function: `match_document_chunks`

```sql
SELECT * FROM match_document_chunks(
  query_embedding  := '[0.1, 0.2, ...]'::vector,  -- JSON array string
  match_count      := 5,                           -- default 5
  filter_user_id   := 'uuid-of-user'               -- NULL = no user filter
);
```

Returns: `id, document_id, content, chunk_index, similarity (FLOAT), document_title`.

The function sets `ivfflat.probes = 10` for the duration of its transaction to improve
recall over the default `probes=1`. Similarity is `1 - cosine_distance` (range 0–1).

---

## Query Patterns

### List documents (user-scoped, newest first)

```typescript
const { data } = await authClient
  .from('documents')
  .select('*')
  .order('created_at', { ascending: false });
```

### Get a single document (returns null if not owned by current user)

```typescript
const { data } = await authClient
  .from('documents')
  .select('*')
  .eq('id', documentId)
  .single();  // throws if 0 or >1 rows
```

### Insert chunks (admin client — user ownership already verified)

```typescript
await adminClient.from('document_chunks').insert(
  chunks.map((content, index) => ({
    document_id: documentId,
    content,
    chunk_index: index,
    embedding: JSON.stringify(embeddingVector),  // ← must stringify
  }))
);
```

### Vector similarity search (via RPC)

```typescript
const { data } = await authClient.rpc('match_document_chunks', {
  query_embedding: JSON.stringify(queryEmbedding),  // ← must stringify
  match_count: 5,
  filter_user_id: userId,
});
```

### Delete chunks before re-indexing

```typescript
await adminClient
  .from('document_chunks')
  .delete()
  .eq('document_id', documentId);
```

---

## Changing the Embedding Dimension

If you switch to an embedding model with different output dimensions (e.g., Ollama's
`nomic-embed-text` at 768 dims):

1. Create a new migration:
   ```bash
   supabase migration new change_embedding_dimension_768
   ```

2. Write the migration:
   ```sql
   -- Drop and recreate the index (it's dimension-specific)
   DROP INDEX IF EXISTS document_chunks_embedding_idx;

   -- Alter the column
   ALTER TABLE document_chunks
     ALTER COLUMN embedding TYPE vector(768);

   -- Recreate the index for the new dimension
   CREATE INDEX document_chunks_embedding_idx
     ON document_chunks
     USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 100);

   -- Update the function signature
   CREATE OR REPLACE FUNCTION match_document_chunks(
     query_embedding vector(768),
     ...
   ```

3. Update `EMBEDDING_MODEL` in `.env`.

4. Delete all existing chunks (they are the wrong dimension) and re-index:
   ```sql
   DELETE FROM document_chunks;
   ```
   Then trigger re-indexing via the API or directly.

**Do not mix dimensions** — a 768-dim query vector cannot be compared to 1536-dim stored
vectors. The function call will fail with a type error.

---

## Inspecting Data Locally

Supabase Studio runs at `http://localhost:54323` when you have `supabase start` active.

Useful queries to run in the Studio SQL editor:

```sql
-- How many chunks per document?
SELECT d.title, count(dc.id) AS chunks
FROM documents d
LEFT JOIN document_chunks dc ON dc.document_id = d.id
GROUP BY d.id, d.title
ORDER BY chunks DESC;

-- Documents with no chunks (indexing failed or too short)
SELECT d.id, d.title, length(d.content) AS content_length
FROM documents d
WHERE NOT EXISTS (
  SELECT 1 FROM document_chunks dc WHERE dc.document_id = d.id
);

-- Check embedding is populated (not null)
SELECT id, chunk_index, embedding IS NOT NULL AS has_embedding
FROM document_chunks
ORDER BY chunk_index;

-- Test the similarity function directly
SELECT * FROM match_document_chunks(
  '[' || array_to_string(array_fill(0::float, ARRAY[1536]), ',') || ']',
  5,
  NULL
);
```
