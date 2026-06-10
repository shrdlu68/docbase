-- IVFFlat index for approximate nearest neighbor cosine similarity search
-- lists=100 is a good starting point for moderate dataset sizes
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
