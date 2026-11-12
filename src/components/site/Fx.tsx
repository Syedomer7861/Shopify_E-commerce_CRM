"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { animate, useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import * as m from "motion/react-m";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Interactive effects for the public site. Motion handles component-level
// interaction (magnetic, tilt, counters, drawn strokes); GSAP ScrollTrigger is
// used only where a section is pinned to scroll progress. Must render inside
// MotionRoot (SiteShell).

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/** Enter transition for every public page (app/(site)/template.tsx). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>{children}</m.div>;
}

/** Pulls its child toward the pointer; springs back on leave. Mouse only. */
export function Magnetic({ children, className, strength = 0.3 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  return (
    <m.span className={`inline-flex ${className ?? ""}`} style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </m.span>
  );
}

/** Card surface with a pointer-following glow and a slight 3D tilt. */
export function Spotlight({ children, className = "", tilt = 5 }: { children: React.ReactNode; className?: string; tilt?: number }) {
  const rx = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  return (
    <m.div className={`group/spot relative ${className}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        ry.set((px - 0.5) * tilt);
        rx.set((0.5 - py) * tilt);
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}>
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover/spot:opacity-100 transition-opacity duration-300"
        style={{ background: "radial-gradient(22rem circle at var(--mx, 50%) var(--my, 50%), rgba(255,122,69,0.14), rgba(95,227,154,0.10) 40%, transparent 65%)" }} />
    </m.div>
  );
}

/** Counts up to `to` when scrolled into view. The final number is in the HTML from the start. */
export function Counter({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -60px 0px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, to, { duration: 1.4, ease: "easeOut", onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => controls.stop();
  }, [inView, reduce, to]);
  return <span ref={ref} className={className}>{to}</span>;
}

/** Hand-drawn squiggle arrow that draws itself in. Decorative. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 130" fill="none" className={className}>
      <m.path d="M96 6c14 18 6 44-14 46-14 2-22-12-12-20 12-9 30 8 22 30-6 17-26 22-40 16-12-5-12-20-1-22 12-2 20 14 10 30-8 12-24 18-44 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.9, ease: "easeInOut" }} />
      <m.path d="M30 104l-14 12 17 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 2.4 }} />
    </svg>
  );
}

/** Slowly rotating eight-point star. Decorative. */
export function Star({ className }: { className?: string }) {
  return (
    <m.svg aria-hidden viewBox="0 0 48 48" className={className} animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: "linear" }}>
      <path fill="currentColor" d="M24 0l3.2 17.2L40 8l-9.2 12.8L48 24l-17.2 3.2L40 40l-12.8-9.2L24 48l-3.2-17.2L8 40l9.2-12.8L0 24l17.2-3.2L8 8l12.8 9.2z" />
    </m.svg>
  );
}

export type StoryItem = { pain: string; painText: string; fix: string; fixText: string; href: string };

/**
 * Problem to solution, told by scrolling (GSAP ScrollTrigger). On desktop the
 * section pins and scroll progress steps through the items. On small screens
 * and with reduced motion nothing pins: every item is listed with its fix.
 * All copy is always in the DOM.
 */
export function PinnedStory({ items, children }: { items: StoryItem[]; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      setPinned(true);
      const st = ScrollTrigger.create({
        trigger: root.current, start: "top top+=64", end: `+=${items.length * 460}`, pin: true, scrub: true,
        onUpdate: (self) => setActive(Math.min(items.length - 1, Math.floor(self.progress * items.length))),
      });
      return () => { st.kill(); setPinned(false); };
    });
    return () => mm.revert();
  }, [items.length]);

  return (
    <div ref={root} className="lg:min-h-[calc(100vh-4rem)] flex items-center">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-10 grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-16 items-center">
        <div>
          {children}
          <ol className="mt-8 space-y-2">
            {items.map((it, i) => {
              const on = i === active;
              return (
                <li key={it.pain} className={`rounded-2xl border px-5 py-4 transition-all duration-500 ${pinned ? (on ? "bg-white border-[var(--line)] shadow-xl shadow-black/5" : "border-transparent opacity-45") : "bg-white border-[var(--line)]"}`}>
                  <p className="flex items-center gap-3 font-display font-semibold tracking-tight text-lg">
                    <span className="font-sans text-[11px] font-bold tabular-nums text-[var(--dim)]">{String(i + 1).padStart(2, "0")}</span>{it.pain}
                  </p>
                  <p className="text-[14.5px] text-[var(--dim)] leading-relaxed mt-1.5 pl-8">{it.painText}</p>
                  {/* Small screens: the fix sits under its problem. */}
                  <div className="lg:hidden mt-4 sm:ml-8 rounded-xl bg-[#111113] text-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)]">With CodeCrest</p>
                    <p className="font-semibold mt-1.5">{it.fix}</p>
                    <p className="text-[14px] text-white/65 leading-relaxed mt-1">{it.fixText}</p>
                    <Link href={it.href} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--lemon)] mt-3">See how it works <ArrowRight className="w-3.5 h-3.5" /></Link>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="hidden lg:block relative h-[26rem]">
          {items.map((it, i) => (
            <div key={it.fix} aria-hidden={i !== active} className={`absolute inset-0 transition-all duration-700 ease-out ${i === active ? "opacity-100 translate-y-0 scale-100" : `opacity-0 scale-95 pointer-events-none ${i < active ? "-translate-y-8" : "translate-y-8"}`}`}>
              <div className="relative h-full overflow-hidden rounded-[2rem] bg-[#111113] text-white p-10 flex flex-col justify-between">
                <span aria-hidden className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#ff7a45]/35 blur-[90px]" />
                <span aria-hidden className="absolute -bottom-28 -left-10 w-80 h-80 rounded-full bg-[#5fe39a]/30 blur-[90px]" />
                <div className="relative flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--mint)]">With CodeCrest</span>
                  <span className="font-display text-6xl font-semibold text-white/10 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="relative">
                  <p className="font-display font-semibold tracking-tight text-3xl leading-tight">{it.fix}</p>
                  <p className="text-white/65 text-[16px] leading-relaxed mt-4 max-w-md">{it.fixText}</p>
                  <Link href={it.href} tabIndex={i === active ? 0 : -1} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--lemon)] mt-6">
                    See how it works <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
          <div aria-hidden className="absolute -right-5 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            {items.map((_, i) => <span key={i} className={`w-1.5 rounded-full transition-all duration-500 ${i === active ? "h-8 bg-[#111113]" : "h-1.5 bg-[#111113]/20"}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
