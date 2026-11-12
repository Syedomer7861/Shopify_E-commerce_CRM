// Content model for the public marketing site. Every page under
// /features, /solutions, /integrations, /compare and /resources is one of
// these objects - add an entry to the matching file and the route, sitemap,
// nav, llms.txt and structured data all pick it up.

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://codecrest-crm.vercel.app").replace(/\/$/, "");
export const SITE_NAME = "CodeCrest";
export const CONTENT_UPDATED = "2026-11-12";

export type VisualKind = "orders" | "board" | "chat" | "chart" | "flow" | "people" | "matrix";

export type Page = {
  slug: string;
  /** H1 */
  title: string;
  /** <title>; falls back to title */
  metaTitle?: string;
  /** meta description, 140-160 chars */
  description: string;
  /** Short direct answer shown under the H1 - what answer engines quote. */
  answer: string;
  visual?: VisualKind;
  /** [heading, text] benefit cards */
  points: [string, string][];
  sections: { h: string; p: string; list?: string[] }[];
  /** Ordered how-to steps: [name, text] */
  steps?: [string, string][];
  table?: { cols: string[]; rows: string[][] };
  faqs: [string, string][];
  /** "section/slug" links */
  related?: string[];
};

export type SectionKey = "features" | "solutions" | "integrations" | "compare" | "resources";

export type Section = {
  key: SectionKey;
  label: string;
  title: string;
  description: string;
  intro: string;
  /** schema.org type used for the detail pages */
  kind: "product" | "article";
  pages: Page[];
};
