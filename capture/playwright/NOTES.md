# Playwright Capture — Phase 1 (click + navigate + circle)

- Standalone, unattended Node/TS script — unlike `capture/chrome-mcp`
  (agent-driven only, see `chrome-mcp/NOTES.md`), this one runs with
  `npm install && npm run capture:demo`, no live agent session required.
- `src/capture-session.ts` — bookkeeping harness. Same `CaptureSession`
  API as `chrome-mcp/manifest-builder.ts` (`addNavigate` / `addClick` /
  `addCircle` / `nextScreenshotName` / `save`), kept as its own copy per the
  duplication this repo already tolerates between backends (ADR-001).
  Adds one thing chrome-mcp's harness doesn't have: `saveScreenshot()`,
  which runs Playwright's raw screenshot buffer through `sharp`
  (`mozjpeg: true, quality: 80`, per ADR-003) and writes the `.jpg` directly.
- `src/capture-demo.ts` — the actual script. Launches Chromium, navigates to
  the running `replay-app` Demo Gallery, clicks through counter / form /
  wizard sections via `data-testid` selectors, polls the app's
  `data-busy` attribute instead of sleeping (see
  `skills/demo-readiness-check/`), and writes `manifest.json` +
  `screenshots/` straight into `replay-app/public/test-scenarios/demo-gallery/`
  by default.
- `dry-run/` — synthetic proof that `capture-session.ts`'s bookkeeping logic
  (not the browser-driving half) produces schema-valid output. See
  `dry-run/README.md` for exactly what was and wasn't verified, and why —
  short version: **this sandbox had no outbound network access**, so
  `playwright`/`sharp` could not actually be installed or run here. The dry
  run substitutes a local fake `sharp` shim for one verification pass (see
  `dry-run/output/manifest.json`, produced for real in this sandbox); the
  checked-in `dry-run.ts` itself targets the *real* `sharp` so it becomes a
  genuine smoke test once you run `npm install` on a machine with network
  access.
- `RUNBOOK.md` — exact commands for the full loop: serve `replay-app`, run
  the capture script against it, load the result in the replay player.
- Implements the common capture interface from
  `docs/adr/ADR-001-dual-capture-backends.md` — same `manifest.json` +
  `screenshots/` output shape as the Chrome MCP backend, this one with real
  ADR-003 JPEG compression actually wired up end to end (chrome-mcp's
  fixtures still use placeholder `.png`, predating ADR-003 — worth revisiting
  there too at some point).
- See `docs/adr/ADR-005-playwright-project-structure.md` for why this is its
  own small npm project (not folded into a repo-root package.json) and why
  it runs via `tsx` rather than a compile step.
