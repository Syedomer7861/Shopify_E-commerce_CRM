import LandingPage from "@/components/marketing/LandingPage";
import SiteShell from "@/components/site/SiteShell";

// Public marketing home page, server-rendered. Signed-in users never reach
// it: src/middleware.ts redirects them to their own home first.
export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <SiteShell><LandingPage /></SiteShell>;
}
