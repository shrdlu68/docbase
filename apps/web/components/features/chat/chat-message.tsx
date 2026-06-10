'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type { StreamingMessage } from '@/lib/hooks/use-chat-stream';

interface ChatMessageProps {
  message: StreamingMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === 'user';
  const hasCitations = (message.citations?.length ?? 0) > 0;

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx('max-w-[80%] space-y-2', isUser ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        <div
          className={clsx(
            'rounded-lg px-4 py-3 text-sm',
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200',
          )}
        >
          <p className="whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current" />
            )}
          </p>
        </div>

        {/* Citations toggle */}
        {!isUser && hasCitations && (
          <div>
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showCitations ? '▼' : '▶'} {message.citations!.length} source
              {message.citations!.length !== 1 ? 's' : ''}
            </button>

            {showCitations && (
              <div className="mt-2 space-y-2">
                {message.citations!.map((citation, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs"
                  >
                    <p className="font-medium text-gray-700">{citation.documentTitle}</p>
                    <p className="mt-1 line-clamp-3 text-gray-600">{citation.chunkContent}</p>
                    <p className="mt-1 text-gray-400">
                      Similarity: {(citation.similarity * 100).toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
