'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser';
import { apiStream, apiGet } from '@/lib/api/client';
import type { Citation, ChatStreamRequest, Message } from '@docbase/types';

export interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

let _msgId = 0;
function nextMsgId() { return `msg-${++_msgId}`; }

export function useChatStream(initialConversationId?: string, onNewConversation?: () => void) {
  const [messages, setMessages] = useState<StreamingMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | undefined>(initialConversationId);

  // Load history when an existing conversation is selected
  useEffect(() => {
    if (!initialConversationId) return;
    conversationIdRef.current = initialConversationId;
    apiGet<Message[]>(`/chat/conversations/${initialConversationId}/messages`)
      .then((history) => {
        setMessages(
          history.map((m) => ({ id: m.id, role: m.role, content: m.content, citations: [] })),
        );
      })
      .catch(() => setError('Failed to load conversation history'));
  }, [initialConversationId]);

  const sendMessage = useCallback(async (question: string) => {
    if (isStreaming) return;

    setError(null);
    setIsStreaming(true);

    // Add user message immediately
    setMessages((prev) => [...prev, { id: nextMsgId(), role: 'user', content: question }]);

    // Add placeholder for streaming assistant message
    setMessages((prev) => [
      ...prev,
      { id: nextMsgId(), role: 'assistant', content: '', citations: [], isStreaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: ChatStreamRequest = {
        question,
        conversationId: conversationIdRef.current,
      };

      const response = await apiStream('/chat/stream', body);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      if (!response.body) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let citations: Citation[] = [];

      const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
        if (event.type !== 'event') return;

        const { event: eventType, data } = event;

        if (eventType === 'meta') {
          try {
            const meta = JSON.parse(data);
            if (meta.conversationId) {
              conversationIdRef.current = meta.conversationId;
              onNewConversation?.();
            }
          } catch {
            // ignore parse error
          }
        } else if (eventType === 'sources') {
          try {
            citations = JSON.parse(data);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, citations };
              }
              return updated;
            });
          } catch {
            // ignore parse error
          }
        } else if (eventType === 'chunk') {
          accumulatedContent += data;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: accumulatedContent,
                isStreaming: true,
              };
            }
            return updated;
          });
        } else if (eventType === 'done') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
          setIsStreaming(false);
        }
      });

      for await (const chunk of response.body) {
        parser.feed(decoder.decode(chunk, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || 'Sorry, an error occurred.',
            isStreaming: false,
          };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, onNewConversation]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setError(null);
    conversationIdRef.current = undefined;
  }, []);

  return { messages, isStreaming, error, sendMessage, reset, conversationIdRef };
}
