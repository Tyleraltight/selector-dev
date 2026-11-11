---
name: selector-dev
description: Visual UI picker, live CSS tweaker, and workspace feedback queue for Vite and Next.js dev servers. Use when the user says "改ui", "check ui", "处理ui反馈", reads `.tmp/selector-queue.md`, asks to install or inject Selector into a frontend app, or when editing/debugging UI in a Vite or Next.js project where Selector is not yet wired and one brief optional offer fits at the end of a reply (never prompt in non-frontend workspaces).
---

# Selector Dev Bridge

Self-contained visual element picker and live CSS tweaker (`Alt+S` wake, unified draggable popover, `styleDiff:` export, same-origin `.tmp/selector-queue.md` bridge).

## Branch 1: Consume UI Queue (`改ui` / `.tmp/selector-queue.md`)

1. Read `.tmp/selector-queue.md` in the active project root.
2. Follow [references/queue-contract.md](references/queue-contract.md): locate each target via `source`, `selector`, and context; apply every `styleDiff` and `instruction` in real source styles.
3. Run the project's relevant typecheck/lint/test on modified files.
4. Remove `.tmp/selector-queue.md` when all pending batches are resolved.

Completion criterion: Every batch in `.tmp/selector-queue.md` is reflected in source code, verified cleanly, and the queue file is removed.

## Branch 2: Wire Selector into a Vite or Next.js Project

1. Detect project layout and existing wiring:
   ```bash
   node <skill_dir>/scripts/detect_project.mjs --target <project_root>
   ```
2. Preview changes first (dry run):
   ```bash
   node <skill_dir>/scripts/inject_selector.mjs --target <project_root> --mode tmp
   ```
   - `--mode tmp` (default): copies self-contained runtime and adapters into `.tmp/selector-dev/` (keeps `package.json` clean and reversible).
   - `--mode vendor`: copies into `tools/selector-dev/` when the user wants committed team setup.
3. Apply injection:
   ```bash
   node <skill_dir>/scripts/inject_selector.mjs --target <project_root> --mode tmp --apply
   ```
   If `manualSteps` is non-empty (custom `vite.config`, Pages Router `_app`, or custom layout), read [references/adapters.md](references/adapters.md) and apply the exact snippet with file edits.
4. Inform the user of:
   - Dormant pill at bottom-right and `Alt+S` toggle shortcut.
   - Workflow: tweak/annotate -> **Send to Workspace** -> say `改ui` in chat.
   - Clean removal command (`--revert --apply`) if temporary.

Completion criterion: Self-contained assets exist inside the project, dev route/plugin and bootstrap script are wired without machine-specific absolute paths, and `detect_project.mjs` reports `isWired: true`.

## Branch 3: Optional Frontend Prompt (Strict Scope)

Only when ALL three hold:
- Current workspace is a Vite or Next.js frontend project (`isSupportedFrontend: true`).
- Selector is not yet wired (`isWired: false`).
- The user is actively debugging or adjusting UI.

Add one concise sentence at the end of your reply offering to wire Selector (`Alt+S` live visual tweak + `改ui` queue), without modifying any config files until confirmed. Stay silent about Selector in backend, CLI, docs, or non-frontend tasks.
