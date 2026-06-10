'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Mode = 'login' | 'register';

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign('/documents');
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          window.location.assign('/documents');
        } else {
          setMessage('Check your email to confirm your account.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {mode === 'login' ? 'Sign in to your knowledge base' : 'Start building your knowledge base'}
        </p>
      </div>

      <div className="space-y-4">
        <Input
          id="email"
          type="email"
          label="Email address"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Input
          id="password"
          type="password"
          label="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</div>
      )}

      <Button
        type="submit"
        className="w-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
        loading={loading}
        size="lg"
      >
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-gray-500">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <button
              type="button"
              onClick={() => setMode('register')}
              className="font-medium text-teal-600 hover:underline"
            >
              Sign up free
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="font-medium text-teal-600 hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}
