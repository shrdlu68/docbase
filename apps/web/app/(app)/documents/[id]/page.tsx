import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !doc) notFound();

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/documents" className="text-sm text-blue-600 hover:underline">
            ← Documents
          </Link>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">{doc.title}</h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Updated {new Date(doc.updated_at).toLocaleDateString()}
            </span>
            {doc.tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Link
          href={`/documents/${id}/edit`}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Edit
        </Link>
      </div>

      <div className="prose max-w-none rounded-lg bg-white p-6 shadow-sm">
        <pre className="whitespace-pre-wrap text-sm text-gray-800">{doc.content}</pre>
      </div>
    </div>
  );
}
