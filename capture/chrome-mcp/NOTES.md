# Chrome MCP Capture — Phase 1 (click + navigate)

- Uses Chrome MCP tools (`mcp__Claude_in_Chrome__*`) to drive an interactive
  browser session; this folder holds the bookkeeping half (manifest +
  screenshots), not the browser driving itself — see `RUNBOOK.md`.
- `manifest-builder.ts` — harness module. Plain TS, no MCP dependency.
  `CaptureSession` class: `addNavigate` / `addClick` / `addCircle` /
  `nextScreenshotName` / `save`.
- `RUNBOOK.md` — step-by-step loop for an agent with live Chrome MCP access
  to follow to produce a real `manifest.json` + `screenshots/`.
- `dry-run/` — synthetic (non-browser) proof that the harness produces
  schema-valid output. **Not a real capture** — built because live Chrome
  MCP wasn't connected in the session that wrote this code (see RUNBOOK
  "Status"). Run `dry-run.ts` again once Chrome MCP is connected to produce
  a real `test-capture/` per the runbook.
- Implements the common capture interface from
  `docs/adr/ADR-001-dual-capture-backends.md` — same `manifest.json` +
  `screenshots/` output shape as the Playwright backend.
