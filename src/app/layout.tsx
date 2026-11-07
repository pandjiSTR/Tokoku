import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tokoku', description: 'Platform website online shop untuk UMKM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
