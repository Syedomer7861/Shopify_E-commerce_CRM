"use client";
import { cn, SEGMENT_CONFIG, DELIVERY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_CONFIG, initials } from "@/lib/utils";
import type { CustomerSegment, DeliveryStatus, TaskType, TaskStatus } from "@/types";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info, Sun, Moon, Clock, Truck, Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

export function SegmentBadge({ segment, rto }: { segment: CustomerSegment; rto?: boolean }) {
  if (rto) return <span className="badge bg-orange-50 border-orange-200 text-orange-700 animate-in fade-in zoom-in duration-300">⚠ RTO</span>;
  const c = SEGMENT_CONFIG[segment];
  return <span className={cn("badge animate-in fade-in zoom-in duration-300", c.bg, c.color)}>{c.label}</span>;
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

export function TaskTypeBadge({ type }: { type: TaskType }) {
  const c = TASK_TYPE_CONFIG[type];
  return <span className={cn("badge border-transparent", c.bg, c.color)}>{c.label}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const c = TASK_STATUS_CONFIG[status];
  return <span className={cn("badge border-transparent", c.bg, c.color)}>{c.label}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-12 h-12 text-sm" }[size];
  const colors = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700"];
  const charCode = name?.charCodeAt(0) || 0;
  const color = colors[charCode % colors.length];
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold flex-shrink-0", sz, color)}>
      {initials(name)}
    </div>
  );
}

import Link from "next/link";

export function StatCard({ 
  label, value, sub, accent, className, href, trend, trendValue, sparklineData 
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
}) {
  const content = (
    <div className="relative overflow-hidden h-full">
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">{label}</div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm",
            trend === "up" ? "bg-blue-50 text-[#2D1E6F] border-[#2D1E6F]/20" : 
            trend === "down" ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-gray-50 text-gray-500 border-gray-100"
          )}>
            {trend === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : 
             trend === "down" ? <TrendingDown className="w-2.5 h-2.5" /> : null}
            {trendValue}
          </div>
        )}
      </div>
      <div className={cn("relative flex items-end justify-between z-10", trend ? "mt-3" : "mt-2")}>
        <div className="flex flex-col">
          <div className={cn("text-3xl font-bold tracking-tight leading-none mb-1.5", accent || "text-[#2D1E6F]")}>{value}</div>
          {sub && <div className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", accent ? accent.replace('text-', 'bg-') : "bg-[#2D1E6F]/20")} />
            {sub}
          </div>}
        </div>
        
        {sparklineData && sparklineData.length > 0 && (
          <div className="h-10 w-24 opacity-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={trend === "down" ? "#ef4444" : "#2D1E6F"} 
                  fill={trend === "down" ? "url(#colorRose)" : "url(#colorBlue)"} 
                  strokeWidth={2} 
                  dot={false} 
                />
                <defs>
                  <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2D1E6F" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2D1E6F" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );

  const containerClasses = cn(
    "card p-6 group transition-all duration-300 relative",
    href && "hover:border-[#2D1E6F]/30 hover:shadow-md cursor-pointer",
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
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4 text-gray-400 border border-gray-100">{icon}</div>
      <div className="text-sm font-bold text-gray-900">{title}</div>
      {desc && <div className="text-xs text-gray-500 mt-1.5 max-w-[240px] leading-relaxed">{desc}</div>}
    </div>
  );
}

export function AccessDenied({ title = "Access Restricted", desc = "You do not have permission to view this section." }: { title?: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4 text-rose-500 border border-rose-100">
        <Info className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500 mt-1.5 max-w-[280px] leading-relaxed">{desc}</div>
    </div>
  );
}

export function Modal({ 
  open, onClose, title, children, footer, maxWidth = "max-w-md" 
}: {
  open: boolean; 
  onClose: () => void; 
  title: string;
  children: React.ReactNode; 
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#2D1E6F]/20 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-white rounded-xl shadow-2xl w-full animate-slide-up border border-gray-100", maxWidth)}>
        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 uppercase tracking-wider text-xs">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <div className="px-6 py-6 overflow-y-auto max-h-[80vh]">{children}</div>
        {footer && <div className="px-6 py-5 border-t border-gray-50 flex items-center justify-end gap-3 bg-gray-50/30 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
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
          {!isComplete && !error && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2D1E6F]" />}
          {isComplete && <CheckCircle className="w-3.5 h-3.5 text-blue-600 animate-in zoom-in" />}
          {error && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
          <span className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            error ? "text-rose-500" : isComplete ? "text-blue-700" : "text-gray-500"
          )}>
            {message || (isComplete ? "Sync Complete" : "Synchronizing...")}
          </span>
        </div>
        <span className="text-[11px] font-bold text-[#2D1E6F] tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
        <div 
          className={cn(
            "h-full transition-all duration-500 ease-out relative",
            error ? "bg-rose-500" : isComplete ? "bg-blue-600" : "bg-[#2D1E6F]"
          )}
          style={{ width: `${progress}%` }}
        >
          {!isComplete && !error && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
      {!isComplete && !error && (
        <div className="mt-1.5 text-[9px] text-gray-400 font-medium italic text-right">
          Estimated: {Math.max(1, Math.round((100 - progress) / 5))}s remaining
        </div>
      )}
    </div>
  );
}

const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);

const AlertCircle = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);
