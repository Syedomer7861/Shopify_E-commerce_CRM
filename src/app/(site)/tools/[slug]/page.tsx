import { notFound } from "next/navigation";
import { SITE_URL, TOOLS } from "@/content";
import { Breadcrumbs, Faqs, RelatedLinks, siteMetadata } from "@/components/site/PageView";
import { CtaBand, JsonLd } from "@/components/site/SiteShell";
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
  const others = TOOLS.filter((x) => x.slug !== t.slug).slice(0, 3).map((x) => `tools/${x.slug}`);
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-10">
        <Breadcrumbs trail={[["Free Tools", "/tools"], [t.name, `/tools/${t.slug}`]]} />
        <h1 className="font-display font-semibold tracking-tight text-4xl md:text-5xl leading-[1.08] mt-8 max-w-3xl">{t.name}</h1>
        <p className="text-[17px] text-[#3a3a38] leading-relaxed mt-5 max-w-3xl" data-speakable>{t.answer}</p>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6"><ToolWidget slug={t.slug} /></section>
      <Faqs faqs={t.faqs} heading="About this tool" />
      <RelatedLinks refs={others} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "WebApplication", name: t.name, description: t.description, url: `${SITE_URL}/tools/${t.slug}`,
        applicationCategory: "BusinessApplication", operatingSystem: "Any", isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      }} />
      <CtaBand title="Want these numbers to move?" text="CodeCrest turns verification, delivery follow-up and cart recovery into a daily process with an owner for every order." />
    </>
  );
}
