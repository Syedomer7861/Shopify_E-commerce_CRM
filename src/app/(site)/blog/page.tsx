import { SITE_URL } from "@/content";
import { CATEGORIES, POSTS } from "@/content/blog";
import { HeroCta, PageHero, siteMetadata, slugify } from "@/components/site/PageView";
import { CtaBand, JsonLd } from "@/components/site/SiteShell";
import { PostCard } from "@/components/site/BlogView";
import { Reveal, Stagger, StaggerItem } from "@/components/site/Motion";

const DESCRIPTION = "Practical playbooks for Indian D2C and Shopify teams: reducing RTO, COD verification, NDR, WhatsApp templates, cart recovery, retention and running an operations team.";
export const metadata = siteMetadata("/blog", "E-commerce Operations Blog", DESCRIPTION);

export default function BlogIndex() {
  const [featured, ...rest] = POSTS;
  return (
    <>
      <PageHero trail={[["Blog", "/blog"]]} eyebrow="Blog" title="Playbooks for the work after checkout"
        answer="Straight answers on COD, RTO, shipping, WhatsApp and running an e-commerce operations team. No invented statistics: methods you can run tomorrow.">
        <HeroCta href="/tools" primary>Try the free calculators</HeroCta>
        <HeroCta href="/resources">Read the guides</HeroCta>
      </PageHero>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 md:-mt-12 relative">
        {featured && <Reveal className="flex"><PostCard post={featured} wide /></Reveal>}
        <nav aria-label="Categories" className="mt-10 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <a key={c} href={`#${slugify(c)}`} className="rounded-full border border-[#1c1c1c]/15 bg-white px-4 py-2 text-[13px] font-semibold hover:bg-[#0f0f0e] hover:text-white hover:border-[#0f0f0e] transition-colors">
              {c} <span className="opacity-50 font-normal">{POSTS.filter((p) => p.category === c).length}</span>
            </a>
          ))}
        </nav>
      </section>

      {CATEGORIES.map((c) => {
        const posts = rest.filter((p) => p.category === c);
        if (!posts.length) return null;
        return (
          <section key={c} id={slugify(c)} className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 md:pt-20 scroll-mt-20">
            <Reveal><h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl mb-8">{c}</h2></Reveal>
            <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" gap={0.05}>
              {posts.map((p) => <StaggerItem key={p.slug} className="flex"><PostCard post={p} /></StaggerItem>)}
            </Stagger>
          </section>
        );
      })}

      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Blog", name: "CodeCrest Blog", description: DESCRIPTION, url: `${SITE_URL}/blog`,
        blogPost: POSTS.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE_URL}/blog/${p.slug}`, datePublished: p.date })),
      }} />
      <CtaBand />
    </>
  );
}
