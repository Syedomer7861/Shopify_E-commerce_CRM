import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu } from "lucide-react";
import { SECTIONS, TOOLS, SITE_URL } from "@/content";
import { MotionRoot, Reveal } from "./Motion";

// Header and footer for every public marketing page. Navigation is
// server-rendered and script-free: dropdowns open on hover/focus, the mobile
// menu is <details>. Motion is layered on top by MotionRoot.

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
      <span className={`font-display font-black tracking-tight ${small ? "text-sm" : "text-lg"} ${dark ? "text-white" : ""}`}>CodeCrest</span>
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

/** Dot-grid + emerald aurora used behind every dark band. */
export function DarkBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fcfbf8 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)" }} />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[70rem] max-w-[160%] h-[30rem] rounded-full bg-emerald-500/25 blur-[120px] animate-[aurora_14s_ease-in-out_infinite]" />
      <div className="absolute top-10 -right-32 w-[28rem] h-[28rem] rounded-full bg-sky-500/10 blur-[110px] animate-[aurora_18s_ease-in-out_infinite_reverse]" />
    </div>
  );
}

export function CtaBand({ title = "See it running on your own orders", text = "Tell us about your team. We set up your organisation, connect your stack with you and hand over a working system." }: { title?: string; text?: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#0f0f0e] text-[#fcfbf8] px-6 py-14 md:p-20 text-center">
          <DarkBackdrop />
          <div className="relative">
            <h2 className="font-display font-semibold tracking-tight text-3xl md:text-5xl leading-[1.08] max-w-2xl mx-auto">{title}</h2>
            <p className="text-white/60 mt-5 max-w-xl mx-auto leading-relaxed">{text}</p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/contact" className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 text-[#0f0f0e] px-7 py-3.5 text-sm font-semibold hover:bg-emerald-300 transition-colors w-full sm:w-auto justify-center">
                Talk to us <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link href="/features" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold hover:bg-white/10 transition-colors w-full sm:w-auto justify-center">
                Explore the product
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f4ed] text-[#1c1c1c] flex flex-col overflow-x-clip">
      <noscript><style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style></noscript>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:px-3 focus:py-2 focus:rounded">Skip to content</a>
      <header className="sticky top-0 z-50 bg-[#0f0f0e]/85 backdrop-blur-xl border-b border-white/10 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Logo dark />
          <nav aria-label="Main" className="hidden lg:flex items-center">
            {HEADER_NAV.map((n) => (
              <div key={n.href} className="relative group">
                <Link href={n.href} className="flex items-center gap-1 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-white/70 hover:text-white transition-colors">
                  {n.label} {n.items.length > 0 && <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover:rotate-180 transition-transform duration-200" />}
                </Link>
                {n.items.length > 0 && (
                  <div className="invisible opacity-0 translate-y-2 scale-[0.98] group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 transition-all duration-200 ease-out origin-top absolute left-1/2 -translate-x-1/2 top-full pt-3 w-[32rem]">
                    <div className="rounded-2xl border border-[#eceae4] bg-white text-[#1c1c1c] shadow-2xl shadow-black/20 p-3 grid grid-cols-2 gap-0.5">
                      {n.items.map((i) => (
                        <Link key={i.href} href={i.href} className="rounded-lg px-3 py-2 text-[13px] hover:bg-[#f7f4ed] transition-colors">{i.label}</Link>
                      ))}
                      <div className="col-span-2 mt-1 pt-1 border-t border-[#eceae4] flex items-center justify-between">
                        <Link href={n.href} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1">
                          All {n.label.toLowerCase()} <ArrowRight className="w-3 h-3" />
                        </Link>
                        {n.href === "/resources" && <Link href="/compare" className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1">Compare CodeCrest <ArrowRight className="w-3 h-3" /></Link>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <Link href="/login" className="hidden sm:inline-flex px-3 py-2 text-[13.5px] font-medium text-white/70 hover:text-white whitespace-nowrap transition-colors">Sign in</Link>
            <Link href="/contact" className="group inline-flex items-center gap-1.5 rounded-full bg-emerald-400 text-[#0f0f0e] px-4 py-2 text-[13px] font-semibold whitespace-nowrap hover:bg-emerald-300 transition-colors">
              Talk to us <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <details className="lg:hidden relative">
              <summary className="list-none cursor-pointer p-2 rounded-md hover:bg-white/10 [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="w-5 h-5" /></summary>
              <nav aria-label="Mobile" className="fixed inset-x-0 top-16 bottom-0 overflow-y-auto bg-[#0f0f0e] border-t border-white/10 px-4 py-4 space-y-1">
                {NAV.map((n) => n.items.length ? (
                  <details key={n.href} className="border-b border-white/10 group/m">
                    <summary className="list-none cursor-pointer flex items-center justify-between py-3.5 font-semibold [&::-webkit-details-marker]:hidden">{n.label}<ChevronDown className="w-4 h-4 opacity-60 group-open/m:rotate-180 transition-transform" /></summary>
                    <div className="pb-3 grid gap-1">
                      <Link href={n.href} className="py-1.5 text-sm font-medium text-emerald-400">All {n.label.toLowerCase()}</Link>
                      {n.items.map((i) => <Link key={i.href} href={i.href} className="py-1.5 text-sm text-white/65">{i.label}</Link>)}
                    </div>
                  </details>
                ) : <Link key={n.href} href={n.href} className="block py-3.5 font-semibold border-b border-white/10">{n.label}</Link>)}
                <Link href="/login" className="block py-3.5 font-semibold">Sign in</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <MotionRoot>
        <main id="main" className="flex-1">{children}</main>
      </MotionRoot>

      <footer className="bg-[#0f0f0e] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-white/10">
            <div>
              <Logo dark />
              <p className="text-[14px] text-white/55 mt-4 leading-relaxed max-w-sm">The operations platform for e-commerce teams and the business behind them.</p>
            </div>
            <Link href="/contact" className="group inline-flex items-center gap-2 font-display font-semibold tracking-tight text-2xl md:text-3xl hover:text-emerald-400 transition-colors">
              Talk to our team <ArrowUpRight className="w-6 h-6 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
          <div className="pt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-10">
            {NAV.filter((n) => n.items.length).map((n) => (
              <div key={n.href}>
                <Link href={n.href} className="text-[11px] font-bold uppercase tracking-widest text-white/90 hover:text-emerald-400 transition-colors">{n.label}</Link>
                <ul className="mt-4 space-y-2.5">
                  {n.items.slice(0, 7).map((i) => (
                    <li key={i.href}><Link href={i.href} className="text-[13px] text-white/50 hover:text-white transition-colors">{i.label}</Link></li>
                  ))}
                  {n.items.length > 7 && <li><Link href={n.href} className="text-[13px] font-medium text-emerald-400">View all</Link></li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/45">
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
