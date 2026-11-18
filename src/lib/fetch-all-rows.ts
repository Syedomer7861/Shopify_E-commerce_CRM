/**
 * Supabase returns at most 1,000 rows per request, so a plain select silently
 * drops the rest and any client-side total is wrong. This pages through with
 * .range() until a short page, up to `max` rows.
 *
 * Pass a query that is already filtered and ordered. An `id` tie-breaker is
 * added so rows sharing a timestamp are never skipped or repeated between pages.
 */
type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null };
type Pageable<T> = {
  order: (column: string, opts?: { ascending?: boolean }) => Pageable<T>;
  range: (from: number, to: number) => PromiseLike<PageResult<T>>;
};

export const PAGE_SIZE = 1000;

export async function fetchAllRows<T = any>(
  query: unknown,
  max = 20_000,
): Promise<{ data: T[]; error: unknown; count: number | null; truncated: boolean }> {
  const q = (query as Pageable<T>).order("id", { ascending: true });
  const rows: T[] = [];
  let count: number | null = null;
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const want = Math.min(PAGE_SIZE, max - from);
    const res = await q.range(from, from + want - 1);
    if (res.error) return { data: rows, error: res.error, count, truncated: false };
    if (from === 0) count = res.count ?? null;
    const page = res.data || [];
    rows.push(...page);
    if (page.length < want) return { data: rows, error: null, count, truncated: false };
  }
  return { data: rows, error: null, count, truncated: true };
}
