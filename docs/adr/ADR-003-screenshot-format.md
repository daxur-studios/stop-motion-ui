# ADR-003: Screenshot Compression Format
**Status:** Accepted

**Context:** Capture backends will produce one screenshot per event, potentially many per session. Goal is a lightweight artifact format (manifest.json + screenshots/), explicitly **not** gifs or video — so per-frame file size matters. Daxur-Daemon already has a battle-tested image compression path; no need to reinvent it.

**Decision:**
- Reuse **`sharp` (^0.34.5)** — same package Daxur-Daemon's CLI uses for its `media compress` command (`cli/src/commands/media/compress.ts`)
- Reuse its exact JPEG settings: `sharp(file).jpeg({ mozjpeg: true, quality: 80 })`
  - mozjpeg encoder, quality 80 — Daxur-Daemon's proven tradeoff between size and visual fidelity
  - Daxur-Daemon's command also has a PNG path (`png({ compressionLevel: 9, palette: true })`), but for UI screenshots (photographic-ish, lots of gradients/anti-aliasing) JPEG compresses much smaller than palette PNG, so capture backends should write `.jpg`, not `.png`
- Capture flow: take the raw screenshot (Playwright/Chrome MCP native capture), pipe the buffer through `sharp(...).jpeg({ mozjpeg: true, quality: 80 })`, write the result into `screenshots/`
- `screenshotRef` in the manifest points at the compressed `.jpg` file — no raw/uncompressed frame is persisted

**Consequences:**
- No new image-compression dependency or settings to tune — directly reuses Daxur-Daemon's existing, proven config
- Keeps per-session output small, consistent with the "not expensive gifs or videos" goal
- Lossy JPEG is fine for this use case (illustrative UI screenshots, not pixel-perfect diffing); if pixel-perfect comparison is ever needed later, this decision should be revisited
- `shared/manifest-types.ts` documents `screenshotRef` as pointing at a `.jpg` file produced by this pipeline
