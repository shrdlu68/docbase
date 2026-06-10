'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/documents', label: 'Documents', icon: DocumentsIcon },
  { href: '/chat', label: 'Chat', icon: ChatIcon },
];

interface AppSidebarProps {
  userEmail?: string;
}

export function AppSidebar({ userEmail }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col bg-slate-900">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-white">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2h6l3 3v7H2V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M4 7h5M4 9.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">Docbase</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2.5 py-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-teal-500/10 text-teal-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
            {userEmail?.[0]?.toUpperCase() ?? '?'}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-slate-400">{userEmail}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex-shrink-0 text-xs text-slate-500 transition-colors hover:text-slate-200"
          >
            Out
          </button>
        </div>
      </div>
    </aside>
  );
}

function DocumentsIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={active ? 'text-teal-400' : 'text-slate-500'}>
      <path d="M3 1.5h6l3 3v9H3v-12z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M9 1.5V4.5H12" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M5 7h5M5 9.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={active ? 'text-teal-400' : 'text-slate-500'}>
      <path d="M1.5 2.5h12v8h-7l-3 2.5v-2.5h-2v-8z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M4 6h7M4 8.5h4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}
