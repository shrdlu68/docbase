'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex gap-3">
        <textarea
          ref={textareaRef}
          aria-label="Chat message"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your documents… (Enter to send, Shift+Enter for newline)"
          rows={3}
          disabled={disabled}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <Button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          loading={disabled}
          className="self-end"
        >
          Send
        </Button>
      </div>
      <p className="mt-1 text-xs text-gray-400">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
