import Link from "next/link";
import {
  ShoppingBag, Truck, MessageSquare, Users, BarChart3, ArrowRight, ArrowUpRight, CheckCircle2,
  Workflow, PhoneCall, LayoutGrid, ShieldCheck, LifeBuoy, Target, Receipt, MapPin, ShoppingCart, Calculator,
  Database, KeyRound, ScrollText, ToggleRight, type LucideIcon,
} from "lucide-react";
import { SECTIONS, SITE_URL, TOOLS, getSection, type VisualKind } from "@/content";
import { POSTS, latestPosts } from "@/content/blog";
import { Btn, CtaBand, DarkBackdrop, JsonLd, Mesh, ORG_LD } from "@/components/site/SiteShell";
import { CARD, Eyebrow, Faqs } from "@/components/site/PageView";
import { Float, Parallax, Reveal, Showcase, Stagger, StaggerItem, TiltIn, WordsIn, type ShowcaseItem } from "@/components/site/Motion";
import { Counter, PinnedStory, Spotlight, Squiggle, Star, type StoryItem } from "@/components/site/Fx";
import { PostCard } from "@/components/site/BlogView";
import Visual, { DashboardMock } from "@/components/site/Visual";
import { getSiteContent } from "@/lib/site-content-server";

const ICONS: Record<string, LucideIcon> = {
  "shopify-order-management": ShoppingBag, "abandoned-cart-recovery": ShoppingCart, "shipping-rto-management": Truck,
  "whatsapp-automation": MessageSquare, "task-engine": Workflow, "team-hr": Users, workspaces: LayoutGrid,
  "analytics-reports": BarChart3, "roles-permissions": ShieldCheck, "approvals-and-rules": CheckCircle2,
  "service-desk": LifeBuoy, "sales-pipeline": Target, "finance-operations": Receipt, "field-visits": MapPin, "cloud-telephony": PhoneCall,
};

const CONNECTS = ["Shopify", "Shiprocket", "WhatsApp", "Exotel", "Twilio", "Gmail", "Google Sheets", "Google Drive", "CSV and Excel import", "Fastrr checkout"];

const STORY: StoryItem[] = [
  {
    pain: "Orders live in five tabs", painText: "Shopify admin, the courier panel, WhatsApp, a call app and a spreadsheet. Nobody sees the whole order.",
    fix: "One screen per order", fixText: "Order, shipment, calls, messages and the tasks your team owes on it, together on one timeline.", href: "/features/shopify-order-management",
  },
  {
    pain: "COD parcels come back", painText: "Unverified addresses and unconfirmed orders ship anyway, and you pay shipping both ways.",
    fix: "Verification before dispatch", fixText: "COD orders land in an agent queue to confirm the customer, the address and the amount before the parcel moves.", href: "/features/shipping-rto-management",
  },
  {
    pain: "Failed deliveries go unanswered", painText: "A delivery fails and the report sits in the courier panel until the parcel is already on its way back.",
    fix: "Every exception gets an owner", fixText: "Failed and stuck shipments become follow-up tasks with a named person, a due time and the customer one click away.", href: "/resources/ndr-management-guide",
  },
  {
    pain: "Nobody knows who can see what", painText: "Shared logins and all-or-nothing access, with no record of who changed a role or approved a refund.",
    fix: "Roles with real boundaries", fixText: "Grant each action per module and choose how far it reaches: own records, a team, a branch or the organisation.", href: "/features/roles-permissions",
  },
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
    eyebrow: "Automation", title: "Rules and approvals that run without reminders",
    text: "Describe what should happen when something changes, and who has to sign off. The platform routes it, records it and blocks self-approval.",
    bullets: ["When, if, then rules on your own records", "Multi-step approvals", "Every decision in the audit trail"], href: "/features/approvals-and-rules", visual: "flow",
  },
];

// The three features shown large in the bento, each with its own product visual.
const FEATURED: [string, VisualKind][] = [["shopify-order-management", "orders"], ["whatsapp-automation", "chat"], ["analytics-reports", "chart"]];

const TRUST: [LucideIcon, string, string][] = [
  [Database, "Isolated by organisation", "Every record belongs to one organisation, enforced in the database, not only hidden in the interface."],
  [KeyRound, "Your own connections", "Your Shopify, Shiprocket and WhatsApp connections belong to your organisation alone."],
  [ShieldCheck, "Roles you design", "Admin-built roles with permissions scoped to a person, team, department, branch or the whole organisation."],
  [ScrollText, "A record of changes", "Role and record changes are written to an audit trail."],
  [ToggleRight, "Only what you need", "Modules are switched on or off per organisation, so teams see the tools they use."],
];

const ONBOARD: [string, string][] = [
  ["Tell us how you work", "Share your team size, the tools you run on and where orders get stuck. One short form, no sales deck."],
  ["We build your organisation", "Our team creates your workspace, roles and queues, and connects Shopify, Shiprocket and WhatsApp with you."],
  ["Your team starts working", "You get logins for a system that already has your orders in it, not an empty tool to configure."],
];

const HOME_FAQS: [string, string][] = [
  ["What is CodeCrest?", "CodeCrest is an operations platform for e-commerce teams and growing businesses. It brings Shopify orders, shipping follow-up, WhatsApp and call workflows, tasks, HR, approvals and an internal service desk into one place, with permissions scoped by team, department and branch."],
  ["Who is it for?", "Shopify-based brands with a team working orders every day, and small to mid-sized businesses that want roles, approvals and internal requests on one system instead of spreadsheets and chat groups."],
  ["What does it integrate with?", "Shopify, Shiprocket, WhatsApp, Exotel and Twilio for calls and SMS, Gmail, Google Sheets and Google Drive, plus CSV and Excel import."],
  ["How is each organisation's data kept separate?", "Every record belongs to one organisation and access is enforced in the database, not only in the interface. Isolation is tested automatically across every table."],
  ["How do we get started?", "Contact us. Our team sets up your organisation, connects your integrations with you and hands over a working system. There is no self-serve signup."],
];

const H2 = "font-display font-bold tracking-[-0.03em] text-[2rem] sm:text-4xl md:text-5xl leading-[1.06]";

export default async function LandingPage() {
  const hero = await getSiteContent("home.hero");
  const features = getSection("features")!.pages;
  const solutions = getSection("solutions")!.pages;
  const featured = FEATURED.map(([slug, visual]) => ({ page: features.find((f) => f.slug === slug)!, visual }));
  const rest = features.filter((f) => !FEATURED.some(([slug]) => slug === f.slug));
  const posts = latestPosts(3);
  // Counts come from the content itself, so they stay true as pages are added.
  const counts: [number, string][] = [[features.length, "product modules"], [CONNECTS.length, "tools it connects with"], [POSTS.length, "operations playbooks"], [TOOLS.length, "free calculators"]];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <Mesh />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-32 md:pt-40 text-center">
          <Reveal eager y={12}>
            <Link href={hero.badge_href || "/blog"} className="group inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full border border-black/10 bg-white/70 backdrop-blur text-[12px] font-medium hover:bg-white transition-colors">
              <span className="rounded-full bg-[#111113] text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">New</span>
              <span className="text-left">{hero.badge || `${POSTS.length} playbooks for COD, RTO and WhatsApp`}</span>
              <ArrowRight className="w-3 h-3 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </Reveal>
          <h1 className="font-display font-bold tracking-[-0.04em] text-[2.6rem] sm:text-6xl lg:text-[4.6rem] leading-[1.0] mt-7 max-w-5xl mx-auto">
            <WordsIn text={hero.headline} accent={hero.accent && hero.headline.includes(hero.accent) ? hero.accent : undefined} />
          </h1>
          <Reveal eager delay={0.2} y={16}>
            <p className="text-[#3b3b3a] text-lg md:text-xl leading-relaxed mt-7 max-w-2xl mx-auto" data-speakable>
              {hero.subheadline}
            </p>
          </Reveal>
          <Reveal eager delay={0.28} y={16}>
            <div className="relative flex flex-col sm:flex-row gap-3 mt-9 justify-center">
              <Btn href={hero.primary_href} arrow>{hero.primary_label}</Btn>
              <Btn href={hero.secondary_href} tone="outline">{hero.secondary_label}</Btn>
              <Squiggle className="hidden lg:block absolute left-[calc(50%+15rem)] -top-16 w-24 text-[#111113]" />
            </div>
            {hero.footnote && <p className="text-[var(--dim)] text-[13px] mt-5">{hero.footnote}</p>}
          </Reveal>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 mt-14 md:mt-20">
          <Star className="hidden md:block absolute -left-6 lg:-left-14 top-16 w-10 h-10 text-[#111113]" />
          <TiltIn><DashboardMock /></TiltIn>
          <Float className="hidden lg:block absolute -left-24 bottom-10 w-[17rem]"><Visual kind="chat" bare /></Float>
          <Float delay={1.5} className="hidden lg:block absolute -right-20 top-24 w-[16rem]"><Visual kind="chart" bare /></Float>
        </div>
      </section>

      {/* Connects with + honest numbers */}
      <section className="relative border-y border-[var(--line)] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col md:flex-row md:items-center gap-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--dim)] whitespace-nowrap">Connects with</p>
          <div className="relative flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
            <ul className="flex w-max gap-12 animate-[marquee_38s_linear_infinite] hover:[animation-play-state:paused]">
              {[...CONNECTS, ...CONNECTS].map((c, i) => (
                <li key={i} aria-hidden={i >= CONNECTS.length} className="font-display font-semibold text-lg text-[#111113]/75 whitespace-nowrap">{c}</li>
              ))}
            </ul>
          </div>
        </div>
        <Stagger className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-3 grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
          {counts.map(([n, label]) => (
            <StaggerItem key={label} className="md:border-l md:border-[var(--line)] md:pl-6 first:border-l-0 first:pl-0">
              <div className="font-display font-bold tracking-[-0.04em] text-5xl md:text-6xl tabular-nums"><Counter to={n} /></div>
              <div className="text-[13px] text-[var(--dim)] mt-1.5">{label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Problem to solution (pinned scroll story) */}
      <section aria-labelledby="story-h">
        <PinnedStory items={STORY}>
          <Eyebrow>The problem</Eyebrow>
          <h2 id="story-h" className={`${H2} mt-5`}>The sale is easy. <span className="font-accent text-grad">Everything after</span> is where money leaks.</h2>
        </PinnedStory>
      </section>

      {/* Product tour */}
      <section className="bg-white border-y border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Reveal className="max-w-2xl mb-12">
            <Eyebrow>Product tour</Eyebrow>
            <h2 className={`${H2} mt-5`}>Four jobs your team does every day, in one system</h2>
          </Reveal>
          <Showcase items={SHOWCASE} />
        </div>
      </section>

      {/* Features: bento */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
          <div className="max-w-2xl">
            <Eyebrow>Everything in one place</Eyebrow>
            <h2 className={`${H2} mt-5`}>One platform, every operation your business runs on</h2>
          </div>
          <Link href="/features" className="group text-sm font-semibold inline-flex items-center gap-1.5">All {features.length} features <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
        </Reveal>

        <Stagger className="grid lg:grid-cols-6 gap-4">
          {featured.map(({ page, visual }, i) => {
            const Icon = ICONS[page.slug] || LayoutGrid;
            const dark = i === 0;
            return (
              <StaggerItem key={page.slug} className={`flex ${i === 0 ? "lg:col-span-6" : "lg:col-span-3"}`}>
                <Spotlight tilt={i === 0 ? 2 : 4} className={`w-full rounded-[2rem] overflow-hidden ${dark ? "bg-[#111113] text-white" : "bg-white border border-[var(--line)]"}`}>
                  <Link href={`/features/${page.slug}`} className={`group relative grid h-full ${i === 0 ? "md:grid-cols-2" : ""}`}>
                    {dark && <DarkBackdrop />}
                    <div className="relative p-7 md:p-10 flex flex-col">
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${dark ? "bg-white/10 text-[var(--lemon)]" : "bg-[#111113] text-white"}`}><Icon className="w-5 h-5" /></span>
                      <h3 className={`font-display font-bold tracking-[-0.02em] mt-6 ${i === 0 ? "text-3xl md:text-4xl leading-tight" : "text-2xl"}`}>{(page.metaTitle || page.title).split(":")[0]}</h3>
                      <p className={`leading-relaxed mt-3 flex-1 ${dark ? "text-white/65 text-[16px]" : "text-[var(--dim)] text-[15px]"}`}>{page.points[0][1]}</p>
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold mt-6 ${dark ? "text-[var(--lemon)]" : ""}`}>Learn more <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
                    </div>
                    <div className={`relative ${i === 0 ? "px-7 pb-0 md:p-10 md:pl-0 self-end" : "px-7"} overflow-hidden`}>
                      <div className={`${i === 0 ? "translate-y-6 md:translate-y-10" : "translate-y-4 max-h-56"} transition-transform duration-500 group-hover:translate-y-2`}><Visual kind={visual} bare /></div>
                    </div>
                  </Link>
                </Spotlight>
              </StaggerItem>
            );
          })}
        </Stagger>

        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4" gap={0.04}>
          {rest.map((f) => {
            const Icon = ICONS[f.slug] || LayoutGrid;
            return (
              <StaggerItem key={f.slug} className="flex">
                <Link href={`/features/${f.slug}`} className={`${CARD} w-full !p-5`}>
                  <div className="w-10 h-10 rounded-xl bg-[#111113]/5 flex items-center justify-center mb-4 transition-colors duration-300 group-hover:bg-[#111113] group-hover:text-white"><Icon className="w-[18px] h-[18px]" /></div>
                  <h3 className="font-display font-semibold tracking-tight text-[16.5px] flex items-start justify-between gap-2">
                    {(f.metaTitle || f.title).split(":")[0]}
                    <ArrowUpRight className="w-4 h-4 mt-0.5 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0 transition-all flex-shrink-0" />
                  </h3>
                  <p className="text-[var(--dim)] text-[13.5px] leading-relaxed mt-1.5">{f.points[0][0]}</p>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Use cases */}
      <section className="bg-white border-y border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
            <div className="max-w-2xl">
              <Eyebrow>Use cases</Eyebrow>
              <h2 className={`${H2} mt-5`}>Set up around the way <span className="font-accent text-grad">your</span> team works</h2>
            </div>
            <Link href="/solutions" className="group text-sm font-semibold inline-flex items-center gap-1.5">All solutions <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {solutions.slice(0, 6).map((s, i) => (
              <StaggerItem key={s.slug} className="flex">
                <Link href={`/solutions/${s.slug}`} className={`${CARD} w-full !bg-[#f4f3ee] !border-transparent`}>
                  <span className="font-display text-[13px] font-semibold tabular-nums text-[var(--dim)]">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display font-bold text-xl tracking-tight leading-snug mt-8">{s.metaTitle || s.title}</h3>
                  <p className="text-[var(--dim)] text-[14px] leading-relaxed mt-2.5 flex-1">{s.points[0][1]}</p>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold mt-5">See how <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Trust: facts about how the platform is built, in place of invented testimonials */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <Reveal>
          <div className="bg-[#111113] text-white rounded-[2.25rem] p-7 md:p-14 relative overflow-hidden">
            <DarkBackdrop />
            <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
              <div>
                <Eyebrow dark>Built to be trusted</Eyebrow>
                <h2 className={`${H2} mt-5`}>Your data stays yours, by design</h2>
                <ul className="mt-9 space-y-5">
                  {TRUST.map(([Icon, h, t]) => (
                    <li key={h} className="flex gap-4">
                      <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 text-[var(--mint)] flex items-center justify-center"><Icon className="w-[18px] h-[18px]" /></span>
                      <div><p className="font-semibold">{h}</p><p className="text-white/60 text-[14.5px] leading-relaxed mt-0.5">{t}</p></div>
                    </li>
                  ))}
                </ul>
                <Link href="/features/roles-permissions" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--lemon)] mt-9">How access control works <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
              </div>
              <Parallax amount={24} className="min-w-0"><Visual kind="matrix" /></Parallax>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Getting started */}
      <section className="bg-white border-y border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Reveal className="max-w-2xl">
            <Eyebrow>Getting started</Eyebrow>
            <h2 className={`${H2} mt-5`}>We set it up. You start with a working system.</h2>
          </Reveal>
          <Stagger className="relative mt-12 grid md:grid-cols-3 gap-4" gap={0.12}>
            {ONBOARD.map(([h, t], i) => (
              <StaggerItem key={h} className="flex">
                <div className="relative w-full rounded-3xl bg-[#f4f3ee] p-7 overflow-hidden">
                  <span aria-hidden className="absolute -top-6 -right-2 font-display font-bold text-[7rem] leading-none text-[#111113]/[0.05] tabular-nums">{i + 1}</span>
                  <span className="relative inline-flex w-9 h-9 rounded-full bg-[#111113] text-white text-[13px] font-bold items-center justify-center">{i + 1}</span>
                  <h3 className="relative font-display font-bold text-xl tracking-tight mt-6">{h}</h3>
                  <p className="relative text-[var(--dim)] text-[14.5px] leading-relaxed mt-2">{t}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
            <Btn href="/contact" arrow>Request your workspace</Btn>
            <p className="text-[13.5px] text-[var(--dim)]">One short form. We reply with next steps.</p>
          </Reveal>
        </div>
      </section>

      {/* Free tools */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 grid lg:grid-cols-[1fr_1.3fr] gap-12 items-start">
        <Reveal className="lg:sticky lg:top-28">
          <Eyebrow>Free tools</Eyebrow>
          <h2 className={`${H2} mt-5`}>Put a number on it first</h2>
          <p className="text-[var(--dim)] text-[16px] leading-relaxed mt-5 max-w-md">Calculators for returns, recovery and repeat revenue. No signup, nothing stored: each one runs in your browser.</p>
          <Link href="/tools" className="group inline-flex items-center gap-1.5 text-sm font-semibold mt-7">All free tools <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
        </Reveal>
        <Stagger className="grid sm:grid-cols-2 gap-4">
          {TOOLS.map((t) => (
            <StaggerItem key={t.slug} className="flex">
              <Link href={`/tools/${t.slug}`} className={`${CARD} w-full !p-5 !flex-row items-center gap-4`}>
                <span className="w-11 h-11 rounded-xl bg-[#111113]/5 flex items-center justify-center flex-shrink-0 group-hover:bg-[#111113] group-hover:text-white transition-colors duration-300"><Calculator className="w-5 h-5" /></span>
                <span className="font-semibold text-[15px] leading-snug flex-1">{t.name}</span>
                <ArrowUpRight className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Blog */}
      {posts.length > 0 && (
        <section className="bg-white border-y border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
            <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-12">
              <div className="max-w-2xl">
                <Eyebrow>From the blog</Eyebrow>
                <h2 className={`${H2} mt-5`}>Playbooks for the work after checkout</h2>
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
