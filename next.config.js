/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] }
  },
  images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'example.com' }
  ]
},
};

module.exports = nextConfig;
