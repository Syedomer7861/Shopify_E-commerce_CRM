import { Check, Minus } from "lucide-react";
import SiteShell, { CtaBand, Mesh } from "@/components/site/SiteShell";
import { Breadcrumbs, Eyebrow, siteMetadata } from "@/components/site/PageView";
import { Reveal } from "@/components/site/Motion";
import PricingCards from "@/components/site/PricingCards";
import { loadPricing } from "@/lib/pricing-server";
import { razorpayEnabled } from "@/lib/razorpay";

// Plans, prices and comparison rows are owner-edited (Super Admin > Plans,
// Pricing, Modules); re-read at most every minute.
export const revalidate = 60;

export const metadata = siteMetadata("/pricing", "Pricing and Plans",
  "CodeCrest plans and prices. Compare what each plan includes, start a free trial and pay monthly or yearly with auto-pay.");

const FAQ: [string, string][] = [
  ["How does the free trial work?", "Your workspace opens as soon as you set up auto-pay. You are charged only when the trial ends, and you can stop auto-pay any time before that from Billing."],
  ["Can I cancel?", "Yes. Stop auto-pay from your Billing page. A paid period runs to its end; your data stays safe."],
  ["How do I pay?", "Through Razorpay: cards, UPI and net banking that support recurring payments."],
  ["Can my team join?", "Yes. As the admin you add your team from inside the workspace, with their own roles."],
];

function Cell({ value, dark }: { value: string | undefined; dark?: boolean }) {
  const v = (value ?? "").trim();
  if (v.toLowerCase() === "yes") return <Check className={`w-5 h-5 mx-auto ${dark ? "text-[var(--mint)]" : "text-emerald-600"}`} aria-label="Included" />;
  if (!v || v.toLowerCase() === "no") return <Minus className="w-4 h-4 mx-auto text-black/25" aria-label="Not included" />;
  return <span className="text-[13px]">{v}</span>;
}

export default async function PricingPage() {
  const { plans, sections } = await loadPricing();
  const signupOpen = razorpayEnabled();

  return (
    <SiteShell>
      <section className="relative overflow-hidden">
        <Mesh soft />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-28 md:pt-32 pb-16">
          <Breadcrumbs trail={[["Pricing", "/pricing"]]} />
          <div className="mt-8 text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="font-display font-bold tracking-[-0.035em] text-[2.3rem] sm:text-5xl lg:text-[3.5rem] leading-[1.04] mt-5">Plans that grow with your team</h1>
            <p className="text-[17px] text-[#3b3b3a] leading-relaxed mt-5 max-w-xl mx-auto">
              {signupOpen ? "Pick a plan, create your workspace and start working today." : "Pick the plan that fits. Our team sets up your workspace with you."}
            </p>
          </div>
          <div className="mt-12">
            {plans.length ? <PricingCards plans={plans} signupOpen={signupOpen} />
              : <p className="text-center text-[var(--dim)]">Plans are being updated. <a href="/contact" className="font-semibold underline">Talk to us</a> for a quote.</p>}
          </div>
        </div>
      </section>

      {plans.length > 0 && sections.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
          <Reveal>
            <h2 className="font-display font-bold tracking-tight text-3xl md:text-4xl text-center">Compare plans</h2>
            <div className="mt-10 overflow-x-auto rounded-[1.75rem] border border-black/[0.07] bg-white">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <caption className="sr-only">What each plan includes</caption>
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th scope="col" className="p-5 w-[34%] text-[13px] font-semibold text-[var(--dim)]">Feature</th>
                    {plans.map((p) => (
                      <th key={p.code} scope="col" className={`p-5 text-center font-display font-bold text-lg ${p.featured ? "bg-[#f4f3ee]" : ""}`}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                {sections.map((s) => (
                  <tbody key={s.title}>
                    <tr><th colSpan={plans.length + 1} scope="colgroup" className="px-5 pt-6 pb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--dim)]">{s.title}</th></tr>
                    {s.rows.map((r) => (
                      <tr key={r.label} className="border-t border-[var(--line)]">
                        <th scope="row" className="px-5 py-3.5 font-medium text-[14px]">
                          {r.label}
                          {r.hint && <span className="block text-[12px] font-normal text-[var(--dim)] mt-0.5">{r.hint}</span>}
                        </th>
                        {plans.map((p) => (
                          <td key={p.code} className={`px-5 py-3.5 text-center ${p.featured ? "bg-[#f4f3ee]" : ""}`}><Cell value={r.cells[p.code]} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Reveal>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="font-display font-bold tracking-tight text-3xl text-center">Questions</h2>
        <div className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="cursor-pointer list-none flex justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}<span aria-hidden className="text-[var(--dim)] group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-[15px] text-[var(--dim)] leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand title="Want help choosing?" text="Tell us about your team and we will recommend a plan and help you set it up." />
    </SiteShell>
  );
}
