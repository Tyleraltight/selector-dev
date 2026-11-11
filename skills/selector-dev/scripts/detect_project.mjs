#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { countPendingBatches } = require("../assets/adapters/shared.js");

function firstExisting(root, candidates) {
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return rel.replace(/\\/g, "/");
    }
  }
  return null;
}

function readSafe(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch (_) {
    return "";
  }
}

export function detectProject(targetDir = process.cwd()) {
  const root = path.resolve(targetDir);
  const pkgPath = path.join(root, "package.json");
  const hasPkg = fs.existsSync(pkgPath);
  let pkg = {};
  if (hasPkg) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch (_) {
      pkg = {};
    }
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const viteConfig = firstExisting(root, [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
  ]);
  const nextConfig = firstExisting(root, [
    "next.config.ts",
    "next.config.mts",
    "next.config.mjs",
    "next.config.js",
  ]);
  const nextAppLayout = firstExisting(root, [
    "src/app/layout.tsx",
    "src/app/layout.jsx",
    "src/app/layout.ts",
    "src/app/layout.js",
    "app/layout.tsx",
    "app/layout.jsx",
    "app/layout.ts",
    "app/layout.js",
  ]);
  const nextPagesApp = firstExisting(root, [
    "src/pages/_app.tsx",
    "src/pages/_app.jsx",
    "src/pages/_app.ts",
    "src/pages/_app.js",
    "pages/_app.tsx",
    "pages/_app.jsx",
    "pages/_app.ts",
    "pages/_app.js",
  ]);

  const hasVite = Boolean(deps.vite || viteConfig);
  const hasNext = Boolean(deps.next || nextConfig || nextAppLayout || nextPagesApp);
  const usesSrcDir = Boolean(
    (nextAppLayout && nextAppLayout.startsWith("src/")) ||
    (nextPagesApp && nextPagesApp.startsWith("src/")) ||
    fs.existsSync(path.join(root, "src", "app")) ||
    fs.existsSync(path.join(root, "src", "pages"))
  );
  const usesTypeScript = Boolean(
    fs.existsSync(path.join(root, "tsconfig.json")) ||
    (viteConfig && /\.(ts|mts)$/.test(viteConfig)) ||
    (nextAppLayout && /\.(ts|tsx)$/.test(nextAppLayout)) ||
    (nextPagesApp && /\.(ts|tsx)$/.test(nextPagesApp))
  );

  const frameworks = [];
  if (hasNext && nextAppLayout) frameworks.push("next-app");
  if (hasNext && nextPagesApp) frameworks.push("next-pages");
  if (hasNext && !nextAppLayout && !nextPagesApp) frameworks.push("next");
  if (hasVite) frameworks.push("vite");

  const nextAppRoute = firstExisting(root, [
    "src/app/api/selector/[...slug]/route.ts",
    "src/app/api/selector/[...slug]/route.js",
    "app/api/selector/[...slug]/route.ts",
    "app/api/selector/[...slug]/route.js",
  ]);
  const nextPagesRoute = firstExisting(root, [
    "src/pages/api/selector/[...slug].ts",
    "src/pages/api/selector/[...slug].js",
    "pages/api/selector/[...slug].ts",
    "pages/api/selector/[...slug].js",
  ]);

  const viteConfigText = viteConfig ? readSafe(path.join(root, viteConfig)) : "";
  const appLayoutText = nextAppLayout ? readSafe(path.join(root, nextAppLayout)) : "";
  const pagesAppText = nextPagesApp ? readSafe(path.join(root, nextPagesApp)) : "";

  const wired = {
    vitePlugin: viteConfigText.includes("selectorDevPlugin"),
    nextAppRoute: Boolean(nextAppRoute),
    nextAppBootstrap: appLayoutText.includes("/api/selector/assets/bootstrap.js"),
    nextPagesRoute: Boolean(nextPagesRoute),
    nextPagesBootstrap: pagesAppText.includes("/api/selector/assets/bootstrap.js"),
  };

  const installPaths = [".tmp/selector-dev", "tools/selector-dev"].filter((rel) =>
    fs.existsSync(path.join(root, rel))
  );

  const queueAbs = path.join(root, ".tmp", "selector-queue.md");
  const queueExists = fs.existsSync(queueAbs);
  const pendingBatches = queueExists ? countPendingBatches(readSafe(queueAbs)) : 0;

  const gitignoreText = readSafe(path.join(root, ".gitignore"));
  const ignoresTmp = /(^|\r?\n)\s*\/?\.tmp\/?\s*($|\r?\n)/.test(gitignoreText);

  return {
    root,
    hasPackageJson: hasPkg,
    isSupportedFrontend: frameworks.length > 0,
    frameworks,
    primaryFramework: frameworks[0] || null,
    usesTypeScript,
    usesSrcDir,
    files: {
      viteConfig,
      nextConfig,
      nextAppLayout,
      nextPagesApp,
      nextAppRoute,
      nextPagesRoute,
    },
    wired,
    isWired: Boolean(
      wired.vitePlugin ||
      (wired.nextAppRoute && wired.nextAppBootstrap) ||
      (wired.nextPagesRoute && wired.nextPagesBootstrap)
    ),
    installPaths,
    ignoresTmp,
    queue: {
      exists: queueExists,
      path: ".tmp/selector-queue.md",
      pendingBatches,
    },
  };
}

function parseCliArgs(argv) {
  let target = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target" && argv[i + 1]) target = argv[++i];
  }
  return { target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { target } = parseCliArgs(process.argv.slice(2));
  console.log(JSON.stringify(detectProject(target), null, 2));
}
