---
type: Plan
title: "Adopt Engineering Records and Agent Workflow"
description: "Add repository guidance and document conventions for scoped plans, append-only engineering history, evidence and CLI archival."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/001_agent-workflow-adoption.md
map_schema: 1
document_id: plan-001
initiative_id: "agent-workflow-adoption"
performance: []
---

# Plan 001: Adopt Engineering Records and Agent Workflow

Status: **in progress**. Evidence and decisions: [ER 001](/docs/engineering-records/001_agent-workflow-adoption.md).

<!-- tri:scope -->

## Intended outcome

Stop Motion UI has repository-level agent guidance and a concise local convention for numbered Plans and Engineering Records, based on the current Triangular workflow. The guidance makes the project boundary, evidence expectations, archival lifecycle and user preferences clear to future agents. This is a documentation adoption; it does not migrate old ADRs or implement the separate product exploration in Plan 002.

## Phases and acceptance

- **agent-instructions** — Add canonical cross-agent guidance and a short Claude entry file. Acceptance: agents are directed to the same plan/record lifecycle, preserve local work, do not commit, and distinguish functional, performance and human visual evidence.
- **record-convention** — Document pair creation, scoped review, append-only history, indexes, and archive/restore commands. Acceptance: the instructions identify the Triangular CLI commands and consumer-root option without adding a runtime dependency.
- **project-status** — Refresh the README summary to match the implemented prototype and state its boundary from `triangular-engine/testing`. Acceptance: the README links to the active exploration plan and no longer presents the original rough POC as the full current state.
- **archive-completed-pair** — Record this documentation adoption and archive PLAN-001/ER-001 through the Triangular CLI. Acceptance: the CLI writes archived stubs, preserves the original pair in Git history, and marks the pair archived in both indexes.

## Relationships

- related-to: [/docs/plans/002_testing-video-workflows.md](/docs/plans/002_testing-video-workflows.md)

<!-- /tri:scope -->

## Current phase status

| Phase | State |
| --- | --- |
| agent-instructions | done |
| record-convention | done |
| project-status | done |
| archive-completed-pair | blocked |

<!-- tri:review version="1" scope-hash="47fe57e09d734b58222a624fe132c4e15915d34aaf8d259fd00b89eae41bcfcf" reviewed="2026-11-05" reviewer="agent" -->
<!-- /tri:review -->

## Delivery progress

2026-11-05: Added root agent guidance and a Claude pointer, documented the local record workflow, corrected the README project summary, and created PLAN-002/ER-002 for the still-open product exploration. The pair passes CLI validation; archival awaits a commit containing the full source documents so the archive stubs can point to recoverable Git history.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after explicit developer confirmation; document review and checked boxes do not imply confirmation.
