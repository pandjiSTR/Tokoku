'use client';
import { ErrorView } from '@/components/ErrorView';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView title="Terjadi kesalahan" text="Maaf, ada masalah di sisi kami. Coba muat ulang halaman. Jika berulang, hubungi pengelola situs." reset={reset} homeHref="/" homeLabel="Ke beranda" />;
}
