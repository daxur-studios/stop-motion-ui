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
