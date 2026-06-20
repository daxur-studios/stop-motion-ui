# ADR-011: asyncWait Max-Display-Duration Cap and Sped-Up Indicator

**Status:** Accepted

**Context:** `AsyncWaitAction` (see ADR-010) already compresses a real wait of arbitrary length (`realDurationMs`) down to a short on-screen duration (`frameDurationMs`) by sampling a capped number of frames at capture time. Two gaps remained:

1. **No per-action ceiling on the compressed duration.** `frameDurationMs` was whatever the caller passed at capture time (e.g. `capture-demo.ts`'s `ASYNC_WAIT_DISPLAY_MS` constant) — there was no way to say "no matter what, this specific wait must not occupy more than N seconds of the final replay/video" independent of that shared default, and no way to apply a tighter cap to one especially long real wait without changing the constant for every asyncWait in the capture script.
2. **No visual signal that compression happened at all.** A viewer watching a 3-second on-screen progress bar has no way to tell whether that 3 seconds is "real time" or "40 real seconds played back at ~14x" — the compression is invisible, which can read as a continuity error (why did the spinner finish so fast?) rather than a deliberate edit.

This is distinct from the existing global playback-speed control (0.5x/1x/2x in the player UI), which scales the whole replay uniformly. This feature is local to a single `asyncWait` action and is baked into the manifest at capture time, not adjustable at playback time.

**Decision:**

Add three new optional fields to `AsyncWaitAction` (`shared/manifest-types.ts`), all backward-compatible (manifests without them behave exactly as before):

- **`maxDisplayMs?: number`** — authoring-time cap, in milliseconds, on how long this specific wait may occupy on screen. Owned by the `asyncWait` action itself (not a capture-time-only flag, not a manifest-level setting) because the right cap is inherently per-wait: a 5-second real wait and a 5-minute real wait don't want the same ceiling, and a manifest can contain several asyncWait actions with very different real durations.
- **`speedupIndicator?: boolean`** — whether to render the "sped up" badge. Defaults to **true when compression is actually applied** (see below) if omitted.
- **`speedupIndicatorCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`** — badge position. Defaults to `'top-right'` if omitted.

**Where the cap is computed:** `CaptureSession.addAsyncWait()` (`shared/capture-session.ts`), at capture time, not in the players or the export pipeline:

```ts
const effectiveFrameDurationMs = Math.min(
  args.realDurationMs,
  args.maxDisplayMs ?? args.frameDurationMs,
);
```

The clamped result is written into the manifest as the action's ordinary `frameDurationMs` — `maxDisplayMs` itself is also recorded (so the manifest documents *why* `frameDurationMs` came out the way it did), but every downstream consumer (both live players, the video-export pipeline) only ever needs to read `frameDurationMs`, exactly as before this feature existed. This means the cap required **zero changes** to any of the three `buildTimeline()`/`sampleAt()` copies — the entire feature is capture-time-only on this half.

**Why on-by-default for the badge:** compression is the surprising case (a viewer's default assumption is "what I'm watching took as long as it looks like it took"); the badge corrects that assumption exactly when it would otherwise mislead. Off-by-default would mean every existing/future asyncWait silently lies about elapsed time unless an author remembers to opt in. The badge only ever appears when compression is real and non-trivial — see the next paragraph — so the on-by-default choice costs nothing in the common case where `frameDurationMs` already equals (or is close to) `realDurationMs`.

**When the badge shows:** `isCompressed = realDurationMs > frameDurationMs` (strict `>`; after the clamp above, `frameDurationMs` can never exceed `realDurationMs`, so this is exactly "was anything actually compressed") AND `speedupIndicator !== false`. Label is `Math.round(realDurationMs / frameDurationMs) + 'x'`. This computation, and the resulting `{ label, corner }` shape, is duplicated identically across all three `buildTimeline()`/`sampleAt()` implementations — `replay/player.js`, `replay-player.component.ts`, and `scripts/build-frame-plan.mjs` — per the pre-existing triplication risk flagged in `docs/agent-maintainability.md`; each copy's relevant block carries a comment pointing back to the other two and to this ADR.

**Visual design:** a black, ~60%-opacity rounded-pill badge containing a two-triangle fast-forward glyph followed by the `NNx` label, positioned in the configured corner with a fixed margin. Implemented three times to match the three rendering surfaces:
- `replay/player.js` and `replay-player.component.ts` — `<canvas>` 2D draw calls (`drawSpeedupBadge()`), called from each file's `render()`.
- `scripts/render-frames.py` (the video-export rasterizer) — `draw_speedup_badge()`, using Pillow's `ImageDraw.rounded_rectangle()` for the pill, `ImageDraw.polygon()` for the two glyph triangles, and `ImageDraw.text()` for the label (TrueType `DejaVuSans-Bold` if available in the environment, else PIL's built-in bitmap font as a fallback — either way the badge renders, just with a coarser label font in the fallback case).

**How to set these fields when authoring a demo:** pass them through `CaptureSession.addAsyncWait()`'s args object, e.g. (see the real call site in `capture/playwright/src/capture-demo.ts`'s kitchen-sink step 11):

```ts
session.addAsyncWait({
  target: '[data-testid="kitchen-sink-async-active"]',
  frames,
  realDurationMs,
  frameDurationMs: ASYNC_WAIT_DISPLAY_MS,
  maxDisplayMs: ASYNC_WAIT_DISPLAY_MS, // explicit cap; see this call site's comment
  cursor: asyncTriggerCursor,
  screenshotRef: frames[frames.length - 1],
  narrationShort: "Waiting for the action to finish.",
  narrationLong: "...",
  // speedupIndicator/speedupIndicatorCorner omitted -> defaults (shown, top-right)
});
```

To suppress the badge for a specific wait: `speedupIndicator: false`. To move it: `speedupIndicatorCorner: 'bottom-left'` (or any of the four corners).

**Verification performed:**
- `npx tsc --noEmit -p tsconfig.json` (from `replay-app/`) passes with zero errors across `manifest-types.ts`, `capture-session.ts`, and `replay-player.component.ts`.
- `node --check scripts/build-frame-plan.mjs` passes; ran it against `replay/test-scenarios/scenario-asyncwait` (a real fixture with `realDurationMs: 42000`, `frameDurationMs: 3000`, no explicit `speedupIndicator` — exercising the default-on path) and confirmed `frame-plan.json` carries `"speedup": {"label": "14x", "corner": "top-right"}` on the asyncWait frames.
- `python3 -m py_compile scripts/render-frames.py` passes. Rendered that same frame-plan with `scripts/render-frames.py` and visually inspected the output PNGs: the "14x" badge renders correctly in the default top-right corner.
- Re-ran the same scenario with `speedupIndicatorCorner: 'bottom-left'` added to the manifest by hand and confirmed the badge moved to that corner as expected, with no other visual regressions (cursor, progress bar, spinner all unaffected).
- `capture/playwright`'s own `tsc --noEmit` reports only pre-existing module-resolution noise from this sandbox's incomplete `node_modules` (no `@types/node`/`playwright`/`sharp` installed) — confirmed via a `--noResolve --skipLibCheck` workaround that the affected files (`capture-demo.ts` et al.) contain zero real syntax errors. This is a documented environment limitation (`docs/agent-maintainability.md`), not a defect introduced here.

**Consequences:**
- Manifests authored before this ADR are unaffected — all three new fields are optional, and the default behavior (`speedupIndicator` defaulting to true only when compression is real) means a manifest with `frameDurationMs == realDurationMs` (no compression) never shows a badge regardless of the default, so nothing changes visually for non-compressed waits.
- The cap and the badge are two independently toggleable concerns: an author can set `maxDisplayMs` without the badge (`speedupIndicator: false`), or rely on whatever `frameDurationMs` they already pass without ever setting `maxDisplayMs`, and still get the badge if real compression is happening.
- This is the fourth place (after `manifest-types.ts`'s `AsyncWaitAction.frames`/`regionRect` history, ADR-010's compositing removal, and now this) where the three-way `buildTimeline()`/`sampleAt()` duplication required a matching edit in three files by hand. No structural fix to that duplication is included in this ADR — it remains tracked as a maintainability risk (`docs/agent-maintainability.md`) and is in scope for the separate, larger restructuring pass planned next (deprecating `replay/player.js` in favor of a single Angular-based player, among other things).
- `scripts/render-frames.py`'s badge font falls back to PIL's built-in bitmap font when no TrueType font is installed in the rendering environment — this means the badge's exact appearance (label crispness) can differ slightly between a machine with `DejaVuSans-Bold.ttf` available and one without. Not fixed here since the badge is legible either way; flagged for whoever next touches this file in case pixel-exact parity with the canvas version becomes a requirement.
