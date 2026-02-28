/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    HORIZONS_MODE: process.env.HORIZONS_MODE || 'live',
  },
  async headers() {
    return [
      {
        // Serve WASM with correct Content-Type and enable SharedArrayBuffer
        source: '/vendor/stellarium/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        // /stellarium page also needs COOP/COEP for the engine
        source: '/stellarium',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
