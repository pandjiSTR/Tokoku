'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <h1>Terjadi kesalahan</h1>
        <p>Maaf, aplikasi sedang bermasalah. Coba muat ulang.</p>
        <button onClick={reset} style={{ minHeight: 48, padding: '0 20px', fontSize: 16 }}>Coba lagi</button>
      </body>
    </html>
  );
}
