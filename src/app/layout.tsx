import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Suspense } from "react";
import { PHProvider } from "./providers";
import PostHogPageView from "./_components/PostHogPageView";

export const metadata: Metadata = {
  title: "CureForever CRM",
  description: "Advanced Shopify & Shiprocket CRM for E-commerce",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.webp",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CureForever CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A2514",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            --font-display: 'DM Serif Display', serif;
            --font-sans: 'DM Sans', sans-serif;
          }
        `}</style>
      </head>
      <body suppressHydrationWarning className="antialiased" style={{ fontFamily: 'var(--font-sans)', color: '#0A2514', background: '#f8f7f4' }}>
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
              background: "#0A2514", 
              color: "#CBF653", 
              fontSize: "13px", 
              borderRadius: "10px", 
              padding: "10px 14px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" 
            },
            duration: 3000,
          }}
        />
      </body>
    </html>
  );
}

