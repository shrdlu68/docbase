import { redirect } from 'next/navigation';

export const metadata = { title: 'Docbase' };

export default function RootPage() {
  redirect('/documents');
}
