# Project Guidelines (`selector-dev`)

## Commands
- `npm run check` — Builds `dist/assets/`, syncs self-contained artifacts into `skills/selector-dev/assets/`, runs `tests/dev-bridge.test.mjs` (unit + headless Chrome CDP E2E), and runs `skills/selector-dev/tests/smoke.test.mjs`.
- `npm run build` — Assembles `src/*.js` into `dist/assets/payload-00..07.css` and `dist/assets/editor.js`.
- `npm run sync:skill` — Syncs compiled runtime assets and `adapters/` into `skills/selector-dev/assets/`.
- `npm run demo` — Launches a local interactive demo page wired to `.tmp/selector-queue.md`.

## UI Feedback Queue
- When asked `改ui` (or `check ui`), read `.tmp/selector-queue.md`, apply all pending batches using `source`, `selector`, `styleDiff`, and `instruction`, and delete `.tmp/selector-queue.md` once complete.
