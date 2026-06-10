import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocumentEditor } from '@/components/features/documents/document-editor';

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()]);
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !doc) notFound();

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Edit Document</h2>
      <DocumentEditor document={doc} />
    </div>
  );
}
