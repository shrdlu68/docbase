import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessage } from '@docbase/types';

@Injectable()
export class AiService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly logger = new Logger(AiService.name);

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: configService.getOrThrow<string>('AI_API_KEY'),
      baseURL: configService.get<string>('AI_BASE_URL', 'https://api.openai.com/v1'),
    });
    this.model = configService.get<string>('AI_MODEL', 'gpt-4o-mini');
    this.embeddingModel = configService.get<string>(
      'EMBEDDING_MODEL',
      'text-embedding-ada-002',
    );
  }

  async chat(messages: ChatCompletionMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async *chatStream(messages: ChatCompletionMessage[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) yield token;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const BATCH_SIZE = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: batch,
      });
      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
      results.push(...batchEmbeddings);
    }

    return results;
  }
}
