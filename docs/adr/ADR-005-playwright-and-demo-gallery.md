# ADR-005: Playwright Backend Structure & Demo Gallery Routing

**Status:** Accepted

**Context:** Two pieces landed together: a real Playwright capture backend
(`capture/playwright/`), and a small Angular "Demo Gallery" view in
`replay-app/` that exists purely to give that backend something realistic
to capture and the demo-readiness-check skill something to be dogfooded
against.

**Decisions:**

- **`capture/playwright/` is its own small npm project**, not folded into a
  repo-root `package.json` or merged with `capture/chrome-mcp/`. The two
  backends have genuinely different dependency footprints (Playwright +
  sharp vs. none) and different execution models (standalone script vs.
  agent-driven, per ADR-001) — keeping them separate avoids one backend's
  deps leaking into the other.
- **Runs via `tsx`**, not Node's built-in `--experimental-strip-types` or a
  `tsc` compile step. `tsx` resolves bare/extensionless TS imports the way
  the rest of the ecosystem expects; Node's native flag requires explicit
  `.js` extensions on relative specifiers, which is workable but more
  friction for a script meant to be run directly via `npm run`.
- **`capture-session.ts` duplicates `chrome-mcp/manifest-builder.ts`'s API**
  rather than extracting a shared base class. Same call as ADR-001's
  acceptance of backend duplication: the two will diverge anyway (this one
  owns real JPEG compression via `saveScreenshot()`; chrome-mcp's doesn't
  compress at all yet), and a shared abstraction over two ~80-line files
  isn't worth the indirection.
- **Demo Gallery is a second view inside the existing `replay-app`**, not a
  separate Angular project, and is toggled with a plain signal
  (`view = signal<'replay' | 'demos'>('replay')`) rather than
  `@angular/router`. Two views, no deep-linking need, no nested routes —
  adding the router dependency for a same-tab toggle isn't worth it. If a
  third view or URL-addressable demos show up later, revisit.
- **`capture-demo.ts` writes straight into
  `replay-app/public/test-scenarios/demo-gallery/`** instead of a local
  output folder that then gets copied. One fewer manual step between
  "capture ran" and "replay player can load it."

**Consequences:**

- Two `CaptureSession`-shaped classes to keep mentally in sync if the
  manifest schema changes — same tradeoff ADR-001 already accepted.
- Demo Gallery has no URL of its own; can't deep-link to "the demos view."
  Acceptable for a test fixture, would need revisiting if it became
  user-facing.
- Playwright backend was written and syntax-checked but not run against a
  live browser in the environment that authored it (no outbound network
  access there) — see `capture/playwright/RUNBOOK.md` Status section for
  the exact verification gap and how to close it.
