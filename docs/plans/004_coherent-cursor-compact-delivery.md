---
type: Plan
title: "Coherent cursor motion and compact delivery"
description: "Implementation goals and acceptance criteria."
timestamp: 2026-11-06T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/004_coherent-cursor-compact-delivery.md
map_schema: 1
document_id: plan-004
initiative_id: "coherent-cursor-compact-delivery"
performance: []
---

# Plan 004: Coherent cursor motion and compact delivery

Status: **implemented; owner accepted the smoother pilot**. Evidence and decisions: [ER 004](/docs/engineering-records/004_coherent-cursor-compact-delivery.md).

<!-- tri:scope -->

## Intended outcome

Default installed exports to compact HEVC/AAC after the owner confirmed phone playback of the Daxur derivative. Preserve explicit H.264 output. Make cursor position continuous across waits, animated scrolls and circle exits in the maintained screenshot renderer. Repair the demo-local continuous recorder's movement pacing and initial position so the next game clip provides reviewable evidence. Extracting continuous recording into this package remains separate work under Plan 002.

## Phases and acceptance

- **compact-delivery** — Select HEVC CRF 28/hvc1 at the final encode by default, avoiding a second lossy pass. Acceptance: installed CLI tests inspect actual default HEVC and explicit H.264 streams; help and delivery guidance agree.
- **cursor-continuity** — Add a visible glide whenever a wait or animated scroll requests a different cursor position. Acceptance: regression checks cover circle-to-wait, circle-to-scroll, narration holds and ordinary clicks, sampling actual maintained renderer boundaries.
- **continuous-pilot** — Pace demo-local real mouse movement in wall time, initialize its actual input position, retain pointer evidence, and generate another narrated game clip. Acceptance: headless recording succeeds and frame/movement evidence shows intermediate positions; owner motion acceptance remains distinct from these checks.

## Relationships

Continues the agent delivery workflow in Plan 003; informs the separate continuous-recording exploration in Plan 002. Game-local changes and evidence belong in Triangular Plan/ER 084.
<!-- /tri:scope -->

## Current phase status

| Phase    | State   |
| -------- | ------- |
| compact-delivery | done |
| cursor-continuity | done |
| continuous-pilot | done |

<!-- tri:review version="1" scope-hash="155cc338af3e22c8b6bafd227e735280f102f70e9de63be99f587db086e909de" reviewed="2026-11-06" reviewer="agent" -->
<!-- tri:item id="Q1" kind="intent" applies-to="continuous-pilot" blocks="continuous-pilot" state="resolved" -->

- [x] HEVC phone playback was explicitly confirmed by the owner on 2026-11-06; smoother mouse movement is still a new visual acceptance check.
  - Why it matters: codec playback evidence permits the requested default change but does not establish cursor quality.
  - Next action: deliver a newly recorded clip with paced pointer motion for user review.
  - Resolution: change the default on the strength of the owner's HEVC playback confirmation, while retaining an explicit H.264 override and a separate motion review for the new clip.
    <!-- /tri:item -->
    <!-- /tri:review -->

## Delivery progress

2026-11-06: Build and all four package tests passed; paced real-input headless check passed. A new 42.00-second HEVC/AAC game clip is 1,333,868 bytes, with 798 source frames and 233 pointer samples retained. Built the 0.2.1 tarball for consumer upgrades. See the ER for commands, installation checks and human review limits. Leave the full Plan/ER pair intact for maintainer commit before archival.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after
explicit developer confirmation; document review and checked boxes do not imply confirmation.
