import type { MetadataRoute } from "next";
import { CONTENT_UPDATED, SECTIONS, SITE_URL, TOOLS, allPages } from "@/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] =>
    ({ url: SITE_URL + path, lastModified: CONTENT_UPDATED, changeFrequency: "monthly", priority });
  return [
    entry("/", 1),
    entry("/contact", 0.6),
    ...SECTIONS.map((s) => entry(`/${s.key}`, 0.8)),
    entry("/tools", 0.8),
    ...allPages().map((p) => entry(p.href, 0.7)),
    ...TOOLS.map((t) => entry(`/tools/${t.slug}`, 0.7)),
  ];
}
