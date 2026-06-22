# Demo Readiness Checklist

Pre-flight checklist for prepping any repo/UI before recording a stop-motion-ui demo of it.

## Stable element targeting

- Add `data-testid` (or `data-stopmotion-id`) attributes to key interactive elements — buttons, inputs, nav items, modals
- Avoids brittle CSS-selector / visual-position clicking that breaks on refactors
- Prefer one stable attribute per target over chained selectors (`.btn-primary > span:nth-child(2)`)

## Ready/idle signal

- Expose a "ready/idle" signal instead of relying on fixed sleeps
- e.g. a `data-busy="true|false"` attribute on the app root, or a `window.__appIdle` boolean
- Toggle it whenever something async is in flight: pending fetch, active CSS transition/animation, debounce timer
- Capture harness should poll this signal instead of guessing wait durations

## Viewport & rendering consistency

- Pin viewport size for recording sessions — consistent screenshot dimensions across runs
- Disable/lock OS-level zoom, dark-mode auto-switching, or font-scaling that could shift layout between runs

## Deterministic demo data

- Use seeded/deterministic demo data where possible
- Avoid live timestamps, random avatars, "x minutes ago" text — anything that changes between recordings
- Deterministic data makes re-captures diffable and comparable run to run

## Common async pitfalls

- Debounced inputs (search-as-you-type) — wait for the debounce window, not just the keystroke
- Toasts/snackbars that auto-dismiss in 2-3s — capture window may need to be tight
- Lazy-loaded / virtualized content — scroll/trigger before assuming an element exists
- Modals stacking on z-index — confirm the right modal is on top before interacting
- Optimistic UI that can revert on error — don't capture success state before the real response lands

## Auth/session

- Use a consistent test account or seeded session state
- Avoids login flow variance (MFA prompts, first-login onboarding, expired sessions) breaking reproducibility
- Pre-warm/pre-authenticate session state outside the recorded sequence where possible

## Narration authoring rules

These apply to anyone (human or agent) writing `narrationShort`/`narrationLong` strings for a capture script (e.g. `session.addClick(...)`, `session.addCircle(...)` calls in `capture-demo.ts`). Narration is meant to sound like a person walking through the product, not a templated log message — the fastest way to break that illusion is a repeated phrase.

- **Never repeat the same phrase/clause back-to-back across consecutive steps.** A real bug this caught: a loop that clicked a counter's increment button twice gave both clicks the exact narration string ("Incrementing the counter."), so playback said "Incrementing the counter... incrementing the counter" with nothing else changing — the single most noticeable moment (a number visibly changing on screen) became the exact moment a viewer hears it's not a real person.
- **When a loop performs the same physical action more than once** (repeated clicks, repeated scrolls, etc.), vary the narration per iteration — read back the actual resulting state (a counter value, a step number, an updated label) and narrate *that*, rather than restating the verb phrase identically each time. "Incrementing the counter to 1." / "Clicking it again brings the counter up to 2." reads as natural; "Incrementing the counter." / "Incrementing the counter." does not.
- **Describe the resulting state in one natural pass, not two.** Avoid "Incrementing the counter, incrementing the counter to 2" — say the action and the outcome together as a single sentence ("Incrementing the counter to 2.").
- **Prefer present-progressive, conversational phrasing** ("Opening the dropdown.", "Scrolling down to the dialog trigger.") over clipped log-style fragments, and vary sentence shape between consecutive steps even when the underlying action type repeats (a click, then another click, then another click) so the narration doesn't fall into a sing-song template.
- When authoring narration for a multi-iteration capture step, write out all the iterations' strings together and read them back to back before committing — if it sounds like a stutter, rewrite it.
