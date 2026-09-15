import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sportmonks.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'flagcdn.com', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
