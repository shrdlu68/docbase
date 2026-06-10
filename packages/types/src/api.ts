export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChatStreamRequest {
  conversationId?: string;
  question: string;
}

export interface SseEvent {
  type: 'sources' | 'chunk' | 'done' | 'error';
  data: string;
}
