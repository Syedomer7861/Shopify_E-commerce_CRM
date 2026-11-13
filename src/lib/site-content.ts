import { z } from "zod";

// Public-site text the platform owner can edit (Super Admin > Content).
// Each key lists its fields; the defaults are the text the site shipped
// with and are used whenever nothing is published or a value is invalid.
// Values are stored versioned in platform_content (migration 20261113k).

type Field = { name: string; label: string; type: "text" | "textarea" | "link" | "bool"; max?: number; optional?: boolean; help?: string };

// Internal path or https URL only: no javascript:, data: or mailto tricks in owner-entered links.
// "//host" and "/\host" are rejected: browsers treat them as off-site links.
const LINK = /^(\/(?![/\\])[^\s]*|https:\/\/[^\s]+)$/;

export const CONTENT_KEYS = {
  "home.hero": {
    label: "Home page: hero",
    fields: [
      { name: "badge", label: "Badge text", type: "text", max: 80, optional: true, help: "Leave empty to show the playbook count." },
      { name: "badge_href", label: "Badge link", type: "link", optional: true },
      { name: "headline", label: "Headline", type: "text", max: 120 },
      { name: "accent", label: "Highlighted words", type: "text", max: 40, optional: true, help: "Must appear in the headline." },
      { name: "subheadline", label: "Text under the headline", type: "textarea", max: 400 },
      { name: "primary_label", label: "Main button", type: "text", max: 30 },
      { name: "primary_href", label: "Main button link", type: "link" },
      { name: "secondary_label", label: "Second button", type: "text", max: 30 },
      { name: "secondary_href", label: "Second button link", type: "link" },
      { name: "footnote", label: "Small print under buttons", type: "text", max: 160, optional: true },
    ] as Field[],
    defaults: {
      badge: "", badge_href: "/blog",
      headline: "Run every order, and the team behind it, from one place",
      accent: "one place",
      subheadline: "CodeCrest unifies Shopify orders, Shiprocket shipping, WhatsApp and calls with tasks, HR, approvals and role-based access, so your team stops switching tabs and closes the loop on every order.",
      primary_label: "Talk to us", primary_href: "/contact",
      secondary_label: "Explore the product", secondary_href: "/features",
      footnote: "Set up for you by our team · Your own isolated organisation",
    },
  },
  "site.announcement": {
    label: "Announcement bar (top of every public page)",
    fields: [
      { name: "enabled", label: "Show the bar", type: "bool" },
      { name: "text", label: "Text", type: "text", max: 160, optional: true },
      { name: "href", label: "Link", type: "link", optional: true },
    ] as Field[],
    defaults: { enabled: false, text: "", href: "" },
  },
  "site.footer": {
    label: "Footer",
    fields: [{ name: "tagline", label: "Tagline", type: "text", max: 200 }] as Field[],
    defaults: { tagline: "The operations platform for e-commerce teams and the business behind them." },
  },
} as const;

export type ContentKey = keyof typeof CONTENT_KEYS;
export type ContentValue<K extends ContentKey> = { -readonly [F in keyof (typeof CONTENT_KEYS)[K]["defaults"]]: (typeof CONTENT_KEYS)[K]["defaults"][F] extends boolean ? boolean : string };

function fieldSchema(f: Field) {
  if (f.type === "bool") return z.boolean();
  let s = z.string().trim();
  if (f.max) s = s.max(f.max, `${f.label}: at most ${f.max} characters`);
  if (f.type === "link") {
    const link = s.regex(LINK, `${f.label}: use a path like /contact or an https:// address`);
    return f.optional ? z.union([z.literal(""), link]) : link;
  }
  return f.optional ? s : s.min(1, `${f.label} is required`);
}

export function contentSchema(key: ContentKey) {
  return z.object(Object.fromEntries(CONTENT_KEYS[key].fields.map(f => [f.name, fieldSchema(f)]))).strict();
}

/** Published value merged over defaults; defaults if invalid. Never throws. */
export function resolveContent<K extends ContentKey>(key: K, stored: unknown): ContentValue<K> {
  const defaults = CONTENT_KEYS[key].defaults as unknown as ContentValue<K>;
  if (!stored || typeof stored !== "object") return defaults;
  const parsed = contentSchema(key).safeParse({ ...defaults, ...(stored as object) });
  return parsed.success ? (parsed.data as ContentValue<K>) : defaults;
}
