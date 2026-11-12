import { SECTIONS, SITE_URL, TOOLS } from "@/content";

// llms.txt: a plain-text map of the site for AI assistants and answer
// engines, generated from the same content as the pages so it never drifts.
export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# CodeCrest",
    "",
    "> CodeCrest is a multi-tenant operations platform for e-commerce teams and growing businesses. It combines Shopify order operations, shipping and RTO follow-up, WhatsApp and call workflows with team management, approvals, a service desk and role-based permissions scoped by team, department and branch.",
    "",
    `Organisations are provisioned by the CodeCrest team; there is no self-serve signup. Contact: ${SITE_URL}/contact`,
    "",
    ...SECTIONS.flatMap((s) => [
      `## ${s.title}`, "",
      ...s.pages.map((p) => `- [${p.metaTitle || p.title}](${SITE_URL}/${s.key}/${p.slug}): ${p.description}`), "",
    ]),
    "## Free tools", "",
    ...TOOLS.map((t) => `- [${t.name}](${SITE_URL}/tools/${t.slug}): ${t.description}`), "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
