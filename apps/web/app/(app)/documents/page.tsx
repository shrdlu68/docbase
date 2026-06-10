import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { DocumentList } from '@/components/features/documents/document-list';

export const metadata = { title: 'Documents — Docbase' };

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="mt-1 text-sm text-gray-500">
            {documents?.length ?? 0} document{documents?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/documents/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New document
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Failed to load documents: {error.message}
        </div>
      )}

      <DocumentList initialDocuments={documents ?? []} />
    </div>
  );
}
