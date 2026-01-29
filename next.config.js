/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next 14 uses this key to keep server-only packages external (not webpack-bundled).
    // This avoids build-time resolution of Playwright optional deps/assets (electron, chromium-bidi, recorder fonts/html).
    serverComponentsExternalPackages: [
      "playwright-core", 
      "@sparticuz/chromium",
      "playwright", // Include playwright for good measure
    ],
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
      // Instagram CDN domains
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.instagram.com',
        pathname: '/**',
      },
    ],
    // Allow images from local API routes and Instagram
    domains: ['localhost', '127.0.0.1', 'cdninstagram.com', 'fbcdn.net', 'instagram.com'],
    unoptimized: process.env.NODE_ENV === 'development', // Disable optimization in dev to avoid issues
  },
};

module.exports = nextConfig;

