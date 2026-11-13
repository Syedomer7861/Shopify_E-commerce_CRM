import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu } from "lucide-react";
import { SECTIONS, TOOLS, SITE_URL } from "@/content";
import { MotionRoot, Reveal } from "./Motion";
import { Magnetic } from "./Fx";
import { getSiteContent } from "@/lib/site-content-server";
import { razorpayEnabled } from "@/lib/razorpay";

// Header, footer and shared surfaces for every public marketing page.
// Design system: warm paper background, near-black ink, and one signature
// gradient (sun -> lemon -> mint) used as soft blurred light, never as flat
// fills. Tokens live on .site in globals.css. Navigation is server-rendered
// and script-free: dropdowns open on hover/focus, the mobile menu is <details>.

type NavItem = { label: string; href: string; items: { href: string; label: string }[] };

const NAV: NavItem[] = [
  ...SECTIONS.map((s) => ({
    label: s.label, href: `/${s.key}`,
    items: s.pages.map((p) => ({ href: `/${s.key}/${p.slug}`, label: (p.metaTitle || p.title).split(":")[0] })),
  })),
  { label: "Free Tools", href: "/tools", items: TOOLS.map((t) => ({ href: `/tools/${t.slug}`, label: t.name })) },
  { label: "Blog", href: "/blog", items: [] },
];
// Compare stays in the footer and the Resources menu; the header has room for six.
const HEADER_NAV = NAV.filter((n) => n.href !== "/compare");

function Logo({ small, dark }: { small?: boolean; dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CodeCrest home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={small ? 24 : 30} height={small ? 24 : 30} className="rounded-full" />
      {/* Below 340px (fold phones) the mark alone leaves room for the CTA and menu. */}
      <span className={`font-display font-extrabold tracking-tight max-[339px]:hidden ${small ? "text-sm" : "text-lg"} ${dark ? "text-white" : ""}`}>CodeCrest</span>
    </Link>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  // Content is authored in this repo, never user input; "<" is escaped anyway.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const ORG_LD = {
  "@context": "https://schema.org", "@type": "Organization",
  name: "CodeCrest", url: SITE_URL, logo: `${SITE_URL}/logo-mark.png`,
};

/** Signature light: drifting sun, lemon and mint glows on paper. Sits behind light heroes. */
export function Mesh({ soft }: { soft?: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none max-md:opacity-55">
      <div className={`absolute -left-[12%] top-[8%] w-[38rem] h-[38rem] rounded-full bg-[#ff7a45] blur-[110px] md:animate-[blob_18s_ease-in-out_infinite] md:will-change-transform ${soft ? "opacity-25" : "opacity-50"}`} />
      <div className={`absolute -left-[6%] top-[52%] w-[26rem] h-[26rem] rounded-full bg-[#ffe36e] blur-[100px] md:animate-[blob_22s_ease-in-out_infinite_reverse] md:will-change-transform ${soft ? "opacity-30" : "opacity-70"}`} />
      <div className={`absolute -right-[10%] top-[38%] w-[34rem] h-[34rem] rounded-full bg-[#5fe39a] blur-[110px] md:animate-[blob_20s_ease-in-out_infinite] md:will-change-transform ${soft ? "opacity-25" : "opacity-55"}`} />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#f4f3ee] to-transparent" />
    </div>
  );
}

/** The same light, dimmed, for near-black panels. */
export function DarkBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-[#ff7a45]/40 blur-[110px] md:animate-[blob_18s_ease-in-out_infinite] md:will-change-transform" />
      <div className="absolute -bottom-40 -right-16 w-[30rem] h-[30rem] rounded-full bg-[#5fe39a]/35 blur-[110px] md:animate-[blob_22s_ease-in-out_infinite_reverse] md:will-change-transform" />
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
    </div>
  );
}

const BTN = "group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111113]";

/** Site button. tone: ink (primary on light), light (primary on dark), outline, ghost-dark. */
export function Btn({ href, children, tone = "ink", arrow, className = "" }: {
  href: string; children: React.ReactNode; tone?: "ink" | "light" | "outline" | "outline-dark"; arrow?: boolean; className?: string;
}) {
  const tones = {
    ink: "bg-[#111113] text-white hover:bg-black hover:shadow-xl hover:shadow-black/20",
    light: "bg-white text-[#111113] hover:shadow-xl hover:shadow-white/20",
    outline: "border-[1.5px] border-[#111113] text-[#111113] hover:bg-[#111113] hover:text-white",
    "outline-dark": "border border-white/30 text-white hover:bg-white/10",
  };
  return (
    <Magnetic className="w-full sm:w-auto">
      <Link href={href} className={`${BTN} ${tones[tone]} w-full sm:w-auto ${className}`}>
        {children}{arrow && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
      </Link>
    </Magnetic>
  );
}

export function CtaBand({ title = "See it running on your own orders", text = "Tell us about your team. We set up your organisation, connect your stack with you and hand over a working system." }: { title?: string; text?: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.25rem] bg-[#111113] text-white px-6 py-16 md:p-24 text-center">
          <DarkBackdrop />
          <div className="relative">
            <h2 className="font-display font-bold tracking-[-0.03em] text-[2rem] sm:text-5xl md:text-6xl leading-[1.04] max-w-3xl mx-auto">{title}</h2>
            <p className="text-white/65 text-[17px] mt-6 max-w-xl mx-auto leading-relaxed">{text}</p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Btn href="/contact" tone="light" arrow>Talk to us</Btn>
              <Btn href="/features" tone="outline-dark">Explore the product</Btn>
            </div>
            <p className="text-white/40 text-[13px] mt-6">Set up for you by our team &middot; No self-serve signup to figure out</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default async function SiteShell({ children }: { children: React.ReactNode }) {
  const [bar, footer] = await Promise.all([getSiteContent("site.announcement"), getSiteContent("site.footer")]);
  // Self-serve signup link appears only once online payments are configured.
  const signupOpen = razorpayEnabled();
  return (
    <div className="site min-h-screen flex flex-col overflow-x-clip">
      <noscript><style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style></noscript>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:px-3 focus:py-2 focus:rounded">Skip to content</a>

      {bar.enabled && bar.text && (
        <div className="relative z-[51] bg-[#111113] text-white text-center text-[13px] px-4 py-2">
          {bar.href ? <Link href={bar.href} className="underline-offset-2 hover:underline">{bar.text} <ArrowRight className="inline w-3 h-3" /></Link> : bar.text}
        </div>
      )}

      <header className="sticky top-0 z-50 px-3 sm:px-4 pt-3">
        <div className="relative max-w-6xl mx-auto h-14 pl-3 pr-2 min-[360px]:pl-4 sm:pl-5 flex items-center justify-between gap-2 sm:gap-3">
          {/* The glass is its own layer: backdrop-filter on an ancestor would
              trap the fixed mobile menu inside this 56px pill. */}
          <div aria-hidden className="absolute inset-0 -z-10 rounded-full border border-black/[0.07] bg-white/75 backdrop-blur-xl shadow-[0_8px_30px_rgba(17,17,19,0.06)]" />
          <Logo />
          <nav aria-label="Main" className="hidden lg:flex items-center">
            {HEADER_NAV.map((n) => (
              <div key={n.href} className="relative group">
                <Link href={n.href} className="flex items-center gap-1 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-[#111113]/70 hover:text-[#111113] transition-colors">
                  {n.label} {n.items.length > 0 && <ChevronDown className="w-3.5 h-3.5 opacity-50 group-hover:rotate-180 transition-transform duration-200" />}
                </Link>
                {n.items.length > 0 && (
                  <div className="invisible opacity-0 translate-y-2 scale-[0.98] group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 transition-all duration-200 ease-out origin-top absolute left-1/2 -translate-x-1/2 top-full pt-4 w-[32rem]">
                    <div className="rounded-3xl border border-black/[0.07] bg-white shadow-2xl shadow-black/10 p-3 grid grid-cols-2 gap-0.5">
                      {n.items.map((i) => (
                        <Link key={i.href} href={i.href} className="rounded-xl px-3 py-2 text-[13px] hover:bg-[#f4f3ee] transition-colors">{i.label}</Link>
                      ))}
                      <div className="col-span-2 mt-1 pt-1 border-t border-[var(--line)] flex items-center justify-between">
                        <Link href={n.href} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[var(--dim)] hover:text-[#111113] flex items-center gap-1">
                          All {n.label.toLowerCase()} <ArrowRight className="w-3 h-3" />
                        </Link>
                        {n.href === "/resources" && <Link href="/compare" className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[var(--dim)] hover:text-[#111113] flex items-center gap-1">Compare CodeCrest <ArrowRight className="w-3 h-3" /></Link>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link href="/login" className="hidden sm:inline-flex px-3 py-2 text-[13.5px] font-medium text-[#111113]/70 hover:text-[#111113] whitespace-nowrap transition-colors">Sign in</Link>
            {signupOpen && <Link href="/signup" className="hidden sm:inline-flex px-3 py-2 text-[13.5px] font-semibold text-[#111113] hover:underline underline-offset-4 whitespace-nowrap">Sign up</Link>}
            <Link href="/contact" className="group inline-flex items-center gap-1.5 rounded-full bg-[#111113] text-white px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-black transition-colors">
              Talk to us <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <details className="lg:hidden">
              <summary className="list-none cursor-pointer w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="w-5 h-5" /></summary>
              <nav aria-label="Mobile" className="fixed inset-x-3 top-[4.75rem] bottom-3 overflow-y-auto overscroll-contain rounded-3xl bg-white border border-black/[0.07] shadow-2xl shadow-black/15 px-5 py-3">
                {NAV.map((n) => n.items.length ? (
                  <details key={n.href} className="border-b border-[var(--line)] group/m">
                    <summary className="list-none cursor-pointer flex items-center justify-between py-4 font-display font-semibold text-lg [&::-webkit-details-marker]:hidden">{n.label}<ChevronDown className="w-4 h-4 opacity-50 group-open/m:rotate-180 transition-transform" /></summary>
                    <div className="pb-4 grid gap-0.5">
                      <Link href={n.href} className="py-2 text-sm font-semibold">All {n.label.toLowerCase()} &rarr;</Link>
                      {n.items.map((i) => <Link key={i.href} href={i.href} className="py-2 text-sm text-[var(--dim)]">{i.label}</Link>)}
                    </div>
                  </details>
                ) : <Link key={n.href} href={n.href} className="block py-4 font-display font-semibold text-lg border-b border-[var(--line)]">{n.label}</Link>)}
                <Link href="/login" className="block py-4 font-display font-semibold text-lg">Sign in</Link>
                {signupOpen && <Link href="/signup" className="block py-4 font-display font-semibold text-lg border-t border-[var(--line)]">Sign up</Link>}
                <Link href="/contact" className="mt-2 mb-3 flex items-center justify-center gap-2 rounded-full bg-[#111113] text-white py-3.5 text-sm font-semibold">Talk to us <ArrowRight className="w-4 h-4" /></Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <MotionRoot>
        {/* Pull content up under the floating header so hero light shows through it. */}
        <main id="main" className="flex-1 -mt-[4.25rem]">{children}</main>
      </MotionRoot>

      <footer className="relative bg-[#111113] text-white overflow-hidden">
        <DarkBackdrop />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-white/10">
            <div>
              <Logo dark />
              <p className="text-[14px] text-white/55 mt-4 leading-relaxed max-w-sm">{footer.tagline}</p>
            </div>
            <Link href="/contact" className="group inline-flex items-center gap-2 font-display font-bold tracking-tight text-3xl md:text-4xl hover:text-[var(--lemon)] transition-colors">
              Talk to our team <ArrowUpRight className="w-7 h-7 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Link>
          </div>
          <div className="pt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-10">
            {NAV.filter((n) => n.items.length).map((n) => (
              <div key={n.href}>
                <Link href={n.href} className="inline-block py-1.5 -my-1.5 text-[11px] font-bold uppercase tracking-widest text-white/90 hover:text-[var(--lemon)] transition-colors">{n.label}</Link>
                <ul className="mt-4 space-y-2.5">
                  {n.items.slice(0, 7).map((i) => (
                    <li key={i.href}><Link href={i.href} className="inline-block py-1 -my-1 text-[13px] text-white/60 hover:text-white transition-colors">{i.label}</Link></li>
                  ))}
                  {n.items.length > 7 && <li><Link href={n.href} className="text-[13px] font-medium text-[var(--mint)]">View all</Link></li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="relative border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/60">
            <p>&copy; 2026 CodeCrest. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link href="/blog" className="hover:text-white">Blog</Link>
              <Link href="/resources/faq" className="hover:text-white">FAQ</Link>
              <Link href="/contact" className="hover:text-white">Contact</Link>
              <Link href="/login" className="hover:text-white">Sign in</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
