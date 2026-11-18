#!/usr/bin/env node
/**
 * Fails if the field contact rules drift: required fields, phone cleaning
 * (same last-10-digits rule as customers), WhatsApp copy, consent value.
 * Run: node scripts/check-field-contacts.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const load = (file, deps = {}) => {
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, (p) => deps[p] ?? require_(p));
  return mod.exports;
};
const phone = load("src/lib/phone-utils.ts");
const { contactErrors, contactRow, contactInput, EMPTY_CONTACT, waLink } = load("src/lib/field-contacts.ts", { "./phone-utils": phone });

const C = (o) => ({ ...EMPTY_CONTACT, ...o });
assert.deepStrictEqual(Object.keys(contactErrors(EMPTY_CONTACT)).sort(), ["business_name", "contact_person", "phone"]);
assert.strictEqual(contactErrors(C({ business_name: "A", contact_person: "B", phone: "98765" })).phone, "Mobile number needs 10 digits");
assert.ok(contactErrors(C({ business_name: "A", contact_person: "B", phone: "9876543210", email: "x@y" })).email);
const ok = C({ business_name: "  Sai   Medicals ", contact_person: "Ravi", phone: "+91 98765-43210", email: " Ravi@Shop.IN ", interest: "hot", marketing_consent: true });
assert.deepStrictEqual(contactErrors(ok), {});

const row = contactRow(ok);
assert.strictEqual(row.business_name, "Sai Medicals", "spaces tidied");
assert.strictEqual(row.phone, "9876543210", "last 10 digits, like customers");
assert.strictEqual(row.whatsapp, "9876543210", "WhatsApp defaults to the mobile");
assert.strictEqual(row.email, "ravi@shop.in");
assert.strictEqual(row.marketing_consent, "yes");
assert.strictEqual(row.category, null, "empty becomes null");
assert.strictEqual(contactRow(C({ ...ok, whatsappSame: false, whatsapp: "" })).whatsapp, null);
assert.strictEqual(contactRow(C({ ...ok, interest: "maybe" })).interest, null, "unknown interest dropped");

const back = contactInput({ ...row, whatsapp: "9000000000" });
assert.strictEqual(back.whatsappSame, false);
assert.strictEqual(back.marketing_consent, true);
assert.strictEqual(waLink("9876543210"), "https://wa.me/919876543210");
assert.strictEqual(waLink(null), null);

console.log("check-field-contacts: OK");
