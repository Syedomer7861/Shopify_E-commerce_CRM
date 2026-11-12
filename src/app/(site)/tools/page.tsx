import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";
import { SITE_URL, TOOLS } from "@/content";
import { CARD, HeroCta, PageHero, siteMetadata } from "@/components/site/PageView";
import { CtaBand, JsonLd } from "@/components/site/SiteShell";
import { Stagger, StaggerItem } from "@/components/site/Motion";

const DESCRIPTION = "Free calculators and tools for e-commerce teams: RTO loss, cart recovery, COD vs prepaid profit, volumetric weight, customer lifetime value and WhatsApp links.";
export const metadata = siteMetadata("/tools", "Free E-commerce Tools & Calculators", DESCRIPTION);

export default function ToolsIndex() {
  return (
    <>
      <PageHero trail={[["Free Tools", "/tools"]]} eyebrow="Free tools" title="Free tools for e-commerce teams"
        answer="Put a number on returns, recovery and repeat revenue. No signup, nothing stored: every tool runs in your browser.">
        <HeroCta href={`/tools/${TOOLS[0].slug}`} primary>Start with RTO loss</HeroCta>
      </PageHero>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((t) => (
            <StaggerItem key={t.slug} className="flex">
              <Link href={`/tools/${t.slug}`} className={`${CARD} w-full`}>
                <div className="w-11 h-11 rounded-xl bg-[#111113]/5 flex items-center justify-center mb-5 group-hover:bg-[#111113] group-hover:text-white transition-colors duration-300"><Calculator className="w-5 h-5" /></div>
                <h2 className="font-display font-semibold text-xl tracking-tight">{t.name}</h2>
                <p className="text-[14px] text-[var(--dim)] leading-relaxed mt-2.5 flex-1">{t.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold">Open tool <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "CollectionPage", name: "Free e-commerce tools", description: DESCRIPTION, url: `${SITE_URL}/tools`,
        hasPart: TOOLS.map((t) => ({ "@type": "WebApplication", name: t.name, url: `${SITE_URL}/tools/${t.slug}` })),
      }} />
      <CtaBand title="Want these numbers to move?" text="CodeCrest turns verification, delivery follow-up and cart recovery into a daily process with an owner for every order." />
    </>
  );
}
