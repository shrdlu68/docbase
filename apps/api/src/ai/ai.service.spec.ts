import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

// Mock the OpenAI constructor
const mockCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation((config: { apiKey: string; baseURL: string }) => ({
    _config: config,
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  }));
});

const OpenAI = require('openai');

describe('AiService', () => {
  let service: AiService;

  const mockConfig = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        AI_API_KEY: 'test-key',
        AI_BASE_URL: 'https://api.groq.com/openai/v1',
      };
      return config[key];
    }),
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        AI_MODEL: 'llama3-70b-8192',
        EMBEDDING_MODEL: 'nomic-embed-text',
        AI_BASE_URL: 'https://api.groq.com/openai/v1',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    OpenAI.mockClear();
    mockCreate.mockClear();
    mockEmbeddingsCreate.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('initializes OpenAI with correct baseURL from config', () => {
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://api.groq.com/openai/v1',
      }),
    );
  });

  it('uses the configured model for chat', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Response text' } }],
    });

    await service.chat([{ role: 'user', content: 'Hello' }]);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama3-70b-8192' }),
    );
  });

  it('uses the configured embedding model', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
    });

    await service.embed(['test text']);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nomic-embed-text' }),
    );
  });

  it('returns empty array for empty texts', async () => {
    const result = await service.embed([]);
    expect(result).toEqual([]);
  });

  it('batches embed requests in groups of 100', async () => {
    const texts = Array(250).fill('text');
    mockEmbeddingsCreate.mockImplementation(({ input }: { input: string[] }) =>
      Promise.resolve({
        data: input.map((_, i) => ({ embedding: [i], index: i })),
      }),
    );

    await service.embed(texts);

    // Should be called 3 times: 100, 100, 50
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3);
  });
});
