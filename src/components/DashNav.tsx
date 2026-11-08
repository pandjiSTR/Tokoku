'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashNav({ slug }: { slug: string }) {
  const path = usePathname();
  const items = [
    { href: `/dashboard/${slug}`, label: 'Ringkasan', active: path === `/dashboard/${slug}` },
    { href: `/dashboard/${slug}/pesanan`, label: 'Pesanan', active: path.startsWith(`/dashboard/${slug}/pesanan`) },
    { href: `/dashboard/${slug}/produk`, label: 'Produk', active: path.startsWith(`/dashboard/${slug}/produk`) || path.startsWith(`/dashboard/${slug}/kategori`) },
    { href: `/dashboard/${slug}/pengaturan`, label: 'Pengaturan', active: path.startsWith(`/dashboard/${slug}/pengaturan`) },
  ];
  return (
    <nav className="bottom-nav" aria-label="Navigasi dashboard">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? 'page' : undefined} className={i.active ? 'active' : ''}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
