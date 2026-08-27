"use client";
import { useState, useRef, useEffect } from "react";
import { cn, SEGMENT_CONFIG, DELIVERY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_CONFIG, initials } from "@/lib/utils";
import type { CustomerSegment, DeliveryStatus, TaskType, TaskStatus } from "@/types";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info, Sun, Moon, Clock, Truck, Zap, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import Link from "next/link";

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
    "bg-[#eceae4] text-[#1c1c1c]", 
    "bg-[#f7f4ed] border border-[#eceae4] text-[#1c1c1c]"
  ];
  const charCode = name?.charCodeAt(0) || 0;
  const color = colors[charCode % colors.length];
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold flex-shrink-0", sz, color, className)}>
      {initials(name)}
    </div>
  );
}

export function StatCard({ 
  label, value, sub, accent, className, href, trend, trendValue, sparklineData, icon, variant = "default"
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
  const isGradient = variant === "gradient";
  const isGlass = variant === "glass";

  const content = (
    <div className="relative overflow-hidden h-full flex flex-col">
      <div className="flex flex-col gap-2 mb-4 relative z-10">
        <div className="flex items-center justify-between">
          {icon && (
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
              "bg-[#f7f4ed] border border-[#eceae4] text-[#1c1c1c]"
            )}>
              {icon}
            </div>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all duration-500",
              trend === "up" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
              trend === "down" ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-[#f7f4ed] text-[#5f5f5d] border-[#eceae4]"
            )}>
              {trend === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : 
               trend === "down" ? <TrendingDown className="w-2.5 h-2.5" /> : null}
              {trendValue}
            </div>
          )}
        </div>
        <div className={cn(
          "text-[10px] font-black uppercase tracking-[0.15em] opacity-60",
          "text-[#5f5f5d]"
        )}>{label}</div>
      </div>
      
      <div className="flex-1 flex flex-col justify-end relative z-10">
        <div className={cn(
          "font-[900] tracking-tighter leading-none mb-1 font-display transition-all duration-500", 
          String(value).length > 8 ? "text-lg md:text-xl" : "text-2xl md:text-[32px]",
          "text-[#1c1c1c]"
        )}>
          {value}
        </div>
        
        <div className="flex items-center justify-between mt-1">
          {sub && (
            <div className={cn(
              "text-[10px] font-black uppercase tracking-wider opacity-60",
              "text-[#5f5f5d]"
            )}>
              {sub}
            </div>
          )}
          
          {href && (
            <div className={cn(
              "transition-all duration-500",
              "text-[#1c1c1c] opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0"
            )}>
              <ChevronRight className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
      
      {sparklineData && sparklineData.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-16 w-full opacity-20 pointer-events-none transition-opacity duration-500 group-hover:opacity-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={isGradient ? "rgba(255,255,255,0.4)" : accent || "#1c1c1c"} 
                fill={isGradient ? "url(#colorWhite)" : "url(#colorAccent)"} 
                strokeWidth={2} 
                dot={false} 
              />
              <defs>
                <linearGradient id="colorAccent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent || "#1c1c1c"} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={accent || "#1c1c1c"} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorWhite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const containerClasses = cn(
    "card p-6 group transition-all duration-500 relative overflow-hidden",
    "hover:border-[rgba(28,28,28,0.4)]",
    href && "cursor-pointer",
    className
  );

  if (href) {
    return (
      <Link href={href} className={containerClasses}>
        {content}
      </Link>
    );
  }

  return (
    <div className={containerClasses}>
      {content}
    </div>
  );
}

export function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#eceae4] flex items-center justify-center mb-4 text-[#1c1c1c] border border-[#eceae4]">{icon}</div>
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
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1c1c1c]/40 backdrop-blur-[2px] transition-all" onClick={onClose} />
      <div className={cn("relative bg-[#f7f4ed] rounded-xl shadow-2xl w-full animate-slide-up border border-[#eceae4]", maxWidth)}>
        <div className="px-6 py-5 border-b border-[#eceae4] flex items-center justify-between">
          <h3 className="section-title text-sm">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#eceae4] flex items-center justify-center text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">✕</button>
        </div>
        <div className="px-6 py-6 overflow-y-auto max-h-[80vh]">{children}</div>
        {footer && <div className="px-6 py-5 border-t border-[#eceae4] flex items-center justify-end gap-3 bg-[#eceae4]/20 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
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

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-[#f7f4ed] border border-[#eceae4] rounded-lg shadow-xl py-1 animate-slide-up"
        >
          {options.map((o, i) => (
            <div key={o.value}>
              {o.group && o.group !== options[i - 1]?.group && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60">{o.group}</div>
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
                  "w-full text-left px-3 py-2 text-sm text-[#1c1c1c] hover:bg-[#eceae4]/60 transition-colors truncate",
                  o.value === value && "bg-[#eceae4] font-semibold",
                  o.disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                {o.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-10">
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
          {isComplete && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in" />}
          {error && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            error ? "text-rose-500" : isComplete ? "text-emerald-700" : "text-[#5f5f5d]"
          )}>
            {message || (isComplete ? "Sync Complete" : "Synchronizing...")}
          </span>
        </div>
        <span className="text-[10px] font-bold text-[#1c1c1c] tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 w-full bg-[#eceae4] rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full transition-all duration-500 ease-out relative",
            error ? "bg-rose-500" : isComplete ? "bg-emerald-600" : "bg-[#1c1c1c]"
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
      <div className="flex-1 h-3 bg-[#eceae4] rounded-full overflow-hidden">
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
    <div className="flex items-center justify-between py-6 mt-6 border-t border-[#eceae4]/60">
      <p className="text-[10px] font-black text-[#5f5f5d] uppercase tracking-[0.2em] opacity-40">
        Showing <span className="text-[#1c1c1c]">{(current - 1) * pageSize + 1}</span> to <span className="text-[#1c1c1c]">{Math.min(current * pageSize, total)}</span> of <span className="text-[#1c1c1c]">{total}</span> entries
      </p>
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onChange(Math.max(1, current - 1))}
          disabled={current === 1}
          className="w-9 h-9 flex items-center justify-center bg-[#f7f4ed] border border-[#eceae4] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-95"
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
                    <button onClick={() => onChange(1)} className="w-9 h-9 rounded-xl text-[10px] font-black bg-[#f7f4ed] text-[#5f5f5d] border border-[#eceae4] hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm">1</button>
                    {startPage > 2 && <span className="text-[#5f5f5d] px-1 text-[10px] font-black opacity-30">...</span>}
                  </>
                )}
                {pages.map(p => (
                  <button
                    key={p}
                    onClick={() => onChange(p)}
                    className={cn(
                      "w-9 h-9 rounded-xl text-[10px] font-black transition-all shadow-sm",
                      current === p ? "bg-[#1c1c1c] text-white ring-4 ring-[#1c1c1c]/10" : "bg-[#f7f4ed] text-[#5f5f5d] border border-[#eceae4] hover:border-[#1c1c1c] hover:text-[#1c1c1c]"
                    )}
                  >
                    {p}
                  </button>
                ))}
                {endPage < totalPages && (
                  <>
                    {endPage < totalPages - 1 && <span className="text-[#5f5f5d] px-1 text-[10px] font-black opacity-30">...</span>}
                    <button onClick={() => onChange(totalPages)} className="w-9 h-9 rounded-xl text-[10px] font-black bg-[#f7f4ed] text-[#5f5f5d] border border-[#eceae4] hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm">{totalPages}</button>
                  </>
                )}
              </>
            );
          })()}
        </div>

        <button 
          onClick={() => onChange(Math.min(totalPages, current + 1))}
          disabled={current === totalPages}
          className="w-9 h-9 flex items-center justify-center bg-[#f7f4ed] border border-[#eceae4] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white disabled:opacity-20 transition-all shadow-sm active:scale-95"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
