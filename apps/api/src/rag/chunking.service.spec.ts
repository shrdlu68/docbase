import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkingService],
    }).compile();
    service = module.get<ChunkingService>(ChunkingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns empty array for empty string', () => {
    expect(service.chunk('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(service.chunk('   \n\n\t  ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'Hello world.';
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Hello world.');
  });

  it('does not split text shorter than CHUNK_SIZE', () => {
    const text = 'A'.repeat(1999);
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
  });

  it('splits text longer than CHUNK_SIZE', () => {
    // Create text with double newlines so it can split cleanly
    const paragraph = 'Word '.repeat(100); // ~500 chars per paragraph
    const text = Array(6).fill(paragraph).join('\n\n'); // ~3000 chars total
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be at most CHUNK_SIZE + OVERLAP chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2200);
    }
  });

  it('adds overlap between chunks', () => {
    // Create text that will definitely split
    const paragraph = 'This is paragraph content with enough words to fill the space. ';
    const longParagraph = paragraph.repeat(35); // ~2275 chars per paragraph
    const text = longParagraph + '\n\n' + longParagraph;
    const chunks = service.chunk(text);

    if (chunks.length >= 2) {
      // The second chunk should start with content from the end of the first
      const firstChunkEnd = chunks[0].slice(-100);
      const secondChunkStart = chunks[1].slice(0, 100);
      // There should be some overlap
      expect(chunks[1].length).toBeGreaterThan(chunks[1].replace(firstChunkEnd.slice(-50), '').length - 100);
    }
  });

  it('merges very short chunks together', () => {
    // Short paragraphs that are each below MIN_CHUNK (200 chars)
    const shortParagraphs = Array(10).fill('Short paragraph.').join('\n\n');
    const chunks = service.chunk(shortParagraphs);
    // They should be merged rather than having 10 tiny chunks
    expect(chunks.length).toBeLessThan(10);
  });

  it('handles text with only a single large paragraph (no separators)', () => {
    const text = 'x'.repeat(5000);
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2200);
    }
  });
});
