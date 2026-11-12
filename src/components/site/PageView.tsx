import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Plus } from "lucide-react";
import { CONTENT_UPDATED, SITE_NAME, SITE_URL, resolveRef, type Page, type Section, type VisualKind } from "@/content";
import { CtaBand, DarkBackdrop, JsonLd, ORG_LD } from "./SiteShell";
import { Reveal, Stagger, StaggerItem, TiltIn, WordsIn } from "./Motion";
import Visual from "./Visual";

export function siteMetadata(path: string, title: string, description: string, type: "website" | "article" = "website", image = "/og-image.png"): Metadata {
  const full = `${title} | ${SITE_NAME}`;
  return {
    title: full, description,
    alternates: { canonical: path },
    openGraph: { type, url: path, siteName: SITE_NAME, title: full, description, images: [image] },
    twitter: { card: "summary_large_image", title: full, description, images: [image] },
  };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const Eyebrow = ({ children, dark }: { children: React.ReactNode; dark?: boolean }) => (
  <span className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] ${dark ? "text-emerald-400" : "text-emerald-700"}`}>
    <span className={`w-5 h-px ${dark ? "bg-emerald-400" : "bg-emerald-700"}`} />{children}
  </span>
);

export function Breadcrumbs({ trail, dark }: { trail: [string, string][]; dark?: boolean }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1 text-[12px] ${dark ? "text-white/50" : "text-[#5f5f5d]"}`}>
        <Link href="/" className="hover:underline">Home</Link>
        {trail.map(([label, href], i) => (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            {i === trail.length - 1 ? <span aria-current="page" className={dark ? "text-white" : "text-[#1c1c1c]"}>{label}</span> : <Link href={href} className="hover:underline">{label}</Link>}
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

/** Dark hero band shared by every inner page. */
export function PageHero({ trail, eyebrow, title, answer, visual, children, meta }: {
  trail: [string, string][]; eyebrow?: string; title: string; answer?: string; visual?: VisualKind; children?: React.ReactNode; meta?: React.ReactNode;
}) {
  return (
    <section className="relative bg-[#0f0f0e] text-white overflow-hidden">
      <DarkBackdrop />
      <div className={`relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-20 md:pb-28 ${visual ? "grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-14 items-center" : ""}`}>
        <div className={visual ? "min-w-0" : "max-w-3xl"}>
          <Breadcrumbs trail={trail} dark />
          {eyebrow && <div className="mt-9"><Eyebrow dark>{eyebrow}</Eyebrow></div>}
          <h1 className={`font-display font-semibold tracking-tight text-[2.1rem] sm:text-5xl lg:text-[3.4rem] leading-[1.06] ${eyebrow ? "mt-4" : "mt-9"}`}>
            <WordsIn text={title} />
          </h1>
          {answer && <Reveal delay={0.25} y={16}><p className="text-[17px] text-white/70 leading-relaxed mt-6 max-w-2xl" data-speakable>{answer}</p></Reveal>}
          {children && <Reveal delay={0.35} y={16}><div className="mt-8 flex flex-col sm:flex-row gap-3">{children}</div></Reveal>}
          {meta && <div className="mt-7 text-[12.5px] text-white/45">{meta}</div>}
        </div>
        {visual && <TiltIn className="min-w-0"><Visual kind={visual} /></TiltIn>}
      </div>
      <div aria-hidden className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
    </section>
  );
}

export const HeroCta = ({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) => (
  <Link href={href} className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${primary ? "bg-emerald-400 text-[#0f0f0e] hover:bg-emerald-300" : "border border-white/25 hover:bg-white/10"}`}>
    {children}{primary && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
  </Link>
);

export function Faqs({ faqs, heading = "Frequently asked questions" }: { faqs: [string, string][]; heading?: string }) {
  if (!faqs.length) return null;
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
      <Reveal><h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl text-center mb-10">{heading}</h2></Reveal>
      <Stagger className="space-y-3">
        {faqs.map(([q, a]) => (
          <StaggerItem key={q}>
            <details className="group rounded-2xl border border-[#eceae4] bg-white px-5 open:shadow-lg open:shadow-black/5 transition-shadow">
              <summary className="list-none cursor-pointer flex items-start justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
                <h3 className="text-[15.5px] font-semibold font-sans">{q}</h3>
                <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-[#f7f4ed] flex items-center justify-center group-open:bg-emerald-500 group-open:text-white transition-colors">
                  <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-open:rotate-45" />
                </span>
              </summary>
              <p className="text-[#5f5f5d] text-[15px] leading-relaxed pb-5 -mt-1">{a}</p>
            </details>
          </StaggerItem>
        ))}
      </Stagger>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      }} />
    </section>
  );
}

export const CARD = "group relative flex flex-col rounded-2xl border border-[#eceae4] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-600/30 hover:shadow-2xl hover:shadow-emerald-900/10";

export function RelatedLinks({ refs, heading = "Keep exploring" }: { refs?: string[]; heading?: string }) {
  const links = (refs || []).map(resolveRef).filter((l): l is NonNullable<typeof l> => !!l);
  if (!links.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
      <Reveal><h2 className="font-display font-semibold tracking-tight text-2xl mb-6">{heading}</h2></Reveal>
      <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {links.map((l) => (
          <StaggerItem key={l.href} className="flex">
            <Link href={l.href} className={`${CARD} w-full !p-5`}>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">{l.section}</span>
              <span className="mt-2 font-semibold leading-snug flex-1">{l.title}</span>
              <ArrowUpRight className="w-4 h-4 mt-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/** Hub page: /features, /solutions, ... */
export function SectionIndex({ section }: { section: Section }) {
  return (
    <>
      <PageHero trail={[[section.label, `/${section.key}`]]} eyebrow={section.label} title={section.title} answer={section.intro}>
        <HeroCta href="/contact" primary>Talk to us</HeroCta>
      </PageHero>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {section.pages.map((p, i) => (
            <StaggerItem key={p.slug} className="flex">
              <Link href={`/${section.key}/${p.slug}`} className={`${CARD} w-full`}>
                <span className="font-display text-[13px] font-semibold text-emerald-700 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="font-display font-semibold text-xl leading-snug tracking-tight mt-3">{p.metaTitle || p.title}</h2>
                <p className="text-[14px] text-[#5f5f5d] leading-relaxed mt-2.5 flex-1">{p.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold">Read more <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "CollectionPage", name: section.title, description: section.description, url: `${SITE_URL}/${section.key}`,
        hasPart: section.pages.map((p) => ({ "@type": "WebPage", name: p.metaTitle || p.title, url: `${SITE_URL}/${section.key}/${p.slug}` })),
      }} />
      <CtaBand />
    </>
  );
}

export function DataTable({ table }: { table: { cols: string[]; rows: string[][] } }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#eceae4] bg-white shadow-sm">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="bg-[#0f0f0e] text-white">{table.cols.map((c, i) => <th key={i} scope="col" className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#eceae4]">
          {table.rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-[#fcfbf8] transition-colors">{r.map((cell, i) => i === 0
              ? <th key={i} scope="row" className="px-4 py-3.5 font-semibold align-top min-w-[9rem]">{cell}</th>
              : <td key={i} className="px-4 py-3.5 text-[#3a3a38] align-top min-w-[11rem]">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sticky "On this page" rail; hidden below lg. */
export function Toc({ headings }: { headings: string[] }) {
  return (
    <aside className="hidden lg:block">
      <nav aria-label="On this page" className="sticky top-24">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5f5f5d] mb-4">On this page</p>
        <ul className="space-y-2.5 border-l border-[#eceae4]">
          {headings.map((h) => (
            <li key={h}><a href={`#${slugify(h)}`} className="block -ml-px pl-4 border-l border-transparent text-[13px] leading-snug text-[#5f5f5d] hover:text-[#1c1c1c] hover:border-emerald-600 transition-colors">{h}</a></li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** Detail page for any content entry. */
export default function PageView({ section, page }: { section: Section; page: Page }) {
  const url = `${SITE_URL}/${section.key}/${page.slug}`;
  const isArticle = section.kind === "article";
  return (
    <article>
      <PageHero
        trail={[[section.label, `/${section.key}`], [(page.metaTitle || page.title).split(":")[0], `/${section.key}/${page.slug}`]]}
        eyebrow={section.label} title={page.title} answer={page.answer} visual={page.visual}
        meta={isArticle ? <>Last reviewed <time dateTime={CONTENT_UPDATED}>{fmtDate(CONTENT_UPDATED)}</time> by the CodeCrest team</> : undefined}
      >
        <HeroCta href="/contact" primary>Talk to us</HeroCta>
        <HeroCta href={`/${section.key}`}>All {section.key === "compare" ? "comparisons" : section.key}</HeroCta>
      </PageHero>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 md:-mt-12 relative">
        <Stagger className="grid md:grid-cols-3 gap-4">
          {page.points.map(([h, t], i) => (
            <StaggerItem key={h} className="flex">
              <div className="w-full rounded-2xl border border-[#eceae4] bg-white p-6 shadow-xl shadow-black/5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Check className="w-4 h-4 text-emerald-700" strokeWidth={2.5} /></span>
                  <span className="font-display text-[12px] font-semibold text-[#5f5f5d] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h2 className="font-display font-semibold text-lg tracking-tight leading-snug">{h}</h2>
                <p className="text-[14.5px] text-[#5f5f5d] leading-relaxed mt-2">{t}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {page.steps && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-20">
          <Reveal>
            <Eyebrow>{isArticle ? "Method" : "Setup"}</Eyebrow>
            <h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl mt-3 mb-10">{isArticle ? "Step by step" : "How to set it up"}</h2>
          </Reveal>
          <Stagger className="relative">
            <span aria-hidden className="absolute left-[17px] top-3 bottom-3 w-px bg-gradient-to-b from-emerald-500 via-[#eceae4] to-transparent" />
            {page.steps.map(([name, text], i) => (
              <StaggerItem key={name} className="relative flex gap-5 pb-8 last:pb-0">
                <span className="relative flex-shrink-0 w-9 h-9 rounded-full bg-[#0f0f0e] text-white text-[13px] font-bold flex items-center justify-center ring-4 ring-[#f7f4ed]">{i + 1}</span>
                <div className="pt-1"><h3 className="font-semibold font-sans text-[16.5px]">{name}</h3><p className="text-[15px] text-[#5f5f5d] leading-relaxed mt-1.5">{text}</p></div>
              </StaggerItem>
            ))}
          </Stagger>
          <JsonLd data={{
            "@context": "https://schema.org", "@type": "HowTo", name: page.title,
            step: page.steps.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
          }} />
        </section>
      )}

      {page.table && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-20">
          <Reveal>
            <DataTable table={page.table} />
            {section.key === "compare" && (
              <p className="text-[12px] text-[#5f5f5d] mt-3 leading-relaxed">
                This comparison describes each product&apos;s general positioning as we understand it. Products change; check the vendor&apos;s own site for current features and pricing. Product names are trademarks of their owners.
              </p>
            )}
          </Reveal>
        </section>
      )}

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 grid lg:grid-cols-[14rem_1fr] gap-12">
        <Toc headings={page.sections.map((s) => s.h)} />
        <div className="max-w-3xl space-y-14 min-w-0">
          {page.sections.map((s) => (
            <Reveal key={s.h}>
              <h2 id={slugify(s.h)} className="font-display font-semibold tracking-tight text-2xl md:text-[2rem] leading-tight scroll-mt-24">{s.h}</h2>
              <p className="text-[16.5px] text-[#3a3a38] leading-[1.75] mt-4">{s.p}</p>
              {s.list && (
                <ul className="mt-6 grid sm:grid-cols-2 gap-3">
                  {s.list.map((li) => (
                    <li key={li} className="flex items-start gap-2.5 text-[14.5px] rounded-xl bg-white border border-[#eceae4] px-4 py-3"><Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />{li}</li>
                  ))}
                </ul>
              )}
            </Reveal>
          ))}
        </div>
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
