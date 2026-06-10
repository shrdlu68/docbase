'use client';

import { useState, useCallback, useRef } from 'react';
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser';
import { apiStream } from '@/lib/api/client';
import type { Citation, ChatStreamRequest } from '@docbase/types';

export interface StreamingMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export function useChatStream() {
  const [messages, setMessages] = useState<StreamingMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);

  const sendMessage = useCallback(async (question: string) => {
    if (isStreaming) return;

    setError(null);
    setIsStreaming(true);

    // Add user message immediately
    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    // Add placeholder for streaming assistant message
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', citations: [], isStreaming: true },
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

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
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
  }, [isStreaming, messages.length]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setError(null);
    conversationIdRef.current = undefined;
  }, []);

  return { messages, isStreaming, error, sendMessage, reset, conversationIdRef };
}
