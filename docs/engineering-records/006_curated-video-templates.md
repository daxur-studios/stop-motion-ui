---
type: EngineeringRecord
title: "Curated video templates and daily development stories"
description: "Dated decisions, findings and evidence for Curated video templates and daily development stories."
timestamp: 2026-11-15T00:00:00Z
tags: [engineering-records]
record_id: er-006
scope_history_schema: 1
plans:
  - /docs/plans/006_curated-video-templates.md
performance: []
---

# Engineering Record 006: Curated video templates and daily development stories

Plan: [PLAN-006](/docs/plans/006_curated-video-templates.md).

## 2026-11-15 — Starting

**[action]** Created this reciprocal Plan/ER pair using the Triangular CLI at Bruno's request. Planning only; no runtime or package changes.

**[decision]** Curate a small reusable set: vertical short, desktop showcase and matched comparison. First implementation checkpoint is the same real scenario in vertical and desktop formats, with references and reproducible recipes; extract shared presentation after seeing both.

**[finding]** Stop Motion UI already packages screenshot reconstruction and continuous browser recording with optional supplied/generated narration. Plan 005 records local consumer verification. The BSP Volcano Freight pilot is a silent 24-second vertical seed; Bruno liked the format and asked whether it should have sound. This is feedback on that pilot, not new-template acceptance or an audio requirement.

**[action]** Preserved the later use case Bruno described: stitch Git changes and cross-provider sessions into a coherent development-day story, covering Codex/Claude/Antigravity, parallel work, handovers, available token/cost information, spoken chapters, highlights/shoutouts, successes, setbacks and possible lessons.

**[decision]** Proposed boundary: Æ assembles evidence and optional bounded analysis; Stop Motion UI presents a portable brief and selected media. Start with a curated fixture, then validate a minimal live producer contract. No new session ingestion/store in Stop Motion UI and no Æ implementation in this task.

**[finding]** Æ's session documentation describes a transactional registry with read-only native readers, timestamped observations and revision-checked annotations. Full transcript browsing and dedicated session commands are not implemented there. Cross-provider usage completeness, handover extraction and an export API were not established by this review.

**[decision]** Preserve uncertainty and provenance: no invented handovers or commit attribution; no double-counting mirrored/cumulative usage or parallel elapsed time; unknown usage stays unknown. Reported costs and estimates remain separate. A green focus box is editorial, while result badges require actual scoped checks.

**[decision]** Keep future analysis cheap and bounded: deterministic grouping, compact evidence candidates, cacheable optional cheap-model analysis with explicit caps and no escalation. Retain a manual path and an editable script. Public output requires selected/redacted inputs and owner review; rendering never automatically publishes.

**[question]** A real sample day must establish what timing, change attribution and provider usage are actually available before promising automated recaps. This exploration is deferred and does not block initial template curation.

**[verification]** Triangular scope review refreshed; `docs records check --root .` passed for all six mapped plans, including phase readiness and reciprocal links. Both indexes and the roadmap include this initiative. Roadmap whitespace check passed; local Æ reference documents and the BSP seed recipe exist. No media rendering, provider usage extraction, model call or runtime test was performed. Existing unrelated working-tree changes were preserved; nothing staged or committed.

## 2026-11-15 — First reference pair for review

**[action]** Extended the BSP Volcano Freight recipe with a `FREIGHT_FORMAT=desktop` 1280 × 720 treatment. The 720 × 1280 vertical treatment remains its default. Both use the same gameplay actions and assertions, with layout-specific framing; presentation has not yet been extracted into a reusable package.

**[verification]** A fresh desktop run produced a 24.3-second, 3,963,998-byte H.264 MP4 with no audio. The blocked route, 35% rating, scheduled route, first 10 t delivery and positive energy assertions passed. The source contact sheet shows all five beats, including the title and delivered result. This is not performance evidence or owner acceptance. The earlier vertical pilot remains available (24.13 seconds, 2,795,176 bytes, silent). Commands and local artifact locations are recorded in the plan. Recipe syntax and whitespace checks passed. Captions and pacing need owner review at actual viewing size; no audio quality was assessed.

## 2026-11-15 — Continuous recording storage

**[finding]** Continuous recording uses timestamped JPEG frames as encoder inputs and for optional rerendering; prior successful runs retained them indefinitely. The desktop reference had 610 frames (43,633,109 bytes) and the earlier portrait reference 605 frames (36,776,540 bytes), in addition to their MP4s. BSP had ignored only `artifacts/test-runs/`, leaving the new folder visible to Git.

**[action]** Ignored BSP's local `/artifacts/` and removed only those two regenerable source-frame folders, retaining the videos and other run data. Those two scenarios can no longer be rerendered without recapture. Updated the Stop Motion UI source CLI so successful continuous `run` removes its own source frames by default; `--keep-source` or `capture` preserves them. Failure diagnostics can still contain frames, and the per-run limit is not a global disk quota. Older installed packages keep the previous behaviour until refreshed.

**[verification]** The focused continuous CLI tests passed: retained source can rerender, capture preserves its inputs, and a successful default run removes its frame folder while retaining the video. Git confirms the BSP artifact path is ignored; both existing MP4s still exist. Triangular records validation and syntax/whitespace checks passed. The older installed archive was not rebuilt or refreshed.

## 2026-11-15 — Prioritize the daily development story

**[decision]** Bruno watched the vertical and desktop reference pair and found them acceptable. He wants to focus on a daily development story, bounded evidence and inexpensive session analysis. He also proposed a dedicated Æ provider integration-testing area to surface breakage after Codex, Claude or Antigravity updates.

**[action]** Created sibling Æ Plan/ER 021 for source coverage, sanitized provider compatibility fixtures and opt-in read-only diagnostics, bounded evidence, a story brief and a real-day pilot. Added candidate recap scenes in this plan. One read-only metadata survey found discovery limits and incomplete start-time data, so a continuous or complete cross-provider timeline is not yet supported. No cheap model, transcript digest, integration diagnostic or recap video was run.

## History

## 2026-11-16 — First real development-day film

**[decision]** Bruno asked for a video now to get a feel for the outcome, before completing automatic collection. He explicitly selected Sunday 15 November after a midnight date clarification. This supersedes the earlier fixture-before-live-pilot ordering for this experiment; it does not imply approval for publishing or complete historical ingestion.

**[action]** Added `examples/day-story.video.mjs`, a seven-chapter continuous-browser documentary treatment of the shared Æ day-story contract. The private brief/assets are supplied through environment variables rather than committed in the recipe. Uses observed conversation endpoint dots, discussion cards, an exact short user excerpt, two existing video excerpts and local Kokoro narration through Æ. The sampled source logs confirm 62 sessions with dated messages across four providers, including consultations and smoke tests. The current Codex agent curated this pilot; no additional Luna/panel call was made. Source coverage is partial and usage totals are not assessed. No claims of hours worked are made.

**[verification]** Tool doctor passed. The initial capture completed all seven chapters and seven audio clips, but render validation found the last browser frame 2.170 milliseconds beyond the wall-clock source duration. Updated the source capture finalization to include the last recorded timestamp, extended the retained capture's final interval accordingly (preserving pre-repair metadata), then rendered the retained footage. Final output: 84.917 seconds, 1280 × 720, 24 fps, H.264 yuv420p, AAC mono 24 kHz, 3,054,137 bytes. Full FFmpeg decode passed. Contact sheet and full-resolution timeline/reflection cards were inspected; selected recorded clips are visible. Subjective listening and owner playback/visual acceptance remain pending. Source package archives were not refreshed.

**[action]** Added `/artifacts/` to this checkout's ignore rules. This pilot's regenerated output stays under `artifacts/videos/day-recap-2026-11-15/`. Successful render-only recovery retains its failed capture's JPEGs, so those source frames are being removed after final verification; keep the MP4, narration and metadata. There is no automatic TTL or global storage quota.

**[verification]** Local-only output: `artifacts/videos/day-recap-2026-11-15/sunday-recap.mp4`; contact sheet and timeline under `run-bx1ze2/`. Regenerate from the currently available private inputs by setting `DAY_STORY_FILE=D:/code/brunos-iae/artifacts/videos/day-recap-2026-11-15/day-story.json`, `DAY_STORY_ASSETS=D:/code/brunos-iae/artifacts/videos/day-recap-2026-11-15/assets.json`, `DAY_STORY_SPEECH_CLI=D:/code/brunos-iae/bin/iae.mjs`, then running `node bin/stop-motion-ui.mjs run examples/day-story.video.mjs --out artifacts/videos/day-recap-2026-11-15 --codec h264 --fps 24 --timeout-ms 360000 --json`. The final narration is cached locally; the two source media clips must still exist. Private collection and curation inputs are documented in Æ ER 021. This is not a production automatic daily-video command or connected Æ timeline UI.

**[verification]** Both focused continuous-capture tests passed, including paced input, real capture, speech padding, retiming, rerendering, default source cleanup and cancellation. The pilot recipe syntax and tracked whitespace checks passed. Automatic approval review rejected this pilot's explicit source-frame cleanup with "blocked by policy"; no alternative deletion was attempted. Its failed-capture source folder therefore still contains 285 JPEGs / 20,667,104 bytes under the ignored pilot run. The final MP4 remains available and valid; manual/local cleanup is outstanding.

Append dated findings, decisions, scope changes and verification. Media acceptance remains pending.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
