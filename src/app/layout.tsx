import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "CureForever CRM",
  description: "Advanced Shopify & Shiprocket CRM for E-commerce",
  manifest: "/manifest.json",
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
      <body className="antialiased">
        {children}
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

