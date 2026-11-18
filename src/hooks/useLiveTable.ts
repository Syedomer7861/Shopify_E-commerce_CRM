"use client";
import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Row = Record<string, unknown>;
export type LiveChange = RealtimePostgresChangesPayload<Row>;

/**
 * Calls `onChange` when rows in `table` change, through Supabase Realtime.
 * Row-level security still applies: a viewer only hears about rows they may read.
 * Returns true while the channel is connected, so callers can slow their
 * fallback polling. The table must be in the `supabase_realtime` publication
 * (migration 20261118k), otherwise it connects but never fires and polling carries on.
 */
export function useLiveTable(table: string, onChange: (change: LiveChange) => void, enabled = true): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled || !table) return;
    const supabase = createClient();
    // Unique per mount: two components on one page may watch the same table.
    const channel = supabase
      .channel(`live:${table}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, payload => cb.current(payload as LiveChange))
      .subscribe(status => setConnected(status === "SUBSCRIBED"));
    return () => { setConnected(false); supabase.removeChannel(channel); };
  }, [table, enabled]);

  return connected;
}

/** Wraps `fn` so a burst of calls runs it once, `ms` after the last call. */
export function useDebounced(fn: () => void, ms: number): () => void {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const call = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), ms);
  });
  return call.current;
}
