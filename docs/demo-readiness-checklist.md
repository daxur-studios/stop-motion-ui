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
