import Link from "next/link";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { SECTIONS, TOOLS, SITE_URL } from "@/content";

// Header and footer for every public marketing page. Server-rendered and
// script-free: dropdowns open on hover/focus, the mobile menu is <details>.

const NAV = [
  ...SECTIONS.map((s) => ({
    label: s.label, href: `/${s.key}`,
    items: s.pages.map((p) => ({ href: `/${s.key}/${p.slug}`, label: (p.metaTitle || p.title).split(":")[0] })),
  })),
  { label: "Free Tools", href: "/tools", items: TOOLS.map((t) => ({ href: `/tools/${t.slug}`, label: t.name })) },
];

function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CodeCrest home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={small ? 24 : 32} height={small ? 24 : 32} className="rounded-full" />
      <span className={`font-display font-black tracking-tight ${small ? "text-sm" : "text-lg"}`}>CodeCrest</span>
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

export function CtaBand({ title = "See it running on your own orders", text = "Tell us about your team. We set up your organisation, connect your stack with you and hand over a working system." }: { title?: string; text?: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1c1c1c] text-[#fcfbf8] px-6 py-12 md:p-16 text-center">
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fcfbf8 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-48 bg-emerald-400/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl max-w-2xl mx-auto">{title}</h2>
          <p className="text-white/60 mt-4 max-w-xl mx-auto leading-relaxed">{text}</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-md bg-[#fcfbf8] text-[#1c1c1c] px-6 py-3 text-sm font-semibold hover:opacity-90 transition">
              Talk to us <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/features" className="inline-flex items-center gap-2 rounded-md border border-white/25 px-6 py-3 text-sm font-semibold hover:bg-white/5 transition">
              Explore the product
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f4ed] text-[#1c1c1c] flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded">Skip to content</a>
      <header className="sticky top-0 z-40 bg-[#f7f4ed]/90 backdrop-blur border-b border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Logo />
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <div key={n.href} className="relative group">
                <Link href={n.href} className="flex items-center gap-1 px-3 py-2 text-sm font-medium whitespace-nowrap text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">
                  {n.label} <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover:rotate-180 transition-transform" />
                </Link>
                <div className="invisible opacity-0 translate-y-1 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150 absolute left-1/2 -translate-x-1/2 top-full pt-2 w-[30rem]">
                  <div className="rounded-2xl border border-[#eceae4] bg-white shadow-xl shadow-black/5 p-3 grid grid-cols-2 gap-0.5">
                    {n.items.map((i) => (
                      <Link key={i.href} href={i.href} className="rounded-lg px-3 py-2 text-[13px] text-[#1c1c1c] hover:bg-[#f7f4ed] transition-colors">{i.label}</Link>
                    ))}
                    <Link href={n.href} className="col-span-2 mt-1 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#5f5f5d] hover:text-[#1c1c1c] border-t border-[#eceae4] flex items-center gap-1">
                      All {n.label.toLowerCase()} <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost text-sm whitespace-nowrap hidden sm:inline-flex">Sign in</Link>
            <Link href="/contact" className="btn-primary text-sm whitespace-nowrap">Talk to us <ArrowRight className="w-3.5 h-3.5" /></Link>
            <details className="lg:hidden relative">
              <summary className="list-none cursor-pointer p-2 rounded-md hover:bg-black/5 [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="w-5 h-5" /></summary>
              <nav aria-label="Mobile" className="fixed inset-x-0 top-16 bottom-0 overflow-y-auto bg-[#f7f4ed] border-t border-[#eceae4] px-4 py-4 space-y-1">
                {NAV.map((n) => (
                  <details key={n.href} className="border-b border-[#eceae4]">
                    <summary className="list-none cursor-pointer flex items-center justify-between py-3 font-semibold [&::-webkit-details-marker]:hidden">{n.label}<ChevronDown className="w-4 h-4 opacity-60" /></summary>
                    <div className="pb-3 grid gap-1">
                      <Link href={n.href} className="py-1.5 text-sm font-medium">All {n.label.toLowerCase()}</Link>
                      {n.items.map((i) => <Link key={i.href} href={i.href} className="py-1.5 text-sm text-[#5f5f5d]">{i.label}</Link>)}
                    </div>
                  </details>
                ))}
                <Link href="/login" className="block py-3 font-semibold">Sign in</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-[#eceae4] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Logo small />
            <p className="text-[13px] text-[#5f5f5d] mt-3 leading-relaxed max-w-xs">The operations platform for e-commerce teams and the business behind them.</p>
          </div>
          {NAV.map((n) => (
            <div key={n.href}>
              <Link href={n.href} className="text-[11px] font-bold uppercase tracking-widest">{n.label}</Link>
              <ul className="mt-3 space-y-2">
                {n.items.slice(0, 7).map((i) => (
                  <li key={i.href}><Link href={i.href} className="text-[13px] text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">{i.label}</Link></li>
                ))}
                {n.items.length > 7 && <li><Link href={n.href} className="text-[13px] font-medium">View all</Link></li>}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[#eceae4]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5f5f5d]">
            <p>&copy; 2026 CodeCrest. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link href="/resources/faq" className="hover:text-[#1c1c1c]">FAQ</Link>
              <Link href="/contact" className="hover:text-[#1c1c1c]">Contact</Link>
              <Link href="/login" className="hover:text-[#1c1c1c]">Sign in</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
