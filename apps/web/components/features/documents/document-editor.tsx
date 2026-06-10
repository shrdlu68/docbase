'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { documentsApi, estimateChunkCount } from '@/lib/api/documents';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Document } from '@docbase/types';

interface DocumentEditorProps {
  document?: Document;
}

export function DocumentEditor({ document }: DocumentEditorProps) {
  const router = useRouter();
  const isEditing = !!document;

  const [title, setTitle] = useState(document?.title ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const [tagsInput, setTagsInput] = useState(document?.tags.join(', ') ?? '');

  const mutation = useMutation({
    mutationFn: async () => {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (isEditing) {
        return documentsApi.update(document.id, { title, content, tags });
      }
      return documentsApi.create({ title, content, tags });
    },
    onSuccess: (saved) => {
      router.push(`/documents/${saved.id}`);
      router.refresh();
    },
  });

  const chunkCount = estimateChunkCount(content);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-6"
    >
      <Input
        id="title"
        label="Title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Document title"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-sm font-medium text-gray-700">
          Content
        </label>
        <textarea
          id="content"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your document content here. Markdown is supported."
          rows={16}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {content.length > 0 && (
          <p className="text-xs text-gray-500">
            {content.length.toLocaleString()} characters · will be split into ~{chunkCount} chunk
            {chunkCount !== 1 ? 's' : ''} for indexing
          </p>
        )}
      </div>

      <Input
        id="tags"
        label="Tags (comma-separated)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="guide, api, onboarding"
      />

      {mutation.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {(mutation.error as Error).message}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={mutation.isPending}>
          {isEditing ? 'Save changes' : 'Create document'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
