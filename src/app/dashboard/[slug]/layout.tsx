import Link from 'next/link';
import { Brand } from '@/components/Brand';
import { DashNav } from '@/components/DashNav';
import { getMyStore } from '@/lib/session';
import { logout } from '../../login/actions';

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store } = await getMyStore(slug);
  return (
    <div className="page has-bottom-nav">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand href="/dashboard" />
          <span className="spacer" />
          <Link href="/dashboard" className="muted small ellipsis" style={{ fontWeight: 600 }}>{store.name}</Link>
          <Link href={`/s/${slug}`} className="btn btn-ghost btn-sm">Lihat toko</Link>
          <form action={logout}><button type="submit" className="btn btn-ghost btn-sm">Keluar</button></form>
        </div>
      </header>
      {children}
      <DashNav slug={slug} />
    </div>
  );
}
