import { notFound } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant';

export default async function Storefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await resolveTenant({ pathname: `/s/${slug}` });
  if (!store) notFound();
  return (
    <main>
      <h1>{store.name}</h1>
      <p className="muted">Storefront segera hadir (M2).</p>
    </main>
  );
}
