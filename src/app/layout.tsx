import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Suspense } from "react";
import { PHProvider } from "./providers";
import PostHogPageView from "./_components/PostHogPageView";
import ServiceWorkerRegister from "./_components/ServiceWorkerRegister";
import ConsentBanner from "./_components/ConsentBanner";

// Self-hosted at build time: no request to Google, no render-blocking stylesheet chain.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap", preload: false });

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cureforever-crm.vercel.app";
const SITE_TITLE = "CodeCrest CRM — Shopify & Shiprocket Order Management";
const OG_DESCRIPTION =
  "CodeCrest CRM unifies Shopify orders, Shiprocket shipping, WhatsApp support, and agent performance in one dashboard for fast-moving e-commerce teams.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: OG_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CodeCrest CRM",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CodeCrest CRM",
    title: SITE_TITLE,
    description: OG_DESCRIPTION,
    images: [
      { url: "/og-image.png", width: 1200, height: 665, alt: "CodeCrest CRM dashboard" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: OG_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ed",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${instrument.variable}`}>
      <body suppressHydrationWarning className="antialiased" style={{ background: '#f7f4ed' }}>
        <PHProvider>
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
          {children}
        </PHProvider>
        <ServiceWorkerRegister />
        <ConsentBanner />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { 
              background: "#1c1c1c", 
              color: "#fcfbf8", 
              fontSize: "13px", 
              borderRadius: "6px", 
              padding: "10px 14px",
              boxShadow: "rgba(0,0,0,0.1) 0px 4px 12px" 
            },
            duration: 3000,
          }}
        />
      </body>
    </html>
  );
}
