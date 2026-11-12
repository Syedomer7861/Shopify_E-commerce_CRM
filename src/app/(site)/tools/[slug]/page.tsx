import { notFound } from "next/navigation";
import { SITE_URL, TOOLS } from "@/content";
import { Faqs, PageHero, RelatedLinks, siteMetadata } from "@/components/site/PageView";
import { CtaBand, JsonLd } from "@/components/site/SiteShell";
import { Reveal } from "@/components/site/Motion";
import ToolWidget from "@/components/site/Tools";

export const dynamicParams = false;
export const generateStaticParams = () => TOOLS.map((t) => ({ slug: t.slug }));

type Props = { params: { slug: string } };
const find = (slug: string) => TOOLS.find((t) => t.slug === slug);

export function generateMetadata({ params }: Props) {
  const t = find(params.slug);
  return t ? siteMetadata(`/tools/${t.slug}`, `${t.name} (Free)`, t.description) : {};
}

export default function ToolPage({ params }: Props) {
  const t = find(params.slug);
  if (!t) notFound();
  const others = TOOLS.filter((x) => x.slug !== t.slug).slice(0, 4).map((x) => `tools/${x.slug}`);
  return (
    <>
      <PageHero trail={[["Free Tools", "/tools"], [t.name, `/tools/${t.slug}`]]} eyebrow="Free tool" title={t.name} answer={t.answer} />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 md:-mt-12 relative"><Reveal><ToolWidget slug={t.slug} /></Reveal></section>
      <Faqs faqs={t.faqs} heading="About this tool" />
      <RelatedLinks refs={others} heading="More free tools" />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "WebApplication", name: t.name, description: t.description, url: `${SITE_URL}/tools/${t.slug}`,
        applicationCategory: "BusinessApplication", operatingSystem: "Any", isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      }} />
      <CtaBand title="Want these numbers to move?" text="CodeCrest turns verification, delivery follow-up and cart recovery into a daily process with an owner for every order." />
    </>
  );
}
