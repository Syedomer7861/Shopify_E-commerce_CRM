/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] }
  },
  allowedDevOrigins: ['192.168.0.116', '192.168.0.121', 'localhost:3000'],
  images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'example.com' }
  ]
},
};

module.exports = nextConfig;
