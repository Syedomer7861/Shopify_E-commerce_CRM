"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ATTRIBUTION_KEY, CONSENT_COOKIE, isPublicPath, mergeTouch, readConsent, touchFromUrl, type Consent } from "@/lib/attribution";
import { getPostHog } from "../providers";

// Cookie choice for everyone (public site and app). Until the visitor allows
// analytics, PostHog never loads and no attribution is stored.
function recordTouch() {
  if (!isPublicPath(window.location.pathname)) return;
  const touch = touchFromUrl(window.location.href, document.referrer);
  if (!touch) return;
  try {
    const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null");
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(mergeTouch(stored, touch)));
  } catch { /* storage blocked: attribution is optional */ }
}

export default function ConsentBanner() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  useEffect(() => { setConsent(readConsent(document.cookie)); }, []);
  useEffect(() => { if (consent === "analytics") recordTouch(); }, [consent, pathname]);

  function choose(value: Consent) {
    document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (value === "essential") {
      try { localStorage.removeItem(ATTRIBUTION_KEY); } catch { /* ignore */ }
    } else {
      getPostHog().then(ph => ph?.capture("$pageview", { $current_url: window.location.href }));
    }
    setConsent(value);
  }

  if (consent !== null) return null;
  return (
    <div role="dialog" aria-label="Cookie choice" className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-[60] rounded-2xl border border-[#eceae4] bg-white p-4 shadow-xl text-[13px] text-[#3b3b3a]">
      <p className="leading-relaxed">
        We use essential cookies to keep you signed in. With your OK we also use analytics cookies to see which pages help and where visitors come from.
      </p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => choose("analytics")} className="flex-1 rounded-full bg-[#111113] text-white px-4 py-2 font-semibold">Allow analytics</button>
        <button onClick={() => choose("essential")} className="flex-1 rounded-full border border-[#eceae4] px-4 py-2 font-semibold">Essential only</button>
      </div>
    </div>
  );
}
