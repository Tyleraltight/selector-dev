#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectProject } from "./detect_project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(SKILL_ROOT, "assets");
const ROUTE_MARKER = "// selector-dev: auto-generated dev bridge route";
const BOOTSTRAP_SRC = "/api/selector/assets/bootstrap.js";

function toPosixRelativeImport(fromFileRel, toFileRel) {
  const fromDir = path.posix.dirname(fromFileRel.replace(/\\/g, "/"));
  let rel = path.posix.relative(fromDir, toFileRel.replace(/\\/g, "/"));
  if (!rel.startsWith("./") && !rel.startsWith("../")) rel = "./" + rel;
  return rel;
}

async function copyDirContents(srcDir, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) await copyDirContents(src, dest);
    else if (entry.isFile()) await fsp.copyFile(src, dest);
  }
}

function patchViteConfigSource(content, importPath) {
  if (content.includes("selectorDevPlugin")) {
    return { status: "already-wired", content };
  }
  const importLine = `import { selectorDevPlugin } from ${JSON.stringify(importPath)};`;
  const pluginsMatch = content.match(/\bplugins\s*:\s*\[/);
  if (!pluginsMatch) {
    return {
      status: "manual-required",
      content,
      manualSnippet: `${importLine}\n// Add selectorDevPlugin() inside plugins: [...]`,
    };
  }
  let next = content;
  const importMatches = [...next.matchAll(/^import\s+[^\r\n]+;\s*\r?\n/gm)];
  if (importMatches.length > 0) {
    const last = importMatches[importMatches.length - 1];
    const insertAt = last.index + last[0].length;
    next = next.slice(0, insertAt) + importLine + "\n" + next.slice(insertAt);
  } else {
    next = importLine + "\n" + next;
  }
  next = next.replace(/\bplugins\s*:\s*\[/, "plugins: [selectorDevPlugin(), ");
  return { status: "patched", content: next };
}

function unpatchViteConfigSource(content) {
  let next = content.replace(/^import\s+\{\s*selectorDevPlugin\s*\}\s+from\s+["'][^"']*selector-dev[^"']*["'];?\r?\n/gm, "");
  next = next.replace(/selectorDevPlugin\(\)\s*,\s*/g, "");
  next = next.replace(/,\s*selectorDevPlugin\(\)/g, "");
  next = next.replace(/selectorDevPlugin\(\)/g, "");
  return next;
}

function patchNextLayoutSource(content) {
  if (content.includes(BOOTSTRAP_SRC)) {
    return { status: "already-wired", content };
  }
  const hasBodyClose = /<\/body\s*>/i.test(content);
  if (!hasBodyClose) {
    return {
      status: "manual-required",
      content,
      manualSnippet: `import Script from "next/script";\n// Inside <body>:\n{process.env.NODE_ENV === "development" && (\n  <Script src="${BOOTSTRAP_SRC}" strategy="afterInteractive" />\n)}`,
    };
  }
  let next = content;
  if (!/from\s+["']next\/script["']/.test(next)) {
    const importMatches = [...next.matchAll(/^import\s+[^\r\n]+;\s*\r?\n/gm)];
    if (importMatches.length > 0) {
      const last = importMatches[importMatches.length - 1];
      const insertAt = last.index + last[0].length;
      next = next.slice(0, insertAt) + 'import Script from "next/script";\n' + next.slice(insertAt);
    } else {
      const directiveMatch = next.match(/^["']use (?:client|server)["'];?\s*\r?\n/);
      const insertAt = directiveMatch ? directiveMatch[0].length : 0;
      next = next.slice(0, insertAt) + 'import Script from "next/script";\n' + next.slice(insertAt);
    }
  }
  next = next.replace(
    /([ \t]*)<\/body\s*>/i,
    `$1  {process.env.NODE_ENV === "development" && (\n$1    <Script src="${BOOTSTRAP_SRC}" strategy="afterInteractive" />\n$1  )}\n$1</body>`
  );
  return { status: "patched", content: next };
}

function unpatchNextBootstrapSource(content) {
  let next = content.replace(
    /[ \t]*\{process\.env\.NODE_ENV === "development" && \(\r?\n[ \t]*<Script src="\/api\/selector\/assets\/bootstrap\.js" strategy="afterInteractive" \/>\r?\n[ \t]*\)\}\r?\n?/g,
    ""
  );
  if (!/\bScript\b/.test(next.replace(/^import\s+Script\s+from\s+["']next\/script["'];?\r?\n/gm, ""))) {
    next = next.replace(/^import\s+Script\s+from\s+["']next\/script["'];?\r?\n/gm, "");
  }
  return next;
}

function buildNextAppRoute(importPath) {
  return [
    ROUTE_MARKER,
    `import { createNextAppHandler } from ${JSON.stringify(importPath)};`,
    "",
    'export const dynamic = "force-dynamic";',
    "",
    "const handler = createNextAppHandler({ root: process.cwd() });",
    "",
    "export const GET = handler;",
    "export const POST = handler;",
    "export const DELETE = handler;",
    "",
  ].join("\n");
}

function buildNextPagesRoute(importPath) {
  return [
    ROUTE_MARKER,
    `import { createNextPagesHandler } from ${JSON.stringify(importPath)};`,
    "",
    "export default createNextPagesHandler({ root: process.cwd() });",
    "",
  ].join("\n");
}

async function removeEmptyParents(absDir, stopDir) {
  let current = absDir;
  while (current.startsWith(stopDir) && current !== stopDir) {
    const entries = await fsp.readdir(current).catch(() => null);
    if (!entries || entries.length > 0) break;
    await fsp.rmdir(current).catch(() => {});
    current = path.dirname(current);
  }
}

export async function injectSelector({
  target = process.cwd(),
  mode = "tmp",
  apply = false,
  revert = false,
} = {}) {
  const root = path.resolve(target);
  const info = detectProject(root);
  const installRel = mode === "vendor" ? "tools/selector-dev" : ".tmp/selector-dev";
  const installAbs = path.join(root, installRel);
  const actions = [];
  const manualSteps = [];

  if (revert) {
    for (const rel of [".tmp/selector-dev", "tools/selector-dev"]) {
      const abs = path.join(root, rel);
      if (fs.existsSync(abs)) {
        actions.push({ type: "remove-dir", path: rel });
        if (apply) await fsp.rm(abs, { recursive: true, force: true });
      }
    }
    for (const routeRel of [info.files.nextAppRoute, info.files.nextPagesRoute].filter(Boolean)) {
      const abs = path.join(root, routeRel);
      const text = await fsp.readFile(abs, "utf8").catch(() => "");
      if (text.includes(ROUTE_MARKER)) {
        actions.push({ type: "remove-file", path: routeRel });
        if (apply) {
          await fsp.rm(abs, { force: true });
          await removeEmptyParents(path.dirname(abs), root);
        }
      }
    }
    if (info.files.viteConfig) {
      const abs = path.join(root, info.files.viteConfig);
      const prev = await fsp.readFile(abs, "utf8");
      const next = unpatchViteConfigSource(prev);
      if (next !== prev) {
        actions.push({ type: "unpatch-file", path: info.files.viteConfig });
        if (apply) await fsp.writeFile(abs, next, "utf8");
      }
    }
    if (info.files.nextAppLayout) {
      const abs = path.join(root, info.files.nextAppLayout);
      const prev = await fsp.readFile(abs, "utf8");
      const next = unpatchNextBootstrapSource(prev);
      if (next !== prev) {
        actions.push({ type: "unpatch-file", path: info.files.nextAppLayout });
        if (apply) await fsp.writeFile(abs, next, "utf8");
      }
    }
    if (info.files.nextPagesApp) {
      const abs = path.join(root, info.files.nextPagesApp);
      const prev = await fsp.readFile(abs, "utf8");
      const next = unpatchNextBootstrapSource(prev);
      if (next !== prev) {
        actions.push({ type: "unpatch-file", path: info.files.nextPagesApp });
        if (apply) await fsp.writeFile(abs, next, "utf8");
      }
    }
    return { ok: true, mode: "revert", applied: apply, root, actions };
  }

  if (!info.isSupportedFrontend) {
    return {
      ok: false,
      error: "No supported Vite or Next.js project detected in target directory.",
      detection: info,
    };
  }

  actions.push({ type: "copy-self-contained-assets", path: installRel });
  if (apply) {
    await copyDirContents(path.join(ASSETS_DIR, "runtime"), path.join(installAbs, "runtime"));
    await copyDirContents(path.join(ASSETS_DIR, "adapters"), path.join(installAbs, "adapters"));
  }

  if (info.primaryFramework === "vite" && info.files.viteConfig) {
    const abs = path.join(root, info.files.viteConfig);
    const prev = await fsp.readFile(abs, "utf8");
    const importPath = toPosixRelativeImport(info.files.viteConfig, `${installRel}/adapters/vite.mjs`);
    const res = patchViteConfigSource(prev, importPath);
    if (res.status === "patched") {
      actions.push({ type: "patch-file", path: info.files.viteConfig });
      if (apply) await fsp.writeFile(abs, res.content, "utf8");
    } else if (res.status === "manual-required") {
      manualSteps.push({ file: info.files.viteConfig, snippet: res.manualSnippet });
    }
  } else if (info.frameworks.includes("next-app") && info.files.nextAppLayout) {
    const ext = info.usesTypeScript ? "ts" : "js";
    const routeRel = `${info.usesSrcDir ? "src/" : ""}app/api/selector/[...slug]/route.${ext}`;
    const routeAbs = path.join(root, routeRel);
    const importPath = toPosixRelativeImport(routeRel, `${installRel}/adapters/next.mjs`);
    if (!fs.existsSync(routeAbs)) {
      actions.push({ type: "create-file", path: routeRel });
      if (apply) {
        await fsp.mkdir(path.dirname(routeAbs), { recursive: true });
        await fsp.writeFile(routeAbs, buildNextAppRoute(importPath), "utf8");
      }
    }
    const layoutAbs = path.join(root, info.files.nextAppLayout);
    const prevLayout = await fsp.readFile(layoutAbs, "utf8");
    const layoutRes = patchNextLayoutSource(prevLayout);
    if (layoutRes.status === "patched") {
      actions.push({ type: "patch-file", path: info.files.nextAppLayout });
      if (apply) await fsp.writeFile(layoutAbs, layoutRes.content, "utf8");
    } else if (layoutRes.status === "manual-required") {
      manualSteps.push({ file: info.files.nextAppLayout, snippet: layoutRes.manualSnippet });
    }
  } else if (info.frameworks.includes("next-pages") && info.files.nextPagesApp) {
    const ext = info.usesTypeScript ? "ts" : "js";
    const routeRel = `${info.usesSrcDir ? "src/" : ""}pages/api/selector/[...slug].${ext}`;
    const routeAbs = path.join(root, routeRel);
    const importPath = toPosixRelativeImport(routeRel, `${installRel}/adapters/next.mjs`);
    if (!fs.existsSync(routeAbs)) {
      actions.push({ type: "create-file", path: routeRel });
      if (apply) {
        await fsp.mkdir(path.dirname(routeAbs), { recursive: true });
        await fsp.writeFile(routeAbs, buildNextPagesRoute(importPath), "utf8");
      }
    }
    manualSteps.push({
      file: info.files.nextPagesApp,
      snippet: `import Script from "next/script";\n// Inside App JSX:\n{process.env.NODE_ENV === "development" && (\n  <Script src="${BOOTSTRAP_SRC}" strategy="afterInteractive" />\n)}`,
    });
  } else {
    manualSteps.push({
      file: "manual",
      snippet: `Self-contained runtime & adapters copied to ${installRel}/. See references/adapters.md to mount.`,
    });
  }

  return {
    ok: true,
    mode,
    applied: apply,
    root,
    framework: info.primaryFramework,
    installRel,
    ignoresTmp: info.ignoresTmp,
    actions,
    manualSteps,
  };
}

function parseCliArgs(argv) {
  const opts = { target: process.cwd(), mode: "tmp", apply: false, revert: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--mode" && argv[i + 1]) opts.mode = argv[++i];
    else if (a === "--apply") opts.apply = true;
    else if (a === "--dry-run") opts.apply = false;
    else if (a === "--revert") opts.revert = true;
  }
  return opts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const opts = parseCliArgs(process.argv.slice(2));
  injectSelector(opts)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok) process.exit(1);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
