import { Check } from "lucide-react";
import { SITE_URL } from "@/content";
import SiteShell, { JsonLd, Mesh, ORG_LD } from "@/components/site/SiteShell";
import { Breadcrumbs, Eyebrow, siteMetadata } from "@/components/site/PageView";
import { Reveal, Stagger, StaggerItem, WordsIn } from "@/components/site/Motion";
import ContactForm from "@/components/site/ContactForm";

// Owner-editable text (Super Admin > Content) is re-read at most every 5 minutes; publishing refreshes it at once.
export const revalidate = 300;

export const metadata = siteMetadata("/contact", "Talk to Us: Request Your Workspace",
  "Request a CodeCrest workspace. Tell us about your team and tools; we set up your organisation, connect Shopify, Shiprocket and WhatsApp, and hand over a working system.");

const NEXT: [string, string][] = [
  ["You send this form", "Team size, the tools you run on and where orders get stuck."],
  ["We build your organisation", "Workspace, roles and queues, with your integrations connected alongside you."],
  ["Your team logs in", "To a system that already has your orders in it."],
];

export default function ContactPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden">
        <Mesh soft />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-28 md:pt-32 pb-20 md:pb-28 grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-start">
          <div className="lg:sticky lg:top-28">
            <Breadcrumbs trail={[["Contact", "/contact"]]} />
            <div className="mt-8"><Eyebrow>Talk to us</Eyebrow></div>
            <h1 className="font-display font-bold tracking-[-0.035em] text-[2.3rem] sm:text-5xl lg:text-[3.5rem] leading-[1.04] mt-5">
              <WordsIn text="Let's set up your workspace" accent="workspace" />
            </h1>
            <Reveal delay={0.25} y={16}>
              <p className="text-[17px] md:text-lg text-[#3b3b3a] leading-relaxed mt-6 max-w-md" data-speakable>
                Every CodeCrest organisation is set up by our team. Tell us how you work and we hand over a system that is ready on day one.
              </p>
            </Reveal>
            <Stagger className="mt-10 space-y-5" gap={0.1}>
              {NEXT.map(([h, t], i) => (
                <StaggerItem key={h} className="flex gap-4">
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-[#111113] text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div><p className="font-semibold">{h}</p><p className="text-[var(--dim)] text-[14.5px] leading-relaxed mt-0.5">{t}</p></div>
                </StaggerItem>
              ))}
            </Stagger>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-[#3b3b3a]">
              {["Your own isolated organisation", "Your own integrations", "No self-serve setup to figure out"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4 text-[#0e8f55]" strokeWidth={2.5} />{t}</li>
              ))}
            </ul>
          </div>

          <div>
            <div className="rounded-[2rem] bg-white border border-[var(--line)] shadow-[0_30px_80px_-30px_rgba(17,17,19,0.25)] p-6 sm:p-9">
              <h2 className="font-display font-bold tracking-tight text-2xl">Request your workspace</h2>
              <p className="text-[var(--dim)] text-[14.5px] mt-1.5 mb-7">Three required fields. We reply with next steps.</p>
              <ContactForm />
            </div>
            <p className="text-center text-[13.5px] text-[var(--dim)] mt-6">Already have a workspace? <a href="/login" className="font-semibold text-[#111113] underline underline-offset-4">Sign in</a></p>
          </div>
        </div>
      </section>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ContactPage", name: "Contact CodeCrest", url: `${SITE_URL}/contact`, about: ORG_LD }} />
    </SiteShell>
  );
}
