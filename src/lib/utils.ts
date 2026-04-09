import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { CustomerSegment, DeliveryStatus, TaskType, TaskStatus, CallOutcome } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMM yyyy"); } catch { return dateStr; }
}

export function formatDateTime(dateStr: string) {
  try { return format(parseISO(dateStr), "d MMM yyyy, h:mm a"); } catch { return dateStr; }
}

export function timeAgo(dateStr: string) {
  try { return formatDistanceToNow(parseISO(dateStr), { addSuffix: true }); } catch { return dateStr; }
}

export function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export const SEGMENT_CONFIG: Record<CustomerSegment, { label: string; color: string; bg: string; dot: string }> = {
  repeat:   { label: "Repeat",   color: "text-emerald-700",  bg: "bg-emerald-50 border-emerald-200",   dot: "bg-emerald-500" },
  one_time: { label: "One-time", color: "text-amber-700",    bg: "bg-amber-50 border-amber-200",       dot: "bg-amber-500" },
  inactive: { label: "Inactive", color: "text-rose-700",     bg: "bg-rose-50 border-rose-200",         dot: "bg-rose-500" },
  risky:    { label: "Risky",    color: "text-orange-700",   bg: "bg-orange-50 border-orange-200",     dot: "bg-orange-500" },
};

export const DELIVERY_CONFIG: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  pending:          { label: "Pending",          color: "text-slate-600",   bg: "bg-slate-100" },
  in_transit:       { label: "In Transit",       color: "text-blue-700",    bg: "bg-blue-50" },
  out_for_delivery: { label: "Out for Delivery", color: "text-violet-700",  bg: "bg-violet-50" },
  delivered:        { label: "Delivered",        color: "text-emerald-700", bg: "bg-emerald-50" },
  rto:              { label: "RTO",              color: "text-rose-700",    bg: "bg-rose-50" },
  failed:           { label: "Failed",           color: "text-red-700",     bg: "bg-red-50" },
};

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; color: string; bg: string; accent: string }> = {
  review:        { label: "Review Call",    color: "text-blue-700",   bg: "bg-blue-50",   accent: "border-l-blue-500" },
  reorder:       { label: "Reorder Call",   color: "text-lime-700",   bg: "bg-lime-50",   accent: "border-l-lime-500" },
  final_followup:{ label: "Final Follow-up",color: "text-violet-700", bg: "bg-violet-50", accent: "border-l-violet-500" },
  recovery:      { label: "Recovery Call",   color: "text-purple-700", bg: "bg-purple-50", accent: "border-l-purple-500" },
};

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "text-slate-600",   bg: "bg-slate-100" },
  due:         { label: "Due Today",   color: "text-amber-700",   bg: "bg-amber-50" },
  done:        { label: "Done",        color: "text-emerald-700", bg: "bg-emerald-50" },
  rescheduled: { label: "Rescheduled", color: "text-blue-700",    bg: "bg-blue-50" },
  skipped:     { label: "Skipped",     color: "text-slate-500",   bg: "bg-slate-50" },
  cancelled:   { label: "Cancelled",   color: "text-rose-700",    bg: "bg-rose-50" },
  overdue:     { label: "Overdue",     color: "text-rose-700",    bg: "bg-rose-50" },
};

export function getTaskProductName(task: any): string {
  const customerMeta = task.customer?.custom_meta;
  const abandonedCart = task.abandoned_cart;
  const order = task.order;

  // 1. Check line items first
  const rawItems = order?.line_items || abandonedCart?.line_items || [];
  const metaItem = rawItems.find((i: any) => i.__metadata);
  const meta = metaItem?.payload || abandonedCart?.custom_meta || order?.custom_meta || customerMeta;

  let items = Array.isArray(rawItems) ? rawItems.filter((i: any) => !i.__metadata) : [];
  
  if (items.length === 0 && meta) {
    if (meta.items || meta.line_items) {
      items = meta.items || meta.line_items;
    } else if (meta.PRODUCTNAME || meta.Product || meta["Product Name"] || meta.item || meta.name) {
      items = [{ name: meta.PRODUCTNAME || meta.Product || meta["Product Name"] || meta.item || meta.name }];
    }
  }

  const nameFromItems = items[0]?.name || items[0]?.title || "";
  if (nameFromItems) return nameFromItems;

  // 2. Check Landing Page URL (Fastrr carts)
  const url = meta?.landing_page_url || 
              meta?.landing_url || 
              meta?.cart_attributes?.landing_page_url ||
              meta?.referrer || 
              customerMeta?.landing_page_url;
  if (url && typeof url === "string") {
    const match = url.match(/\/products\/([^/?#]+)/);
    if (match && match[1]) {
      const slug = match[1];
      return slug
        .replace("cureforever-", "")
        .split("-")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }

  // 3. Check for specific detailed keys in the root or meta
  if (!nameFromItems) {
    const detailedName = data?.item_details?.[0]?.name || data?.checkout_items?.[0]?.name;
    if (detailedName) return detailedName;
  }

  // 4. Last fallback
  if (task.task_type === "recovery") return "Abandoned Items";
  if (task.task_type === "reorder") return "Refill Reminder";
  return "—";
}
