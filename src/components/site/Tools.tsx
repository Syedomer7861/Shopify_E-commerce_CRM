"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Free tools. Everything is computed in the browser; nothing is sent anywhere.
// Each calculator is a list of inputs and a pure function from inputs to
// result lines, so the maths can be checked by reading `calc`.

type Field = { key: string; label: string; value: number; unit?: "₹" | "%" | "kg" | "cm"; step?: number };
type Result = { label: string; value: string; strong?: boolean; note?: string };
type Calc = { fields: Field[]; calc: (v: Record<string, number>) => Result[] };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number, d = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: d });

export const CALCS: Record<string, Calc> = {
  "rto-loss-calculator": {
    fields: [
      { key: "orders", label: "Orders per month", value: 3000 },
      { key: "cod", label: "COD share of orders", value: 60, unit: "%" },
      { key: "rto", label: "RTO rate on COD orders", value: 25, unit: "%" },
      { key: "fwd", label: "Forward shipping per order", value: 70, unit: "₹" },
      { key: "ret", label: "Return shipping per order", value: 60, unit: "₹" },
      { key: "pack", label: "Packaging and handling per order", value: 25, unit: "₹" },
      { key: "aov", label: "Average order value", value: 900, unit: "₹" },
      { key: "margin", label: "Gross margin", value: 50, unit: "%" },
      { key: "target", label: "Target RTO rate", value: 18, unit: "%" },
    ],
    calc: (v) => {
      const cod = v.orders * v.cod / 100;
      const perReturn = v.fwd + v.ret + v.pack;
      const returned = cod * v.rto / 100;
      const targetReturned = cod * Math.min(v.target, v.rto) / 100;
      const saved = returned - targetReturned;
      return [
        { label: "Returned orders per month", value: num(returned) },
        { label: "Direct RTO loss per month", value: inr(returned * perReturn), strong: true, note: "Shipping both ways plus packaging and handling" },
        { label: "Margin not earned on those orders", value: inr(returned * v.aov * v.margin / 100) },
        { label: "Saved per month at target rate", value: inr(saved * perReturn + saved * v.aov * v.margin / 100), strong: true, note: `${num(saved)} more orders delivered` },
        { label: "Saved per year at target rate", value: inr(12 * (saved * perReturn + saved * v.aov * v.margin / 100)) },
      ];
    },
  },
  "cart-recovery-calculator": {
    fields: [
      { key: "carts", label: "Abandoned checkouts per month", value: 2000 },
      { key: "aov", label: "Average order value", value: 900, unit: "₹" },
      { key: "rate", label: "Recovery rate", value: 8, unit: "%", step: 0.5 },
    ],
    calc: (v) => {
      const rec = v.carts * v.rate / 100;
      return [
        { label: "Revenue sitting in abandoned checkouts", value: inr(v.carts * v.aov) },
        { label: "Recovered orders per month", value: num(rec) },
        { label: "Recovered revenue per month", value: inr(rec * v.aov), strong: true },
        { label: "Recovered revenue per year", value: inr(rec * v.aov * 12) },
        { label: "Each extra point of recovery adds", value: inr(v.carts * v.aov / 100) + " / month", note: "One percentage point more of the same carts" },
      ];
    },
  },
  "cod-vs-prepaid-calculator": {
    fields: [
      { key: "aov", label: "Order value", value: 900, unit: "₹" },
      { key: "cost", label: "Product cost", value: 400, unit: "₹" },
      { key: "ship", label: "Forward shipping", value: 70, unit: "₹" },
      { key: "ret", label: "Return shipping", value: 60, unit: "₹" },
      { key: "codFee", label: "COD collection fee", value: 40, unit: "₹" },
      { key: "gw", label: "Payment gateway fee", value: 2, unit: "%", step: 0.1 },
      { key: "rtoCod", label: "Return rate on COD", value: 25, unit: "%" },
      { key: "rtoPre", label: "Return rate on prepaid", value: 4, unit: "%" },
    ],
    // Expected profit per order placed: a delivered order earns its margin
    // less fees; a returned one loses shipping both ways (stock comes back).
    calc: (v) => {
      const profit = (rto: number, fee: number) => {
        const p = rto / 100;
        return (1 - p) * (v.aov - v.cost - v.ship - fee) - p * (v.ship + v.ret);
      };
      const cod = profit(v.rtoCod, v.codFee);
      const pre = profit(v.rtoPre, v.aov * v.gw / 100);
      return [
        { label: "Expected profit per COD order", value: inr(cod), strong: true },
        { label: "Expected profit per prepaid order", value: inr(pre), strong: true },
        { label: "Prepaid advantage per order", value: inr(pre - cod), note: pre > cod ? "The most you could give as a prepaid discount and still come out ahead" : "COD is ahead with these inputs" },
      ];
    },
  },
  "volumetric-weight-calculator": {
    fields: [
      { key: "l", label: "Length", value: 30, unit: "cm" },
      { key: "w", label: "Width", value: 20, unit: "cm" },
      { key: "h", label: "Height", value: 15, unit: "cm" },
      { key: "actual", label: "Actual weight", value: 1, unit: "kg", step: 0.1 },
      { key: "div", label: "Courier divisor", value: 5000 },
    ],
    calc: (v) => {
      const vol = v.div > 0 ? (v.l * v.w * v.h) / v.div : 0;
      return [
        { label: "Volumetric weight", value: num(vol, 2) + " kg", note: `${num(v.l)} × ${num(v.w)} × ${num(v.h)} ÷ ${num(v.div)}` },
        { label: "Chargeable weight", value: num(Math.max(vol, v.actual), 2) + " kg", strong: true, note: vol > v.actual ? "Billed on size: a smaller box would cost less" : "Billed on actual weight" },
      ];
    },
  },
  "customer-lifetime-value-calculator": {
    fields: [
      { key: "aov", label: "Average order value", value: 900, unit: "₹" },
      { key: "freq", label: "Orders per customer per year", value: 2.5, step: 0.1 },
      { key: "years", label: "Years a customer stays", value: 2, step: 0.5 },
      { key: "margin", label: "Gross margin", value: 50, unit: "%" },
    ],
    calc: (v) => {
      const rev = v.aov * v.freq * v.years;
      const ltv = rev * v.margin / 100;
      return [
        { label: "Lifetime revenue per customer", value: inr(rev) },
        { label: "Customer lifetime value (margin)", value: inr(ltv), strong: true },
        { label: "Acquisition cost ceiling at 3:1", value: inr(ltv / 3), note: "A common rule of thumb: spend up to a third of LTV to acquire a customer" },
        { label: "One more order per year is worth", value: inr(v.aov * v.years * v.margin / 100), note: "Per customer, over their lifetime" },
      ];
    },
  },
};

const inputCls = "w-full rounded-lg border border-[#eceae4] bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/15 focus:border-[#1c1c1c]/40";

function Calculator({ fields, calc }: Calc) {
  const [v, setV] = useState<Record<string, number>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const results = calc(v);
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form className="rounded-2xl border border-[#eceae4] bg-white p-5 sm:p-6 grid sm:grid-cols-2 gap-4 content-start" onSubmit={(e) => e.preventDefault()}>
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[12px] font-semibold text-[#5f5f5d] mb-1.5">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
            <input type="number" inputMode="decimal" min={0} step={f.step ?? 1} value={Number.isFinite(v[f.key]) ? v[f.key] : ""} className={inputCls}
              onChange={(e) => setV({ ...v, [f.key]: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </label>
        ))}
      </form>
      <div className="rounded-2xl bg-[#1c1c1c] text-[#fcfbf8] p-5 sm:p-6" aria-live="polite">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50 mb-4">Result</div>
        <dl className="divide-y divide-white/10">
          {results.map((r) => (
            <div key={r.label} className="py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[14px] text-white/70">{r.label}</dt>
                <dd className={`font-display font-semibold tabular-nums text-right ${r.strong ? "text-2xl text-emerald-300" : "text-lg"}`}>{r.value}</dd>
              </div>
              {r.note && <p className="text-[12px] text-white/45 mt-1">{r.note}</p>}
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-white/40 mt-4 leading-relaxed">An estimate from the numbers you entered. The starting values are examples, not benchmarks.</p>
      </div>
    </div>
  );
}

function WhatsAppLink() {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("Hi, I have a question about my order.");
  const [copied, setCopied] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const valid = digits.length >= 8 && digits.length <= 15;
  const link = valid ? `https://wa.me/${digits}${text.trim() ? `?text=${encodeURIComponent(text.trim())}` : ""}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <form className="rounded-2xl border border-[#eceae4] bg-white p-5 sm:p-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="block text-[12px] font-semibold text-[#5f5f5d] mb-1.5">WhatsApp number with country code</span>
          <input type="tel" inputMode="tel" autoComplete="off" placeholder="91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          {phone && !valid && <span className="block text-[12px] text-rose-600 mt-1.5">Enter 8 to 15 digits including the country code, without a leading 0.</span>}
        </label>
        <label className="block">
          <span className="block text-[12px] font-semibold text-[#5f5f5d] mb-1.5">Pre-filled message (optional)</span>
          <textarea rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
        </label>
      </form>
      <div className="rounded-2xl bg-[#1c1c1c] text-[#fcfbf8] p-5 sm:p-6" aria-live="polite">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50 mb-4">Your link</div>
        {valid ? (
          <>
            <p className="break-all rounded-lg bg-white/10 px-3.5 py-3 text-[13px] font-mono">{link}</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-md bg-[#fcfbf8] text-[#1c1c1c] px-4 py-2.5 text-sm font-semibold">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? "Copied" : "Copy link"}
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-white/25 px-4 py-2.5 text-sm font-semibold">Test it</a>
            </div>
          </>
        ) : <p className="text-white/60 text-[14px]">Enter a number to generate the link.</p>}
        <p className="text-[11px] text-white/40 mt-5 leading-relaxed">Built in your browser. The number and message are not sent to us or stored.</p>
      </div>
    </div>
  );
}

export default function ToolWidget({ slug }: { slug: string }) {
  if (slug === "whatsapp-link-generator") return <WhatsAppLink />;
  const c = CALCS[slug];
  return c ? <Calculator {...c} /> : null;
}
