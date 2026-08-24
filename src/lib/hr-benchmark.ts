// Real replacement for the HR Dashboard's "Efficiency Benchmark" card, which
// used to show a literal hardcoded "A+ / outperforming by 18% / 12.5m
// faster / 98.2% SLA / 4.8x ROI" - none of it bound to data. Every number
// here is derived from real tasks: SLA adherence (completed on or before
// due_date) and a trend against the prior window (this week vs last week),
// not an invented baseline.

export interface TaskSlaRow {
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SlaWindowStats {
  doneCount: number;
  onTimeCount: number;
  slaPct: number;
  avgResolutionHours: number;
}

export function computeSlaWindow(tasks: TaskSlaRow[]): SlaWindowStats {
  const done = tasks.filter(t => t.status === "done" && t.completed_at);
  if (done.length === 0) return { doneCount: 0, onTimeCount: 0, slaPct: 0, avgResolutionHours: 0 };

  let onTime = 0;
  let totalHours = 0;
  for (const t of done) {
    const completed = new Date(t.completed_at!).getTime();
    if (t.due_date) {
      const due = new Date(`${t.due_date}T23:59:59`).getTime();
      if (completed <= due) onTime++;
    }
    totalHours += (completed - new Date(t.created_at).getTime()) / 3_600_000;
  }

  return {
    doneCount: done.length,
    onTimeCount: onTime,
    slaPct: (onTime / done.length) * 100,
    avgResolutionHours: totalHours / done.length,
  };
}

export function gradeFromSla(slaPct: number): string {
  if (slaPct >= 95) return "A+";
  if (slaPct >= 90) return "A";
  if (slaPct >= 80) return "B+";
  if (slaPct >= 70) return "B";
  if (slaPct >= 60) return "C";
  return "D";
}

export interface BenchmarkResult {
  slaPct: number;
  grade: string;
  doneCount: number;
  /** Positive = resolving faster than the prior window. */
  resolutionDeltaPct: number;
  resolutionDeltaMinutes: number;
  /** False when either window has no completed tasks - nothing real to compare. */
  hasBaseline: boolean;
}

export function computeBenchmark(current: TaskSlaRow[], prior: TaskSlaRow[]): BenchmarkResult {
  const cur = computeSlaWindow(current);
  const pri = computeSlaWindow(prior);
  const hasBaseline = pri.doneCount > 0 && cur.doneCount > 0;

  return {
    slaPct: cur.slaPct,
    grade: gradeFromSla(cur.slaPct),
    doneCount: cur.doneCount,
    resolutionDeltaPct: hasBaseline ? ((pri.avgResolutionHours - cur.avgResolutionHours) / pri.avgResolutionHours) * 100 : 0,
    resolutionDeltaMinutes: hasBaseline ? (pri.avgResolutionHours - cur.avgResolutionHours) * 60 : 0,
    hasBaseline,
  };
}
