# Workspace Queue Contract (`.tmp/selector-queue.md`)

When the user clicks **Send to Workspace** in Selector, the dev middleware appends a structured batch to `.tmp/selector-queue.md` in that project's `process.cwd()` and clears the temporary inline `!important` preview styles from the page DOM.

## Batch Format

```markdown
<!-- selector-batch: 2026-11-11T05:00:00.000Z -->
## UI Feedback Batch #1 (05:00:00)
- Page: http://localhost:5173/
- Items: 1

````text
Page: http://localhost:5173/
Viewport: 1280x800

Selected Elements:
1. button#hero-btn
   source: src/components/Hero.tsx:42
   selector: button#hero-btn
   styleDiff: padding-top: 8px -> 24px; font-size: 14px -> 18px
   instruction: Make primary CTA taller and match section heading scale
````
```

## Consumption Rules (`改ui`)

1. Read `.tmp/selector-queue.md` from the current project root.
2. Process every `UI Feedback Batch #N` in order:
   - Locate the target component/stylesheet using `source` (if present), `selector`, `text`, and `html`.
   - Apply every `styleDiff` delta (`prop: before -> after`) and free-text `instruction` in the project's actual styling system (Tailwind utility classes, CSS modules, or component styles — never hardcode temporary inline overrides unless the component already styles that way).
   - Verify no TypeScript/build regressions in the touched files.
3. Once all batches are applied and verified, delete `.tmp/selector-queue.md` (or clear processed entries if the user asks to keep history) so pending batch counts return to `0`.
