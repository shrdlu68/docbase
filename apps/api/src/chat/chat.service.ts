import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { RagService } from '../rag/rag.service';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { Citation, RetrievedChunk } from '@docbase/types';

/** Number of prior messages to include as conversation history. */
const HISTORY_LIMIT = 10;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private supabaseService: SupabaseService,
    private aiService: AiService,
    private ragService: RagService,
  ) {}

  /**
   * Returns an Observable that emits SSE events.
   * IMPORTANT: The Subject is returned synchronously; async work fires in a non-blocking chain.
   */
  streamChat(dto: ChatStreamDto, user: AuthUser): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.runStream(dto, user, subject).catch((err) => {
      this.logger.error('Stream error:', err);
    });
    return subject.asObservable();
  }

  private async runStream(
    dto: ChatStreamDto,
    user: AuthUser,
    subject: Subject<MessageEvent>,
  ): Promise<void> {
    const client = this.supabaseService.getAuthClient(user.jwt);

    try {
      // 1. Get or create conversation
      const conversationId = await this.ensureConversation(
        dto.conversationId,
        dto.question,
        user,
      );

      // 2. Send conversation ID to client so subsequent turns stay in the same conversation
      subject.next({
        type: 'meta',
        data: JSON.stringify({ conversationId }),
      } as MessageEvent);

      // 3. Save user message
      await client.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: dto.question,
      });

      // 4. Fetch all user documents for the knowledge-base index (enables meta-questions
      //    like "what documents do I have?" which have no semantic similarity to chunks)
      const { data: allDocs } = await client
        .from('documents')
        .select('id, title, tags, created_at')
        .order('created_at', { ascending: false });

      // 5. Retrieve relevant chunks (RAG)
      const chunks = await this.ragService.retrieveChunks(
        dto.question,
        user.userId,
        user.jwt,
      );

      // 6. Emit sources so the client can show citations immediately
      const citations: Citation[] = chunks.map((chunk: RetrievedChunk) => ({
        documentId: chunk.document_id,
        documentTitle: chunk.document_title,
        chunkContent: chunk.content,
        similarity: chunk.similarity,
      }));

      subject.next({
        type: 'sources',
        data: JSON.stringify(citations),
      } as MessageEvent);

      // 7. Fetch the most recent prior messages as conversation history.
      //    Fetch HISTORY_LIMIT + 1 in descending order, reverse to chronological,
      //    then drop the last entry (the user message just inserted in step 3).
      const { data: recentRows } = await client
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT + 1);

      const priorHistory = ((recentRows ?? []).reverse()).slice(0, -1);

      // 8. Build the prompt using Anthropic best practices:
      //    - Knowledge-base index + retrieved chunks formatted with XML tags at the top
      //    - Inline citation instructions ([1], [2] …)
      //    - Explicit persona, grounding rules, and no-preamble instruction
      const systemPrompt = this.buildSystemPrompt(
        chunks,
        allDocs ?? [],
      );

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...priorHistory.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: dto.question },
      ];

      // 9. Stream the response token by token
      let fullResponse = '';

      for await (const token of this.aiService.chatStream(messages)) {
        fullResponse += token;
        subject.next({
          type: 'chunk',
          data: token,
        } as MessageEvent);
      }

      // 10. Emit done (data must be non-empty — SSE spec discards events with empty data)
      subject.next({ type: 'done', data: 'done' } as MessageEvent);
      subject.complete();

      // 11. Persist the assistant reply
      await client.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse,
      });
    } catch (err) {
      // Emit done so the client stream closes cleanly (subject.error() doesn't
      // reliably flush/end the HTTP SSE response in NestJS)
      try {
        subject.next({ type: 'done', data: 'done' } as MessageEvent);
        subject.complete();
      } catch {
        // subject may already be completed
      }
      throw err;
    }
  }

  /**
   * Builds a system prompt following Anthropic best practices:
   * - Long-form context (documents) placed at the top, before instructions
   * - XML tags for clear structure
   * - Explicit persona, citation format, grounding rules, and no-preamble instruction
   *
   * Always injects the full knowledge-base index (titles + tags) so meta-questions
   * like "what documents do I have?" are answerable even when RAG finds no chunks.
   */
  private buildSystemPrompt(
    chunks: RetrievedChunk[],
    allDocs: { id: string; title: string; tags: string[]; created_at: string }[],
  ): string {
    // Knowledge-base index — always present so meta-questions are always answerable
    const kbIndex =
      allDocs.length === 0
        ? '  (no documents in knowledge base yet)'
        : allDocs
            .map((doc) => {
              const tags = doc.tags?.length ? ` [${doc.tags.join(', ')}]` : '';
              const date = doc.created_at.slice(0, 10);
              return `  - ${doc.title}${tags} (added ${date})`;
            })
            .join('\n');

    const kbSection = `<knowledge_base_index>
${kbIndex}
</knowledge_base_index>`;

    const persona = `You are Docbase Assistant, an AI built into a personal knowledge base application. \
Your job is to help users find and understand information stored in their documents.`;

    if (chunks.length === 0) {
      return `${persona}

${kbSection}

<instructions>
The <knowledge_base_index> above lists every document the user has stored.
Use it to answer questions about which documents exist, their titles, tags, and dates.
No document chunks were retrieved for this specific query, so do not quote document content.
If the user asks a question that requires reading document content, let them know which document(s) might help and suggest they ask a more specific question.
Do not invent facts. Do not start your response with preamble — be direct.
</instructions>`;
    }

    const documentsXml = chunks
      .map(
        (chunk, i) =>
          `  <document index="${i + 1}">
    <source>${chunk.document_title}</source>
    <relevance>${Math.round(chunk.similarity * 100)}%</relevance>
    <content>
${chunk.content}
    </content>
  </document>`,
      )
      .join('\n\n');

    return `${persona}

${kbSection}

<retrieved_chunks>
${documentsXml}
</retrieved_chunks>

<instructions>
The <knowledge_base_index> lists all documents the user has stored — use it to answer meta-questions about their collection.
The <retrieved_chunks> contain the most relevant excerpts for this specific question — use them to answer content questions.
Cite retrieved chunks inline with bracketed numbers matching the document index — e.g. [1], [2].
If the chunks contain partial information, answer what you can and note what's missing.
If the question cannot be answered from the provided content, say so clearly — do not invent facts.
Be concise. Prefer flowing prose over bullet lists unless listing genuinely discrete items.
Do not start your response with preamble like "Based on the documents…" — go straight to the answer.
</instructions>`;
  }

  private async ensureConversation(
    conversationId: string | undefined,
    question: string,
    user: AuthUser,
  ): Promise<string> {
    const client = this.supabaseService.getAuthClient(user.jwt);

    if (conversationId) {
      const { data } = await client
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .single();
      if (data) return conversationId;
    }

    // Create new conversation with a title derived from the first question
    const title = question.length > 60 ? question.slice(0, 57) + '...' : question;
    const { data, error } = await client
      .from('conversations')
      .insert({ user_id: user.userId, title })
      .select()
      .single();

    if (error || !data) throw new Error('Failed to create conversation');
    return data.id;
  }

  async getConversations(user: AuthUser) {
    const client = this.supabaseService.getAuthClient(user.jwt);
    const { data, error } = await client
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  async getMessages(conversationId: string, user: AuthUser) {
    const client = this.supabaseService.getAuthClient(user.jwt);
    const { data, error } = await client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  }
}
