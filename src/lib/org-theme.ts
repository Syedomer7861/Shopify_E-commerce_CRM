/**
 * Organisation theme (organizations.theme, Premium "branding" module).
 * Shape is enforced by the DB CHECK organizations_theme_shape; keep in sync.
 */
export type OrgTheme = {
  accent?: string;          // "#rrggbb"
  radius?: number;          // card corner radius px, 8..28
  density?: "comfortable" | "compact";
  preset?: string;
};

export const DEFAULT_ACCENT = "#c3e33a";
export const DEFAULT_RADIUS = 20;

export const THEME_PRESETS: { key: string; name: string; theme: OrgTheme }[] = [
  { key: "default", name: "CodeCrest lime", theme: {} },
  { key: "clinic",  name: "Clinic mint",    theme: { accent: "#6ee7b7", radius: 16 } },
  { key: "studio",  name: "Studio sky",     theme: { accent: "#7cc4ff", radius: 12 } },
  { key: "homes",   name: "Homes sand",     theme: { accent: "#ffd166", radius: 20 } },
  { key: "store",   name: "Store peach",    theme: { accent: "#ffab91", radius: 24 } },
];

export const ACCENT_SWATCHES = ["#c3e33a", "#6ee7b7", "#7cc4ff", "#c4b5fd", "#f9a8d4", "#ffab91", "#ffd166", "#5eead4"];

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Text on the accent is the app's dark ink (#1c1c1c), so the accent must be light enough to read it. */
export function readableAccent(hex: string) {
  if (!HEX.test(hex)) return false;
  return (luminance(hex) + 0.05) / (luminance("#1c1c1c") + 0.05) >= 4.5;
}

/** Drops anything the DB would reject or that would make text unreadable. */
export function cleanTheme(raw: unknown): OrgTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: OrgTheme = {};
  if (typeof t.accent === "string" && readableAccent(t.accent)) out.accent = t.accent.toLowerCase();
  if (typeof t.radius === "number" && t.radius >= 8 && t.radius <= 28) out.radius = Math.round(t.radius);
  if (t.density === "compact" || t.density === "comfortable") out.density = t.density;
  if (typeof t.preset === "string" && t.preset.length <= 40) out.preset = t.preset;
  return out;
}

/** Writes the theme onto <html>. Empty theme = the stylesheet defaults in globals.css. */
export function applyOrgTheme(theme: OrgTheme) {
  const s = document.documentElement.style;
  const a = theme.accent;
  if (a) {
    s.setProperty("--accent", a);
    s.setProperty("--accent-2", `color-mix(in srgb, ${a} 70%, white)`);
    s.setProperty("--accent-3", `color-mix(in srgb, ${a} 42%, white)`);
    s.setProperty("--accent-4", `color-mix(in srgb, ${a} 12%, white)`);
    s.setProperty("--accent-dark", `color-mix(in srgb, ${a} 86%, black)`);
  } else {
    for (const k of ["--accent", "--accent-2", "--accent-3", "--accent-4", "--accent-dark"]) s.removeProperty(k);
  }
  if (theme.radius) s.setProperty("--radius-card", `${theme.radius}px`);
  else s.removeProperty("--radius-card");
  if (theme.density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

export const THEME_EVENT = "org-theme-change";
export const themeCacheKey = (orgId: string) => `org-theme:${orgId}`;
