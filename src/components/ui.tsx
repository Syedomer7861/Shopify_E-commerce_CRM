"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cn, SEGMENT_CONFIG, DELIVERY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_CONFIG, initials } from "@/lib/utils";
import type { CustomerSegment, DeliveryStatus, TaskType, TaskStatus } from "@/types";
import { Download, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info, Sun, Moon, Clock, Truck, Zap, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Tile, type Tone } from "@/components/dashboard/Tiles";


export function SegmentBadge({ segment, rto }: { segment: CustomerSegment; rto?: boolean }) {
  if (rto) return <span className="badge bg-amber-50 border-amber-200 text-amber-700">⚠ RTO</span>;
  const c = SEGMENT_CONFIG[segment];
  return <span className={cn("badge", c.bg, c.color)}>{c.label}</span>;
}

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const c = DELIVERY_CONFIG[status];
  const Icon = {
    pending: Clock,
    in_transit: Truck,
    out_for_delivery: Zap,
    delivered: CheckCircle2,
    rto: AlertTriangle,
    failed: Info
  }[status] || Info;

  return (
    <span className={cn("badge border-transparent flex gap-1.5 items-center px-2 py-0.5 whitespace-nowrap", c.bg, c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// Reads the RTO risk our own engine computed at order-create time
// (src/lib/risk-engine.ts, stored as order.custom_meta.risk_analysis).
// LOW isn't worth a badge - only flag what an agent should act on.
const RISK_CONFIG: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "bg-rose-50 border-rose-200", color: "text-rose-600" },
  HIGH: { bg: "bg-rose-50 border-rose-100", color: "text-rose-600" },
  MEDIUM: { bg: "bg-amber-50 border-amber-100", color: "text-amber-600" },
};

export function RiskBadge({ level }: { level?: string }) {
  const c = level ? RISK_CONFIG[level] : undefined;
  if (!c) return null;
  return (
    <span
      title="RTO risk (order-create prediction)"
      className={cn("badge flex gap-1 items-center px-1.5 py-0.5 whitespace-nowrap", c.bg, c.color)}
    >
      <AlertTriangle className="w-3 h-3" />
      {level}
    </span>
  );
}

export function TaskTypeBadge({ type }: { type: TaskType }) {
  const c = TASK_TYPE_CONFIG[type];
  return <span className={cn("badge border-transparent", c.bg, c.color)}>{c.label}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const c = TASK_STATUS_CONFIG[status];
  return <span className={cn("badge border-transparent", c.bg, c.color)}>{c.label}</span>;
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sz = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-12 h-12 text-sm" }[size];
  const colors = [
    "bg-[#ebece6] text-[#1c1c1c]", 
    "bg-[#f6f7f2] border border-[#ebece6] text-[#1c1c1c]"
  ];
  const charCode = name?.charCodeAt(0) || 0;
  const color = colors[charCode % colors.length];
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold flex-shrink-0", sz, color, className)}>
      {initials(name)}
    </div>
  );
}

/** Legacy stat card API, drawn as the dashboard Tile so every page shares one look. */
export function StatCard({
  label, value, sub, accent, className, href, trend, trendValue, sparklineData, icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  className?: string;
  href?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string | number;
  sparklineData?: { value: number }[];
  icon?: React.ReactNode;
  variant?: "default" | "glass" | "gradient";
}) {
  const tone: Tone = accent?.includes("rose") || accent?.includes("red") ? "coral" : accent?.includes("amber") ? "amber" : accent?.includes("emerald") || accent?.includes("green") ? "mint" : "lime";
  return (
    <Tile icon={icon ?? <BarChart3 className="w-4 h-4" />} label={label} value={value} sub={sub} href={href} tone={tone} className={cn("h-full", className)}
      trend={trend && trendValue != null && trendValue !== "" ? { text: String(trendValue), dir: trend === "neutral" ? "flat" : trend } : null}
      spark={sparklineData?.map(d => d.value) ?? null} />
  );
}

export function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-[#e6f5a6] flex items-center justify-center mb-4 text-[#1c1c1c]">{icon}</div>
      <div className="text-sm font-bold text-[#1c1c1c]">{title}</div>
      {desc && <div className="text-xs text-[#5f5f5d] mt-1.5 max-w-[240px] leading-relaxed">{desc}</div>}
    </div>
  );
}

export function AccessDenied({ title = "Access Restricted", desc = "You do not have permission to view this section." }: { title?: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4 text-rose-500 border border-rose-100">
        <Info className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold text-[#1c1c1c]">{title}</div>
      <div className="text-xs text-[#5f5f5d] mt-1.5 max-w-[280px] leading-relaxed">{desc}</div>
    </div>
  );
}

export function Modal({ 
  open, onClose, title, children, footer, maxWidth = "max-w-xl" 
}: {
  open: boolean; 
  onClose: () => void; 
  title: React.ReactNode;
  children: React.ReactNode; 
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  // Escape closes; the page behind stops scrolling while the dialog is open.
  const closeRef = useRef(onClose);
  const boxRef = useRef<HTMLDivElement>(null);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    // Only the top-most dialog closes, so Escape on a confirm box leaves the pop-up under it open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (all[all.length - 1] === boxRef.current) closeRef.current();
    };
    // The app scrolls inside <main>, not <body>, so lock both.
    const els = [document.body, document.getElementById("main-application-content")].filter((el): el is HTMLElement => !!el);
    const prev = els.map(el => el.style.overflow);
    els.forEach(el => { el.style.overflow = "hidden"; });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); els.forEach((el, i) => { el.style.overflow = prev[i]; }); };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={boxRef} role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#1c1c1c]/40 backdrop-blur-[2px] transition-all" onClick={onClose} />
      <div className={cn("relative bg-white rounded-t-[22px] sm:rounded-[22px] shadow-2xl w-full animate-slide-up border border-[#ebece6] flex flex-col max-h-[92dvh] sm:max-h-[90dvh]", maxWidth)}>
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-[#f0f0ec] flex items-center justify-between gap-3 shrink-0">
          <h3 className="section-title text-sm min-w-0">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 shrink-0 rounded-full hover:bg-[#e6f5a6] flex items-center justify-center text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">✕</button>
        </div>
        <div className="px-5 sm:px-6 py-5 sm:py-6 overflow-y-auto min-h-0 flex-1 overscroll-contain">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 sm:py-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5 border-t border-[#f0f0ec] flex flex-wrap items-center justify-end gap-3 bg-[#fafaf7] sm:rounded-b-[22px] shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Fixed-position style for a dropdown list anchored to `anchor`. The list is
 * portalled to <body>, so a modal's scroll area or a table's overflow can't
 * clip it; it opens upward when there's no room below. Follows scrolling.
 */
export function useAnchoredList(open: boolean, anchor: React.RefObject<HTMLElement | null>): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) { setStyle(null); return; }
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 260 && r.top > below;
      setStyle({
        position: "fixed", left: r.left, width: r.width, zIndex: 80,
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        maxHeight: Math.max(140, Math.min(260, (up ? r.top : below) - 12)),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, anchor]);
  return style;
}

/**
 * Custom-styled dropdown replacing the native <select> - the CLOSED
 * trigger of a native select is stylable with CSS, but the OPEN options
 * list is rendered by the OS/browser itself and can't be restyled by any
 * CSS in most browsers (confirmed live: a plain unstyled white popup even
 * inside an otherwise fully-themed dark bulk-action bar). This renders
 * both states itself, so it's consistent everywhere it's used.
 *
 * triggerClassName lets each call site keep its own current closed-state
 * look (light form select, dark bulk-bar select, etc.) - only the open
 * list is unified.
 */
export function Select({
  value, onChange, options, placeholder = "Select...", className, triggerClassName, disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  // Optional `group` renders a non-interactive header whenever it changes
  // from the previous option - replaces <optgroup> for the one caller that
  // used it (TaskCard's disposition select).
  options: { value: string; label: string; disabled?: boolean; group?: string }[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listStyle = useAnchoredList(open, ref);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "select flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClassName
        )}
      >
        <span className={cn("truncate", !selected && "opacity-60")}>{selected?.label || placeholder}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && listStyle && createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={listStyle}
          className="overflow-y-auto bg-[#f6f7f2] border border-[#ebece6] rounded-lg shadow-xl py-1"
        >
          {options.map((o, i) => (
            <div key={o.value}>
              {o.group && o.group !== options[i - 1]?.group && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#5f5f5d]/60">{o.group}</div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm text-[#1c1c1c] hover:bg-[#ebece6]/60 transition-colors truncate",
                  o.value === value && "bg-[#ebece6] font-semibold",
                  o.disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                {o.label}
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 rise">
      <div className="flex flex-col gap-2">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:gap-3 pt-2 md:pt-0">{actions}</div>}
    </div>
  );
}

export function SyncProgressBar({ 
  progress, 
  message, 
  isComplete,
  error
}: { 
  progress: number; 
  message: string; 
  isComplete?: boolean;
  error?: string | null;
}) {
  return (
    <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isComplete && !error && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1c1c1c]" />}
          {isComplete && <CheckCircle className="w-3.5 h-3.5 text-[#3fa877] animate-in zoom-in" />}
          {error && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            error ? "text-rose-500" : isComplete ? "text-[#2f8a5f]" : "text-[#5f5f5d]"
          )}>
            {message || (isComplete ? "Sync Complete" : "Synchronizing...")}
          </span>
        </div>
        <span className="text-[10px] font-bold text-[#1c1c1c] tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 w-full bg-[#ebece6] rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full transition-all duration-500 ease-out relative",
            error ? "bg-rose-500" : isComplete ? "bg-[#3fa877]" : "bg-[#1c1c1c]"
          )}
          style={{ width: `${progress}%` }}
        >
          {!isComplete && !error && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
    </div>
  );
}

const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);

const AlertCircle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title text-sm mb-4 flex items-center gap-2">{children}</h2>;
}

export function BarRow({ label, value, max, color = "bg-[#1c1c1c]", suffix = "" }: { label: string; value: number; max: number; color?: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 text-[10px] text-[#5f5f5d] text-right flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 h-3 bg-[#ebece6] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 text-[10px] font-bold text-[#1c1c1c] text-right flex-shrink-0">{Math.round(value).toLocaleString()}{suffix}</div>
    </div>
  );
}

export function Pagination({ 
  current, 
  total, 
  pageSize, 
  onChange 
}: { 
  current: number; 
  total: number; 
  pageSize: number; 
  onChange: (page: number) => void; 
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between py-6 mt-6 border-t border-[#ebece6]/60">
      <p className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-[0.2em] opacity-40">
        Showing <span className="text-[#1c1c1c]">{(current - 1) * pageSize + 1}</span> to <span className="text-[#1c1c1c]">{Math.min(current * pageSize, total)}</span> of <span className="text-[#1c1c1c]">{total}</span> entries
      </p>
      <div className="flex items-center gap-2">
        <button aria-label="Previous" 
          onClick={() => onChange(Math.max(1, current - 1))}
          disabled={current === 1}
          className="w-9 h-9 flex items-center justify-center bg-[#f6f7f2] border border-[#ebece6] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <div className="flex items-center gap-1.5 px-2">
          {(() => {
            const maxButtons = 5;
            let startPage = Math.max(1, current - Math.floor(maxButtons / 2));
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            
            if (endPage - startPage + 1 < maxButtons) {
              startPage = Math.max(1, endPage - maxButtons + 1);
            }

            const pages = [];
            for (let i = startPage; i <= endPage; i++) {
              pages.push(i);
            }

            return (
              <>
                {startPage > 1 && (
                  <>
                    <button onClick={() => onChange(1)} className="w-9 h-9 rounded-xl text-[10px] font-bold bg-[#f6f7f2] text-[#5f5f5d] border border-[#ebece6] hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm">1</button>
                    {startPage > 2 && <span className="text-[#5f5f5d] px-1 text-[10px] font-bold opacity-30">...</span>}
                  </>
                )}
                {pages.map(p => (
                  <button
                    key={p}
                    onClick={() => onChange(p)}
                    className={cn(
                      "w-9 h-9 rounded-xl text-[10px] font-bold transition-all shadow-sm",
                      current === p ? "bg-[#1c1c1c] text-white ring-4 ring-[#1c1c1c]/10" : "bg-[#f6f7f2] text-[#5f5f5d] border border-[#ebece6] hover:border-[#1c1c1c] hover:text-[#1c1c1c]"
                    )}
                  >
                    {p}
                  </button>
                ))}
                {endPage < totalPages && (
                  <>
                    {endPage < totalPages - 1 && <span className="text-[#5f5f5d] px-1 text-[10px] font-bold opacity-30">...</span>}
                    <button onClick={() => onChange(totalPages)} className="w-9 h-9 rounded-xl text-[10px] font-bold bg-[#f6f7f2] text-[#5f5f5d] border border-[#ebece6] hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm">{totalPages}</button>
                  </>
                )}
              </>
            );
          })()}
        </div>

        <button aria-label="Next" 
          onClick={() => onChange(Math.min(totalPages, current + 1))}
          disabled={current === totalPages}
          className="w-9 h-9 flex items-center justify-center bg-[#f6f7f2] border border-[#ebece6] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
