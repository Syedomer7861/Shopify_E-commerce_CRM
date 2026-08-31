"use client";
import { useState } from "react";
import Link from "next/link";
import { Megaphone, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { marketingApi } from "@/lib/marketing-client";

// Any signed-in user can file a creative request here — it lands in the
// marketing team's intake queue. No marketing permission required.
export default function CreativeRequestPage() {
  const [form, setForm] = useState({ title: "", details: "", desired_date: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!form.title.trim()) return toast.error("Give it a title");
    setSubmitting(true);
    try {
      await marketingApi.submitIntake({
        title: form.title.trim(),
        details: form.details.trim() || undefined,
        desired_date: form.desired_date || null,
      });
      setSent(true);
    } catch (e: any) {
      toast.error(e.message || "Could not send");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-[#1c1c1c]">Request sent to marketing</h2>
        <p className="text-[13px] text-[#5f5f5d] font-medium">You&apos;ll get a notification when they pick it up.</p>
        <button
          onClick={() => { setForm({ title: "", details: "", desired_date: "" }); setSent(false); }}
          className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Request Creative</span>}
        subtitle="Ask the marketing team for an asset, campaign, or content piece."
      />
      <div className="space-y-5 bg-white border border-[#eceae4] rounded-2xl p-5">
        <div>
          <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">What do you need</label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. WhatsApp broadcast image for Diwali offer"
            className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Details</label>
          <textarea
            value={form.details}
            onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            rows={5}
            placeholder="Audience, key message, references, sizes, anything useful…"
            className="w-full text-[13px] font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-3 py-2.5 resize-y"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Needed by</label>
          <input
            type="date"
            value={form.desired_date}
            onChange={(e) => setForm((f) => ({ ...f, desired_date: e.target.value }))}
            className="text-xs font-bold bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2.5 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Send request
          </button>
          <Link href="/marketing" className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">
            Marketing board
          </Link>
        </div>
      </div>
    </div>
  );
}
