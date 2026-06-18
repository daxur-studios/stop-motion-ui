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

5. **Verify the manifest**: confirm
   `replay-app/public/test-scenarios/demo-gallery/manifest.json` exists,
   `"backend": "playwright"`, and every `screenshotRef` resolves to a real
   `.jpg` under the sibling `screenshots/` folder.

6. **Replay it**: with `replay-app` still serving from step 2, open it in a
   browser, select **"Demo Gallery — real Playwright capture"** from the
   scenario dropdown, and confirm it plays back the counter / form / wizard
   sequence captured in step 4.

## What the demo capture exercises

- `nav-demos` tab switch (Replay ↔ Demos toggle, no router)
- Counter: two increments + a circle gesture on the value
- Contact form: fill name/email, submit, wait for the simulated async
  delay via the app's `data-busy` idle signal (not a fixed sleep)
- Wizard: three `Next` clicks through all steps

## Known gaps (Phase 1 deliberately excludes)

- No scroll / drag capture (same limitation as chrome-mcp).
- No retry/backoff if a selector doesn't resolve — script fails fast.
- Single demo flow only; doesn't yet cover wizard `Back`/`Restart` or form
  validation-error paths.
- Not yet run for real — see Status above.
