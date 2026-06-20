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

**Amendment — per-call quality override for scroll frames:** `CaptureSession.saveScreenshot()` now takes an optional `{ quality }` (default still 80, unchanged for every normal step screenshot). `capture/playwright/src/capture-demo.ts`'s `scrollToAndRecord()` passes a much lower `SCROLL_FRAME_QUALITY` (20) for frames captured during an animated scroll's `frames` loop — those frames are each on screen for only a fraction of a short animation (6-12 of them per animated scroll by default), so spending the full quality-80 budget per frame was wasteful for something nobody pauses on individually. Measured against a real capture's scroll frames: quality 30 only saved ~33% over quality 80, while quality 20 saved ~46% — 20 was picked as the point where savings are substantial without visibly distracting artifacts mid-animation.
  - **Exception: the last frame.** `screenshotRef` for the scroll event reuses that last animated frame (avoids a redundant extra shot) — but unlike the others, it doesn't just flash by mid-animation. It's what stays on screen for the rest of the step's hold phase, which (per ADR-004's "whichever is longer" timing sync) can stretch well past the animation if narration audio runs long. A frame that lingers for seconds needs the normal quality, not the throwaway-frame quality — so the loop captures every frame except the last one at `SCROLL_FRAME_QUALITY`, and the last one at the regular default (80).
  - The single "real" screenshot per non-scroll step, and the non-animated scroll path, are unaffected either way.
