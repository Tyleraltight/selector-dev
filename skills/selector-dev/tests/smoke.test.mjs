import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";

import { detectProject } from "../scripts/detect_project.mjs";
import { injectSelector } from "../scripts/inject_selector.mjs";

test("self-contained Vite injection, dev server roundtrip, and clean revert", async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "selector-skill-vite-"));
  try {
    await fsp.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "demo-vite", devDependencies: { vite: "^6.0.0" } }, null, 2),
      "utf8"
    );
    const viteConfigOrig = [
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      "  plugins: [],",
      "});",
      "",
    ].join("\n");
    await fsp.writeFile(path.join(tmpDir, "vite.config.ts"), viteConfigOrig, "utf8");

    const before = detectProject(tmpDir);
    assert.equal(before.isSupportedFrontend, true);
    assert.equal(before.primaryFramework, "vite");
    assert.equal(before.isWired, false);

    const dryRun = await injectSelector({ target: tmpDir, mode: "tmp", apply: false });
    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.applied, false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".tmp", "selector-dev")), false);

    const applied = await injectSelector({ target: tmpDir, mode: "tmp", apply: true });
    assert.equal(applied.ok, true);
    assert.equal(applied.manualSteps.length, 0);
    assert.ok(fs.existsSync(path.join(tmpDir, ".tmp", "selector-dev", "runtime", "editor.js")));
    assert.ok(fs.existsSync(path.join(tmpDir, ".tmp", "selector-dev", "adapters", "vite.d.mts")));

    const wiredConfig = await fsp.readFile(path.join(tmpDir, "vite.config.ts"), "utf8");
    assert.ok(!wiredConfig.includes("E:/ClaudeCode"), "must not contain machine-specific absolute path");
    assert.ok(wiredConfig.includes("./.tmp/selector-dev/adapters/vite.mjs"));

    const after = detectProject(tmpDir);
    assert.equal(after.isWired, true);

    // Load the copied self-contained Vite plugin directly from target project
    const mod = await import(pathToFileURL(path.join(tmpDir, ".tmp", "selector-dev", "adapters", "vite.mjs")).href);
    const plugin = mod.selectorDevPlugin({ root: tmpDir });
    plugin.configResolved({ root: tmpDir, base: "/" });

    const middlewares = [];
    plugin.configureServer({
      middlewares: {
        use(prefix, fn) {
          middlewares.push({ prefix, fn });
        },
      },
    });
    assert.equal(middlewares.length, 1);

    const server = http.createServer((req, res) => {
      const m = middlewares[0];
      if (req.url && req.url.startsWith(m.prefix)) {
        req.url = req.url.slice(m.prefix.length) || "/";
        return m.fn(req, res, () => { res.statusCode = 404; res.end("Not found"); });
      }
      res.statusCode = 404;
      res.end("Not found");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const bootRes = await fetch(`http://127.0.0.1:${port}/__selector/assets/bootstrap.js`);
      assert.equal(bootRes.status, 200);
      const editorRes = await fetch(`http://127.0.0.1:${port}/__selector/assets/editor.js`);
      assert.equal(editorRes.status, 200);
      assert.ok((await editorRes.text()).includes("window.__SELECTOR_DEV__"));

      const postRes = await fetch(`http://127.0.0.1:${port}/__selector/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "1. button\n   styleDiff: padding: 8px -> 12px", url: "http://127.0.0.1/", itemCount: 1 }),
      });
      assert.equal(postRes.status, 200);
      assert.equal(detectProject(tmpDir).queue.pendingBatches, 1);
    } finally {
      server.close();
    }

    const reverted = await injectSelector({ target: tmpDir, revert: true, apply: true });
    assert.equal(reverted.ok, true);
    assert.equal(fs.existsSync(path.join(tmpDir, ".tmp", "selector-dev")), false);
    assert.equal(detectProject(tmpDir).isWired, false);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test("self-contained Next.js src/app injection, runtime execution, and clean revert", async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "selector-skill-next-"));
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    await fsp.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "demo-next", dependencies: { next: "^15.0.0" } }, null, 2),
      "utf8"
    );
    await fsp.writeFile(path.join(tmpDir, "tsconfig.json"), "{}", "utf8");
    await fsp.mkdir(path.join(tmpDir, "src", "app"), { recursive: true });
    const layoutOrig = [
      "export default function RootLayout({ children }: { children: React.ReactNode }) {",
      "  return (",
      '    <html lang="en">',
      "      <body>{children}</body>",
      "    </html>",
      "  );",
      "}",
      "",
    ].join("\n");
    await fsp.writeFile(path.join(tmpDir, "src", "app", "layout.tsx"), layoutOrig, "utf8");

    const applied = await injectSelector({ target: tmpDir, mode: "tmp", apply: true });
    assert.equal(applied.ok, true);
    assert.equal(applied.framework, "next-app");
    assert.equal(applied.manualSteps.length, 0);

    const routeRel = path.join(tmpDir, "src", "app", "api", "selector", "[...slug]", "route.ts");
    assert.ok(fs.existsSync(routeRel), "route.ts created under src/app");
    const routeCode = await fsp.readFile(routeRel, "utf8");
    assert.ok(routeCode.includes("../../../../../.tmp/selector-dev/adapters/next.mjs"));

    const layoutAfter = await fsp.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf8");
    assert.ok(layoutAfter.includes("/api/selector/assets/bootstrap.js"));

    const nextMod = await import(pathToFileURL(path.join(tmpDir, ".tmp", "selector-dev", "adapters", "next.mjs")).href);
    const handler = nextMod.createNextAppHandler({ root: tmpDir });
    const editorRes = await handler(new Request("http://localhost:3000/api/selector/assets/editor.css"));
    assert.equal(editorRes.status, 200);
    assert.ok((await editorRes.text()).includes(".ai-editor-dev-pill"));

    const reverted = await injectSelector({ target: tmpDir, revert: true, apply: true });
    assert.equal(reverted.ok, true);
    assert.equal(fs.existsSync(routeRel), false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".tmp", "selector-dev")), false);
    assert.equal(await fsp.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf8"), layoutOrig);
  } finally {
    process.env.NODE_ENV = prevEnv;
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});
