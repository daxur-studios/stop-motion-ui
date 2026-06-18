# Dry Run — synthetic, NOT a real capture

- Proves `manifest-builder.ts`'s `CaptureSession` produces schema-valid
  output: ran `dry-run.mts` against the harness with 3 fake events
  (navigate → click → navigate), 1x1px placeholder PNGs standing in for
  real screenshots.
- Actually executed via `node --experimental-strip-types` — output below is
  the real result, not hand-written.
- `output/manifest.json` here is that real result, copied in. The 3 fake
  PNG bytes themselves aren't included in this folder (binary write
  constraints of the tool that authored this repo) — only the manifest,
  which is the artifact that matters for schema validation.
- Confirms: event shape matches `ManifestEvent` from `shared/manifest-types.ts`,
  `screenshotRef` paths are well-formed and sequential, `id`/`timestamp`/`cursor`
  populate correctly for all three Phase 1 action types exercised
  (`navigate`, `click` — `circle` is exercised by the `addCircle` method but
  not used in this particular run).
- Real browser test capture (via live Chrome MCP) was NOT possible in the
  session that built this — see `../RUNBOOK.md` "Status". This dry run is
  the closest available proof that the harness itself works correctly.
