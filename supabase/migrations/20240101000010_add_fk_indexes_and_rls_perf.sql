-- Foreign key indexes: every FK column needs an index for fast JOINs,
-- ON DELETE CASCADE operations, and RLS policy evaluation.
CREATE INDEX IF NOT EXISTS documents_user_id_idx            ON documents          (user_id);
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx  ON document_chunks    (document_id);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx        ON conversations      (user_id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx     ON messages           (conversation_id);

-- RLS performance: wrapping auth.uid() in a sub-SELECT causes Postgres to
-- evaluate it once per statement rather than once per row.
-- Re-create all policies that call auth.uid() directly.

-- Documents
DROP POLICY IF EXISTS "Users can view their own documents"   ON documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;

CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING    (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- Document chunks (the EXISTS subqueries already cache auth.uid implicitly,
-- but wrapping it explicitly is still the clearest form)
DROP POLICY IF EXISTS "Users can view chunks of their own documents"   ON document_chunks;
DROP POLICY IF EXISTS "Users can insert chunks for their own documents" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete chunks of their own documents" ON document_chunks;

CREATE POLICY "Users can view chunks of their own documents"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert chunks for their own documents"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete chunks of their own documents"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = (SELECT auth.uid())
    )
  );
