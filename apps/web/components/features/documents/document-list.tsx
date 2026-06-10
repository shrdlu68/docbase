'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/lib/api/documents';
import { Button } from '@/components/ui/button';
import type { Document } from '@docbase/types';

interface DocumentListProps {
  initialDocuments: Document[];
}

export function DocumentList({ initialDocuments }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const router = useRouter();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onMutate: async (id) => {
      // Optimistic update
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    },
    onError: (_err, _id, _context) => {
      // Revert on error
      setDocuments(initialDocuments);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.refresh();
    },
  });

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
        <p className="text-gray-500">No documents yet.</p>
        <Link
          href="/documents/new"
          className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          Create your first document
        </Link>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
          <div className="min-w-0 flex-1">
            <Link
              href={`/documents/${doc.id}`}
              className="block truncate text-sm font-medium text-gray-900 hover:text-blue-600"
            >
              {doc.title}
            </Link>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {new Date(doc.updated_at).toLocaleDateString()}
              </span>
              {doc.tags.length > 0 && (
                <div className="flex gap-1">
                  {doc.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-xs text-gray-400">
                {doc.content.length.toLocaleString()} chars
              </span>
            </div>
          </div>

          <div className="ml-4 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/documents/${doc.id}/edit`)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending && deleteMutation.variables === doc.id}
              onClick={() => {
                if (confirm(`Delete "${doc.title}"?`)) {
                  deleteMutation.mutate(doc.id);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
