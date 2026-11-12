import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Clock, Sparkles } from "lucide-react";
import { SITE_URL } from "@/content";
import { POSTS, readMins, type BlogCategory, type Post } from "@/content/blog";
import { CtaBand, DarkBackdrop, JsonLd, ORG_LD } from "./SiteShell";
import { Breadcrumbs, CARD, DataTable, Eyebrow, Faqs, RelatedLinks, Toc, fmtDate, slugify } from "./PageView";
import { ReadingProgress, Reveal, TiltIn, WordsIn } from "./Motion";
import Visual from "./Visual";

// Category colourways for covers and tags.
const TONE: Record<BlogCategory, { grad: string; tag: string }> = {
  "COD & RTO": { grad: "from-amber-300 via-orange-200 to-rose-200", tag: "bg-amber-100 text-amber-900" },
  "Shipping & Delivery": { grad: "from-sky-300 via-cyan-200 to-emerald-200", tag: "bg-sky-100 text-sky-900" },
  "WhatsApp & Retention": { grad: "from-emerald-300 via-teal-200 to-lime-200", tag: "bg-emerald-100 text-emerald-900" },
  "Operations & Teams": { grad: "from-violet-300 via-indigo-200 to-sky-200", tag: "bg-violet-100 text-violet-900" },
};

export const Tag = ({ category }: { category: BlogCategory }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider ${TONE[category].tag}`}>{category}</span>
);

/** Card cover: the post's product illustration on its category gradient. */
export function PostCover({ post, className = "" }: { post: Post; className?: string }) {
  return (
    <div aria-hidden className={`relative overflow-hidden bg-gradient-to-br ${TONE[post.category].grad} ${className}`}>
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(#0f0f0e 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      <div className="absolute left-6 right-[-18%] top-7 origin-top-left scale-[0.82] rotate-[-3deg] transition-transform duration-500 group-hover:scale-[0.86] group-hover:rotate-[-1.5deg]">
        <Visual kind={post.visual} bare />
      </div>
    </div>
  );
}

export function PostCard({ post, wide }: { post: Post; wide?: boolean }) {
  return (
    <Link href={`/blog/${post.slug}`} className={`${CARD} w-full !p-0 overflow-hidden ${wide ? "md:!flex-row" : ""}`}>
      <PostCover post={post} className={wide ? "h-52 md:h-auto md:w-1/2 md:min-h-[20rem]" : "h-44"} />
      <div className={`flex flex-col flex-1 ${wide ? "p-6 md:p-9 justify-center" : "p-5"}`}>
        <div className="flex items-center gap-3">
          <Tag category={post.category} />
          <span className="text-[12px] text-[#5f5f5d] inline-flex items-center gap-1"><Clock className="w-3 h-3" />{readMins(post)} min read</span>
        </div>
        <h3 className={`font-display font-semibold tracking-tight leading-snug mt-3.5 ${wide ? "text-2xl md:text-[2rem] md:leading-tight" : "text-lg"}`}>{post.title}</h3>
        <p className={`text-[#5f5f5d] leading-relaxed mt-2 ${wide ? "text-[15px]" : "text-[13.5px] line-clamp-3"} flex-1`}>{post.description}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold">Read article <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span>
      </div>
    </Link>
  );
}

/** Full article page. */
export default function PostView({ post }: { post: Post }) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const more = POSTS.filter((p) => p.category === post.category && p.slug !== post.slug).slice(0, 3);
  const mins = readMins(post);
  return (
    <article>
      <ReadingProgress />
      <section className="relative bg-[#0f0f0e] text-white overflow-hidden">
        <DarkBackdrop />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-20 md:pb-28 grid lg:grid-cols-[1.15fr_1fr] gap-12 items-center">
          <div className="min-w-0">
            <Breadcrumbs trail={[["Blog", "/blog"], [post.metaTitle || post.title, `/blog/${post.slug}`]]} dark />
            <div className="mt-9 flex flex-wrap items-center gap-3 text-[12.5px] text-white/55">
              <Tag category={post.category} />
              <time dateTime={post.date}>{fmtDate(post.date)}</time>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{mins} min read</span>
            </div>
            <h1 className="font-display font-semibold tracking-tight text-[2rem] sm:text-[2.75rem] lg:text-5xl leading-[1.08] mt-5"><WordsIn text={post.title} /></h1>
            <p className="text-[12.5px] text-white/45 mt-6">By the CodeCrest team</p>
          </div>
          <TiltIn className="min-w-0 hidden md:block"><Visual kind={post.visual} /></TiltIn>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 md:-mt-12 relative grid lg:grid-cols-[14rem_1fr] gap-12">
        <div className="hidden lg:block" />
        <Reveal className="max-w-3xl min-w-0">
          <div className="rounded-2xl border border-emerald-600/20 bg-white p-6 md:p-8 shadow-xl shadow-black/5">
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700"><Sparkles className="w-3.5 h-3.5" />Quick answer</p>
            <p className="text-[17px] leading-[1.7] mt-3" data-speakable>{post.answer}</p>
            <ul className="mt-6 pt-6 border-t border-[#eceae4] space-y-2.5">
              {post.takeaways.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[14.5px] text-[#3a3a38]"><Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />{t}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 grid lg:grid-cols-[14rem_1fr] gap-12">
        <Toc headings={post.sections.map((s) => s.h)} />
        <div className="max-w-3xl space-y-14 min-w-0">
          {post.sections.map((s) => (
            <Reveal key={s.h}>
              <h2 id={slugify(s.h)} className="font-display font-semibold tracking-tight text-2xl md:text-[2rem] leading-tight scroll-mt-24">{s.h}</h2>
              {s.p.map((para, i) => <p key={i} className="text-[16.5px] text-[#3a3a38] leading-[1.8] mt-4">{para}</p>)}
              {s.list && (
                <ul className="mt-6 space-y-2.5">
                  {s.list.map((li) => (
                    <li key={li} className="flex items-start gap-3 text-[15px] leading-relaxed rounded-xl bg-white border border-[#eceae4] px-4 py-3"><Check className="w-4 h-4 text-emerald-600 mt-1 flex-shrink-0" strokeWidth={2.5} />{li}</li>
                  ))}
                </ul>
              )}
              {s.table && <div className="mt-6"><DataTable table={s.table} /></div>}
            </Reveal>
          ))}

          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[#0f0f0e] text-white p-7 md:p-9">
              <DarkBackdrop />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex-1">
                  <p className="font-display font-semibold text-xl tracking-tight">Want this running as a daily process?</p>
                  <p className="text-white/60 text-[14.5px] mt-1.5 leading-relaxed">CodeCrest gives every order, delivery and customer follow-up an owner and a next step.</p>
                </div>
                <Link href="/contact" className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 text-[#0f0f0e] px-6 py-3 text-sm font-semibold hover:bg-emerald-300 transition-colors whitespace-nowrap">
                  Talk to us <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Faqs faqs={post.faqs} />
      <RelatedLinks refs={[...post.related, ...more.map((p) => `blog/${p.slug}`)].slice(0, 8)} heading="Related reading" />
      <CtaBand />

      <JsonLd data={{
        "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.description, url, mainEntityOfPage: url,
        datePublished: post.date, dateModified: post.date, articleSection: post.category, keywords: post.keyword,
        wordCount: mins * 220, author: ORG_LD, publisher: ORG_LD, image: `${url}/og`,
        speakable: { "@type": "SpeakableSpecification", cssSelector: ["[data-speakable]"] },
      }} />
    </article>
  );
}

export { Eyebrow };
