-- Remove the fixed vector dimension so any embedding model can be used without
-- a schema migration when switching providers (OpenAI, Ollama, Groq, etc.).
--
-- Trade-off: the IVFFlat index requires a fixed dimension and is dropped here.
-- At knowledge-base scale (< 1M chunks) exact cosine search is fast enough.
-- If you commit to a specific provider and need the index back, run:
--   CREATE INDEX document_chunks_embedding_idx
--     ON document_chunks USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
-- (requires the column to be typed with a fixed dimension first)

BEGIN;

DROP INDEX IF EXISTS document_chunks_embedding_idx;

ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE document_chunks ADD COLUMN embedding vector;

-- Update match function — remove dimension from the parameter and return types
DROP FUNCTION IF EXISTS match_document_chunks(vector(768),  integer, uuid);
DROP FUNCTION IF EXISTS match_document_chunks(vector(1536), integer, uuid);

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector,
  match_count     integer DEFAULT 5,
  filter_user_id  uuid    DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  document_id    uuid,
  content        text,
  chunk_index    integer,
  similarity     float,
  document_title text
)
LANGUAGE plpgsql AS $$
BEGIN
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
