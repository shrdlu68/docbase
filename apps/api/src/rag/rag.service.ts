import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { RetrievedChunk } from '@docbase/types';

const MIN_CHUNK = 200;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private supabaseService: SupabaseService,
    private chunkingService: ChunkingService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Chunks, embeds, and stores document content in document_chunks.
   * Deletes existing chunks first to handle updates.
   */
  async indexDocument(
    documentId: string,
    content: string,
    userId: string,
    jwt: string,
  ): Promise<void> {
    if (content.trim().length < MIN_CHUNK) {
      this.logger.warn(`Document ${documentId} too short to index (${content.length} chars)`);
      return;
    }

    const adminClient = this.supabaseService.getAdminClient();

    // 1. Delete existing chunks
    const { error: deleteError } = await adminClient
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      this.logger.error(`Failed to delete existing chunks for ${documentId}:`, deleteError);
    }

    // 2. Chunk the text
    const chunks = this.chunkingService.chunk(content);
    if (chunks.length === 0) return;

    this.logger.log(`Indexing document ${documentId}: ${chunks.length} chunks`);

    // 3. Embed all chunks
    const embeddings = await this.embeddingService.embedChunks(chunks);

    // 4. Insert chunk rows
    const rows = chunks.map((chunkContent, index) => ({
      document_id: documentId,
      content: chunkContent,
      chunk_index: index,
      // pgvector requires JSON array string format
      embedding: JSON.stringify(embeddings[index]),
    }));

    const { error: insertError } = await adminClient.from('document_chunks').insert(rows);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    this.logger.log(`Document ${documentId} indexed successfully (${chunks.length} chunks)`);
  }

  /**
   * Embeds a query and retrieves the most similar document chunks.
   */
  async retrieveChunks(
    query: string,
    userId: string,
    jwt: string,
    topK = 5,
  ): Promise<RetrievedChunk[]> {
    const queryEmbedding = await this.embeddingService.embedQuery(query);

    const client = this.supabaseService.getAuthClient(jwt);
    const { data, error } = await client.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: topK,
      filter_user_id: userId,
    });

    if (error) {
      this.logger.error('Failed to retrieve chunks:', error);
      return [];
    }

    return (data as RetrievedChunk[]) ?? [];
  }
}
