'use client';
import Link from 'next/link';

export function ErrorView({ title, text, reset, homeHref, homeLabel }: {
  title: string; text: string; reset: () => void; homeHref: string; homeLabel: string;
}) {
  return (
    <main className="container">
      <div className="card empty" role="alert">
        <span className="empty-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
        </span>
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        <button type="button" className="btn" onClick={reset}>Coba lagi</button>
        <Link href={homeHref} className="btn btn-secondary">{homeLabel}</Link>
      </div>
    </main>
  );
}
