/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
    // Allow images from local API routes
    domains: ['localhost'],
    unoptimized: false,
  },
};

module.exports = nextConfig;

