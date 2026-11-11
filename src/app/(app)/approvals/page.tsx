"use client";
import { ApprovalsInbox } from "@/components/workspace/ApprovalsInbox";
import { PageHeader } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

export default function ApprovalsPage() {
  const { profile, loading } = useCurrentProfile();
  if (loading || !profile) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  return (
    <div className="animate-fade-in">
      <PageHeader title="Approvals" subtitle="Expense claims, task reviews and rule-raised requests. You can't decide your own." />
      <ApprovalsInbox profile={profile} />
    </div>
  );
}
