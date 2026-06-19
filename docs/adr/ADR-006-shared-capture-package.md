# ADR-006: Shared Capture Package (cross-repo, not ADR-001's in-repo duplication)
**Status:** Accepted

**Context:** Daxur-Daemon's `daxur-daemon-web/e2e/` independently copied this repo's playwright `CaptureSession` (manifest bookkeeping + the ADR-003 sharp/mozjpeg screenshot compression) and `shared/manifest-types.ts`, inlined into one file. The copy had already drifted (it added optional `narrationShort`/`narrationLong` args to `addNavigate`/`addClick`/`addCircle` that this repo's version didn't have). This is unrelated to the **intentional** chrome-mcp vs. playwright backend duplication from ADR-001 — that stays as-is. This is plain cross-repo copy-paste with no reason to drift.

**Decision:**
- `shared/` becomes an installable package (`stop-motion-shared`, `private: true`), exporting `manifest-types.ts` and the canonical `capture-session.ts` (now the superset, with the narration args) directly — no build step, no `dist/`. Both consumers run via `tsx`, which transpiles `.ts` on the fly even when resolved through a package's `exports` map, so raw source is enough.
- Daxur-Daemon depends on it via `"stop-motion-shared": "file:../../daxur-daemon-playground/stop-motion-ui/shared"` in `daxur-daemon-web/package.json` — same `file:` convention already used for `triangular-engine` elsewhere in this user's repos, deliberately **not** `npm link` (fragile on Windows).
- `capture/playwright/src/capture-session.ts` in this repo is now a one-line re-export of `shared/capture-session.ts`, so existing relative imports (`./capture-session.js` in `capture-demo.ts`, `../src/capture-session.js` in `dry-run.ts`) keep working unchanged.

**Consequences:**
- One implementation of the playwright capture session + manifest types; Daxur-Daemon's copy is gone (replaced with a one-line re-export, kept only because a sandbox file-delete restriction prevented removing it outright — safe to delete by hand).
- `stop-motion-shared` needs its own `npm install` (for `sharp`) the first time, same as any other dependency picked up via `file:`.
- If `shared/` ever needs to ship without TS source (e.g. published, or consumed by a non-`tsx` runtime), this decision should be revisited in favor of a real build step — not needed today.
