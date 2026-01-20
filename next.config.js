/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next 14 uses this key to keep server-only packages external (not webpack-bundled).
    // This avoids build-time resolution of Playwright optional deps/assets (electron, chromium-bidi, recorder fonts/html).
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        pathname: '/**',
      },
    ],
    // Allow images from local API routes
    domains: ['localhost', '127.0.0.1'],
    unoptimized: process.env.NODE_ENV === 'development', // Disable optimization in dev to avoid issues
  },
};

module.exports = nextConfig;

