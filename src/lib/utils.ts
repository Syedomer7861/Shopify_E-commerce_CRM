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
  if (!name) return "U";
  return name.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function toDbDateString(date: Date | string) {
  try {
    return format(typeof date === "string" ? parseISO(date) : date, "yyyy-MM-dd");
  } catch {
    return typeof date === "string" ? date : format(new Date(), "yyyy-MM-dd");
  }
}

export const SEGMENT_CONFIG: Record<CustomerSegment, { label: string; color: string; bg: string; dot: string }> = {
  repeat:         { label: "Repeat",         color: "text-[#1c1c1c]",  bg: "bg-[#eceae4] border-[#eceae4]",   dot: "bg-[#1c1c1c]" },
  one_time:       { label: "One-time",       color: "text-[#1c1c1c]",  bg: "bg-[#eceae4] border-[#eceae4]",   dot: "bg-[#1c1c1c]" },
  inactive:       { label: "Inactive",       color: "text-[#5f5f5d]",  bg: "bg-[#fcfbf8] border-[#eceae4]",   dot: "bg-[#5f5f5d]" },
  risky:          { label: "Risky",          color: "text-rose-700",   bg: "bg-rose-50 border-rose-100",      dot: "bg-rose-500" },
  whale:          { label: "VVIP Whale 👑",  color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",    dot: "bg-amber-500" },
  loyalist:       { label: "Loyalist ⭐",    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",      dot: "bg-blue-500" },
  bargain_hunter: { label: "Deal Hunter 🏷️", color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  risky_returner: { label: "Risky Returner ⚠️", color: "text-rose-800",  bg: "bg-rose-100 border-rose-300",     dot: "bg-rose-600" },
};

export const DELIVERY_CONFIG: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  pending:          { label: "Pending",          color: "text-[#5f5f5d]",   bg: "bg-[#fcfbf8]" },
  in_transit:       { label: "In Transit",       color: "text-[#1c1c1c]",    bg: "bg-[#eceae4]" },
  out_for_delivery: { label: "Out for Delivery", color: "text-[#1c1c1c]",  bg: "bg-[#eceae4]/60" },
  delivered:        { label: "Delivered",        color: "text-[#1c1c1c]", bg: "bg-[#eceae4]" },
  rto:              { label: "RTO",              color: "text-rose-700",    bg: "bg-rose-50" },
  failed:           { label: "Failed",           color: "text-red-700",     bg: "bg-red-50" },
};

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; color: string; bg: string; accent: string }> = {
  review:        { label: "Review Call",    color: "text-[#1c1c1c]",   bg: "bg-[#1c1c1c]/5",   accent: "border-l-[#1c1c1c]" },
  reorder:       { label: "Reorder Call",   color: "text-[#1c1c1c]",   bg: "bg-[#1c1c1c]/5",   accent: "border-l-[#1c1c1c]" },
  final_followup:{ label: "Final Follow-up",color: "text-[#5f5f5d]",    bg: "bg-[#fcfbf8]",       accent: "border-l-[#5f5f5d]" },
  recovery:      { label: "Recovery Call",   color: "text-[#1c1c1c]",   bg: "bg-[#1c1c1c]/5",   accent: "border-l-[#1c1c1c]" },
  issue_resolution:{ label: "Issue Resolution", color: "text-rose-700", bg: "bg-rose-50",     accent: "border-l-rose-500" },
  transit_update: { label: "Transit Inform", color: "text-[#1c1c1c]",    bg: "bg-[#eceae4]",       accent: "border-l-[#1c1c1c]" },
  ndr:            { label: "NDR Resolution", color: "text-amber-700", bg: "bg-amber-50",     accent: "border-l-amber-500" },
  cod_verify:     { label: "COD Verify",     color: "text-[#1c1c1c]",    bg: "bg-[#1c1c1c]/5",   accent: "border-l-[#1c1c1c]" },
  manager_audit:  { label: "Manager Audit",  color: "text-indigo-700", bg: "bg-indigo-50",     accent: "border-l-indigo-500" },
};

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "text-[#5f5f5d]",   bg: "bg-[#fcfbf8]" },
  due:         { label: "Due Today",   color: "text-amber-700",   bg: "bg-amber-50" },
  done:        { label: "Done",        color: "text-[#1c1c1c]", bg: "bg-[#eceae4]" },
  rescheduled: { label: "Rescheduled", color: "text-[#1c1c1c]",    bg: "bg-[#1c1c1c]/5" },
  skipped:     { label: "Skipped",     color: "text-[#5f5f5d]",    bg: "bg-[#fcfbf8]" },
  cancelled:   { label: "Cancelled",   color: "text-[#5f5f5d]",    bg: "bg-[#fcfbf8]" },
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
    const detailedName = meta?.item_details?.[0]?.name || meta?.checkout_items?.[0]?.name;
    if (detailedName) return detailedName;
  }

  // 4. Last fallback
  if (task.task_type === "recovery") return "Abandoned Items";
  if (task.task_type === "transit_update") return "Shipping Update";
  if (task.task_type === "issue_resolution") return "Delivery Issue";
  if (task.task_type === "reorder") return "Refill Reminder";
  return "—";
}

export function isPhoneMasked(phone: string): boolean {
  if (!phone) return true;
  const p = phone.toString().toLowerCase();
  return p.includes("x") || p.includes("_sr_") || p.length < 7;
}

export function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  if (!text) return "neutral";
  const positive = ["happy", "satisfied", "great", "excellent", "love", "good", "purchased", "ordered", "bought", "confirmed", "satisfied"];
  const negative = ["angry", "upset", "frustrated", "bad", "terrible", "expensive", "rude", "refused", "rejected", "cancel", "rto"];
  
  const lower = text.toLowerCase();
  let score = 0;
  positive.forEach(word => { if (lower.includes(word)) score++; });
  negative.forEach(word => { if (lower.includes(word)) score--; });
  
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}
