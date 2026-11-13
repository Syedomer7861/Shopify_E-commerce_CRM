"use client";
import { PageHeader } from "@/components/ui";
import { UsersTable } from "@/components/superadmin/UsersTable";

export default function SuperAdminUsers() {
  return (
    <div>
      <PageHeader title="Users" subtitle="Every account across all organisations. Suspending one blocks sign-in and ends their sessions; their data is kept." />
      <UsersTable />
    </div>
  );
}
