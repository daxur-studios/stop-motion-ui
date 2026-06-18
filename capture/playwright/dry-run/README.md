# Dry Run — synthetic, NOT a real capture

- Proves `src/capture-session.ts`'s `CaptureSession` (incl. the
  `saveScreenshot()` compression wrapper) produces schema-valid output: ran
  4 fake events (navigate → click → click → circle), `saveScreenshot()`
  called for real each time.
- **Why this is a dry run and not a real capture:** the sandbox this code
  was written in has no outbound network access (`npm install` to the public
  registry returns `403 blocked-by-allowlist`), so neither `playwright` nor
  `sharp` could actually be installed here. `sharp`'s real mozjpeg encoder
  was swapped for a local fake module (same `sharp(buf).jpeg({...}).toBuffer()`
  call shape, but it just tags the buffer instead of compressing it) purely
  to exercise `capture-session.ts`'s control flow end-to-end in this
  environment.
- Confirms: event shape matches `ManifestEvent` from
  `shared/manifest-types.ts`, `screenshotRef` paths are `.jpg` and
  sequential, `id`/`timestamp`/`cursor` populate correctly for all three
  Phase 1 action types, `seed` round-trips into the manifest, and
  `saveScreenshot()`'s returned ref lines up with the file it actually wrote.
- **What this does NOT prove:** that `playwright` launches a real browser
  correctly, that `sharp`'s real mozjpeg encoder works, or that
  `src/capture-demo.ts`'s selectors (`[data-testid="..."]`) actually match
  the live Demo Gallery DOM. Those require running the real thing with
  network access — see `../NOTES.md` and `../RUNBOOK.md` for exact commands.
  `capture-session.ts` and `capture-demo.ts` were syntax-checked with
  `node --experimental-strip-types --check`, which catches parse errors but
  not type errors or runtime/integration issues.
- The 4 fake screenshot bytes themselves aren't included in this folder
  (binary placeholders, not worth committing) — only the manifest, which is
  the artifact that matters for schema validation. Same convention as
  `capture/chrome-mcp/dry-run/`.
