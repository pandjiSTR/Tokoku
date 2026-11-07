export function Alert({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
