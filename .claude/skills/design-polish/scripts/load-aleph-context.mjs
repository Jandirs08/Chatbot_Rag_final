#!/usr/bin/env node
// Bundles Aleph design context into one JSON for fast loading by the skill.
// Usage: node .claude/skills/design-polish/scripts/load-aleph-context.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");
const projectRoot = resolve(skillRoot, "..", "..", "..");

const files = {
  design: resolve(projectRoot, "design.md"),
  product: resolve(projectRoot, "PRODUCT.md"),
  primitives: resolve(skillRoot, "reference", "primitives.md"),
  viewsRoadmap: resolve(skillRoot, "reference", "views-roadmap.md"),
  checklist: resolve(skillRoot, "reference", "checklist-v2.md"),
  antiPatterns: resolve(skillRoot, "reference", "anti-patterns-aleph.md"),
  transformRecipe: resolve(skillRoot, "reference", "transform-recipe.md"),
  reviewerPrompt: resolve(skillRoot, "reference", "reviewer-prompt.md"),
};

function readOrNull(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

const bundle = {
  meta: {
    skill: "design-polish",
    version: "1.0.0",
    projectRoot,
    loadedAt: new Date().toISOString(),
  },
  files: {},
  warnings: [],
};

for (const [key, path] of Object.entries(files)) {
  const content = readOrNull(path);
  if (content == null) {
    bundle.warnings.push(`Missing: ${path}`);
    bundle.files[key] = null;
  } else {
    bundle.files[key] = { path, content };
  }
}

if (!bundle.files.design) {
  bundle.warnings.push(
    "design.md not found at project root. This skill requires design.md v2."
  );
}

if (!bundle.files.product) {
  bundle.warnings.push(
    "PRODUCT.md not found. Consider running /impeccable teach to create one for better register detection."
  );
}

process.stdout.write(JSON.stringify(bundle, null, 2));
