#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { source: process.env.SELECTOR_REPO || "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) {
      args.source = argv[++i];
    }
  }
  return args;
}

async function copyChecked(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${src}`);
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

async function main() {
  const { source } = parseArgs(process.argv.slice(2));
  if (!source) {
    console.error("Usage: node sync_runtime.mjs --source <path-to-selector-repo>");
    process.exit(1);
  }
  const repoRoot = path.resolve(source);
  const runtimeDir = path.join(SKILL_ROOT, "assets", "runtime");
  const adaptersDir = path.join(SKILL_ROOT, "assets", "adapters");

  await copyChecked(path.join(repoRoot, "dist", "assets", "editor.js"), path.join(runtimeDir, "editor.js"));
  await copyChecked(path.join(repoRoot, "dist", "assets", "editor.css"), path.join(runtimeDir, "editor.css"));

  for (const file of ["shared.js", "vite.js", "vite.mjs", "next.js", "next.mjs"]) {
    await copyChecked(path.join(repoRoot, "adapters", file), path.join(adaptersDir, file));
  }

  console.log(JSON.stringify({
    ok: true,
    syncedFrom: repoRoot,
    runtimeDir,
    adaptersDir,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
