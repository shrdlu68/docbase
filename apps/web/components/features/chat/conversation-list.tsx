'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { Conversation } from '@docbase/types';
import { Button } from '@/components/ui/button';

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({ activeId, onSelect, onNew }: Props) {
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => apiGet<Conversation[]>('/chat/conversations'),
  });

  return (
    <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="p-3">
        <Button className="w-full" size="sm" onClick={onNew}>
          New conversation
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">No conversations yet</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    activeId === c.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <div className="truncate">{c.title || 'Untitled'}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
