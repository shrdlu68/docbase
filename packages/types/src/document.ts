export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding?: number[];
  created_at: string;
}

export interface CreateDocumentDto {
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateDocumentDto {
  title?: string;
  content?: string;
  tags?: string[];
}
