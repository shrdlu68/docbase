'use client';

import { useRef, useEffect } from 'react';
import { useChatStream } from '@/lib/hooks/use-chat-stream';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { Button } from '@/components/ui/button';

export function ChatInterface() {
  const { messages, isStreaming, error, sendMessage, reset } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
          <p className="text-xs text-gray-500">Ask questions about your documents</p>
        </div>
        {messages.length > 0 && (
          <Button variant="secondary" size="sm" onClick={reset}>
            New conversation
          </Button>
        )}
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
  );
}
