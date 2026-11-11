import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePrivileged } from "@/lib/auth-utils";
import { notifyAdmin } from "@/lib/notifications-server";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
export const maxDuration = 60;

// Supabase Free plan walls. Egress (5 GB/mo) is a platform metric with no
// SQL surface, so DB size + per-table growth is the proxy: the table that
// balloons is almost always the one burning egress too.
const MB = 1024 * 1024;
const DB_SOFT_LIMIT = 500 * MB;      // Free-plan database ceiling
const DB_WARN_AT = 0.8 * DB_SOFT_LIMIT;
const TABLE_WARN = 80 * MB;          // any single table this big is worth a look
const TABLE_JUMP_WARN = 20 * MB;     // growth since the previous snapshot
const SNAPSHOT_RETENTION_DAYS = 120;

type TableSize = { name: string; bytes: number };

const fmt = (b: number) => `${(b / MB).toFixed(1)} MB`;

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivileged(req, ["manage_automations"]);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    const { data: stats, error: rpcErr } = await supabase.rpc("db_size_stats");
    if (rpcErr) throw rpcErr;

    const dbBytes: number = Number(stats?.db_bytes ?? 0);
    const tables: TableSize[] = (stats?.tables ?? []).map((t: any) => ({
      name: String(t.name),
      bytes: Number(t.bytes),
    }));

    // Previous snapshot for the delta (before we insert this one).
    const { data: prevRows } = await supabase
      .from("egress_watch")
      .select("captured_at, db_bytes, table_sizes")
      .order("captured_at", { ascending: false })
      .limit(1);
    const prev = prevRows?.[0];

    const alerts: string[] = [];

    if (dbBytes >= DB_WARN_AT) {
      alerts.push(
        `DB is ${fmt(dbBytes)} — ${((dbBytes / DB_SOFT_LIMIT) * 100).toFixed(0)}% of the ${fmt(DB_SOFT_LIMIT)} Free-plan limit.`
      );
    }

    if (prev) {
      const days = Math.max(
        0.5,
        (Date.now() - new Date(prev.captured_at).getTime()) / 86_400_000
      );
      const perDay = (dbBytes - Number(prev.db_bytes)) / days;
      const projected = dbBytes + perDay * 30;
      if (perDay > 0 && projected > DB_SOFT_LIMIT) {
        alerts.push(
          `DB growing ~${fmt(perDay)}/day — on track to pass the ${fmt(DB_SOFT_LIMIT)} limit within a month (projected ${fmt(projected)}).`
        );
      }

      const prevByName = new Map<string, number>(
        (prev.table_sizes as TableSize[] | null ?? []).map(t => [t.name, Number(t.bytes)])
      );
      for (const t of tables) {
        const jump = t.bytes - (prevByName.get(t.name) ?? t.bytes);
        if (jump >= TABLE_JUMP_WARN) {
          alerts.push(`Table "${t.name}" grew ${fmt(jump)} since ${new Date(prev.captured_at).toISOString().slice(0, 10)} (now ${fmt(t.bytes)}).`);
        }
      }
    }

    for (const t of tables) {
      if (t.bytes >= TABLE_WARN) {
        alerts.push(`Table "${t.name}" is ${fmt(t.bytes)} — check it has a retention policy.`);
      }
    }

    const note = alerts.length ? alerts.join(" ") : null;

    await supabase.from("egress_watch").insert({
      db_bytes: dbBytes,
      table_sizes: tables,
      note,
    });

    if (alerts.length) {
      await notifyAdmin(
        `[EGRESS WATCH] ${alerts.join("\n")}`,
        "alert",
        "egress_watch"
      );
    }

    // Keep the snapshot history bounded — this table must never become the
    // thing it's warning about.
    const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000).toISOString();
    await supabase.from("egress_watch").delete().lt("captured_at", cutoff);

    return NextResponse.json({
      db_bytes: dbBytes,
      db_pct_of_limit: Math.round((dbBytes / DB_SOFT_LIMIT) * 100),
      largest_tables: tables.slice(0, 5),
      alerts,
    });
  } catch (err: any) {
    console.error("egress-watch error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = POST;
