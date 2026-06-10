-- Function to find document chunks similar to a query embedding
-- Uses cosine similarity via pgvector with IVFFlat probes for better recall
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 5,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  document_title TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Increase probes for better recall at slight performance cost
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
