"use client";
import { cn, SEGMENT_CONFIG, DELIVERY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_CONFIG, initials } from "@/lib/utils";
import type { CustomerSegment, DeliveryStatus, TaskType, TaskStatus } from "@/types";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info, Sun, Moon } from "lucide-react";

export function SegmentBadge({ segment, rto }: { segment: CustomerSegment; rto?: boolean }) {
  if (rto) return <span className="badge bg-orange-50 border-orange-200 text-orange-700 animate-in fade-in zoom-in duration-300">⚠ RTO</span>;
  const c = SEGMENT_CONFIG[segment];
  return <span className={cn("badge animate-in fade-in zoom-in duration-300", c.bg, c.color)}>{c.label}</span>;
}

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const c = DELIVERY_CONFIG[status];
  return <span className={cn("badge border-transparent", c.bg, c.color)}>{c.label}</span>;
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
  const colors = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold flex-shrink-0", sz, color)}>
      {initials(name)}
    </div>
  );
}

export function StatCard({ label, value, sub, accent, className }: { label: string; value: string | number; sub?: string; accent?: string; className?: string }) {
  return (
    <div className={cn("stat-card", className)}>
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className={cn("text-2xl font-bold font-display", accent || "text-forest")}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3 text-gray-400">{icon}</div>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      {desc && <div className="text-xs text-gray-400 mt-1 max-w-[200px]">{desc}</div>}
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-white rounded-2xl shadow-2xl w-full animate-slide-up", maxWidth)}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-forest uppercase tracking-tight text-sm">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto max-h-[80vh]">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
