"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Users, Mail, History, ShieldCheck } from "lucide-react";
import { PageHeader, AccessDenied } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { TwoFactorCard } from "@/components/auth/TwoFactorCard";

// Only sections that exist are listed; later phases add theirs here.
const SECTIONS = [
  { href: "/superadmin", label: "Overview", icon: LayoutDashboard },
  { href: "/superadmin/organisations", label: "Organisations", icon: Building2 },
  { href: "/superadmin/users", label: "Users", icon: Users },
  { href: "/superadmin/requests", label: "Requests", icon: Mail },
  { href: "/superadmin/activity", label: "Owner activity", icon: History },
];

/**
 * Owner area shell. Everything under /superadmin needs the owner flag and a
 * session that passed two-factor. The database enforces the same rule
 * (is_platform_owner_verified); this only decides what to draw.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, loading } = useCurrentProfile();
  const [verified, setVerified] = useState<boolean | null>(null);

  const checkVerified = useCallback(async () => {
    const { data } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
    setVerified(data?.currentLevel === "aal2");
  }, []);

  useEffect(() => {
    if (!loading && profile?.is_platform_admin) checkVerified();
  }, [loading, profile?.is_platform_admin, checkVerified]);

  if (loading || (profile?.is_platform_admin && verified === null)) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }
  if (!profile?.is_platform_admin) {
    return <AccessDenied title="Platform Access Only" desc="This area is restricted to the platform owner." />;
  }
  if (!verified) {
    return (
      <div className="animate-fade-in max-w-md">
        <PageHeader title="Super Admin" subtitle="Owner access needs two-factor sign-in." />
        <div className="card p-4 mb-4 flex gap-3 text-xs text-[#5f5f5d]">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <p>Set up two-factor below. Once it is on, this area opens. Your normal workspace is not affected. You can also manage it later in Settings, then Security.</p>
        </div>
        <TwoFactorCard onEnabled={checkVerified} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <nav className="flex gap-1 overflow-x-auto mb-6 border-b border-[#eceae4] -mx-1 px-1">
        {SECTIONS.map(s => {
          const on = s.href === "/superadmin" ? pathname === s.href : pathname.startsWith(s.href);
          return (
            <Link key={s.href} href={s.href}
              className={cn("flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
                on ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-[#5f5f5d] hover:text-[#1c1c1c]")}>
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
