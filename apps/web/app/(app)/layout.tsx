import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/features/layout/app-sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  return (
    <div className="flex h-screen">
      <AppSidebar userEmail={user.email} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
