"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, useScroll, useSpring, useTransform } from "motion/react";
import * as m from "motion/react-m";
import type { VisualKind } from "@/content";
import Visual from "./Visual";

// Motion layer for the public site. Everything animated lives here so the
// pages themselves stay server components. LazyMotion keeps the bundle to the
// DOM-animation feature set; reducedMotion="user" honours the OS setting.
// Elements that start hidden carry data-reveal: SiteShell's <noscript> style
// forces them visible when JavaScript is off.

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Fade + rise when scrolled into view (once). */
export function Reveal({ children, className, delay = 0, y = 28 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <m.div data-reveal className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }} transition={{ duration: 0.7, delay, ease: EASE }}>
      {children}
    </m.div>
  );
}

/** Grid/list whose children (StaggerItem) reveal one after another. */
export function Stagger({ children, className, gap = 0.07 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <m.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div data-reveal className={className}
      variants={{ hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } }}>
      {children}
    </m.div>
  );
}

/** Headline that rises in word by word on load. The text stays one readable string for crawlers. */
export function WordsIn({ text, accent, className }: { text: string; accent?: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
          <m.span data-reveal className={`inline-block ${accent && accent.split(" ").includes(w.replace(/[.,]/g, "")) ? "text-emerald-400" : ""}`}
            initial={{ y: "110%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.75, delay: 0.08 + i * 0.045, ease: EASE }}>
            {w}{i < words.length - 1 ? " " : ""}
          </m.span>
        </span>
      ))}
    </span>
  );
}

/** Hero media: starts tilted back and flattens as the page scrolls. */
export function TiltIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.25"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const rotateX = useTransform(p, [0, 1], [16, 0]);
  const scale = useTransform(p, [0, 1], [0.92, 1]);
  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <m.div style={{ rotateX, scale, transformOrigin: "50% 0%" }}>{children}</m.div>
    </div>
  );
}

/** Drifts its children vertically against the scroll for depth. */
export function Parallax({ children, className, amount = 40 }: { children: React.ReactNode; className?: string; amount?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return <div ref={ref} className={className}><m.div style={{ y }}>{children}</m.div></div>;
}

/** Gentle endless float for decorative cards. */
export function Float({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <m.div className={className} animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay }}>
      {children}
    </m.div>
  );
}

/** Thin reading-progress bar pinned under the header. */
export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  return <m.div aria-hidden className="fixed top-16 inset-x-0 h-0.5 bg-emerald-500 origin-left z-40" style={{ scaleX }} />;
}

export type ShowcaseItem = { eyebrow: string; title: string; text: string; bullets: string[]; href: string; visual: VisualKind };

/**
 * Product tour: the list on the left drives the animated screen on the right.
 * Every item's copy is always in the DOM (collapsed, not removed) so it is
 * indexable; only the illustration swaps.
 */
export function Showcase({ items }: { items: ShowcaseItem[] }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((a) => (a + 1) % items.length), 5200);
    return () => clearInterval(t);
  }, [auto, items.length]);

  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-16 items-center" onMouseEnter={() => setAuto(false)}>
      <div className="space-y-3">
        {items.map((s, i) => {
          const on = i === active;
          return (
            <div key={s.title} className={`relative rounded-2xl border transition-colors duration-300 ${on ? "border-[#1c1c1c]/15 bg-white shadow-xl shadow-black/5" : "border-transparent hover:bg-white/60"}`}>
              {on && auto && <m.span key={active} aria-hidden className="absolute left-0 top-0 h-0.5 bg-emerald-500 rounded-full" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 5.2, ease: "linear" }} />}
              <button type="button" aria-expanded={on} onClick={() => { setActive(i); setAuto(false); }} className="w-full text-left px-5 pt-5 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">{s.eyebrow}</span>
                <h3 className="font-display font-semibold tracking-tight text-xl md:text-2xl leading-snug mt-1.5">{s.title}</h3>
              </button>
              <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-2">
                    <p className="text-[#5f5f5d] text-[15px] leading-relaxed">{s.text}</p>
                    <ul className="mt-4 space-y-2">
                      {s.bullets.map((b) => <li key={b} className="flex items-start gap-2.5 text-[14.5px]"><Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />{b}</li>)}
                    </ul>
                    <Link href={s.href} tabIndex={on ? 0 : -1} className="inline-flex items-center gap-1.5 text-sm font-semibold mt-5 group">
                      Learn more <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              </div>
              {!on && <div className="h-4" />}
            </div>
          );
        })}
      </div>
      <div className="relative min-h-[22rem]">
        <AnimatePresence mode="wait">
          <m.div key={active} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ duration: 0.45, ease: EASE }}>
            <Visual kind={items[active].visual} />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
