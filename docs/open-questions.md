# Open Questions / Decisions To Make

## Phase 2 — scroll/drag capture

- Sample on a fixed interval, or only on scroll-end / drag-end?
- Single screenshot per scroll, or burst of frames for long scrolls?
- How to represent a drag in the manifest — start point + end point, or full path?

## Phase 2 — animation-burst capture

- How to *detect* an animation/transition is happening (DOM mutation observer? rAF sampling? fixed delay after trigger?)
- How many frames is "enough" to fake an animation convincingly during replay?
- Does burst capture need its own action type, or extra fields on existing types?

## General

- How big does a manifest + screenshot set get for a real walkthrough — is this actually smaller than gif in practice?
- Does the replay player need scrubbing/seeking, or just play-through?
- Any need to capture viewport size / DPR for correct screenshot scaling on replay?

## Element-region screenshot compositing — open investigation, not decided

- Idea: instead of N full-screen screenshots when only small regions actually change (e.g. 2 loading elements on an otherwise static large screen), capture 1 full-screen screenshot + N small cropped screenshots of just the changing regions (by selector/bounding box), then composite the crops back onto the base screenshot at the right position during replay
- Goal: cut storage/bytes when most of the screen is static and only small elements animate (the `asyncWait` spinner case in roadmap.md is the motivating example)
- Trade-offs:
  - Savings depend on how static the screen is vs how large/numerous the changing regions are. stop-motion-ui's baseline is already sparse full screenshots, not continuous video frames, so the comparison is against an already-small baseline — a 1280x800 mozjpeg q80 full frame is already ~15-25KB (ADR-003's pipeline); a handful of small element crops would each be well under 5KB, so savings for an `asyncWait`-style burst are real but modest in absolute terms, not an order-of-magnitude win
  - Compositing needs accurate bounding-box capture at capture time — position can drift between capture and replay if layout/viewport differs, though the demo-readiness checklist's "pinned viewport" requirement helps here since viewport is already supposed to be deterministic — plus a canvas-based compositing step in the replay player to draw crops onto the base image at the right coordinates/time
  - Risk: if the element moves, resizes, or other elements shift around it (e.g. a layout reflow triggered by the loading state itself), the cached bounding box goes stale and the composited crop lands in the wrong place — full-screen screenshots don't have this failure mode
  - Backend asymmetry: Playwright has straightforward primitives for this (`elementHandle.boundingBox()`, `screenshot({ clip })`); Chrome MCP is agent-driven, not scriptable, so equivalent region-capture may be much harder or not cleanly possible there — a real concern, not a minor caveat
- Recommendation: worth a small spike/prototype later if storage becomes an actual problem (longer/more complex demo recordings) — not worth building now speculatively. Investigate later, not blocking.
- Connection to the proposed `type` action (see roadmap.md): typing is a second, arguably stronger motivating case for this mechanism — the input region is small, well-defined, and doesn't risk layout reflow shifting it mid-action (unlike the spinner case). Not promoting this item's priority on that basis alone, but when `type` support gets designed for real, region-compositing should be reconsidered alongside it rather than treated as a fully separate, lower-priority topic.
- Connection to the refined `asyncWait` sampling approach (see roadmap.md): the oversample-then-downsample technique (capture continuously at high frequency, downsample once real duration is known) only makes economic sense paired with region-scoped capture — oversampling a tiny cropped region is cheap per-frame, oversampling full-screen at the same frequency is not. This is a third concrete reason this idea has real value now, alongside the `type`-action connection above.
- Connection to the new tall-strip + camera-pan idea for "scroll showcase" (see roadmap.md, under that entry): same static-vs-dynamic-content split as this idea — tall-strip only works when page content is static during scroll; the proposed hybrid fallback for scrolls where something *within* the viewport changes independent of scroll position (lazy-load, sticky animated header, etc.) would layer discrete frames onto the dynamic regions, i.e. this region-compositing mechanism. A fourth concrete motivating case for region-compositing, not yet designed.
