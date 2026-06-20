# Playwright Capture — Runbook

## Status

- Written in a sandbox with **no outbound network access** (`npm install`
  to the public registry returned `403 blocked-by-allowlist` for every
  registry/CDN tried). `playwright` and `sharp` could not be installed or
  run there.
- `src/capture-session.ts` and `src/capture-demo.ts` are real, complete
  implementations — written against accurate Playwright/sharp APIs and
  syntax-checked with `node --experimental-strip-types --check`, but never
  run against a live browser.
- `dry-run/` proves the bookkeeping half (`CaptureSession`, manifest
  writing) works; it does not prove the browser-driving half. See
  `dry-run/README.md`.
- **The steps below have not been executed end-to-end by the agent that
  wrote them.** Run them on a machine with normal network access to get a
  real capture — this is the next concrete verification step.

## Prereqs

- Node 18+ on a machine with normal internet access.
- This repo checked out, two terminals (one for `replay-app`, one for
  `capture/playwright`).

## Full loop

1. **Install deps** (one-time):

   ```sh
   cd replay-app
   npm install

   cd ../../shared
   npm install   # required — capture-session.ts's `sharp` import resolves
                 # from here, not from capture/playwright/node_modules; see
                 # ADR-006. Skipping this fails with
                 # "Cannot find package 'sharp' imported from .../shared/capture-session.ts"
                 # the moment capture-demo.ts runs.

   cd ../capture/playwright
   npm install   # postinstall runs `playwright install chromium`
   ```

2. **Serve the Angular app** (terminal 1):

   ```sh
   cd replay-app
   npm start -- --port 4221
   ```

   Leave this running. `capture-demo.ts` defaults to
   `http://localhost:4221/`; override with `DEMO_URL` if you serve on a
   different port.

3. **Optional fast sanity check** before the real capture (terminal 2):

   ```sh
   cd capture/playwright
   npm run dry-run
   ```

   Writes a synthetic `dry-run/output/manifest.json` using the real `sharp`
   package (no browser involved) — confirms the harness + dependencies are
   wired up correctly.

4. **Run the real capture** (terminal 2, with the app from step 2 still
   serving):

   ```sh
   cd capture/playwright
   npm run capture:demo
   ```

   Defaults: headless Chromium, 1280x800 viewport, writes directly to
   `replay-app/public/test-scenarios/demo-gallery/manifest.json` +
   `screenshots/`. Override with env vars if needed:

   ```sh
   DEMO_URL=http://localhost:4221/ HEADLESS=false OUT_DIR=./out npm run capture:demo
   ```

   The run includes the Kitchen Sink leg (see below), whose async-action step
   waits out a real ~40s simulated delay — `FAST_ASYNC=true npm run
   capture:demo` shrinks that to ~4s for faster local iteration on the
   script itself; omit it to capture the realistic full-length wait.

5. **Verify the manifest**: confirm
   `replay-app/public/test-scenarios/demo-gallery/manifest.json` exists,
   `"backend": "playwright"`, and every `screenshotRef` resolves to a real
   `.jpg` under the sibling `screenshots/` folder.

6. **Replay it**: with `replay-app` still serving from step 2, open it in a
   browser, select **"Demo Gallery — real Playwright capture"** from the
   scenario dropdown, and confirm it plays back the counter / form / wizard /
   kitchen-sink sequence captured in step 4.

## What the demo capture exercises

- `nav-demos` tab switch (real `/replay` ↔ `/demos` router navigation as of
  ADR-007 — previously an in-page signal toggle)
- Counter: two increments + a circle gesture on the value
- Contact form: fill name/email, submit, wait for the simulated async
  delay via the app's `data-busy` idle signal (not a fixed sleep)
- Wizard: three `Next` clicks through all steps
- Kitchen Sink (`nav-kitchen-sink`): text input + textarea fills (via
  `.fill()`, no per-keystroke frames), scrolling between sections (not
  recorded — no scroll action type yet), a mat-select pick, the long async
  action (real-time dead air on replay by design — see
  `kitchen-sink.component.ts` and `docs/roadmap.md`'s `asyncWait` entry), and
  a mat-dialog open/close. This leg is the reference fixture for the
  proposed `asyncWait`/`type` manifest actions — see code comments in
  `replay-app/src/app/kitchen-sink/` and `src/capture-demo.ts` for what
  specifically each step is meant to surface.

## Fixed: dev-server reload mid-capture

Real bug, found while running this for the first time end-to-end against a
live `ng serve`: `capture-demo.ts` used to write each screenshot straight
into `replay-app/public/test-scenarios/demo-gallery/screenshots/` *during*
the run (`CaptureSession.saveScreenshot()` does a `writeFileSync()` after
every click/select/etc.). That path is inside `replay-app/public/`, which
`ng serve` watches — so every screenshot write triggered a dev-server
rebuild + live-reload of the very page Playwright was mid-action on. Symptoms
matched exactly: rapid flicker early in the run (frequent steps → frequent
writes → frequent reloads), and a hard hang/timeout later (a reload landing
mid-click tore down an open `mat-select` panel, and Playwright's own log
showed a real `navigated to ".../kitchen-sink"` event firing while it waited
on a locator — proof it was a full page reload, not a SPA route change).

Fixed by writing into `capture/playwright/.capture-staging/` (git-ignored,
outside `replay-app/` entirely) for the whole run, then copying the finished
`manifest.json` + `screenshots/` into `replay-app/public/...` only after
`browser.close()`. The dev server now sees zero file changes until the
capture is completely done.

## Known gaps (Phase 1 deliberately excludes)

- No scroll / drag capture (same limitation as chrome-mcp) — the Kitchen
  Sink leg scrolls the real page but the manifest has no record of it; the
  replay just jumps straight to whatever the next screenshot shows.
- No retry/backoff if a selector doesn't resolve — script fails fast.
- Single demo flow only; doesn't yet cover wizard `Back`/`Restart` or form
  validation-error paths.
- Not yet run for real end-to-end with the Kitchen Sink leg included — see
  Status above; the original demo-gallery-only flow had the same gap before
  this leg was added.
