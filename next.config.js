/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone', // dipakai Dockerfile
  experimental: {
    // Unggah foto produk lewat Server Action (maks 3 foto x 5 MB).
    serverActions: { bodySizeLimit: '16mb' },
  },
  // Pastikan binari native sharp ikut terbawa ke image standalone.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
  },
};
