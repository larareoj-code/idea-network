#!/usr/bin/env node
// Usage: node scripts/smoke-test.mjs https://your-site.netlify.app
import { exit } from "node:process";

const base = process.argv[2];
if (!base) {
  console.error("Usage: node scripts/smoke-test.mjs <base-url>");
  exit(1);
}

const url = (path) => base.replace(/\/$/, "") + path;
let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ✗  ${label}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

async function fetchText(path) {
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return { status: res.status, text: await res.text() };
}

console.log(`\nSmoke test: ${base}\n`);

await check("Root page returns HTTP 200", async () => {
  const { status } = await fetchText("/");
  if (status !== 200) throw new Error(`Expected 200, got ${status}`);
});

await check("Root page contains app mount point", async () => {
  const { text } = await fetchText("/");
  if (!text.includes('id="root"') && !text.includes("Idea Network")) {
    throw new Error("Missing <div id='root'> or Idea Network title");
  }
});

await check("demo-samples/inbox.csv is reachable", async () => {
  const { text } = await fetchText("/demo-samples/inbox.csv");
  if (!text.includes("Subject") && !text.includes("Body")) {
    throw new Error("CSV does not look like an Outlook export");
  }
});

await check("demo-samples/sent.csv is reachable", async () => {
  const { text } = await fetchText("/demo-samples/sent.csv");
  if (!text.includes("Subject") && !text.includes("Body")) {
    throw new Error("CSV does not look like an Outlook export");
  }
});

await check("favicon.svg is reachable", async () => {
  const res = await fetch(url("/favicon.svg"));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
exit(failed > 0 ? 1 : 0);
