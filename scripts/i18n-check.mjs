// Fails when a message key is missing in either language, or when the {placeholders} differ
// (SRS NFR-LOC-002: 100 % of strings translated). Run with: pnpm i18n:check
import { readFileSync } from "node:fs";

const load = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

function flatten(node, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out.set(path, String(value));
  }
  return out;
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const en = flatten(load("en"));
const km = flatten(load("km"));
const problems = [];

for (const key of en.keys()) if (!km.has(key)) problems.push(`missing in km.json: ${key}`);
for (const key of km.keys()) if (!en.has(key)) problems.push(`missing in en.json: ${key}`);
for (const [key, text] of en) {
  if (!km.has(key)) continue;
  if (placeholders(text) !== placeholders(km.get(key))) problems.push(`placeholders differ: ${key}`);
  if (!text.trim() || !km.get(key).trim()) problems.push(`empty message: ${key}`);
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):\n` + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(`i18n check passed: ${en.size} keys in en.json and km.json.`);
