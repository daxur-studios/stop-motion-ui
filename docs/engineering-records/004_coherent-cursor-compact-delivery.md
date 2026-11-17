---
type: EngineeringRecord
title: "Coherent cursor motion and compact delivery"
description: "Dated decisions, findings and evidence for Coherent cursor motion and compact delivery."
timestamp: 2026-11-06T00:00:00Z
tags: [engineering-records]
record_id: er-004
scope_history_schema: 1
plans:
  - /docs/plans/004_coherent-cursor-compact-delivery.md
performance: []
---

# Engineering Record 004: Coherent cursor motion and compact delivery

Plan: [PLAN-004](/docs/plans/004_coherent-cursor-compact-delivery.md).

## 2026-11-06 — Starting

**Goal.** Compact default delivery and coherent cursor movement. The owner confirmed the HEVC derivative plays on their phone, requested that default, and reported possible cursor teleporting in the game clip. Treat this as authorization for the code/default corrections, not a scope baseline or complete motion-quality acceptance.

**Open decisions and assumptions.** See the current scoped review in [the plan](/docs/plans/004_coherent-cursor-compact-delivery.md).

**Findings and decision.** The installed renderer already supports HEVC/hvc1 CRF 28 and H.264 CRF 23; only the installed CLI/library defaults and current guide need switching. Encode directly using the existing HEVC settings, rather than requiring Daxur or a second lossy pass. Keep `--codec h264` as the explicit override. Ship these changes as 0.2.1; already-installed immutable packages require an upgrade.

Cursor glitches were previously documented in ADR-004 (circle entry/exit) and the roadmap (non-animated scrolls). Remaining maintained-renderer branches for waits and animated scrolls assumed their recorded pointer position already matched the displayed cursor. A circle exits on its circumference while the capture API retains its center, so circle-to-wait/scroll can violate that assumption. Add a 500 ms approach only when coordinates differ; preserve wait/scroll display duration, attach narration to the first approach phase, preserve narration holds, and suppress click ripples on these non-click approaches. Export-only cursor timeline diagnostics allow regression checks against the actual bundled renderer, rather than a copied timeline implementation. Deprecated replay/legacy backends are not changed.

The demo-local continuous producer has a separate issue: its displayed initial position was (1050,400) but Playwright's real mouse was never initialized there. `mouse.move({steps:14})` then emitted a variable-duration sequence that a capped screencast can miss, and `locator.click()` could reposition again. Its local pacing helper now initializes real input, eases moves over 500–1100 ms, waits for arrival, checks stable visible/uncovered target bounds, and presses/releases at the displayed position. It retains timestamped pointer samples. This is still a game-local proof, not a continuous backend shipped in Stop Motion.

**Functional verification so far.** `npm run build:package` passed. `npm test`: four tests passed, including maintained renderer boundary continuity (circle, wait, animated/plain scroll, click, zero/short timestamp gaps, narration catch-up and same-position waits), actual HEVC/hvc1 default output and explicit H.264 rerender, audio caching, failure diagnostics and cancellation. The game helper's headless `node --test tools/scene-tests/paced-mouse.spec.mjs` passed: rendered intermediate positions, timed movement, exact click position, repeated same-target clicks, and disabled/covered target refusal. These are functional checks, not performance measurements or human motion/listening acceptance.

**Capture retry.** The first fresh game recording timed out at readiness with zero frames while the owner-served daemon was rebuilding. `daxur app status triangular-demo --json --wait` subsequently reported a successful live build with zero errors/warnings. Retried against the existing server; started no server. Added a failure screenshot to the recorder diagnostics. Final media evidence follows below.

## 2026-11-06 — Delivered evidence and package

Fresh demo-local recording succeeded: `D:/code/triangular-workspace/ignore/moon-boop-videos/2026-11-06T11-51-41-137Z/demo.mp4`. FFprobe reports 42.004 seconds, 1440x960, HEVC/hvc1, limited-range yuv420p and AAC narration, 1,333,868 bytes. Retained 798 source frames, 58.73 seconds of source, 233 pointer samples and segment mapping. The first approach montage shows intermediate pointer positions; the overall contact sheet shows game progression, accelerated footage labels and final 18-cat victory. More visible pointer travel makes this longer than the previous clip, so those file sizes are not a controlled encoding comparison. Supplied narration was reused without new TTS calls. Human continuous-motion/listening acceptance remains pending; no performance measurement is claimed.

Packed `ignore/packages/cursor-compact-20261106/daxur-studios-stop-motion-ui-0.2.1.tgz` (225.7 kB compressed). SHA256: `7DB7F1ED34F68B6CC2BF476493C97F0342709B8B25A3CDFEBEBE30817C8DEA2D`. Installed the actual tarball into an isolated temporary npm project. Fresh dependency resolution selected Playwright 1.65.0, whose browser was absent; both initial renders produced the expected install-browser diagnostic. For this trial only, selected tested Playwright 1.64.1 within the supported dependency range, reusing the existing browser. Both installed 0.2.1 renders succeeded: default HEVC/hvc1 (`ignore/installed-021-checks/run-rpWBVM/result.json`) and explicit H.264 (`run-sItak7/result.json`), each 46 frames / 7.667 seconds at 640x480/6fps. Narrated streams were separately checked by the package workflow test and game clip. A consumer installing newer Playwright may need its documented browser-install step; no browser was downloaded here.

`triangular docs records review` and `check` pass for all four mapped plans after correcting the new pair's phase-state spelling and resolved-item metadata. No baseline, staging, commit or archival was performed. Existing consumers were not edited. Leave the full pair for maintainer review/commit before archival. Next substantial integration: extract demo-local continuous capture, timed pointer and segment retiming into the package and adopt it through a consumer recipe. The current screenshot-mode repair and HEVC default are in the local tarball; continuous recording remains game-local.

## History

Append dated findings, decisions, scope changes and verification. Do not erase earlier outcomes when a plan is superseded.

## 2026-11-06 — Owner motion feedback

The owner said the revised clip was better and requested adoption in other repositories. Plan 005 packages continuous recording and paced input. This records feedback on that pilot, not listening quality, performance or acceptance of future exports. Keep the pair intact until maintainer commit before archive.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
