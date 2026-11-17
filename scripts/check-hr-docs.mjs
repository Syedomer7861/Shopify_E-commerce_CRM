#!/usr/bin/env node
/** Fails if HR document placeholder merging drifts. Run: node scripts/check-hr-docs.mjs */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const js = ts.transpileModule(readFileSync("src/lib/hr-docs.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require_);
const { customKeys, mergeElements, STARTERS, cloneTemplate } = mod.exports;

const els = [
  { id: "a", type: "text", x: 0, y: 0, w: 1, h: 1, text: "Dear {{employee.name}}, last day {{ last_working_day }}" },
  { id: "b", type: "table", x: 0, y: 0, w: 1, h: 1, rows: [["Basic", "{{basic}}"], ["Net", "{{net_pay}}"]] },
];
assert.deepEqual(customKeys(els).sort(), ["basic", "last_working_day", "net_pay"], "record fields are not asked for");
const m = mergeElements(els, { "employee.name": "Asha", basic: "₹10,000" });
assert.equal(m[0].text, "Dear Asha, last day ", "unknown values become blank, never a guess");
assert.deepEqual(m[1].rows, [["Basic", "₹10,000"], ["Net", ""]]);
assert.equal(els[0].text.includes("{{employee.name}}"), true, "merge does not mutate the design");

const payslip = STARTERS.find((s) => s.kind === "payslip");
const copy = cloneTemplate(payslip);
copy.elements[0].text = "changed";
assert.notEqual(payslip.elements[0].text, "changed", "copying a starter never edits the original");
assert.notEqual(copy.elements[0].id, payslip.elements[0].id);
for (const s of STARTERS) for (const e of s.elements) assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.w <= 794 && e.y + e.h <= 1123, `${s.name}: block inside A4`);
console.log("check-hr-docs: OK");
