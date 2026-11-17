/** @type {import('next').NextConfig} */
const serverActionAllowedOrigins = process.env.SERVER_ACTION_ALLOWED_ORIGINS
  ? process.env.SERVER_ACTION_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["localhost:3000", "127.0.0.1:3000"];

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and location are allowed for this site only (Field Visits check-in proof); never for embedded third parties.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  // HSTS is only meaningful over HTTPS; harmless on localhost since browsers
  // ignore it for http:// origins.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Directives that block injection tricks without touching how pages load
  // scripts or styles. A strict script-src needs per-request nonces (later step).
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
  // Trial run of a full allowlist: the browser only REPORTS what it would block
  // (to /api/csp-report and the console), nothing is blocked. Enforce it once the
  // reports are clean. Inline scripts stay allowed: blocking them needs nonces,
  // which would make every page server-rendered on each request.
  { key: "Content-Security-Policy-Report-Only", value: [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://checkout.razorpay.com https://us-assets.i.posthog.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://us.i.posthog.com https://us-assets.i.posthog.com",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "report-uri /api/csp-report",
  ].join("; ") },
];

const nextConfig = {
  // A stray package-lock.json higher up the disk made Next guess the wrong root.
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: { allowedOrigins: serverActionAllowedOrigins }
  },
  allowedDevOrigins: ['192.168.0.131', 'localhost:3000', 'supplemental-hero-indexed-overseas.trycloudflare.com', 'cureforeverpc.tail1b3337.ts.net'],
  // The image optimizer is off: every <Image> here already passes `unoptimized`,
  // and Next 14's optimizer endpoint has known remote-code-execution and DoS
  // advisories (fixed only in 15.5+). Off means /_next/image serves nothing.
  images: { unoptimized: true },
  async headers() {
    return [
      // Everything except public web forms (/f/<id>) refuses to be framed.
      { source: "/((?!f/).*)", headers: securityHeaders },
      // Public web forms are made to be embedded on customers' own sites.
      { source: "/f/:path*", headers: [...securityHeaders.filter((h) => h.key !== "X-Frame-Options" && !h.key.startsWith("Content-Security-Policy")), { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors *" }] },
      // The service worker must be revalidated on every load so a fix reaches
      // installed apps at once instead of after a cached copy expires.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  // The owner area moved from /platform to /superadmin; old links and bookmarks still work.
  // eSSL / ZKTeco devices push to fixed paths /iclock/cdata and /iclock/getrequest.
  async rewrites() {
    return [{ source: "/iclock/:path*", destination: "/api/biometric/iclock/:path*" }];
  },
  async redirects() {
    return [{ source: "/platform", destination: "/superadmin", permanent: true }];
  },
};

module.exports = nextConfig;
