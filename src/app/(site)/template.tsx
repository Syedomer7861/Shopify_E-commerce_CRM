import { PageTransition } from "@/components/site/Fx";

// Re-mounts on every navigation, so each public page fades and rises in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
