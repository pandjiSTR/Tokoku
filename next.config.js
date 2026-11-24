const isProd = process.env.NODE_ENV === 'production';

// CSP hanya di produksi (mode dev butuh unsafe-eval dan websocket HMR).
// Gambar boleh dari Supabase Storage dan ubin peta OpenStreetMap; iframe hanya dari situs sendiri (pratinjau tema).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  ...(isProd ? [{ key: 'Content-Security-Policy', value: csp }] : []),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
];

/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone', // dipakai Dockerfile
  poweredByHeader: false,
  experimental: {
    // Unggah foto produk lewat Server Action (maks 3 foto x 5 MB).
    serverActions: { bodySizeLimit: '16mb' },
  },
  // Pastikan binari native sharp ikut terbawa ke image standalone.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
