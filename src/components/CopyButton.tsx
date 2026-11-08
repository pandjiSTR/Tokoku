'use client';
import { useState } from 'react';

export function CopyButton({ value, label = 'Salin' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard tidak tersedia */ }
      }}
    >
      {done ? 'Tersalin' : label}
    </button>
  );
}
