'use client';
import { ErrorView } from '@/components/ErrorView';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView title="Dashboard bermasalah" text="Data belum dapat dimuat. Perubahan yang sudah tersimpan tidak hilang. Coba lagi sebentar." reset={reset} homeHref="/dashboard" homeLabel="Ke daftar toko" />;
}
