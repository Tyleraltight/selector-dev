# Adapter Reference (Vite & Next.js)

All adapters and runtime assets are self-contained inside the installed copy (`<installDir>/runtime/` and `<installDir>/adapters/`), with zero external npm dependencies and zero machine-specific paths.

## 1. Vite (`vite.config.ts` / `vite.config.js`)

```ts
import { defineConfig } from "vite";
import { selectorDevPlugin } from "./.tmp/selector-dev/adapters/vite.mjs";

export default defineConfig({
  plugins: [
    selectorDevPlugin({
      // Optional overrides:
      // prefix: "/__selector",
      // toggleShortcut: "Alt+S",
      // startDormant: true,
    }),
  ],
});
```

- Runs with `apply: "serve"` (active only during `vite dev`, excluded from production builds).
- Rejects cross-site, non-loopback `Host`/`Origin` (DNS Rebinding defense), non-JSON `Content-Type`, and payloads > 1 MB.

## 2. Next.js App Router

1. Route handler (`[src/]app/api/selector/[...slug]/route.ts`):

```ts
import { createNextAppHandler } from "../../../../../.tmp/selector-dev/adapters/next.mjs";

export const dynamic = "force-dynamic";

const handler = createNextAppHandler({ root: process.cwd() });

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
```

Note: Prefix defaults to `/api/selector` (not `/_selector`, because Next.js App Router treats `_`-prefixed folders as private routes). Set `basePath` in `createNextAppHandler` and `getBootstrapSrc` if `next.config` defines a `basePath`.

2. Root layout (`[src/]app/layout.tsx`) inside `<body>`:

```tsx
import Script from "next/script";

{process.env.NODE_ENV === "development" && (
  <Script src="/api/selector/assets/bootstrap.js" strategy="afterInteractive" />
)}
```

## 3. Next.js Pages Router

1. Route handler (`[src/]pages/api/selector/[...slug].ts`):

```ts
import { createNextPagesHandler } from "../../../../.tmp/selector-dev/adapters/next.mjs";

export default createNextPagesHandler({ root: process.cwd() });
```

2. Custom App (`[src/]pages/_app.tsx`):

```tsx
import Script from "next/script";

{process.env.NODE_ENV === "development" && (
  <Script src="/api/selector/assets/bootstrap.js" strategy="afterInteractive" />
)}
```

Both Next.js adapters return HTTP `404` whenever `process.env.NODE_ENV !== "development"`.
