# Roadmap / Future Ideas

## Feature: TTS narration for replays — ✅ Done

- Uses Daxur Daemon's local TTS capability (Chatterbox TTS) to generate spoken narration for replay sequences
- Two variants per event: a short version (concise) and a long version (detailed walkthrough) — `narrationShort` / `narrationLong` text fields on each manifest event
- Audio is pre-generated and cached via `scripts/generate-narration.mjs` (not generated live in-browser) into `narrationAudioShort` / `narrationAudioLong` manifest fields
- Implemented in both `replay/player.js` and `replay-app`'s `ReplayPlayerComponent`; narration on/off/short/long is a dropdown in both players
- See ADR-004 for the timing-sync and playback-speed decisions

### Timing sync — resolved

- Per step, duration = whichever is longer (visual action vs narration audio) — an extra hold phase is appended after the visual action if narration runs longer, so playback always waits for both before advancing
- Playback speed (0.5x–2x) applies uniformly to narration audio via `playbackRate`, matching the visual timeline; this is not pitch-corrected (see ADR-004 for why that's an acceptable tradeoff here)

## Feature: Seeded deterministic cursor noise — ✅ Done

- Optional numeric `seed` field on the manifest seeds a small deterministic PRNG (mulberry32, no new dependency)
- Adds small wobble to bezier mouse-move control points and circle-gesture radius/angle, so replays don't look perfectly robotic
- Same seed + same manifest always reproduces the same wobble (no `Math.random()`); cursor still arrives at the exact intended coordinates every time
- Implemented identically in both `replay/player.js` and `replay-app`'s `ReplayPlayerComponent`
- See ADR-004 for the algorithm choice and jitter-envelope design

## Feature: `asyncWait` action (time-compressed long waits) — 💡 Proposed, not built

- Problem: long async waits (e.g. a 30-50s loading spinner/progress bar) shouldn't be skipped entirely (reads as fake/instant) or shown at real duration (dead air) — stop-motion-ui captures sparse screenshots, not video, so this needs time-compression, not a "skip video segment" mechanism
- Mechanism: new manifest action type `asyncWait` — during real capture, sample a handful of screenshots across the real wait window (e.g. every 1-2s, capped ~4-6 frames — enough to convey motion like a spinning spinner or advancing progress bar), plus metadata for the real elapsed duration
- On replay: cycle through the captured frames for a compressed display duration instead of waiting the real duration — reuses the existing "loop frames over a phase duration" mechanic already built for circle-gesture orbit phases in `replay/player.js`; no new playback logic needed
- Tuning knob: configurable display-duration cap per `asyncWait` event — sensible default ~2-4s, floor ~1s (below this reads as a glitch), ceiling ~4s (above this drags) — this is the quick-vs-realistic balance
- Narration interaction: existing "whichever is longer" timing-sync (visual hold vs narration duration, speed-adjusted — see ADR-004) applies here too, same pattern as other steps
- Demo app implication: `replay-app` Demo Gallery needs a second page/route with a deliberately slow flow (button → 30-50s spinner/progress bar → result), specifically as a test fixture for this feature once built
- Flag: the demo-readiness-checklist's "ready/idle signal" pattern is normally used to know when it's *safe to skip* a wait — for `asyncWait` capture it's used differently, to mark the real start/end of the loading window so the capture tool knows where to sample frames within it, not to skip past it. Worth adding as a nuance to that skill's docs later; not edited yet.
- Status: idea/proposed, not yet built

## Feature: `type` action (text input animation) — 💡 Proposed, not built

- Problem: a click→type→screenshot sequence currently jumps straight from empty to final text value at the next screenshot — no animation in between, unlike mouse movement which eases naturally across gaps via the bezier cursor logic. Typing into a form field is common enough in real UIs that this gap matters for demo realism
- Mechanism: new manifest action type `type`
- Two possible implementation approaches — **open design decision, not yet picked**:
  1. **Synthesized typing** — no extra screenshots needed. Render the target text character-by-character (or small chunks) directly in the replay canvas over the input element's known bounding box, with seeded variable cadence reusing the existing mulberry32 PRNG pattern (same as mouse wobble) so typing speed has natural human-like variance instead of robotic uniform timing. Cheap, zero extra capture cost; fidelity depends on matching the input's font/styling closely enough that the overlay looks native rather than pasted on top
  2. **Real partial element captures** — capture a handful of cropped screenshots of just the input's bounding box at intervals while typing (not full-screen), then composite those onto the base screenshot during replay. A strong concrete use case for the element-region screenshot compositing idea in `docs/open-questions.md` — typing is arguably a better fit than the loading-spinner case that idea was originally floated for, since the input region is small, well-defined, and (unlike a spinner during a loading state) isn't at risk of unrelated layout reflow shifting it mid-action
- Status: idea/proposed, not yet built; implementation approach (1) vs (2) above still open
