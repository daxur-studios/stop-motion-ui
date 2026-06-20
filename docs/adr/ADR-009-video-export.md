# ADR-009: Headless Video Export (Node Timeline Math + Pillow Rasterizer + ffmpeg)

**Status:** Accepted (first working implementation; one open follow-up — orbit-guide line-dash fidelity, see Consequences)

**Context:** Until now, `buildTimeline()`/`sampleAt()`/`render()` (the bezier cursor motion, circle-gesture orbits, ripple click-feedback, asyncWait region compositing, and narration-driven timing-stretch logic) only ran live, inside a real `<canvas>`, in two parallel implementations (`replay/player.js`, `replay-player.component.ts`). There was no way to produce an actual video file — the README explicitly frames the project as a *lighter alternative to* video/gif capture, not an exporter to one, and `docs/roadmap.md` had zero mentions of video export before this ADR.

The ask: export a recording (screenshots + cursor animation + circle gestures + asyncWait region-crops + TTS narration) as a real compressed video file, with compression settings matched exactly to Daxur-Daemon's existing media-compression CLI, so output is consistent with the rest of the user's tooling.

**Daxur-Daemon's existing settings (the thing being matched):** `Daxur-Daemon/cli/src/commands/media/compress.ts`'s non-GPU video path:
```
-c:v libx265 -crf 28 -preset medium -tag:v hvc1 -pix_fmt yuv420p
-c:a aac -b:a 128k
```
(`-crf`/`-preset` are the CLI's own configurable defaults, `28`/`medium`; the GPU/`hevc_nvenc` path is opt-in only and not relevant here since this sandbox has no GPU.)

**Sandbox constraints that shaped the approach:**
- No browser/Chromium available (same constraint already documented for capture — see roadmap.md's capture-backend disclosures), so the live `<canvas>` rendering path cannot run here at all.
- `npm install` is blocked for any new package (`403 Forbidden` from `registry.npmjs.org`) — confirmed for both `canvas` (node-canvas, never present) and `sharp` (present in `node_modules` but missing its Linux native binary, since the real dev environment is Windows; a `--os=linux --cpu=x64` reinstall to pull just the binary also hit the same registry block). **Both of the obvious "headless canvas" options are unavailable in this sandbox**, full stop — not a matter of more digging.
- What *is* available with zero install step: system `ffmpeg` 4.4.2 (built with `--enable-libx265 --enable-libopus`), ImageMagick, and **Python 3 with Pillow 12.2.0** already installed.

**Decision: three-stage pipeline, Pillow standing in for `<canvas>`.**

1. **`scripts/build-frame-plan.mjs`** (Node) — a deliberate, declared fork of `player.js`'s `easeInOutCubic`/`mulberry32`/`quadBezier`/`controlPointFor`/`circleWobble`/`circleOrbitPoint`/`buildTimeline()`/`sampleAt()`, plus a new `computeRipples()` ported from `drawRipples()`'s arrival/age math. None of this logic is reinterpreted — every function is meant to produce the same output as its `player.js` counterpart for the same input. The only structural change: `getNarration(ev)` returns `{ ms, el }` where `el` is a narration audio *relative path string* rather than an `HTMLAudioElement` — `buildTimeline()` only ever assigns this value to `phase.narration`, never calls a method on it, so the same function works unchanged. Narration clip duration (replacing `loadAudioMeta()`'s `<audio>`-element metadata load) comes from `ffprobe -show_entries format=duration`. Output: `<scenario-dir>/frame-plan.json` — a pure-data per-frame array (`{ t, screenshot, region, cursor, orbit, ripples }`) sampled at a fixed FPS, plus an `audioEvents` array (`{ path, startMs }`) of every phase `buildTimeline()` picked as a narration owner.

   This file does no rendering and has no DOM/canvas dependency — it's the same math, running as plain Node.

2. **`scripts/render-frames.py`** (Python + Pillow) — the actual rasterizer, standing in for `<canvas>`. Same draw order as `render()`/`drawRipples()`/`drawCursor()`: black fill → base screenshot (`Image.open` + `alpha_composite`) → asyncWait region-crop composite (`alpha_composite` at `regionRect.x/y`) → ripples (`ImageDraw.ellipse(outline=…)`, alpha-faded per ripple's age) → cursor (orbit guide circle → soft shadow ellipse → arrow polygon, vertices copied verbatim from `drawCursor()`). Writes a numbered PNG sequence (`frame_00000.png`, …).

   One known fidelity gap: Pillow's `ImageDraw` has no native dashed-stroke primitive, unlike `ctx.setLineDash([4, 4])`. The orbit guide circle is approximated by stroking short arcs (dash/gap length computed from circumference) — visually close (confirmed by rendering scenario-1's frame 108, mid-circle-gesture, and inspecting it directly) but not pixel-identical to the canvas version. Acceptable for a v1; flagged as a follow-up below.

3. **`scripts/export-video.mjs`** (Node orchestrator) — runs stage 1, then stage 2, then two `ffmpeg` passes: (a) mix the narration clips' disjoint timestamps into one continuous track via `adelay` (per-clip start offset, from `audioEvents[i].startMs`) + `amix` (`normalize=0`, since clips don't actually overlap and `amix`'s default normalization would otherwise quietly attenuate every clip just because there are multiple inputs); (b) `ffmpeg -framerate <fps> -i frame_%05d.png -i audio_mixed.wav` final encode, with the exact Daxur-Daemon settings above. `.ogg`/Opus narration clips (ADR-008) are consumed directly — the system `ffmpeg` build's `--enable-libopus` makes this work with no transcode step.

**Verification performed (not just "should work"):**
- Ran the full pipeline end-to-end against `replay/test-scenarios/scenario-1` (nav → click → circle → click, all 4 events have short-narration `.ogg` clips) with `--narration=short --fps=30`.
- `frame-plan.json`: 210 frames, 4 narration clips, total duration 6973ms (correctly stretched past the manifest's raw event timing, since `circle-3`'s narration clip is longer than its 1600ms visual duration).
- Rendered all 210 frames via Pillow; visually inspected frame 50 (mid cursor-glide toward Settings, base screenshot composited correctly, white cursor arrow with black shadow visible) and frame 108 (mid circle-gesture — dashed gold orbit-guide ring visible around "Notifications", cursor correctly orbiting it).
- Final `ffmpeg` mux produced a real, ffprobe-verified file: `hevc`/`hvc1` tag, `yuv420p`, 1280x800, 30fps, 7.0s video stream; `aac` 128kbps audio stream, 6.367s; 176KB total. This is a genuine, playable `.mp4` — not a synthetic claim.
- Saved a copy of the export at `replay/test-scenarios/scenario-1/exports/scenario-1-short.mp4` for inspection.

**Consequences:**
- Video export now works end-to-end for any existing scenario with `move`/`circle`/`asyncWait` phases, run via `node scripts/export-video.mjs <scenario-dir> [--fps] [--narration=short|long|off] [--out]` — no browser, no new npm dependency, nothing blocked by the sandbox's network allowlist.
- **Duplication risk, same shape as the existing `player.js`/`ReplayPlayerComponent` duplication (ADR-004's closing note):** `build-frame-plan.mjs` is now a *third* copy of the timeline math. Whoever changes `buildTimeline()`/`sampleAt()`/`drawRipples()` in either existing player must mirror the change here too, or video export will silently drift from live playback. Worth eventually extracting the math into one shared module all three call into, rather than three independently-maintained copies — not done now, flagged as a follow-up.
- The dashed-orbit-guide approximation (arcs instead of a true dash pattern) is a known, accepted minor visual difference from the live canvas player — revisit if it's ever visibly distracting in a real export.
- Audio mixing assumes narration clips never overlap (true for every existing scenario, since `buildTimeline()` only ever stretches phases to fit one narration clip at a time) — if a future manifest ever produced overlapping narration windows, `amix` would blend them, which is probably undesirable; not a problem with any current scenario, so not solved here.
- Long-narration (`--narration=long`) and no-narration (`--narration=off`) modes are implemented (same code path, just a different manifest field/skip), but only `short` was exercised end-to-end for this ADR's verification pass.
