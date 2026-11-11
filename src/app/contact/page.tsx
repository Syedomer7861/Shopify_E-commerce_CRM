"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(body?.error || "Could not send your message");
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: `radial-gradient(#1c1c1c 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="text-center mb-10 animate-fade-in">
          <Link href="/" className="inline-block group relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 bg-[#1c1c1c]/10 rounded-full blur-xl group-hover:bg-[#1c1c1c]/20 transition-all duration-500" />
            <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl transition-transform hover:scale-105 duration-300">
              <img src="/logo-mark.png" alt="CodeCrest" className="w-full h-full object-cover" />
            </div>
          </Link>
          <h1 className="text-3xl font-display text-[#1c1c1c] tracking-tight mb-2 font-black uppercase">CodeCrest</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
            <span className="text-[#1c1c1c]/40 text-[9px] font-black uppercase tracking-[0.3em]">Request Your Workspace</span>
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-10 border border-[#eceae4] shadow-[0_20px_50px_rgba(28,28,28,0.05)] relative overflow-hidden animate-slide-up">
          {sent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-[#1c1c1c] mb-2">Request received</h2>
              <p className="text-[#5f5f5d] text-sm leading-relaxed">
                We set up every workspace by hand - integrations, roles, and your team&apos;s logins - and hand it over ready to use. We&apos;ll be in touch shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-xl font-bold text-[#1c1c1c] mb-1">Let&apos;s Set You Up</h2>
                <p className="text-[#5f5f5d] text-[11px] font-medium uppercase tracking-wider">
                  Workspaces are provisioned by our team, not self-serve
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Your Name</label>
                  <input
                    type="text" required
                    className="w-full h-13 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 py-3.5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                    placeholder="Jane Doe"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Work Email</label>
                  <input
                    type="email" required
                    className="w-full h-13 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 py-3.5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Company</label>
                    <input
                      type="text"
                      className="w-full h-13 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 py-3.5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                      placeholder="Acme Inc."
                      value={form.company}
                      onChange={e => setForm({ ...form, company: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Phone</label>
                    <input
                      type="tel"
                      className="w-full h-13 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 py-3.5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                      placeholder="Optional"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">What do you need?</label>
                  <textarea
                    required rows={4}
                    className="w-full bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 py-3.5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium resize-none"
                    placeholder="Tell us about your team and which integrations you use (Shopify, Shiprocket, WhatsApp...)"
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-[#1c1c1c] text-[#f7f4ed] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:shadow-[#1c1c1c]/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3 mt-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#f7f4ed]/20 border-t-[#f7f4ed] rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Request Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-8 text-center">
          <a href="/login" className="text-[10px] font-black text-[#1c1c1c]/40 hover:text-[#1c1c1c] uppercase tracking-widest transition-colors">
            Already have a workspace? Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
