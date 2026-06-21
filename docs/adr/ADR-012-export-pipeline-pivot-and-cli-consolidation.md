# ADR-012: Playwright-Canvas Export Becomes the Canonical Video Pipeline; Root-Level CLI Consolidation

**Status:** Accepted

**Context:** This ADR documents two changes that landed in the same period of offline work, outside any agent session, and were only discovered later via a fresh repo audit (git log `3738a97`, `bbdb0ea`) — which is itself part of why this ADR exists: both changes shipped without an ADR or a roadmap update, leaving ADR-009/ADR-010/ADR-011 and `docs/roadmap.md`'s "Headless video export" entry describing a pipeline that the live "Export Video" button in `replay-app` no longer actually runs. That drift caused real user-facing confusion (a stale tooltip claiming the button needs Pillow, when the path it actually runs does not) and is the immediate trigger for writing this down properly now.

**Decision — Part 1: two export pipelines, not one, with an explicit canonical/fallback relationship.**

There are now two independent ways to turn a scenario into an `.mp4`, and both are intentionally kept:

- **`scripts/export-video.mjs` (legacy path).** `build-frame-plan.mjs` (timeline math, no rendering) → `render-frames.py` (Pillow rasterizes the frame plan to a PNG sequence) → ffmpeg (audio mix + final encode). This is the ADR-009 pipeline, unchanged. It does **not** require a browser, a live `ng serve`, or Playwright — it only needs Node, Python3+Pillow, and ffmpeg.
- **`scripts/playwright-export.mjs` (canonical path).** Launches a real headless Chromium via Playwright, navigates to the **live** `replay-app` dev server (`http://localhost:4221/?scenario=...&narration=...&export=1`), drives a browser-exposed `window.__stopMotion.seekTo(ms)` / `waitForReady()` API (added to `replay-player.component.ts`) to screenshot the actual `#stage` canvas frame-by-frame, then ffmpeg-mixes audio and encodes with the same Daxur-Daemon-matched settings (`libx265 -crf 28 -preset medium -tag:v hvc1 -pix_fmt yuv420p`, `aac 128k`). This is what `scripts/dev-server.mjs`'s `/api/video` endpoint calls, which is what the Angular "Export Video" button triggers.

Why the pivot to the Playwright path as canonical: it screenshots the literal pixels the browser is already drawing, so it is **pixel-identical to the live player by construction** — no second implementation of `buildTimeline()`/`sampleAt()`/badge-drawing to keep in sync. It directly closes a gap `roadmap.md` had flagged about the legacy path: the orbit guide's dashed circle was a Pillow arc-based *approximation* of the canvas dash pattern, not a true match; the Playwright path doesn't approximate anything, it photographs the real canvas. The ADR-011 sped-up-indicator badge "just works" under this path with zero extra code, for the same reason.

Why the legacy path is being kept rather than deleted: it is the only export path that can be executed **without a real launchable browser** — which matters because this sandbox (and any similarly constrained CI/agent environment) cannot launch Chromium at all (see `docs/agent-maintainability.md`). Deleting it would mean video-export changes could never be verified end-to-end in this environment, only statically read. Keeping both means: humans and the Angular button get the higher-fidelity canonical path; an agent working in a browser-less sandbox still has a real, runnable verification path for anything that doesn't depend on the specific Playwright-vs-Pillow rendering difference.

This is a deliberate two-pipeline state, not an unresolved fork — but it does mean `buildTimeline()`/`sampleAt()` duplication (already flagged as a maintenance risk in ADR-009/ADR-011, now four copies: `player.js`, `replay-player.component.ts`, `build-frame-plan.mjs`, and implicitly the live canvas itself via `replay-player.component.ts`) is joined by a second kind of duplication risk: the legacy Pillow renderer can silently drift from what the live canvas actually draws (a CSS/canvas-drawing change in the Angular component doesn't require any matching change in `render-frames.py`, and nothing will fail loudly if someone forgets). No fix for that is implemented in this ADR; it's recorded as a known risk of keeping both paths.

**Decision — Part 2: root-level CLI consolidation.**

Added `scripts/cli.mjs`, a thin dispatcher (no pipeline logic reimplemented — every subcommand spawns the existing, already-working script) exposing one consistent command surface from the repo root:

```
node scripts/cli.mjs dev                          # ng serve + dev-server.mjs together
node scripts/cli.mjs capture [--headed]            # capture/playwright's capture-demo.ts
node scripts/cli.mjs narrate <scenario-dir> [...]   # generate-narration.mjs
node scripts/cli.mjs narrate-all [...]              # generate-all-narration.mjs
node scripts/cli.mjs export <scenario-dir> [...]    # canonical: playwright-export.mjs
node scripts/cli.mjs export <scenario-dir> --legacy # fallback: export-video.mjs (no browser needed)
```

Root `package.json` scripts now forward to this dispatcher (`npm run dev`, `npm run capture`, `npm run narrate`, `npm run generate-narration` → `narrate-all`, `npm run export-video` → canonical, `npm run export-video:legacy` → legacy), so there is one documented place (`scripts/cli.mjs`'s own header comment, plus this ADR) describing the whole capture → narrate → export sequence instead of three separately-versioned `package.json`s (`stop-motion-ui/package.json`, `capture/playwright/package.json`, `replay-app/package.json`) each owning an undocumented slice of it. `capture/playwright/package.json` and `replay-app/package.json` are unchanged — `cli.mjs` calls into them, it doesn't replace them — so existing direct invocations (`cd capture/playwright && npm run capture:demo`) still work for anyone who prefers that.

**Consequences:**
- The Angular Export Video button's tooltip, which previously said "Run export-video.mjs ... needs ... Pillow," has been corrected to describe what it actually runs (`playwright-export.mjs`, no Pillow).
- `docs/roadmap.md`'s "Headless video export" entry needs amending (see the entry itself) to describe both paths instead of presenting the legacy one as the only/current one.
- `docs/agent-maintainability.md` needs a new entry: the canonical export path now requires a real browser AND a live `ng serve`, which is a strictly larger verifiability gap than what that doc currently describes (previously only capture-side code was blocked from in-sandbox execution; now export-side verification is too, unless the `--legacy` path is used deliberately as the sandbox-safe fallback).
- This ADR does not resolve task #28 (deprecating `replay/player.js`) or task #30/#31 (capture-overwrite / hash-based narration regen) — those remain open, tracked separately. It also does not add automated drift-detection between the legacy and canonical renderers; that's named above as a known risk, not solved here.
