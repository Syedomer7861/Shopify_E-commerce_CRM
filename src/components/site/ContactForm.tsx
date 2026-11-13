"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { ATTRIBUTION_KEY, AttributionSchema, readConsent } from "@/lib/attribution";

// How the visitor found us, if they allowed analytics (see ConsentBanner). Otherwise nothing is sent.
function storedAttribution() {
  if (readConsent(document.cookie) !== "analytics") return undefined;
  try {
    const parsed = AttributionSchema.safeParse(JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null"));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}

// Workspace request form. Posts to /api/contact exactly as before; only the
// presentation changed.

const INPUT = "w-full rounded-2xl border border-[var(--line)] bg-[#f4f3ee]/60 px-4 py-3.5 text-[15px] text-[#111113] placeholder:text-[#111113]/30 transition-all focus:outline-none focus:bg-white focus:border-[#111113]/40 focus:ring-4 focus:ring-[#111113]/5";
const LABEL = "block text-[12.5px] font-semibold mb-1.5";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attribution: storedAttribution() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || "Could not send your message");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="text-center py-10">
        <div className="w-16 h-16 rounded-full bg-[#5fe39a]/25 text-[#0e8f55] flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-8 h-8" /></div>
        <h2 className="font-display font-bold tracking-tight text-2xl">Request received</h2>
        <p className="text-[var(--dim)] text-[15px] leading-relaxed mt-3 max-w-sm mx-auto">
          We set up every workspace by hand: integrations, roles and your team&apos;s logins, handed over ready to use. We&apos;ll be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="c-name" className={LABEL}>Your name</label>
          <input id="c-name" type="text" required autoComplete="name" className={INPUT} placeholder="Jane Doe" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label htmlFor="c-email" className={LABEL}>Work email</label>
          <input id="c-email" type="email" required autoComplete="email" className={INPUT} placeholder="you@company.com" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label htmlFor="c-company" className={LABEL}>Company <span className="font-normal text-[var(--dim)]">(optional)</span></label>
          <input id="c-company" type="text" autoComplete="organization" className={INPUT} placeholder="Acme Inc." value={form.company} onChange={set("company")} />
        </div>
        <div>
          <label htmlFor="c-phone" className={LABEL}>Phone <span className="font-normal text-[var(--dim)]">(optional)</span></label>
          <input id="c-phone" type="tel" autoComplete="tel" className={INPUT} placeholder="+91" value={form.phone} onChange={set("phone")} />
        </div>
      </div>
      <div>
        <label htmlFor="c-message" className={LABEL}>What do you need?</label>
        <textarea id="c-message" required rows={4} className={`${INPUT} resize-none`} placeholder="Tell us about your team and which integrations you use (Shopify, Shiprocket, WhatsApp...)" value={form.message} onChange={set("message")} />
      </div>
      <button type="submit" disabled={loading} className="group w-full rounded-full bg-[#111113] text-white py-4 text-[15px] font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:bg-black hover:shadow-xl hover:shadow-black/20 disabled:opacity-60">
        {loading ? <span className="w-5 h-5 border-2 border-white/25 border-t-white rounded-full animate-spin" /> : <>Request workspace <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
      </button>
      <p className="text-center text-[12.5px] text-[var(--dim)]">Workspaces are provisioned by our team, not self-serve.</p>
    </form>
  );
}
