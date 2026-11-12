import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content";

// Public marketing pages are open to search and AI crawlers. The signed-in
// app and the API are not content and are kept out of indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/login", "/signup"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
