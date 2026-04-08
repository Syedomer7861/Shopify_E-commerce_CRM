/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] }
  },
  images: {
    domains: ["cdn.shopify.com"],
  },
};

module.exports = nextConfig;
