# Concept & Vision

## Capture model

- Listen for discrete events: click, navigate (Phase 1); scroll/drag, animation start/end (Phase 2)
- On each event: take a screenshot, record cursor position + timestamp + action type
- Output: a `screenshots/` folder + a single `manifest.json` describing the timeline

## Manifest format (high level)

- `events[]` — ordered list of `{ type, timestamp, cursor, screenshotRef, ...action-specific fields }`
- Action types: `click`, `navigate`, `circle` (Phase 1); scroll/drag added in Phase 2
- `circle` is its own action type — target + radius + duration — not inferred from cursor path
- See [`shared/manifest-types.ts`](../shared/manifest-types.ts) for exact shapes

## Replay model

- Load manifest + screenshots into the player page
- Walk the event timeline, animate a fake cursor between consecutive points using bezier easing (no straight lines, no teleporting)
- Swap the "current" screenshot whenever the timeline crosses an event boundary
- Result reads as a smooth recording, but is just stills + cursor animation
- An optional `seed` on the manifest seeds a small deterministic PRNG (mulberry32) that adds slight wobble to cursor paths/circle gestures, so replays don't look mechanically identical — same seed always reproduces the same wobble, and the cursor still lands exactly on the intended coordinates. See ADR-004.
- Optional pre-generated narration audio per event (short/long), kept in sync with each step's visual duration — whichever is longer wins before advancing. See ADR-004.
