import { AuthForm } from '@/components/features/auth/auth-form';

// Force dynamic rendering — Supabase client requires env vars at runtime, not build time
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in — Docbase' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Docbase</h1>
          <p className="mt-2 text-sm text-gray-600">AI-powered knowledge base</p>
        </div>
        <AuthForm />
      </div>
    </div>
  );
}
