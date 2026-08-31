import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Suspense } from "react";
import { PHProvider } from "./providers";
import PostHogPageView from "./_components/PostHogPageView";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cureforever-crm.vercel.app";
const OG_DESCRIPTION = "Advanced Shopify & Shiprocket CRM for E-commerce";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "CureForever CRM",
  description: OG_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.webp",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CureForever CRM",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CureForever CRM",
    title: "CureForever CRM",
    description: OG_DESCRIPTION,
    images: [
      { url: "/og-image.png", width: 1200, height: 665, alt: "CureForever CRM dashboard" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CureForever CRM",
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
    <html lang="en">
      <body suppressHydrationWarning className="antialiased" style={{ background: '#f7f4ed' }}>
        <PHProvider>
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
          {children}
        </PHProvider>
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
