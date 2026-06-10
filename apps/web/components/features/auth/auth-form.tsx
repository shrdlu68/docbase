'use client';

import { useReducer } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Mode = 'login' | 'register';

type State = {
  mode: Mode;
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  message: string | null;
};

type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS'; message?: string }
  | { type: 'ERROR'; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode, error: null, message: null };
    case 'SET_EMAIL':
      return { ...state, email: action.email };
    case 'SET_PASSWORD':
      return { ...state, password: action.password };
    case 'SUBMIT':
      return { ...state, loading: true, error: null, message: null };
    case 'SUCCESS':
      return { ...state, loading: false, message: action.message ?? null };
    case 'ERROR':
      return { ...state, loading: false, error: action.error };
  }
}

const initialState: State = {
  mode: 'login',
  email: '',
  password: '',
  error: null,
  loading: false,
  message: null,
};

export function AuthForm() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { mode, email, password, error, loading, message } = state;
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: 'SUBMIT' });

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
          dispatch({ type: 'SUCCESS', message: 'Check your email to confirm your account.' });
        }
      }
    } catch (err) {
      dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'An error occurred' });
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
          onChange={(e) => dispatch({ type: 'SET_EMAIL', email: e.target.value })}
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
          onChange={(e) => dispatch({ type: 'SET_PASSWORD', password: e.target.value })}
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
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'register' })}
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
              onClick={() => dispatch({ type: 'SET_MODE', mode: 'login' })}
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
