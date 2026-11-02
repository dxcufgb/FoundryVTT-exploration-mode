// Consistency checks that need no Foundry: run with `node --test tests/*.test.mjs` (CI "lint").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const list = (dir, ext) => readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true })
  .filter(f => f.endsWith(ext)).map(f => `${dir}/${f.replaceAll("\\", "/")}`);
const manifest = JSON.parse(read("module.json"));
const lang = JSON.parse(read("lang/en.json"));
const has = key => typeof key.split(".").reduce((o, k) => o?.[k], lang) === "string";
const SECTIONS = Object.keys(lang.DXEM).join("|");

test("MODULE_ID matches module.json", () => {
  assert.match(read("scripts/util.js"), new RegExp(`MODULE_ID = "${manifest.id}"`));
});

test("every DXEM string used in scripts and templates exists in lang/en.json", () => {
  const missing = [];
  for (const file of [...list("scripts", ".js"), ...list("templates", ".hbs")]) {
    const src = read(file);
    for (const [, key] of src.matchAll(/(DXEM\.[A-Za-z0-9_.]*[A-Za-z0-9_])/g)) if (!has(key)) missing.push(`${file}: ${key}`);
    if (!file.endsWith(".js")) continue;
    // t("Section.Key") and t(cond ? "Section.A" : "Section.B")
    for (const [, key] of src.matchAll(new RegExp(`["'\`]((?:${SECTIONS})\\.[A-Za-z0-9_.]+)["'\`]`, "g"))) {
      if (!has(`DXEM.${key}`)) missing.push(`${file}: DXEM.${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every template the scripts load exists", () => {
  const templates = new Set(list("templates", ".hbs"));
  for (const file of list("scripts", ".js")) {
    for (const [, name] of read(file).matchAll(/TEMPLATE_PATH\}\/([\w-]+\.hbs)/g)) {
      assert.ok(templates.has(`templates/${name}`), `${file}: templates/${name}`);
    }
  }
});

test("module.json ships the folders the code needs", () => {
  const include = JSON.parse(read(".github/foundry-module.json")).include;
  for (const dir of ["scripts", "styles", "lang", "templates"]) assert.ok(include.includes(dir), dir);
  assert.deepEqual(manifest.esmodules, ["scripts/main.js"]);
});
