/** @type {import('next').NextConfig} */
const serverActionAllowedOrigins = process.env.SERVER_ACTION_ALLOWED_ORIGINS
  ? process.env.SERVER_ACTION_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["localhost:3000", "127.0.0.1:3000"];

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is only meaningful over HTTPS; harmless on localhost since browsers
  // ignore it for http:// origins.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
