import LandingPage from "@/components/marketing/LandingPage";
import SiteShell from "@/components/site/SiteShell";

// Owner-editable text (Super Admin > Content) is re-read at most every 5 minutes; publishing refreshes it at once.
export const revalidate = 300;

// Public marketing home page, server-rendered. Signed-in users never reach
// it: src/middleware.ts redirects them to their own home first.
export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <SiteShell><LandingPage /></SiteShell>;
}
