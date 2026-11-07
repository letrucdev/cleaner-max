// Report Tailwind classes that have a canonical (shorter/standard) form — the same check the
// Tailwind CSS IntelliSense extension shows as "suggestCanonicalClasses" warnings.
//
// Usage: node scripts/tw-canonical.mjs          (list)
//        node scripts/tw-canonical.mjs --fix    (rewrite files in place)
import fs from "node:fs";
import path from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const fix = process.argv.includes("--fix");

const css = fs.readFileSync(path.join(src, "index.css"), "utf8");
const ds = await __unstable__loadDesignSystem(css, { base: src });

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith("bindings.ts")) yield p;
  }
}

// index.css redefines the radius scale (--radius-sm…4xl derive from --radius = 10px), but the
// canonicalizer maps pixel radii onto Tailwind's *default* scale: `rounded-[4px]` → `rounded-lg`
// would really become 10px. Never accept a suggestion that lands on an overridden radius key.
const OVERRIDDEN_RADIUS = /(^|:)rounded(-[trblse]{1,2})?-(sm|md|lg|xl|2xl|3xl|4xl)$/;

const cache = new Map();
function canonical(token) {
  if (!cache.has(token)) {
    const isUtility = ds.candidatesToCss([token])[0] !== null;
    let out = isUtility ? ds.canonicalizeCandidates([token], { rem: 16 })[0] : token;
    if (OVERRIDDEN_RADIUS.test(out) && token.includes("[")) out = token;
    cache.set(token, out);
  }
  return cache.get(token);
}

let total = 0;
for (const file of walk(src)) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  let changed = false;
  lines.forEach((line, i) => {
    // Class strings live in "..." or `...` literals; check each whitespace-separated token.
    for (const m of line.matchAll(/(["`])([^"`]*)\1/g)) {
      for (const token of m[2].split(/\s+/).filter(Boolean)) {
        const c = canonical(token);
        if (c && c !== token) {
          total++;
          console.log(`${path.relative(root, file)}:${i + 1}  ${token}  →  ${c}`);
          if (fix) {
            lines[i] = lines[i].replace(new RegExp(`(?<=[\\s"\`])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s"\`])`, "g"), c);
            changed = true;
          }
        }
      }
    }
  });
  if (fix && changed) fs.writeFileSync(file, lines.join("\n"));
}
console.log(`\n${total} non-canonical class${total === 1 ? "" : "es"}${fix ? " fixed" : ""}`);
