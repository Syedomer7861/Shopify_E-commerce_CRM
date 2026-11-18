"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, RefreshCw, X } from "lucide-react";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const CHECK_EVERY_MS = 15 * 60_000;
const DISMISS_KEY = "install-dismissed-at";
const DISMISS_FOR_MS = 30 * 86_400_000;

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Two small PWA helpers for signed-in users:
 * - After a deploy, offers a one-tap reload instead of needing a hard refresh.
 *   It reads /version.json, a static file, at most every 15 minutes and when the tab comes back.
 * - Offers "Install app" where the browser supports it (Chrome, Edge, Android).
 */
export function AppUpdates() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (BUILD === "dev") return;
    let last = 0;
    let told = false;
    const check = async () => {
      if (told || document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!id || id === "dev" || id === BUILD) return;
        told = true;
        toast(t => (
          <span className="flex items-center gap-3 text-sm">
            A new version of the app is ready.
            <button onClick={() => { toast.dismiss(t.id); window.location.reload(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1c1c1c] text-white text-xs font-semibold">
              <RefreshCw className="w-3 h-3" /> Reload
            </button>
          </span>
        ), { id: "app-update", duration: Infinity });
      } catch { /* offline: try again later */ }
    };
    const id = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      let dismissedAt = 0;
      try { dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { /* storage blocked */ }
      if (Date.now() - dismissedAt > DISMISS_FOR_MS) setInstall(e as InstallPrompt);
    };
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!install) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked */ }
    setInstall(null);
  };
  return (
    <div role="dialog" aria-label="Install the app" className="fixed bottom-4 right-4 z-[60] max-w-[calc(100vw-2rem)] w-80 card p-3 flex items-start gap-3 shadow-lg">
      <span className="w-9 h-9 rounded-xl bg-[var(--accent)] grid place-items-center shrink-0"><Download className="w-4 h-4 text-[#1c1c1c]" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[#1c1c1c]">Install the app</div>
        <p className="text-[11px] text-[#6b6b67] leading-snug">Opens full screen from your home screen or taskbar, like a normal app. Handy for field staff.</p>
        <button onClick={async () => { await install.prompt(); await install.userChoice.catch(() => null); setInstall(null); }} className="btn-primary text-xs py-1.5 px-3 mt-2">Install</button>
      </div>
      <button onClick={dismiss} aria-label="Not now" className="p-1 text-[#9a9a94] hover:text-[#1c1c1c]"><X className="w-4 h-4" /></button>
    </div>
  );
}
