// Writes public/version.json with this build's id before `next build`.
// The app compares it with the id baked into its JS (NEXT_PUBLIC_BUILD_ID in
// next.config.js) to notice a new deploy. A static file costs no function calls.
import { writeFileSync } from "node:fs";

const id = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
writeFileSync(new URL("../public/version.json", import.meta.url), JSON.stringify({ id }) + "\n");
console.log(`version.json: ${id.slice(0, 7)}`);
