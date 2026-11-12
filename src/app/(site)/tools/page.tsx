import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";
import { SITE_URL, TOOLS } from "@/content";
import { Breadcrumbs, siteMetadata } from "@/components/site/PageView";
import { CtaBand, JsonLd } from "@/components/site/SiteShell";

const DESCRIPTION = "Free calculators and tools for e-commerce teams: RTO loss, cart recovery, COD vs prepaid profit, volumetric weight, customer lifetime value and WhatsApp links.";
export const metadata = siteMetadata("/tools", "Free E-commerce Tools & Calculators", DESCRIPTION);

const TOOLS_CTA = {
  title: "Want these numbers to move?",
  text: "CodeCrest turns verification, delivery follow-up and cart recovery into a daily process with an owner for every order.",
};

export default function ToolsIndex() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        <Breadcrumbs trail={[["Free Tools", "/tools"]]} />
        <h1 className="font-display font-semibold tracking-tight text-4xl md:text-6xl leading-[1.05] mt-8 max-w-3xl">Free tools for e-commerce teams</h1>
        <p className="text-lg text-[#5f5f5d] leading-relaxed mt-5 max-w-2xl">Put a number on returns, recovery and repeat revenue. No signup, nothing stored: every tool runs in your browser.</p>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TOOLS.map((t) => (
          <Link key={t.slug} href={`/tools/${t.slug}`} className="group flex flex-col rounded-2xl border border-[#eceae4] bg-white p-6 hover:border-[#1c1c1c]/30 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-0.5 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4"><Calculator className="w-5 h-5 text-emerald-700" /></div>
            <h2 className="font-display font-semibold text-lg tracking-tight">{t.name}</h2>
            <p className="text-[14px] text-[#5f5f5d] leading-relaxed mt-2 flex-1">{t.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold">Open tool <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
          </Link>
        ))}
      </section>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "CollectionPage", name: "Free e-commerce tools", description: DESCRIPTION, url: `${SITE_URL}/tools`,
        hasPart: TOOLS.map((t) => ({ "@type": "WebApplication", name: t.name, url: `${SITE_URL}/tools/${t.slug}` })),
      }} />
      <CtaBand {...TOOLS_CTA} />
    </>
  );
}
