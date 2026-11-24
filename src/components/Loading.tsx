export function Loading({ label = 'Memuat' }: { label?: string }) {
  return (
    <main className="container" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}...</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </main>
  );
}
