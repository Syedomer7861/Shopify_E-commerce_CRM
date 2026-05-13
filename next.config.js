/** @type {import('next').NextConfig} */
const serverActionAllowedOrigins = process.env.SERVER_ACTION_ALLOWED_ORIGINS
  ? process.env.SERVER_ACTION_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["localhost:3000", "127.0.0.1:3000"];

const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: serverActionAllowedOrigins }
  },
  allowedDevOrigins: ['192.168.0.131', 'localhost:3000', 'supplemental-hero-indexed-overseas.trycloudflare.com', 'cureforeverpc.tail1b3337.ts.net'],
  images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'example.com' }
  ]
},
};

module.exports = nextConfig;
