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
