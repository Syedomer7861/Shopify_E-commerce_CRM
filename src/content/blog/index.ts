import type { BlogCategory, Post } from "./types";
import { posts1 } from "./posts-1";
import { posts2 } from "./posts-2";
import { posts3 } from "./posts-3";
import { posts4 } from "./posts-4";

export * from "./types";

/** Every post, newest first. */
export const POSTS: Post[] = [...posts1, ...posts2, ...posts3, ...posts4].sort((a, b) => b.date.localeCompare(a.date));

export const CATEGORIES: BlogCategory[] = ["COD & RTO", "Shipping & Delivery", "WhatsApp & Retention", "Operations & Teams"];

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);
export const latestPosts = (n: number) => POSTS.slice(0, n);

/** Rough reading time from the body word count. */
export const readMins = (p: Post) =>
  Math.max(2, Math.round(p.sections.reduce((n, s) => n + [...s.p, ...(s.list || [])].join(" ").split(/\s+/).length, 0) / 220));
