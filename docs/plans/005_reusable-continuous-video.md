---
type: Plan
title: "Reusable continuous video recipes"
description: "Implementation goals and acceptance criteria."
timestamp: 2026-11-06T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/005_reusable-continuous-video.md
map_schema: 1
document_id: plan-005
initiative_id: "reusable-continuous-video"
performance: []
---

# Plan 005: Reusable continuous video recipes

Status: **implemented and verified locally**. Evidence and decisions: [ER 005](/docs/engineering-records/005_reusable-continuous-video.md).

<!-- tri:scope -->

## Intended outcome

Ship continuous browser-page recording alongside reconstructed demos, using the same installed CLI. Recipes name segments, accelerate real waits with visible badges, use timed pointer input, and reuse supplied/Daxur narration. Preserve source-frame and pointer timing plus source/output mapping. Adopt the package in the existing game demo and verify an installed tarball in an isolated consumer. No engine/testing API merger, system-audio capture or registry publication.

## Phases and acceptance

- **package-api** — Implement defineVideo, paced input, staged continuous capture and reusable export. Acceptance: browser tests cover real input, accelerated waits, narration holds, rerendering and cancellation; screenshot tests still pass.
- **consumer-adoption** — Replace demo-local recording machinery with a package recipe. Acceptance: an installed archive generates a narrated game clip with retained mappings and no source-checkout runtime dependency.
- **agent-guide** — Ship types, example and adoption skill. Acceptance: a scratch consumer installs the archive and runs the documented recipe; skill and document checks pass.

## Relationships

Continues Plan 002 continuous-recording exploration and Plan 004 cursor continuity; complements Plan 003 installed screenshot recipes.
<!-- /tri:scope -->

## Current phase status

| Phase    | State   |
| -------- | ------- |
| package-api | done |
| consumer-adoption | done |
| agent-guide | done |

<!-- tri:review version="1" scope-hash="1d319983e056ca1573e84577bdbc0471c3681eb1330fe6c83df0f6bb3be55934" reviewed="2026-11-06" reviewer="agent" -->
<!-- /tri:review -->

## Delivery progress

2026-11-06: Six package tests, bundled build, declarations, skill validation and isolated installed-example run passed. An installed consumer captured the narrated game and rerendered it with the final archive: 42.867 seconds, 1,400,410 bytes, HEVC/hvc1 + AAC. Inspected decoded segment samples, including 3x/5x badges and victory. Fresh human motion/listening acceptance remains separate. The package remains privately distributed by local archive. Leave the full pair for maintainer commit before CLI archival.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after
explicit developer confirmation; document review and checked boxes do not imply confirmation.
