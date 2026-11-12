"use client";

import { useEffect } from "react";

// Registers /sw.js for every visitor so the app is installable and has an
// offline page before sign-in. NotificationBell registers the same file for
// push; registering twice is a no-op. Production only: in development a
// service worker gets in the way of hot reload.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
        .catch((err) => console.error("Service worker registration failed:", err));
    };
    // After load, so it never competes with the first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
