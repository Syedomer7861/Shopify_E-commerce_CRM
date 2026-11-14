import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import PublicForm, { type PublicFormSpec } from "./PublicForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public, embeddable web form. Only what web_form_public() returns is shown. */
export default async function FormPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const { data } = await createAdminClient().rpc("web_form_public", { p_form: params.id });
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-[#f7f4ed] px-4 py-10">
      <PublicForm id={params.id} spec={data as PublicFormSpec} />
    </main>
  );
}
