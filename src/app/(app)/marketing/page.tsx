import { redirect } from "next/navigation";

// The marketing module was generalized into the multi-team /workspace.
// Keep the old path working (bookmarks, notification links).
export default async function MarketingRedirect(
  props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/workspace${q ? `?${q}` : ""}`);
}
