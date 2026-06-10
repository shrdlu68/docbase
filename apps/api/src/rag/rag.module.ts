import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';

@Module({
  providers: [RagService, ChunkingService, EmbeddingService],
  exports: [RagService, ChunkingService, EmbeddingService],
})
export class RagModule {}
