import { DocumentEditor } from '@/components/features/documents/document-editor';

export const metadata = { title: 'New Document — Docbase' };

export default function NewDocumentPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">New Document</h2>
      <DocumentEditor />
    </div>
  );
}
