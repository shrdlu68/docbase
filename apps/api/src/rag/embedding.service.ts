import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

@Injectable()
export class EmbeddingService {
  constructor(private aiService: AiService) {}

  async embedChunks(chunks: string[]): Promise<number[][]> {
    return this.aiService.embed(chunks);
  }

  async embedQuery(query: string): Promise<number[]> {
    const embeddings = await this.aiService.embed([query]);
    return embeddings[0] ?? [];
  }
}
