import { formatRupiah } from '@/lib/format';

type O = { orderNumber: string; total: number; buyerName: string };
type Msg = { subject: string; text: string };

const statusText: Record<string, string> = {
  paid: 'Pembayaran Anda sudah kami terima.',
  processing: 'Pesanan Anda sedang kami proses.',
  shipped: 'Pesanan Anda sudah dikirim.',
  completed: 'Pesanan Anda telah selesai. Terima kasih sudah berbelanja!',
  rejected: 'Pembayaran Anda belum dapat kami verifikasi.',
  cancelled: 'Pesanan Anda dibatalkan.',
  expired: 'Pesanan Anda kedaluwarsa karena belum dibayar.',
};

export function ownerNewOrder(storeName: string, o: O, dashboardUrl: string | null): Msg {
  return {
    subject: `[${storeName}] Pesanan baru ${o.orderNumber}`,
    text: `Pesanan baru ${o.orderNumber} dari ${o.buyerName} senilai ${formatRupiah(o.total)}. Menunggu pembayaran.${dashboardUrl ? `\n\nBuka: ${dashboardUrl}` : ''}`,
  };
}

export function ownerProofUploaded(storeName: string, o: O, dashboardUrl: string | null): Msg {
  return {
    subject: `[${storeName}] Bukti pembayaran ${o.orderNumber} perlu diverifikasi`,
    text: `${o.buyerName} mengunggah bukti pembayaran untuk ${o.orderNumber} (${formatRupiah(o.total)}). Periksa mutasi rekening, lalu terima atau tolak.${dashboardUrl ? `\n\nBuka: ${dashboardUrl}` : ''}`,
  };
}

export function buyerStatus(storeName: string, status: string, o: O, statusUrl: string | null, reason?: string | null): Msg | null {
  const line = statusText[status];
  if (!line) return null;
  return {
    subject: `[${storeName}] Pesanan ${o.orderNumber}: ${line.split('.')[0]}`,
    text: `Halo ${o.buyerName},\n\n${line}${status === 'rejected' && reason ? `\nAlasan: ${reason}` : ''}\n\nNomor pesanan: ${o.orderNumber}\nTotal: ${formatRupiah(o.total)}${statusUrl ? `\n\nLihat status pesanan: ${statusUrl}` : ''}\n\n${storeName}`,
  };
}

export function buyerOrderCreated(storeName: string, o: O, statusUrl: string | null): Msg {
  return {
    subject: `[${storeName}] Pesanan ${o.orderNumber} dibuat`,
    text: `Halo ${o.buyerName},\n\nPesanan ${o.orderNumber} berhasil dibuat. Transfer tepat sebesar ${formatRupiah(o.total)} (jangan dibulatkan) lalu unggah bukti pembayaran.${statusUrl ? `\n\nInstruksi dan status pesanan: ${statusUrl}\nSimpan tautan ini, karena hanya dengan tautan ini pesanan dapat dilihat.` : ''}\n\n${storeName}`,
  };
}
