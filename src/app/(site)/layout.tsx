import SiteShell from "@/components/site/SiteShell";

// Owner-editable text (Super Admin > Content) is re-read at most every 5 minutes; publishing refreshes it at once.
export const revalidate = 300;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
