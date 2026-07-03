#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { exit } from "node:process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ✗  ${label}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function walk(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, results);
    else results.push(full);
  }
  return results;
}

console.log("\nPre-release security check\n");

check("public/samples/ does not exist or is empty (real email data must not ship)", () => {
  const dir = join(ROOT, "public/samples");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  if (files.length > 0) throw new Error(`public/samples/ contains ${files.length} file(s): ${files.join(", ")}`);
});

check("data/ does not exist or is gitignored", () => {
  const dir = join(ROOT, "data");
  if (!existsSync(dir)) return;
  try {
    const tracked = execSync("git ls-files data/", { cwd: ROOT }).toString().trim();
    if (tracked.length > 0) throw new Error(`data/ has git-tracked files: ${tracked}`);
  } catch (e) {
    if (e.message.startsWith("data/")) throw e;
    // git not available or no tracked files — acceptable
  }
});

check("No real email addresses hardcoded in src/ (outside demo-samples context)", () => {
  const srcFiles = walk(join(ROOT, "src")).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|mil|gov|org|net|edu)/g;
  // Allow only @example.com (used in demo data descriptions/comments)
  const hits = [];
  for (const f of srcFiles) {
    const content = readFileSync(f, "utf-8");
    for (const match of content.matchAll(emailRe)) {
      if (!match[0].endsWith("@example.com") && !match[0].includes("noreply@anthropic")) {
        hits.push(`${relative(ROOT, f)}: ${match[0]}`);
      }
    }
  }
  if (hits.length > 0) throw new Error(`Potential real emails in source:\n     ${hits.join("\n     ")}`);
});

check("dist/ is not committed", () => {
  try {
    const tracked = execSync("git ls-files dist/", { cwd: ROOT }).toString().trim();
    if (tracked.length > 0) throw new Error(`dist/ has ${tracked.split("\n").length} tracked file(s)`);
  } catch (e) {
    if (e.message.startsWith("dist/")) throw e;
  }
});

check(".env files are not tracked by git", () => {
  try {
    const tracked = execSync("git ls-files --error-unmatch .env 2>/dev/null || true", { cwd: ROOT }).toString().trim();
    if (tracked.includes(".env")) throw new Error(".env is tracked by git");
  } catch (e) {
    if (e.message.includes(".env is tracked")) throw e;
  }
});

check("netlify.toml exists and has build command", () => {
  const toml = join(ROOT, "netlify.toml");
  if (!existsSync(toml)) throw new Error("netlify.toml not found");
  const content = readFileSync(toml, "utf-8");
  if (!content.includes('command = "npm run build"')) throw new Error("netlify.toml missing build command");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
exit(failed > 0 ? 1 : 0);
