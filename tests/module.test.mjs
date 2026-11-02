// Consistency checks that need no Foundry: run with `node --test tests/*.test.mjs` (CI "lint").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("module.json"));
const lang = JSON.parse(read("lang/en.json"));

test("MODULE_ID matches module.json", () => {
  assert.match(read("scripts/util.js"), new RegExp(`MODULE_ID = "${manifest.id}"`));
});

test("every DXEM key used in scripts exists in lang/en.json", () => {
  const has = key => key.split(".").reduce((o, k) => o?.[k], lang) !== undefined;
  const files = readdirSync(new URL("../scripts", import.meta.url), { recursive: true }).filter(f => f.endsWith(".js"));
  const missing = [];
  for (const file of files) {
    const src = read(`scripts/${file}`);
    for (const [, key] of src.matchAll(/["'`](DXEM\.[A-Za-z0-9_.]+)["'`]/g)) if (!has(key)) missing.push(`${file}: ${key}`);
    for (const [, key] of src.matchAll(/\bt\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g)) if (!has(`DXEM.${key}`)) missing.push(`${file}: DXEM.${key}`);
  }
  assert.deepEqual(missing, []);
});
