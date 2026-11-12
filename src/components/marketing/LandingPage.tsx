import Link from "next/link";
import {
  ShoppingBag, Truck, MessageSquare, Users, BarChart3, Building2, ArrowRight, CheckCircle2,
  Workflow, PhoneCall, LayoutGrid, ShieldCheck, LifeBuoy, Target, Receipt, MapPin, ShoppingCart, Calculator,
  type LucideIcon,
} from "lucide-react";
import { SECTIONS, SITE_URL, TOOLS, getSection, type VisualKind } from "@/content";
import { CtaBand, JsonLd, ORG_LD } from "@/components/site/SiteShell";
import { Eyebrow, Faqs } from "@/components/site/PageView";
import Visual from "@/components/site/Visual";

const ICONS: Record<string, LucideIcon> = {
  "shopify-order-management": ShoppingBag, "abandoned-cart-recovery": ShoppingCart, "shipping-rto-management": Truck,
  "whatsapp-automation": MessageSquare, "task-engine": Workflow, "team-hr": Users, workspaces: LayoutGrid,
  "analytics-reports": BarChart3, "roles-permissions": ShieldCheck, "approvals-and-rules": CheckCircle2,
  "service-desk": LifeBuoy, "sales-pipeline": Target, "finance-operations": Receipt, "field-visits": MapPin, "cloud-telephony": PhoneCall,
};

const SHOWCASE: { eyebrow: string; title: string; text: string; bullets: string[]; href: string; visual: VisualKind }[] = [
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

export default function LandingPage() {
  const features = getSection("features")!.pages;
  const solutions = getSection("solutions")!.pages;
  const integrations = getSection("integrations")!.pages;
  const resources = getSection("resources")!.pages.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{ backgroundImage: "radial-gradient(#1c1c1c 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 md:pt-20 pb-16 md:pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#eceae4] bg-white text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Operations platform for e-commerce teams
            </div>
            <h1 className="font-display font-semibold tracking-tight text-[2.5rem] sm:text-6xl leading-[1.04]">
              Run every order, and the team behind it, from one place
            </h1>
            <p className="text-[#3a3a38] text-lg leading-relaxed mt-6 max-w-xl" data-speakable>
              CodeCrest unifies Shopify orders, Shiprocket shipping, WhatsApp and calls with tasks, HR, approvals and
              role-based access, so your team stops switching tabs and starts closing the loop on every order.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-9">
              <Link href="/contact" className="btn-primary px-6 py-3 text-sm">Talk to us <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/features" className="btn-secondary px-6 py-3 text-sm">Explore the product</Link>
            </div>
            <p className="text-[#5f5f5d] text-[13px] mt-5">Set up for you by our team &middot; Your own isolated organisation</p>
          </div>
          <Visual kind="orders" />
        </div>
      </section>

      {/* Capability strip */}
      <section className="border-y border-[#eceae4] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-9 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[["Shopify + Shiprocket", "Native sync"], ["WhatsApp, email, calls", "Built-in outreach"], ["Roles with scopes", "Access control"], ["Org-isolated", "Multi-tenant data"]].map(([v, l]) => (
            <div key={l}>
              <div className="font-display font-semibold text-base md:text-lg">{v}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#5f5f5d] mt-1">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Showcase */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 space-y-20 md:space-y-28">
        {SHOWCASE.map((s, i) => (
          <div key={s.title} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className={i % 2 ? "lg:order-2" : ""}>
              <Eyebrow>{s.eyebrow}</Eyebrow>
              <h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl leading-tight mt-3">{s.title}</h2>
              <p className="text-[#5f5f5d] text-[16px] leading-relaxed mt-4">{s.text}</p>
              <ul className="mt-6 space-y-2.5">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px]"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-1 flex-shrink-0" />{b}</li>
                ))}
              </ul>
              <Link href={s.href} className="inline-flex items-center gap-1.5 text-sm font-semibold mt-7 group">
                Learn more <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <Visual kind={s.visual} />
          </div>
        ))}
      </section>

      {/* All features */}
      <section className="bg-white border-y border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-24">
          <div className="max-w-2xl mb-12">
            <Eyebrow>Everything in one place</Eyebrow>
            <h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl mt-3">One platform, every operation your business runs on</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => {
              const Icon = ICONS[f.slug] || LayoutGrid;
              return (
                <Link key={f.slug} href={`/features/${f.slug}`} className="group rounded-2xl border border-[#eceae4] bg-[#fcfbf8] p-5 hover:bg-white hover:border-[#1c1c1c]/25 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-0.5 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-[#1c1c1c]/5 flex items-center justify-center mb-4"><Icon className="w-5 h-5" strokeWidth={2} /></div>
                  <h3 className="font-semibold font-sans text-[15px] flex items-center justify-between gap-2">
                    {(f.metaTitle || f.title).split(":")[0]}
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                  </h3>
                  <p className="text-[#5f5f5d] text-[13.5px] leading-relaxed mt-1.5">{f.points[0][1]}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div className="max-w-2xl">
            <Eyebrow>Solutions</Eyebrow>
            <h2 className="font-display font-semibold tracking-tight text-3xl md:text-4xl mt-3">Set up around the way your team works</h2>
          </div>
          <Link href="/solutions" className="text-sm font-semibold inline-flex items-center gap-1.5">All solutions <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {solutions.slice(0, 6).map((s) => (
            <Link key={s.slug} href={`/solutions/${s.slug}`} className="group rounded-2xl border border-[#eceae4] bg-white p-6 hover:border-[#1c1c1c]/25 hover:shadow-xl hover:shadow-black/5 transition-all">
              <h3 className="font-display font-semibold text-lg tracking-tight leading-snug">{s.metaTitle || s.title}</h3>
              <p className="text-[#5f5f5d] text-[14px] leading-relaxed mt-2">{s.points[0][1]}</p>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold mt-4">See how <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* Multi-tenant callout + integrations */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 md:pb-24">
        <div className="bg-[#1c1c1c] text-[#fcfbf8] rounded-[2rem] p-8 md:p-16 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fcfbf8 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-6"><Building2 className="w-5 h-5" strokeWidth={2} /></div>
              <h2 className="text-2xl md:text-3xl font-display font-semibold tracking-tight">Built from the ground up as a real multi-tenant platform</h2>
              <p className="text-white/60 text-[15px] leading-relaxed mt-4">
                Every organisation gets its own isolated data, roles, integrations and workspace. Nothing is shared
                across tenants by accident: it is enforced at the database level, not just hidden in the interface.
              </p>
              <div className="flex flex-wrap gap-2 mt-7">
                {integrations.map((i) => (
                  <Link key={i.slug} href={`/integrations/${i.slug}`} className="rounded-full border border-white/20 px-3.5 py-1.5 text-[12px] font-medium hover:bg-white/10 transition-colors">
                    {(i.metaTitle || i.title).replace(/ (CRM )?Integration$/, "").replace(/ Data Import$/, " import")}
                  </Link>
                ))}
              </div>
            </div>
            <ul className="space-y-3.5">
              {["Organisation-scoped data on every table", "Admin-built roles with scoped permissions", "Modules switched on or off per organisation", "Your own Shopify, Shiprocket and WhatsApp connections", "Audit trail of role and record changes"].map((item) => (
                <li key={item} className="flex items-start gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-1 flex-shrink-0" /><span className="text-[15px] text-white/85">{item}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Tools + resources */}
      <section className="bg-white border-y border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-24 grid lg:grid-cols-2 gap-14">
          <div>
            <Eyebrow>Free tools</Eyebrow>
            <h2 className="font-display font-semibold tracking-tight text-2xl md:text-3xl mt-3">Put a number on it first</h2>
            <ul className="mt-6 divide-y divide-[#eceae4] border-y border-[#eceae4]">
              {TOOLS.slice(0, 4).map((t) => (
                <li key={t.slug}>
                  <Link href={`/tools/${t.slug}`} className="group flex items-center gap-3 py-3.5">
                    <Calculator className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span className="font-medium text-[15px] flex-1">{t.name}</span>
                    <ArrowRight className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm font-semibold mt-5">All free tools <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div>
            <Eyebrow>Guides</Eyebrow>
            <h2 className="font-display font-semibold tracking-tight text-2xl md:text-3xl mt-3">Learn from the playbook</h2>
            <ul className="mt-6 divide-y divide-[#eceae4] border-y border-[#eceae4]">
              {resources.map((r) => (
                <li key={r.slug}>
                  <Link href={`/resources/${r.slug}`} className="group flex items-center gap-3 py-3.5">
                    <span className="font-medium text-[15px] flex-1">{r.title}</span>
                    <ArrowRight className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm font-semibold mt-5">All guides <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </section>

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
