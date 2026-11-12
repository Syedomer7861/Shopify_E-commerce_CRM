import type { VisualKind } from "../types";

export type BlogCategory = "COD & RTO" | "Shipping & Delivery" | "WhatsApp & Retention" | "Operations & Teams";

// One blog post. Add an entry to a posts-*.ts file and the route, blog index,
// sitemap, llms.txt and structured data all pick it up.
export type Post = {
  slug: string;
  /** H1, written around the target keyword */
  title: string;
  /** <title> override, max 60 chars; falls back to title */
  metaTitle?: string;
  /** meta description, 140-160 chars, contains the keyword */
  description: string;
  /** primary search query this post targets */
  keyword: string;
  category: BlogCategory;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Direct 40-70 word answer to the query, shown under the H1 for answer engines */
  answer: string;
  /** 3-5 one-sentence takeaways */
  takeaways: string[];
  visual: VisualKind;
  /** Body. Each h is an H2 phrased as a question or clear topic. */
  sections: { h: string; p: string[]; list?: string[]; table?: { cols: string[]; rows: string[][] } }[];
  /** 4-6 question/answer pairs people actually ask */
  faqs: [string, string][];
  /** "section/slug" links to product pages, tools or other posts ("blog/slug") */
  related: string[];
};
