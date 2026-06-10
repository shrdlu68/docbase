import { AuthForm } from '@/components/features/auth/auth-form';

// Force dynamic rendering — Supabase client requires env vars at runtime, not build time
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in — Docbase' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="hidden w-1/2 flex-col justify-between bg-slate-900 p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-500 text-white">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 2h6l3 3v7H2V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M4 7h5M4 9.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">Docbase</span>
        </div>

        <div>
          <p className="text-3xl font-semibold leading-snug text-white">
            Your documents,<br />
            <span className="text-teal-400">instantly searchable.</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Paste any document. Ask anything. Get answers with sources — powered by embeddings and your own knowledge base.
          </p>
        </div>

        <p className="text-xs text-slate-600">
          RAG-powered · Source citations · Conversation history
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-white">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2h6l3 3v7H2V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M4 7h5M4 9.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">Docbase</span>
            </div>
          </div>
          <AuthForm />
        </div>
      </div>
    </div>
  );
}
