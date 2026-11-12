import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, ChevronRight, Plus } from "lucide-react";
import { CONTENT_UPDATED, SITE_NAME, SITE_URL, resolveRef, type Page, type Section } from "@/content";
import { CtaBand, JsonLd, ORG_LD } from "./SiteShell";
import Visual from "./Visual";

export function siteMetadata(path: string, title: string, description: string, type: "website" | "article" = "website"): Metadata {
  const full = `${title} | ${SITE_NAME}`;
  return {
    title: full, description,
    alternates: { canonical: path },
    openGraph: { type, url: path, siteName: SITE_NAME, title: full, description, images: ["/og-image.png"] },
    twitter: { card: "summary_large_image", title: full, description, images: ["/og-image.png"] },
  };
}

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#5f5f5d]">{children}</span>
);

export function Breadcrumbs({ trail }: { trail: [string, string][] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12px] text-[#5f5f5d]">
        <Link href="/" className="hover:text-[#1c1c1c]">Home</Link>
        {trail.map(([label, href], i) => (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            {i === trail.length - 1 ? <span aria-current="page" className="text-[#1c1c1c]">{label}</span> : <Link href={href} className="hover:text-[#1c1c1c]">{label}</Link>}
          </span>
        ))}
      </nav>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [["Home", "/"], ...trail].map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE_URL + href })),
      }} />
    </>
  );
}

export function Faqs({ faqs, heading = "Frequently asked questions" }: { faqs: [string, string][]; heading?: string }) {
  if (!faqs.length) return null;
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="font-display font-semibold tracking-tight text-2xl md:text-3xl text-center mb-8">{heading}</h2>
      <div className="divide-y divide-[#eceae4] border-y border-[#eceae4]">
        {faqs.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="list-none cursor-pointer flex items-start justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              <h3 className="text-[15px] font-semibold font-sans">{q}</h3>
              <Plus className="w-4 h-4 mt-1 flex-shrink-0 transition-transform group-open:rotate-45" />
            </summary>
            <p className="text-[#5f5f5d] text-[15px] leading-relaxed mt-3">{a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      }} />
    </section>
  );
}

export function RelatedLinks({ refs }: { refs?: string[] }) {
  const links = (refs || []).map(resolveRef).filter((l): l is NonNullable<typeof l> => !!l);
  if (!links.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
      <h2 className="font-display font-semibold tracking-tight text-xl mb-5">Keep exploring</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group rounded-2xl border border-[#eceae4] bg-white p-5 hover:border-[#1c1c1c]/30 hover:shadow-lg hover:shadow-black/5 transition-all">
            <Eyebrow>{l.section}</Eyebrow>
            <div className="mt-2 font-semibold leading-snug flex items-start justify-between gap-3">
              {l.title}<ArrowRight className="w-4 h-4 mt-1 flex-shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Hub page: /features, /solutions, ... */
export function SectionIndex({ section }: { section: Section }) {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        <Breadcrumbs trail={[[section.label, `/${section.key}`]]} />
        <h1 className="font-display font-semibold tracking-tight text-4xl md:text-6xl leading-[1.05] mt-8 max-w-3xl">{section.title}</h1>
        <p className="text-lg text-[#5f5f5d] leading-relaxed mt-5 max-w-2xl">{section.intro}</p>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {section.pages.map((p) => (
          <Link key={p.slug} href={`/${section.key}/${p.slug}`} className="group flex flex-col rounded-2xl border border-[#eceae4] bg-white p-6 hover:border-[#1c1c1c]/30 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-0.5 transition-all">
            <h2 className="font-display font-semibold text-lg leading-snug tracking-tight">{p.metaTitle || p.title}</h2>
            <p className="text-[14px] text-[#5f5f5d] leading-relaxed mt-2 flex-1">{p.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold">Read more <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
          </Link>
        ))}
      </section>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "CollectionPage", name: section.title, description: section.description, url: `${SITE_URL}/${section.key}`,
        hasPart: section.pages.map((p) => ({ "@type": "WebPage", name: p.metaTitle || p.title, url: `${SITE_URL}/${section.key}/${p.slug}` })),
      }} />
      <CtaBand />
    </>
  );
}

/** Detail page for any content entry. */
export default function PageView({ section, page }: { section: Section; page: Page }) {
  const url = `${SITE_URL}/${section.key}/${page.slug}`;
  const isArticle = section.kind === "article";
  return (
    <article>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{ backgroundImage: "radial-gradient(#1c1c1c 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className={`relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16 md:pb-20 ${page.visual ? "grid lg:grid-cols-2 gap-12 items-center" : ""}`}>
          <div className={page.visual ? "" : "max-w-3xl"}>
            <Breadcrumbs trail={[[section.label, `/${section.key}`], [(page.metaTitle || page.title).split(":")[0], `/${section.key}/${page.slug}`]]} />
            <h1 className="font-display font-semibold tracking-tight text-[2.1rem] sm:text-5xl leading-[1.08] mt-8">{page.title}</h1>
            <p className="text-[17px] text-[#3a3a38] leading-relaxed mt-6" data-speakable>{page.answer}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/contact" className="btn-primary px-6 py-3 text-sm">Talk to us <ArrowRight className="w-4 h-4" /></Link>
              <Link href={`/${section.key}`} className="btn-secondary px-6 py-3 text-sm">All {section.key === "compare" ? "comparisons" : section.key}</Link>
            </div>
            {isArticle && <p className="text-[12px] text-[#5f5f5d] mt-6">Last reviewed <time dateTime={CONTENT_UPDATED}>{new Date(CONTENT_UPDATED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time> by the CodeCrest team</p>}
          </div>
          {page.visual && <Visual kind={page.visual} className="lg:ml-4" />}
        </div>
      </section>

      <section className="border-y border-[#eceae4] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-3 gap-8">
          {page.points.map(([h, t]) => (
            <div key={h}>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4"><Check className="w-4 h-4 text-emerald-700" strokeWidth={2.5} /></div>
              <h2 className="font-display font-semibold text-lg tracking-tight">{h}</h2>
              <p className="text-[14.5px] text-[#5f5f5d] leading-relaxed mt-2">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {page.steps && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16">
          <h2 className="font-display font-semibold tracking-tight text-2xl md:text-3xl mb-8">{isArticle ? "Step by step" : "How to set it up"}</h2>
          <ol className="space-y-5">
            {page.steps.map(([name, text], i) => (
              <li key={name} className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1c1c1c] text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                <div><h3 className="font-semibold font-sans text-[16px]">{name}</h3><p className="text-[15px] text-[#5f5f5d] leading-relaxed mt-1">{text}</p></div>
              </li>
            ))}
          </ol>
          <JsonLd data={{
            "@context": "https://schema.org", "@type": "HowTo", name: page.title,
            step: page.steps.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
          }} />
        </section>
      )}

      {page.table && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16">
          <div className="overflow-x-auto rounded-2xl border border-[#eceae4] bg-white">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="bg-[#f7f4ed]">{page.table.cols.map((c, i) => <th key={i} scope="col" className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#5f5f5d]">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#eceae4]">
                {page.table.rows.map((r) => (
                  <tr key={r[0]}>{r.map((cell, i) => i === 0
                    ? <th key={i} scope="row" className="px-4 py-3 font-semibold align-top min-w-[10rem]">{cell}</th>
                    : <td key={i} className="px-4 py-3 text-[#3a3a38] align-top min-w-[12rem]">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {section.key === "compare" && (
            <p className="text-[12px] text-[#5f5f5d] mt-3 leading-relaxed">
              This comparison describes each product&apos;s general positioning as we understand it. Products change; check the vendor&apos;s own site for current features and pricing. Product names are trademarks of their owners.
            </p>
          )}
        </section>
      )}

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 space-y-12">
        {page.sections.map((s) => (
          <div key={s.h}>
            <h2 className="font-display font-semibold tracking-tight text-2xl md:text-3xl">{s.h}</h2>
            <p className="text-[16px] text-[#3a3a38] leading-relaxed mt-4">{s.p}</p>
            {s.list && (
              <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {s.list.map((li) => (
                  <li key={li} className="flex items-start gap-2.5 text-[15px]"><Check className="w-4 h-4 text-emerald-600 mt-1 flex-shrink-0" strokeWidth={2.5} />{li}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <Faqs faqs={page.faqs} />
      <RelatedLinks refs={page.related} />
      <CtaBand />

      <JsonLd data={isArticle ? {
        "@context": "https://schema.org", "@type": "Article", headline: page.title, description: page.description, url, mainEntityOfPage: url,
        dateModified: CONTENT_UPDATED, datePublished: CONTENT_UPDATED, author: ORG_LD, publisher: ORG_LD, image: `${SITE_URL}/og-image.png`,
      } : {
        "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url,
        dateModified: CONTENT_UPDATED, publisher: ORG_LD,
        about: { "@type": "SoftwareApplication", name: "CodeCrest", applicationCategory: "BusinessApplication", operatingSystem: "Web" },
      }} />
    </article>
  );
}
