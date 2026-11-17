---
type: Plan
title: "Explore Test Video Workflows for Stop Motion UI"
description: "Compare the Stop Motion UI replay/export model with triangular-engine/testing recordings and recommend a small, useful integration direction."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/002_testing-video-workflows.md
map_schema: 1
document_id: plan-002
initiative_id: "testing-video-workflows"
performance: []
---

# Plan 002: Explore Test Video Workflows for Stop Motion UI

Status: **in progress**. Evidence and decisions: [ER 002](/docs/engineering-records/002_testing-video-workflows.md).

<!-- tri:scope -->

## Intended outcome

Recommend whether and how Stop Motion UI should learn from or connect to the optional video recordings in `triangular-engine/testing`. Preserve Stop Motion UI's manifest-and-screenshot reconstruction and existing MP4 export as distinct capabilities while evaluating test-result video handoff, media previews and agent-session sharing. This plan is discovery and design only; it does not authorize changes to the separate triangular-engine repository or implementation of an importer.

## Phases and acceptance

- **compare-artifact-models** — Compare Stop Motion UI manifests/screenshots/narration/MP4 output with test-run WebM sidecars, metadata, results UI and media derivatives. Acceptance: document what each system captures, stores, displays and can verify, using repository evidence and clearly labeling user-reported client behavior.
- **compare-handoff-options** — Evaluate whether the useful connection is a result link/metadata handoff, conversion to a Stop Motion scenario, video-only export, or no integration. Acceptance: present a smallest-useful recommendation with the UX, storage, fidelity and maintenance tradeoffs; leave the decision pending if evidence does not establish a clear choice.
- **check-agent-playback** — Record which agent chat workflows can display or otherwise use the produced video artifacts. Acceptance: preserve the user's current Codex and Claude observations, mark Antigravity untested until directly checked, and avoid claiming universal video rendering support.

## Relationships

- related-to: [/docs/plans/001_agent-workflow-adoption.md](/docs/plans/001_agent-workflow-adoption.md)
<!-- /tri:scope -->

## Current phase status

| Phase | State |
| --- | --- |
| compare-artifact-models | in_progress |
| compare-handoff-options | planned |
| check-agent-playback | done |

<!-- tri:review version="1" scope-hash="1750398f278689c93d2673eb61dd37f3e1cdc8b372877951d79952b6ed2580f4" reviewed="2026-11-05" reviewer="agent" -->
<!-- tri:item id="Q1" kind="intent" applies-to="compare-handoff-options,check-agent-playback" blocks="compare-handoff-options" state="resolved" -->

- [x] Which artifact should be the primary handoff between a test run and Stop Motion UI: the original video, its test-result reference, or a reconstructed manifest-and-screenshot scenario?
  - Why it matters: the choice changes whether integration is metadata-only, requires video ingestion/conversion, or should remain a workflow/documentation link.
  - Resolution: on 2026-11-05, the user selected video as the main output for remote agent demos. No test-run-to-Stop-Motion importer is needed for the first milestone; manifests/screenshots remain internal authoring inputs. Plan 003 proposes that workflow. Any future direct testing integration will need a separate handoff decision.
  - Next action: follow Plan 003 for the proposed agent demo workflow and record actual playback behavior when the pilot is run.
    <!-- /tri:item -->
    <!-- /tri:review -->

## Delivery progress

2026-11-05: Initial repository comparison recorded in [ER 002](/docs/engineering-records/002_testing-video-workflows.md). No integration choice or implementation is approved yet.

2026-11-05 (follow-up): The user chose video as the primary deliverable and requested next steps for remote agent demos and a packaged skill. See [Plan 003](/docs/plans/003_agent-video-demo-workflow.md). Playback checks remain outstanding; a direct triangular-engine integration is deferred.

2026-11-05 (scene-testing discussion): Compared scene interaction, continuous recordings and presentation annotations. The ER records a pending recommendation to keep the packages separate with an optional adapter, a target/cue track and a small two-object pilot. Live tracking, continuous-video composition and the shared track are proposed capabilities; no implementation or user-approved integration decision is claimed.

2026-11-05 (game automation clarification): The user wants game-owned assisted actions/pilots and exposed semantic scene helpers, so recording recipes avoid continuous manual steering and Three.js traversal. Strong continuous-video capture is desired in addition to MP4 output. The ER records this direction, existing consumer building blocks and a proposed implementation sequence; this discovery plan does not claim a new capture backend or cross-repository integration is implemented.

2026-11-05 (time-compression clarification): The user reaffirmed that compressing long real waits/travel into visible, labeled accelerated motion is central to Stop Motion UI. The ER records the existing async-wait cap/badge, the newer waitFor API's endpoint-only limitation and proposed continuous-video segment retiming with synchronized overlays and normal-speed narration. The proposed rover walkthrough must demonstrate normal-speed departure/arrival around an explicitly accelerated travel segment.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after
explicit developer confirmation; document review and checked boxes do not imply confirmation.

2026-11-05 (phone confirmation): The user confirmed the MP4 embedded in this Codex chat plays on their phone. Recorded the absolute-path media-embed method in the adoption skill/guide and propagated client-specific guidance to Triangular, the UI pilot and user-level Codex instructions. Claude's existing `SendUserFile` guidance is preserved; Antigravity remains untested. This is documentation reuse, not a testing-entry integration.
