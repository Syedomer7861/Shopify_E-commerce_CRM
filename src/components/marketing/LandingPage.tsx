import Link from "next/link";
import {
  ShoppingBag, Truck, MessageSquare, Users, BarChart3, Building2, ArrowRight, ArrowUpRight, CheckCircle2,
  Workflow, PhoneCall, LayoutGrid, ShieldCheck, LifeBuoy, Target, Receipt, MapPin, ShoppingCart, Calculator,
  PackageCheck, Repeat, type LucideIcon,
} from "lucide-react";
import { SECTIONS, SITE_URL, TOOLS, getSection } from "@/content";
import { latestPosts } from "@/content/blog";
import { CtaBand, DarkBackdrop, JsonLd, ORG_LD } from "@/components/site/SiteShell";
import { CARD, Eyebrow, Faqs, HeroCta } from "@/components/site/PageView";
import { Float, Parallax, Reveal, Showcase, Stagger, StaggerItem, TiltIn, WordsIn, type ShowcaseItem } from "@/components/site/Motion";
import { PostCard } from "@/components/site/BlogView";
import Visual from "@/components/site/Visual";

const ICONS: Record<string, LucideIcon> = {
  "shopify-order-management": ShoppingBag, "abandoned-cart-recovery": ShoppingCart, "shipping-rto-management": Truck,
  "whatsapp-automation": MessageSquare, "task-engine": Workflow, "team-hr": Users, workspaces: LayoutGrid,
  "analytics-reports": BarChart3, "roles-permissions": ShieldCheck, "approvals-and-rules": CheckCircle2,
  "service-desk": LifeBuoy, "sales-pipeline": Target, "finance-operations": Receipt, "field-visits": MapPin, "cloud-telephony": PhoneCall,
};

const CONNECTS = ["Shopify", "Shiprocket", "WhatsApp", "Exotel", "Twilio", "Gmail", "Google Sheets", "Google Drive", "CSV and Excel import", "Fastrr checkout"];

const FLOW: [LucideIcon, string, string][] = [
  [ShoppingBag, "Order placed", "Orders and abandoned checkouts sync in from Shopify."],
  [PhoneCall, "Verified", "COD orders queue for an agent to confirm before dispatch."],
  [Truck, "Shipped", "Shipment status follows the order from Shiprocket."],
  [PackageCheck, "Delivered or rescued", "Failed deliveries become follow-ups with an owner."],
  [Repeat, "Brought back", "Reorder and review reminders go out on WhatsApp."],
];

const SHOWCASE: ShowcaseItem[] = [
  {
    eyebrow: "Order operations", title: "Every order arrives with its next step attached",
    text: "Orders sync from Shopify and shipments from Shiprocket. COD orders queue for verification, failed deliveries become follow-ups, and abandoned carts become recovery tasks.",
    bullets: ["Live order and shipment sync", "COD verification before dispatch", "NDR and stuck-shipment follow-up"], href: "/features/shopify-order-management", visual: "orders",
  },
  {
    eyebrow: "Customer conversations", title: "WhatsApp, email and calls from the same screen",
    text: "Send templated messages on real events, call from the task you are working on, and keep every conversation on the customer's timeline.",
    bullets: ["Templates with order details filled in", "Click-to-call with automatic logging", "Segment campaigns"], href: "/features/whatsapp-automation", visual: "chat",
  },
  {
    eyebrow: "Team work", title: "Work that assigns itself and shows who owns it",
    text: "Tasks are created from real events and routed to the right queue. Managers see the floor live, and every team gets its own workspace for projects.",
    bullets: ["Queues built from orders and deliveries", "Boards, lists and calendars per team", "Attendance and live team view"], href: "/features/task-engine", visual: "board",
  },
  {
    eyebrow: "Control", title: "Decide exactly who can see and do what",
    text: "Build your own roles. Grant each action per module and choose how far it reaches: own records, a team, a department, a branch or the whole organisation.",
    bullets: ["Scoped permissions enforced in the database", "Approvals with no self-approval", "Audit trail of changes"], href: "/features/roles-permissions", visual: "matrix",
  },
];

const HOME_FAQS: [string, string][] = [
  ["What is CodeCrest?", "CodeCrest is an operations platform for e-commerce teams and growing businesses. It brings Shopify orders, shipping follow-up, WhatsApp and call workflows, tasks, HR, approvals and an internal service desk into one place, with permissions scoped by team, department and branch."],
  ["Who is it for?", "Shopify-based brands with a team working orders every day, and small to mid-sized businesses that want roles, approvals and internal requests on one system instead of spreadsheets and chat groups."],
  ["What does it integrate with?", "Shopify, Shiprocket, WhatsApp, Exotel and Twilio for calls and SMS, Gmail, Google Sheets and Google Drive, plus CSV and Excel import."],
  ["How is each organisation's data kept separate?", "Every record belongs to one organisation and access is enforced in the database, not only in the interface. Isolation is tested automatically across every table."],
  ["How do we get started?", "Contact us. Our team sets up your organisation, connects your integrations with you and hands over a working system. There is no self-serve signup."],
];

const H2 = "font-display font-semibold tracking-tight text-3xl md:text-5xl leading-[1.08]";

export default function LandingPage() {
  const features = getSection("features")!.pages;
  const solutions = getSection("solutions")!.pages;
  const posts = latestPosts(3);

  return (
    <>
      {/* Hero */}
      <section className="relative bg-[#0f0f0e] text-white overflow-hidden">
        <DarkBackdrop />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 md:pt-24 text-center">
          <Reveal y={12}>
            <Link href="/blog" className="group inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full border border-white/15 bg-white/5 text-[12px] text-white/75 hover:bg-white/10 transition-colors">
              <span className="rounded-full bg-emerald-400 text-[#0f0f0e] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">New</span>
              Playbooks for COD, RTO and WhatsApp on the blog
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </Reveal>
          <h1 className="font-display font-semibold tracking-tight text-[2.6rem] sm:text-6xl lg:text-[4.1rem] leading-[1.03] mt-7 max-w-5xl mx-auto">
            <WordsIn text="Run every order, and the team behind it, from one place" accent="one place" />
          </h1>
          <Reveal delay={0.3} y={16}>
            <p className="text-white/70 text-lg md:text-xl leading-relaxed mt-7 max-w-2xl mx-auto" data-speakable>
              CodeCrest unifies Shopify orders, Shiprocket shipping, WhatsApp and calls with tasks, HR, approvals and
              role-based access, so your team stops switching tabs and closes the loop on every order.
            </p>
          </Reveal>
          <Reveal delay={0.4} y={16}>
            <div className="flex flex-col sm:flex-row gap-3 mt-9 justify-center">
              <HeroCta href="/contact" primary>Talk to us</HeroCta>
              <HeroCta href="/features">Explore the product</HeroCta>
            </div>
            <p className="text-white/45 text-[13px] mt-5">Set up for you by our team &middot; Your own isolated organisation</p>
          </Reveal>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 mt-14 md:mt-20">
          <TiltIn className="max-w-3xl mx-auto"><Visual kind="orders" /></TiltIn>
          <Float className="hidden lg:block absolute -left-2 top-10 w-[19rem]"><Visual kind="chat" bare /></Float>
          <Float delay={1.5} className="hidden lg:block absolute -right-2 top-36 w-[18rem]"><Visual kind="chart" bare /></Float>
          <div aria-hidden className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#0f0f0e] to-transparent pointer-events-none" />
        </div>

        {/* Connects-with marquee */}
        <div className="relative border-t border-white/10 mt-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col md:flex-row md:items-center gap-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45 whitespace-nowrap">Connects with</p>
            <div className="relative flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
              <ul className="flex w-max gap-10 animate-[marquee_38s_linear_infinite] hover:[animation-play-state:paused]">
                {[...CONNECTS, ...CONNECTS].map((c, i) => (
                  <li key={i} aria-hidden={i >= CONNECTS.length} className="font-display font-semibold text-lg text-white/70 whitespace-nowrap">{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Order flow */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className={`${H2} mt-4`}>One order, followed from checkout to the next purchase</h2>
        </Reveal>
        <Stagger className="relative mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4" gap={0.1}>
          <span aria-hidden className="hidden lg:block absolute top-9 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-emerald-600/40 to-transparent" />
          {FLOW.map(([Icon, h, t], i) => (
            <StaggerItem key={h} className="relative">
              <div className="h-full rounded-2xl border border-[#eceae4] bg-white p-5 hover:shadow-xl hover:shadow-emerald-900/10 hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-xl bg-[#0f0f0e] text-emerald-400 flex items-center justify-center"><Icon className="w-5 h-5" strokeWidth={2} /></span>
                  <span className="font-display text-[12px] font-semibold text-[#5f5f5d] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="font-display font-semibold text-[17px] tracking-tight mt-4">{h}</h3>
                <p className="text-[13.5px] text-[#5f5f5d] leading-relaxed mt-1.5">{t}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Product tour */}
      <section className="bg-[#efeadf]/60 border-y border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Reveal className="max-w-2xl mb-12">
            <Eyebrow>Product tour</Eyebrow>
            <h2 className={`${H2} mt-4`}>Four jobs your team does every day, in one system</h2>
          </Reveal>
          <Showcase items={SHOWCASE} />
        </div>
      </section>

      {/* All features: bento */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
          <div className="max-w-2xl">
            <Eyebrow>Everything in one place</Eyebrow>
            <h2 className={`${H2} mt-4`}>One platform, every operation your business runs on</h2>
          </div>
          <Link href="/features" className="group text-sm font-semibold inline-flex items-center gap-1.5">All features <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
        </Reveal>
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" gap={0.04}>
          {features.map((f, i) => {
            const Icon = ICONS[f.slug] || LayoutGrid;
            const big = i === 0; // 1 wide + 14 = four full rows of four
            return (
              <StaggerItem key={f.slug} className={`flex ${big ? "sm:col-span-2" : ""}`}>
                <Link href={`/features/${f.slug}`} className={`${CARD} w-full overflow-hidden ${big ? "!bg-[#0f0f0e] !border-[#0f0f0e] text-white md:!p-8" : ""}`}>
                  {big && <span aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-500/25 blur-3xl group-hover:bg-emerald-400/35 transition-colors duration-500" />}
                  <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-colors duration-300 ${big ? "bg-white/10 text-emerald-400" : "bg-[#0f0f0e]/5 group-hover:bg-emerald-500 group-hover:text-white"}`}><Icon className="w-5 h-5" strokeWidth={2} /></div>
                  <h3 className={`relative font-display font-semibold tracking-tight flex items-start justify-between gap-2 ${big ? "text-2xl" : "text-[17px]"}`}>
                    {(f.metaTitle || f.title).split(":")[0]}
                    <ArrowUpRight className="w-4 h-4 mt-1 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0 transition-all flex-shrink-0" />
                  </h3>
                  <p className={`relative leading-relaxed mt-2 ${big ? "text-white/65 text-[15px] max-w-md" : "text-[#5f5f5d] text-[13.5px]"}`}>{f.points[0][1]}</p>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Multi-tenant callout */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 md:pb-28">
        <Reveal>
          <div className="bg-[#0f0f0e] text-[#fcfbf8] rounded-[2rem] p-8 md:p-16 relative overflow-hidden">
            <DarkBackdrop />
            <div className="relative grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="w-11 h-11 rounded-xl bg-white/10 text-emerald-400 flex items-center justify-center mb-6"><Building2 className="w-5 h-5" strokeWidth={2} /></div>
                <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight leading-tight">Built from the ground up as a real multi-tenant platform</h2>
                <p className="text-white/60 text-[15.5px] leading-relaxed mt-5">
                  Every organisation gets its own isolated data, roles, integrations and workspace. Nothing is shared
                  across tenants by accident: it is enforced at the database level, not just hidden in the interface.
                </p>
                <ul className="space-y-3 mt-7">
                  {["Organisation-scoped data on every table", "Admin-built roles with scoped permissions", "Modules switched on or off per organisation", "Your own Shopify, Shiprocket and WhatsApp connections", "Audit trail of role and record changes"].map((item) => (
                    <li key={item} className="flex items-start gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-1 flex-shrink-0" /><span className="text-[15px] text-white/85">{item}</span></li>
                  ))}
                </ul>
                <Link href="/features/roles-permissions" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 mt-8">How access control works <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
              </div>
              <Parallax amount={24} className="min-w-0"><Visual kind="matrix" /></Parallax>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Solutions */}
      <section className="bg-white border-y border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
            <div className="max-w-2xl">
              <Eyebrow>Solutions</Eyebrow>
              <h2 className={`${H2} mt-4`}>Set up around the way your team works</h2>
            </div>
            <Link href="/solutions" className="group text-sm font-semibold inline-flex items-center gap-1.5">All solutions <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {solutions.slice(0, 6).map((s) => (
              <StaggerItem key={s.slug} className="flex">
                <Link href={`/solutions/${s.slug}`} className={`${CARD} w-full !bg-[#fcfbf8]`}>
                  <h3 className="font-display font-semibold text-xl tracking-tight leading-snug">{s.metaTitle || s.title}</h3>
                  <p className="text-[#5f5f5d] text-[14px] leading-relaxed mt-2.5 flex-1">{s.points[0][1]}</p>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold mt-5">See how <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Free tools */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 grid lg:grid-cols-[1fr_1.3fr] gap-12 items-start">
        <Reveal className="lg:sticky lg:top-28">
          <Eyebrow>Free tools</Eyebrow>
          <h2 className={`${H2} mt-4`}>Put a number on it first</h2>
          <p className="text-[#5f5f5d] text-[16px] leading-relaxed mt-5 max-w-md">Six calculators for returns, recovery and repeat revenue. No signup, nothing stored: each one runs in your browser.</p>
          <Link href="/tools" className="group inline-flex items-center gap-1.5 text-sm font-semibold mt-7">All free tools <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
        </Reveal>
        <Stagger className="grid sm:grid-cols-2 gap-4">
          {TOOLS.map((t) => (
            <StaggerItem key={t.slug} className="flex">
              <Link href={`/tools/${t.slug}`} className={`${CARD} w-full !p-5 !flex-row items-center gap-4`}>
                <span className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300"><Calculator className="w-5 h-5" /></span>
                <span className="font-semibold text-[15px] leading-snug flex-1">{t.name}</span>
                <ArrowUpRight className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Blog */}
      {posts.length > 0 && (
        <section className="bg-white border-y border-[#eceae4]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
            <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
              <div className="max-w-2xl">
                <Eyebrow>From the blog</Eyebrow>
                <h2 className={`${H2} mt-4`}>Playbooks for the work after checkout</h2>
              </div>
              <Link href="/blog" className="group text-sm font-semibold inline-flex items-center gap-1.5">All articles <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
            </Reveal>
            <Stagger className="grid md:grid-cols-3 gap-5">
              {posts.map((p) => <StaggerItem key={p.slug} className="flex"><PostCard post={p} /></StaggerItem>)}
            </Stagger>
          </div>
        </section>
      )}

      <Faqs faqs={HOME_FAQS} heading="Questions, answered" />
      <CtaBand title="Ready to bring your operations into one place?" />

      <JsonLd data={[
        ORG_LD,
        { "@context": "https://schema.org", "@type": "WebSite", name: "CodeCrest", url: SITE_URL },
        {
          "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CodeCrest", url: SITE_URL,
          applicationCategory: "BusinessApplication", operatingSystem: "Web",
          description: "Operations platform for e-commerce teams: Shopify order management, shipping and RTO follow-up, WhatsApp automation, tasks, HR, approvals and role-based access.",
          featureList: SECTIONS[0].pages.map((p) => (p.metaTitle || p.title).split(":")[0]),
        },
      ]} />
    </>
  );
}
