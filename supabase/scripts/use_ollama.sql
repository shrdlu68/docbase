-- Switch embedding storage to 768 dimensions for Ollama (nomic-embed-text).
-- WARNING: drops all existing chunk embeddings. Re-index documents after running.

BEGIN;

-- 1. Remove the existing index before changing column type
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- 2. Replace the embedding column with the new dimension
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE document_chunks ADD COLUMN embedding vector(768);

-- 3. Recreate IVFFlat index
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. Replace match function — signature must match new dimension
DROP FUNCTION IF EXISTS match_document_chunks(vector(1536), integer, uuid);

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(768),
  match_count     INTEGER DEFAULT 5,
  filter_user_id  UUID    DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  document_id    UUID,
  content        TEXT,
  chunk_index    INTEGER,
  similarity     FLOAT,
  document_title TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL ivfflat.probes = 10;
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.title AS document_title
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE
    (filter_user_id IS NULL OR d.user_id = filter_user_id)
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMIT;
