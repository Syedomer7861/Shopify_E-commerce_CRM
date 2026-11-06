"use client";
import Link from "next/link";
import {
  Zap, ShoppingBag, Truck, MessageSquare, Users, BarChart3, ShieldCheck,
  Building2, ArrowRight, CheckCircle2, Workflow, PhoneCall, LayoutGrid, Mail,
} from "lucide-react";

const FEATURES = [
  {
    icon: ShoppingBag,
    title: "Shopify Order Management",
    desc: "Every order, abandoned cart, and customer synced live from Shopify — no spreadsheets, no manual exports.",
  },
  {
    icon: Truck,
    title: "Shiprocket Shipping Sync",
    desc: "Real-time delivery status, AWB tracking, and NDR handling reconciled automatically against every courier update.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp & Email Automation",
    desc: "Branded, templated messages for order confirmations, recovery, reorders, and reviews — sent on autopilot or by your team.",
  },
  {
    icon: Workflow,
    title: "Smart Task Engine",
    desc: "Recovery, COD verification, issue resolution, and win-back tasks auto-generated and prioritized for the right agent.",
  },
  {
    icon: Users,
    title: "Team & HR Operations",
    desc: "Attendance, leave, payroll, performance reviews, and a live floor view of who's online — one place for the whole team.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    desc: "Revenue, RTO rate, recovery rate, agent leaderboards, and exportable PDF/Excel reports whenever you need them.",
  },
  {
    icon: LayoutGrid,
    title: "Workspaces & Boards",
    desc: "Kanban boards, goals, time tracking, and custom fields for marketing, content, and creative teams — built in.",
  },
  {
    icon: PhoneCall,
    title: "Cloud Telephony",
    desc: "Click-to-call, call logging, and full history tied back to every customer and order automatically.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Create your workspace",
    desc: "Sign up and get your own fully isolated organization in seconds — your data, your team, your rules.",
  },
  {
    step: "02",
    title: "Connect your stack",
    desc: "Link Shopify, Shiprocket, WhatsApp, and email from Settings. Every integration is scoped to your org alone.",
  },
  {
    step: "03",
    title: "Let the engine run",
    desc: "Orders sync, tasks get assigned, reminders go out, and your dashboard fills in — while your team focuses on customers.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f4ed] text-[#1c1c1c]">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-[#f7f4ed]/90 backdrop-blur border-b border-[#eceae4]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1c1c1c] flex items-center justify-center shadow-lg shadow-[#1c1c1c]/10">
              <Zap className="w-4 h-4 text-[#fcfbf8]" strokeWidth={2.5} />
            </div>
            <span className="font-display font-black tracking-tight text-lg">CodeCrest</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost text-sm">Sign In</Link>
            <Link href="/signup" className="btn-primary text-sm">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: `radial-gradient(#1c1c1c 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center relative z-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#eceae4] bg-white text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Multi-Tenant &middot; Built for E-Commerce Teams
          </div>
          <h1 className="text-hero font-display mb-6 max-w-3xl mx-auto">
            The command center for fast-moving e-commerce teams
          </h1>
          <p className="text-[#5f5f5d] text-lg leading-relaxed max-w-2xl mx-auto mb-10">
            CodeCrest CRM unifies Shopify orders, Shiprocket shipping, WhatsApp support, and agent
            performance in one dashboard — so your team spends less time switching tabs and more
            time closing orders.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary px-6 py-3 text-sm">
              Create Your Workspace <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-sm">
              Sign In
            </Link>
          </div>
          <p className="text-[#5f5f5d]/60 text-xs mt-5 uppercase tracking-widest font-bold">
            No credit card required &middot; Your own isolated organization
          </p>
        </div>
      </section>

      {/* Stat bar */}
      <section className="border-y border-[#eceae4] bg-white">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "Shopify + Shiprocket", label: "Native Sync" },
            { value: "WhatsApp + Email", label: "Automated Outreach" },
            { value: "Role-Based", label: "Team Access Control" },
            { value: "Org-Isolated", label: "Multi-Tenant Data" },
          ].map((s) => (
            <div key={s.label}>
              <div className="font-display font-bold text-lg md:text-xl mb-1">{s.value}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#5f5f5d]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#5f5f5d]">Everything in one place</span>
          <h2 className="page-title mt-3">Every operation your store needs, under one roof</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card hover:border-[#1c1c1c]/20 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#1c1c1c]/5 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-[#1c1c1c]" strokeWidth={2} />
              </div>
              <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
              <p className="text-[#5f5f5d] text-[13px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-[#eceae4]">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#5f5f5d]">How it works</span>
            <h2 className="page-title mt-3">Up and running in minutes, not weeks</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {STEPS.map((s) => (
              <div key={s.step}>
                <div className="text-[#1c1c1c]/10 font-display font-black text-5xl mb-4">{s.step}</div>
                <h3 className="font-bold text-base mb-2">{s.title}</h3>
                <p className="text-[#5f5f5d] text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Multi-tenant callout */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="bg-[#1c1c1c] text-[#fcfbf8] rounded-[2rem] p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: `radial-gradient(#fcfbf8 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
          <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-6">
                <Building2 className="w-5 h-5 text-[#fcfbf8]" strokeWidth={2} />
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-bold mb-4 tracking-tight">
                Built from the ground up as a real multi-tenant platform
              </h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Every organization gets its own isolated data, roles, integrations, and workspace.
                Nothing is shared across tenants by accident — it's enforced at the database level,
                not just hidden in the UI.
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Organization-scoped data on every single table",
                "Dynamic, admin-built roles — not a fixed list",
                "Per-user module and page access control",
                "Your own Shopify, Shiprocket, and WhatsApp connections",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-white/80">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 pb-24 text-center">
        <h2 className="page-title mb-4">Ready to bring your operations into one place?</h2>
        <p className="text-[#5f5f5d] mb-8">Create your workspace and invite your team — no setup calls, no waiting.</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-sm">
            Create Your Workspace <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-sm">
            Sign In
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#eceae4] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-[#1c1c1c] flex items-center justify-center">
              <Zap className="w-3 h-3 text-[#fcfbf8]" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-sm">CodeCrest CRM</span>
          </div>
          <div className="flex items-center gap-6 text-[11px] text-[#5f5f5d] font-medium uppercase tracking-wider">
            <Link href="/login" className="hover:text-[#1c1c1c] transition-colors">Sign In</Link>
            <Link href="/signup" className="hover:text-[#1c1c1c] transition-colors">Sign Up</Link>
          </div>
          <p className="text-[#5f5f5d]/60 text-xs">&copy; 2026 CodeCrest CRM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
