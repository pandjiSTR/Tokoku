const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

/** 85000 -> "Rp85.000" */
export function formatRupiah(n: number): string {
  return rupiah.format(n).replace(/\s/g, '');
}

const wib = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/** Tanggal dan jam dalam WIB, mis. "8 Nov 2026, 14.30". */
export function formatDateTime(d: Date | string): string {
  return wib.format(new Date(d)) + ' WIB';
}

/** Awal hari ini (00.00 WIB) sebagai Date UTC. */
export function startOfTodayWib(now = new Date()): Date {
  const shifted = new Date(now.getTime() + 7 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 7 * 3600_000);
}

/** Label status pesanan untuk dashboard. */
export const statusLabel: Record<string, string> = {
  pending_payment: 'Menunggu bayar', awaiting_verification: 'Perlu verifikasi', paid: 'Dibayar', processing: 'Diproses',
  shipped: 'Dikirim', completed: 'Selesai', expired: 'Kedaluwarsa', rejected: 'Ditolak', cancelled: 'Dibatalkan',
};
