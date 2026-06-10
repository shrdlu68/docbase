import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Document, CreateDocumentDto, UpdateDocumentDto } from '@docbase/types';

export const documentsApi = {
  list: () => apiGet<Document[]>('/documents'),
  get: (id: string) => apiGet<Document>(`/documents/${id}`),
  create: (dto: CreateDocumentDto) => apiPost<Document>('/documents', dto),
  update: (id: string, dto: UpdateDocumentDto) => apiPut<Document>(`/documents/${id}`, dto),
  delete: (id: string) => apiDelete(`/documents/${id}`),
};

export function estimateChunkCount(content: string): number {
  const CHUNK_SIZE = 2000;
  const words = content.split(/\s+/).length;
  const avgCharsPerWord = 5;
  const estimatedChars = words * avgCharsPerWord;
  return Math.max(1, Math.ceil(estimatedChars / CHUNK_SIZE));
}
