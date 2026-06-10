-- Documents: users can only access their own documents
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (user_id = auth.uid());

-- Document chunks: access via join to documents (ownership check)
CREATE POLICY "Users can view chunks of their own documents"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chunks for their own documents"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete chunks of their own documents"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
        AND documents.user_id = auth.uid()
    )
  );
