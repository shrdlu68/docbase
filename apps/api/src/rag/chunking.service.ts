import { Injectable } from '@nestjs/common';

const CHUNK_SIZE = 2000;
const MIN_CHUNK = 200;
const OVERLAP = 200;

@Injectable()
export class ChunkingService {
  /**
   * Splits text into overlapping chunks using recursive character splitting.
   * Mirrors the behavior of LangChain's RecursiveCharacterTextSplitter.
   */
  chunk(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    const rawChunks = this.recursiveSplit(text, ['\n\n', '. ', ' ', '']);
    const merged = this.mergeSmallChunks(rawChunks);
    return this.addOverlap(merged);
  }

  private recursiveSplit(text: string, separators: string[]): string[] {
    if (text.length <= CHUNK_SIZE) return [text];

    const [separator, ...remaining] = separators;

    if (separator === undefined) {
      // No more separators — hard split
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
      }
      return chunks;
    }

    const parts = text.split(separator);

    if (parts.length === 1) {
      // Separator not found — try next
      return this.recursiveSplit(text, remaining);
    }

    const chunks: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current ? current + separator + part : part;

      if (candidate.length <= CHUNK_SIZE) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        // If the single part is still too big, recurse
        if (part.length > CHUNK_SIZE) {
          chunks.push(...this.recursiveSplit(part, remaining));
          current = '';
        } else {
          current = part;
        }
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  private mergeSmallChunks(chunks: string[]): string[] {
    const result: string[] = [];
    let pending = '';

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;

      if (pending) {
        const merged = pending + '\n\n' + trimmed;
        if (merged.length <= CHUNK_SIZE) {
          pending = merged;
          continue;
        } else {
          result.push(pending);
        }
      }

      if (trimmed.length < MIN_CHUNK) {
        pending = trimmed;
      } else {
        pending = '';
        result.push(trimmed);
      }
    }

    if (pending) result.push(pending);
    return result;
  }

  private addOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1) return chunks;

    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-OVERLAP);
      return overlapText + chunk;
    });
  }
}
