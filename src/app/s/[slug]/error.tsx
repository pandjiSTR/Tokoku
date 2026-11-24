'use client';
import { ErrorView } from '@/components/ErrorView';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView title="Halaman toko belum bisa dimuat" text="Maaf, ada gangguan sementara. Keranjang Anda aman. Coba muat ulang." reset={reset} homeHref="/" homeLabel="Ke beranda Tokoku" />;
}
