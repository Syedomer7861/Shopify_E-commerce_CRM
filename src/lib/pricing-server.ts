import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { publicPlans, type PublicPlan } from "@/lib/billing-server";

export type PricingPlan = PublicPlan & { highlights: string[]; featured: boolean; maxUsers: number | null };
export type CompareRow = { label: string; hint?: string; cells: Record<string, string> }; // plan code -> 'yes' | 'no' | text
export type CompareSection = { title: string; rows: CompareRow[] };

/**
 * Everything the public pricing page shows, all owner-controlled:
 * plans and prices (Super Admin > Plans), card text and comparison rows
 * (Super Admin > Pricing), and which modules each plan includes
 * (Super Admin > Modules, the same list that gates paying workspaces).
 * Optional parts fall back to empty, so a missing column or table never
 * breaks the page.
 */
export const seatsLabel = (n: number | null) => (n == null ? "Unlimited" : `Up to ${n}`);

export async function loadPricing(): Promise<{ plans: PricingPlan[]; sections: CompareSection[] }> {
  const base = await publicPlans().catch(() => [] as PublicPlan[]);
  if (base.length === 0) return { plans: [], sections: [] };
  const admin = createAdminClient();
  const codes = base.map((p) => p.code);

  const [extra, modules, planModules, rows] = await Promise.all([
    admin.from("subscription_plans").select("id, code, highlights, is_featured, max_users").in("code", codes),
    admin.from("platform_modules").select("key, name, description").eq("is_available", true).order("sort_order"),
    admin.from("plan_modules").select("plan_id, module_key"),
    admin.from("platform_pricing_rows").select("section, label, plan_values").order("sort_order").order("label"),
  ]);

  const byCode = new Map(((extra.data || []) as { id: string; code: string; highlights?: string[]; is_featured?: boolean; max_users?: number | null }[]).map((r) => [r.code, r]));
  const plans = base.map((p) => ({ ...p, highlights: byCode.get(p.code)?.highlights ?? [], featured: !!byCode.get(p.code)?.is_featured, maxUsers: byCode.get(p.code)?.max_users ?? null }));

  // Seats come from the same column the database enforces (max_users).
  const sections: CompareSection[] = [{ title: "Plan details", rows: [{ label: "Team members", cells: Object.fromEntries(plans.map((p) => [p.code, seatsLabel(p.maxUsers)])) }] }];
  const mods = (modules.data || []) as { key: string; name: string; description: string }[];
  if (mods.length) {
    const pm = (planModules.data || []) as { plan_id: string; module_key: string }[];
    // A plan with no module rows includes every module (same rule as the database).
    const includes = (code: string, key: string) => {
      const id = byCode.get(code)?.id;
      const own = pm.filter((r) => r.plan_id === id);
      return own.length === 0 || own.some((r) => r.module_key === key);
    };
    sections.push({
      title: "Modules",
      rows: mods.map((m) => ({ label: m.name, hint: m.description, cells: Object.fromEntries(codes.map((c) => [c, includes(c, m.key) ? "yes" : "no"])) })),
    });
  }

  for (const r of (rows.data || []) as { section: string; label: string; plan_values: Record<string, string> }[]) {
    let s = sections.find((x) => x.title === r.section);
    if (!s) { s = { title: r.section, rows: [] }; sections.push(s); }
    s.rows.push({ label: r.label, cells: r.plan_values || {} });
  }
  return { plans, sections };
}
