const steps = [
  ['pending_payment', 'Menunggu pembayaran'],
  ['awaiting_verification', 'Menunggu verifikasi'],
  ['paid', 'Dibayar'],
  ['processing', 'Diproses'],
  ['shipped', 'Dikirim'],
  ['completed', 'Selesai'],
] as const;

export function OrderTimeline({ status }: { status: string }) {
  const current = steps.findIndex(([s]) => s === status);
  return (
    <ol className="timeline" aria-label="Status pesanan">
      {steps.map(([key, label], i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="dot" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
