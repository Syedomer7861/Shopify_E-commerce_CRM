"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { marketingApi } from "@/lib/marketing-client";
import type { MktIntakeRequest } from "@/types";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-50 text-amber-700 border-amber-100",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
};

// Any signed-in user can file a creative request here and track their own.
export default function CreativeRequestPage() {
  const [form, setForm] = useState({ title: "", details: "", desired_date: "" });
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<MktIntakeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setMine(await marketingApi.listIntake({ mine: true }));
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!form.title.trim()) return toast.error("Give it a title");
    setSubmitting(true);
    try {
      await marketingApi.submitIntake({
        title: form.title.trim(),
        details: form.details.trim() || undefined,
        desired_date: form.desired_date || null,
      });
      setForm({ title: "", details: "", desired_date: "" });
      toast.success("Request sent to the marketing team");
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Request Creative</span>}
        subtitle="Ask the marketing team for an asset, campaign, or content piece — and follow up here."
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
          <Link href="/workspace" className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]">
            Workspace
          </Link>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest mb-2">Your requests</div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" /></div>
        ) : mine.length === 0 ? (
          <div className="bg-white border border-[#eceae4] rounded-2xl p-8 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
            Nothing yet
          </div>
        ) : (
          <div className="bg-white border border-[#eceae4] rounded-2xl divide-y divide-[#eceae4]">
            {mine.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[#1c1c1c]">{r.title}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]/60 mt-0.5">
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {r.desired_date ? ` · needed by ${new Date(r.desired_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    </div>
                  </div>
                  <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border flex-shrink-0", STATUS_STYLE[r.status] ?? STATUS_STYLE.new)}>
                    {r.status}
                  </span>
                </div>
                {r.details && <p className="text-[11px] font-medium text-[#5f5f5d] mt-2 whitespace-pre-wrap">{r.details}</p>}
                {r.created_task_id && (
                  <Link
                    href={`/workspace?task=${r.created_task_id}`}
                    className="inline-block mt-2 text-[10px] font-black uppercase tracking-widest text-[#1c1c1c] hover:underline"
                  >
                    View the task →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
