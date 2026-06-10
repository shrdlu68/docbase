'use client';

import { useRef, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ConversationList } from './conversation-list';

export function ChatInterface() {
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const { messages, isStreaming, error, sendMessage, reset, conversationIdRef } =
    useChatStream(activeConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Refresh conversation list after the first reply in a new chat
  const prevConvId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = conversationIdRef.current;
    if (id && id !== prevConvId.current) {
      prevConvId.current = id;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  function handleNew() {
    reset();
    setActiveConversationId(undefined);
  }

  function handleSelect(id: string) {
    reset();
    setActiveConversationId(id);
  }

  return (
    <div className="flex h-full">
      <ConversationList
        activeId={activeConversationId ?? conversationIdRef.current}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
          <p className="text-xs text-gray-500">Ask questions about your documents</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="text-4xl">💬</div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Ask your knowledge base</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Ask any question and I'll find relevant information from your documents.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <ChatMessage key={i} message={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isStreaming} />
      </div>
    </div>
  );
}
