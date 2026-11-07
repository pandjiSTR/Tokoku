import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'Tokoku', template: '%s | Tokoku' },
  description: 'Platform website online shop untuk UMKM dan brand lokal',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1F5C46' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
