import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, getLegalDoc, type LegalBlock } from "@/content/legal";
import { PageHero, fmtDate, siteMetadata, slugify } from "@/components/site/PageView";

// Static legal pages. Only the documents in src/content/legal.ts exist.
export const dynamicParams = false;
export const generateStaticParams = () => LEGAL_DOCS.map((d) => ({ doc: d.slug }));

export function generateMetadata({ params }: { params: { doc: string } }) {
  const d = getLegalDoc(params.doc);
  return d ? siteMetadata(`/legal/${d.slug}`, d.title, d.summary) : {};
}

// "/contact" inside the text becomes a link; everything else is plain text.
function Text({ s }: { s: string }) {
  const parts = s.split("/contact");
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && <Link href="/contact" className="underline underline-offset-2">/contact</Link>}{p}</span>)}</>;
}

function Block({ b }: { b: LegalBlock }) {
  if (typeof b === "string") return <p><Text s={b} /></p>;
  return <ul className="list-disc pl-5 space-y-2">{b.map((li) => <li key={li}><Text s={li} /></li>)}</ul>;
}

export default function LegalPage({ params }: { params: { doc: string } }) {
  const d = getLegalDoc(params.doc);
  if (!d) notFound();
  return (
    <>
      <PageHero trail={[[d.title, `/legal/${d.slug}`]]} eyebrow="Legal" title={d.title} answer={d.summary} meta={<>Last updated {fmtDate(d.updated)}</>} />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 -mt-10">
        <nav aria-label="Legal documents" className="flex flex-wrap gap-2 mb-10">
          {LEGAL_DOCS.map((o) => (
            <Link key={o.slug} href={`/legal/${o.slug}`} aria-current={o.slug === d.slug ? "page" : undefined}
              className={`px-3.5 py-1.5 rounded-full border text-[13px] font-semibold ${o.slug === d.slug ? "bg-[#111113] text-white border-[#111113]" : "border-black/10 bg-white/70 hover:border-black/30"}`}>
              {o.title}
            </Link>
          ))}
        </nav>
        <div className="space-y-12">
          {d.sections.map((s) => (
            <div key={s.heading} id={slugify(s.heading)} className="scroll-mt-28">
              <h2 className="font-display font-bold tracking-tight text-2xl text-[#111113]">{s.heading}</h2>
              <div className="mt-4 space-y-4 text-[15.5px] leading-relaxed text-[#3b3b3a]">
                {s.body.map((b, i) => <Block key={i} b={b} />)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
