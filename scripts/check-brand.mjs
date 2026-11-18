#!/usr/bin/env node
/**
 * Smallest thing that fails if another organisation's customers would get
 * CureForever's name or links: names swapped, seed links dropped, CureForever's
 * own text untouched.
 * Run: node scripts/check-brand.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert";

const out = join("node_modules", ".cache", "crm-checks", "brand");
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join("node_modules", "typescript", "bin", "tsc"), "src/lib/brand.ts",
  "--outDir", out, "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--skipLibCheck"], { stdio: "inherit" });
const { rebrand, isSeedBrand } = createRequire(import.meta.url)(join(process.cwd(), out, "brand.js"));

const dispatched = "Great news Asha! Your Tea has been dispatched 🚚. You can track it here: https://cureforever.shiprocket.co/tracking . It should reach you soon! 🌿";
const review = "Hi Asha 👋, thank you! 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck";

assert.strictEqual(rebrand(dispatched, "CureForever"), dispatched, "seed org unchanged");
assert.strictEqual(rebrand(dispatched, null), dispatched, "unknown org unchanged");
assert.ok(isSeedBrand("CureForever Wellness"));

const d = rebrand(dispatched, "Acme");
assert.ok(!/cureforever/i.test(d), d);
assert.strictEqual(d, "Great news Asha! Your Tea has been dispatched 🚚. It should reach you soon! 🌿");

const r = rebrand(review, "Acme");
assert.ok(!/placeid|cureforever/i.test(r), r);

assert.strictEqual(rebrand("thanks for ordering Tea from CureForever! ✅", "Acme"), "thanks for ordering Tea from Acme! ✅");
assert.strictEqual(rebrand("I'm reaching out personally from CureForever Care.", "Acme"), "I'm reaching out personally from Acme team.");
assert.strictEqual(rebrand("Use this {{abandon_link}} or https://cureforever.in/cart now", "Acme"), "Use this {{abandon_link}} or now");

console.log("check-brand: OK");
