---
name: demo-readiness-check
description: Audits a repo/UI for gaps before recording a stop-motion-ui demo (data-testid coverage on interactive elements, busy/idle readiness signal, viewport pinning, deterministic demo data, async pitfalls like debounce/toasts/lazy-load/optimistic-UI, and auth/session reproducibility). Use this whenever the user wants to "prep a repo for a demo recording," "check if this UI is ready for stop-motion-ui," "audit data-testids before capture," or mentions recording a walkthrough/demo of an app and wants to avoid brittle or flaky captures. Trigger even if they don't say "stop-motion-ui" by name — any mention of prepping a UI for automated screenshot/replay capture, or asking why a recording broke after a refactor, should pull this in.
---

# Demo Readiness Check

Stop-motion-ui captures replace a live recording with screenshots + cursor animation driven by an
agent clicking through a UI. That only works if the UI can be targeted reliably and the harness
knows when it's safe to act. This skill audits a target repo against
[`docs/demo-readiness-checklist.md`](../../docs/demo-readiness-checklist.md) and reports concrete
gaps — file/line references, not vague advice.

## Why this matters

Two failure modes account for almost all broken or flaky demo captures:

1. **Brittle targeting** — clicks driven by CSS selectors or screen coordinates break the moment
   someone reorders a flexbox or renames a class. A stable `data-testid` (or
   `data-stopmotion-id`) survives refactors.
2. **Guessed timing** — without a way to ask "is the app idle right now?", the capture harness
   either races ahead of an in-flight fetch/animation or pads every step with a fixed sleep that
   makes captures slow and still occasionally wrong.

Everything else in the checklist (deterministic data, pinned viewport, seeded auth) is about
making repeat captures comparable rather than about correctness per se — still worth flagging, but
secondary to the two above.

## Workflow

1. **Confirm the target repo.** If invoked without a clear path, ask which repo/app is being
   prepped for a demo (it's very likely not this stop-motion-ui repo itself, but whatever app is
   about to be recorded).

2. **Find interactive elements and check testid coverage.**
   - Search the UI source for clickable/focusable elements: `<button`, `<a `, `<input`, `onClick`,
     `onPress`, role="button", and framework-specific equivalents (Vue `@click`, Svelte `on:click`).
   - For each match, check whether it (or a near ancestor) already carries `data-testid`,
     `data-stopmotion-id`, `data-cy`, or `data-test` — treat any of these as covered, don't force a
     specific attribute name if the repo already has a convention.
   - Use `scripts/find_missing_testids.sh <path>` for a fast first pass (ripgrep-based); it's a
     heuristic, not ground truth — skim the actual surrounding code for matches it flags before
     reporting them, since some "misses" are decorative elements that don't need a handle.
   - Report misses grouped by file, prioritizing nav/modal/form controls — these are the elements
     a demo script clicks most.

3. **Check for an existing busy/idle signal.**
   - Search for patterns like `data-busy`, `__appIdle`, `isLoading`, a global loading store, or a
     network-in-flight counter.
   - If something exists, note what it is and whether it's exposed somewhere a capture harness
     could actually read it (a DOM attribute or `window` global — not just internal component
     state).
   - If nothing exists, this is the highest-priority gap to flag. Suggest the minimal version: one
     `data-busy="true|false"` attribute on the app root, flipped by a single counter of in-flight
     async work (fetches, pending timers/debounces, running CSS transitions). Don't prescribe a
     specific state-management approach — the repo's existing patterns should decide that.

4. **Scan for the common async pitfalls** from the checklist: debounced search inputs, toasts/
   snackbars with auto-dismiss timers, lazy-loaded or virtualized lists, stacking modals, optimistic
   UI that reverts on error. Grep for tells like `debounce(`, `setTimeout` near toast/snackbar
   components, `react-window`/`react-virtualized`/`IntersectionObserver`, and rollback logic in
   mutation error handlers. Flag what's found — these need explicit wait conditions or
   demo-data choices that avoid triggering them mid-capture.

5. **Check viewport, demo data, and auth setup** — lighter touch than steps 2-4:
   - Is there a fixture/seed script producing deterministic demo data, or does the app pull live
     data with timestamps/random content?
   - Is there a test account, seeded session, or auth bypass for demo environments, or would a
     real login flow (with MFA/onboarding variance) sit at the start of every capture?
   - These are usually a repo-level decision rather than a code change — report status, don't
     necessarily prescribe a fix.

6. **Report.** Structure the output as a gap list against the checklist, ordered by impact (testid
   coverage and idle signal first, since those break captures outright; the rest affect
   reproducibility). For each gap: what's missing, where (file/line), and the smallest change that
   would close it. If everything's covered, say so plainly — don't manufacture findings.

## Output format

Use this structure:

```
# Demo Readiness Report — <repo/app name>

## Blocking gaps
- [ ] <element/file> — no data-testid, currently targeted by <whatever the demo script would have to rely on>
- [ ] No busy/idle signal found — capture harness has nothing to poll

## Reproducibility gaps
- [ ] <e.g. live timestamps in <component>, no seeded demo data>
- [ ] <e.g. login flow has no test-account bypass>

## Watch for during capture
- [ ] <e.g. toast in <component> auto-dismisses after 2s>

## Looks good
- <whatever's already covered — don't skip this section, it's useful confirmation>
```

## Reference

See [`docs/demo-readiness-checklist.md`](../../docs/demo-readiness-checklist.md) in this repo for
the full checklist this skill audits against.
