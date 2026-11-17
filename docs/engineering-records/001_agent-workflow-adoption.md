---
type: EngineeringRecord
title: "Adopt Engineering Records and Agent Workflow"
description: "Dated decisions and verification evidence for Stop Motion UI's agent instructions and numbered work records."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record_id: er-001
scope_history_schema: 1
plans:
  - /docs/plans/001_agent-workflow-adoption.md
performance: []
---

# Engineering Record 001: Adopt Engineering Records and Agent Workflow

Plan: [PLAN-001](/docs/plans/001_agent-workflow-adoption.md).

## 2026-11-05 — Starting

**Goal.** Bring Stop Motion UI's agent guidance and documentation lifecycle in line with the current Engineering Record and Plan practice used in the triangular workspace, then archive this completed adoption pair with the Triangular CLI.

**Open decisions and assumptions.** The repo has no prior numbered plan/record system or root agent instructions. The installed/source Triangular CLI can target it using `--root`; this avoids adding a runtime dependency.

**Checks.** Record document validation and archive outcomes below. No product code or test behavior is in scope.

## History

Append dated findings, decisions, scope changes and verification. Do not erase earlier outcomes when a plan is superseded.

## 2026-11-05 — Adoption completed

**Decision.** `AGENTS.md` is the canonical repository guide. `CLAUDE.md` points Claude to that shared guide instead of maintaining a divergent copy. `docs/plans-and-runbooks.md` records the local lifecycle and uses the Triangular CLI against this repo root.

**Changes.** Added the repo instructions, the concise workflow convention, paired Plan/ER indexes and a second pair for exploring video-recording workflows. Updated the README's project description/status: this is now a replay, narration and MP4-export prototype, while the documented live capture verification and integration with `triangular-engine/testing` remain open.

**Evidence boundary.** The README's live-capture status follows the current capture runbooks. The triangular testing-video details below are sourced from ER-072/073 and their tooling documentation; agent-client display differences are user-reported observations, not independently verified here.

**Verification.** The Triangular CLI refreshed both Plan scope reviews. `triangular docs records check --root .` reported `OK: 2 mapped and 0 legacy plan(s)`, with review freshness, phase readiness, relations and reciprocal links valid. `git diff --check` passed; Git only noted that the working-copy README's LF endings may normalize to CRLF on Windows. No product tests or builds were run for this documentation-only change.

**Archive intent.** Archive PLAN-001 and ER-001 through the CLI after their full source documents are present in Git history, so the stubs remain restorable.

## 2026-11-05 — Archive awaits committed source

**Outcome.** The requested `triangular docs archive` command was attempted and refused the pair because both documents are uncommitted. The CLI requires a source commit containing the complete Plan and ER; `--force` cannot create that history, and `--commit HEAD` would make the stubs point to a commit where these new files do not exist.

**Decision.** Keep PLAN-001/ER-001 intact and mark the archive phase blocked. Agents do not commit in this repo, so the user or maintainer can commit the reviewable documentation first and then run `triangular docs archive docs/plans/001_agent-workflow-adoption.md --root .`. Added this prerequisite to `AGENTS.md` and `docs/plans-and-runbooks.md` for future work.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
