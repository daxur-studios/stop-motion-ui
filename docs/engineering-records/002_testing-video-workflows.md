---
type: EngineeringRecord
title: "Explore Test Video Workflows for Stop Motion UI"
description: "Dated findings and decisions for evaluating integration between Stop Motion UI and agent-readable browser test recordings."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record_id: er-002
scope_history_schema: 1
plans:
  - /docs/plans/002_testing-video-workflows.md
performance: []
---

# Engineering Record 002: Explore Test Video Workflows for Stop Motion UI

Plan: [PLAN-002](/docs/plans/002_testing-video-workflows.md).

## 2026-11-05 — Starting

**Goal.** Compare Stop Motion UI's existing capture/replay/export workflow with the optional recordings added to `triangular-engine/testing`, then recommend whether a small integration would improve test-video handoff and review.

**Open decisions and assumptions.** The primary artifact and connection point are unknown: test-result links/metadata, original video, reconstructed scenario, or no product integration may be the right fit. See Q1 in [PLAN-002](/docs/plans/002_testing-video-workflows.md).

**Checks.** This is a documentation and discovery record. No browser or cross-agent playback check was performed in this pass.

## 2026-11-05 — Repository comparison

**Stop Motion UI model.** Capture scripts produce a `manifest.json` and screenshots for discrete actions. Playback synthesizes cursor motion and can add pre-generated narration; the Angular replay app exports MP4. `docs/ADOPTION-GUIDE.md` already provides a manual bridge for an external manifest-plus-screenshot capture. The capture runbooks currently describe the full live capture loop as needing fresh end-to-end confirmation.

**Testing recording model.** ER-072 records an opt-in, bounded browser recording path: the test host supplies a canvas video stream and optional in-page audio, the receiver stores validated media sidecars with metadata/references, and the test-results page plays the clip. Its original POC limits were 15 seconds and 1 MiB per case, 5 MiB per run; recording remained off by default and was excluded from performance evidence. ER-073 and the current CLI guide add on-demand GIF/contact-sheet derivatives and attributed visual-review records. This path captures rendered video directly, so it does not produce Stop Motion UI's event manifest, synthetic cursor path or narration script.

**User-reported playback.** The user reports that Claude can display the test recording in chat while Codex currently cannot; Antigravity has not yet been tried. This is an observed workflow constraint to preserve during exploration, not a verified product-wide capability claim.

**Current decision.** Treat the two artifact models as complementary evidence. Do not change Stop Motion UI's capture format or imply an importer until the handoff question is answered. No cross-repository code changes are part of this initiative.

## 2026-11-05 — Video output and agent workflow direction

The user clarified that the main output should be video, so recipients need no replay app. The immediate use case is remotely directing agents on a laptop to develop UI and games and return narrated cursor demos, beginning with `@daxur-studios/ui`. TTS will be settled separately through `daxur`; usage guidance should ship as an installed-package skill like the user's other libraries.

This resolves the immediate output question in favor of MP4 delivery and defers direct test-result ingestion. [Plan 003](/docs/plans/003_agent-video-demo-workflow.md) proposes CLI packaging, automated renderer lifecycle, reusable capture recipes, external narration, a packaged skill and a remote pilot. Borrow structured artifact metadata and media previews from the testing workflow. No new agent-client playback evidence was collected, and no integration or implementation is claimed.

## 2026-11-05 — Codex phone playback confirmation

The user confirmed that the narrated UI MP4 shared in this Codex chat can now be viewed on their phone. This supersedes the earlier user report of Codex video playback failure for this workflow. The successful method is an assistant Markdown media embed with the absolute local MP4 path, `![Demo](D:/.../demo.mp4)`, rather than a plain path/link. No separate upload call, hosted URL or direct testing-entry integration was used. This clip is H.264/AAC; other codecs/versions are not established, and listening quality was not separately confirmed. Claude retains its existing `SendUserFile` method; Antigravity is still untested.

The user requested the method be discoverable across repositories. Added a personal Codex skill and a pointer in user-level AGENTS.md on this laptop; added a portable multi-client skill to Triangular's already-packaged skill directory and linked it from its testing guidance and Claude skill. Stop Motion UI's skill/guide and the pilot repo's instructions also carry the method. Already installed package snapshots are unchanged; the personal instruction and explicit pilot rule provide immediate discovery here. This is documentation reuse, not an artifact importer.

## 2026-11-05 — Proposed scene-testing and presentation boundary

**User direction.** Explore combining narrated cursor demos with scene tests: focus targets, rectangles around 3D objects, clicking inside a scene and raycast checks. This is an architecture discussion, not authorization or acceptance of a cross-repository implementation.

**Code-verified starting points.** Stop Motion UI's installed authoring API currently exposes capture, click, circle, scrollTo and waitFor; it reconstructs screenshots rather than recording continuous scene motion. Triangular's testing adapter owns application actions, readiness, state restoration and checks. Its optional recorder accepts a host-composed MediaStream, starts immediately before measure and finalizes on all exit paths. Current recording budgets remain 15 seconds/1 MiB per case and 5 MiB per run, excluding performance suites. Triangular's review CLI already supports normalized boxes/arrows on contact-sheet frames, with separate inspection-target and reviewed-pass roles; these are not live object-tracking video overlays. Scene raycasting exists elsewhere in the engine, but the generic testing entry is renderer-independent.

**Recommendation, pending user decision.** Keep both packages independently useful. Add a narrow, opt-in adapter rather than merge repositories or make the generic testing runtime depend on the Stop Motion CLI, Playwright or Daxur. Triangular/application code resolves stable target IDs, world bounds, camera framing, screen projection and actual raycast results. A small serializable, versioned presentation track could carry source-relative timestamps, normalized viewport bounds, pointer events, target IDs and narration cues. Stop Motion could consume that track with either screenshots or an original continuous clip. Continuous-video ingestion/compositing and this track are proposed extensions, not existing APIs; start with a concrete fixture before generalizing the contract or extracting another package.

**Interaction and capture details.** A synthetic cursor is presentation only. A pointer-path test should resolve a hittable screen point, send actual browser input through the normal scene handler, then assert the selected/hit object ID. Calling a selection method directly verifies a different path. Projected bounds do not establish visibility or hitability: clipping, occlusion, viewport offsets, device-pixel scaling and shader/skinned bounds need explicit handling. Moving cameras/objects require time-aligned bounds samples. DOM overlays do not automatically appear in a canvas-only stream; prefer a derived composited video, or explicitly compose an output canvas. Preserve the unannotated source and original timing; an edited narration timeline needs a source-time mapping. Narration uses the existing Daxur adapter outside the measurement path. Keep benchmark runs undecorated and separate from functional/visual presentation runs.

**Smallest proposed pilot.** One deterministic scene with two named objects: frame one target, show a labeled inspection box, move the displayed pointer in sync with actual input, verify the normal raycast/selection result, then orbit briefly to prove the box tracks the target. Retain the raw clip, structured checks and cue track; produce a narrated H.264/AAC MP4 derivative. Reuse a small annotation subset (box, label, pointer/click and optional dimming) on a DOM target to demonstrate that the presentation primitives are scene-independent. A focus marker or green decoration alone is not evidence of a passing check or visual review; keep those semantics explicit.

**Verification and status.** Read-only inspection of the local testing guide/skill, recording implementation, review CLI and Stop Motion authoring types. No browser, raycast test, media render or performance measurement was run for this proposal. No Triangular files changed. Plan 002 remains in progress and implementation awaits an agreed scope.

## 2026-11-05 — Game-owned automation and continuous capture clarification

**User direction.** Recording recipes should operate convenient game systems: assisted launch/gravity turn, SAS, aircraft piloting, map mode and manoeuvre planning. They should not implement frame-by-frame flight control or traverse Three.js internals to find objects. Pages should expose supported actions and targets; reusable debug/focus overlays should be switchable in the live scene. Strong continuous-video support is desired alongside the existing MP4 deliverable, since a custom replay app is inconvenient to share. Video size relative to GIF is a motivation, not a measured universal size guarantee.

**Revised recommendation.** Treat the recording recipe as a director of game-owned actions. A game pilot/autopilot writes the normal control axes and throttle using simulation ticks; the recorder requests a goal and waits for explicit phase/completion/failure events. Literal keyboard input remains useful when testing keyboard bindings, but is not a prerequisite for every assisted-flight demo. Manual UI, automation tools and testing adapters should call the same domain actions. Register semantic targets at their owning components, with labels, supported interactions and bounds/pick providers; optional engine scene helpers handle projection, focus framing and actual picking internally. Recipes discover these capabilities instead of walking scene graphs. A transport such as existing application tools can expose the same interface; no new MCP dependency is required in the generic testing runtime.

**Layering.** Game-specific flight controllers and missions stay in the game. Renderer-aware target registration, projection and live debug visualization are optional engine capabilities, separate from the renderer-independent testing executor. Testing consumes actions, readiness, structured observations and outcomes. Stop Motion orchestrates captures and produces cursor/annotation/narration presentations. Live overlays and exported overlays should share target data, with exactly one selected overlay composition path per output to avoid double rendering. Track source-clock and simulation-clock relationships for pause/time warp; wait on state rather than wall-clock sleeps. Missing capabilities should be reported explicitly.

**Local source evidence.** Read-only inspection of a game consumer found existing shared throttle/SAS action interfaces, registered focusable actors, game-owned orbit-ascent/flight-plan services, aircraft autopilot code, feedback test pilots that write the player's control axes, and a WebMCP registry for game/editor tools. These are starting points, not a verified end-to-end recording API. Its migration guide also identifies features awaiting a port to the maintained game route; do not build new integrations on deprecated routes. Consumer-specific paths and implementation details stay in that consumer.

**Proposed sequence.** First add a distinct continuous-capture mode to the existing video-first CLI, preserving screenshot reconstruction as an available backend. Browser-page capture is a useful initial default for scene plus HUD; retain a source option for canvas streams. Compose narration and cursor/focus cues into the MP4 and make cancellation, readiness and bounded duration explicit. Then prove one short game-owned assisted-flight scenario through exposed actions and one tracked target, with togglable live highlighting. This is a demo workflow with its own duration/storage policy, not an implicit increase to the testing recorder's small per-case budgets. Expand to longer missions and additional semantic helpers only after that fixture works. No game, engine or Stop Motion runtime implementation was performed in this discussion.

## 2026-11-05 — Proposed dedicated demo-app playground

**User direction.** Start the exploration in the engine demo app, either using a couple of existing examples or creating a small dedicated game that exercises the combination.

**Inspection.** Opened the running demo hub, Navigation Lab and Audio Lab in headless Chromium at the owner-provided demo host. The hub exposed its catalog; Navigation Lab exposed flat/3D modes, obstacle editing, avoidance, play/step/reset and two canvases; Audio Lab exposed the test runner, sound enable/mixer/one-shot controls and one canvas. No pageerror events were observed on these initial visits. This was DOM/runtime inspection, not visual acceptance, an audio-listening check or an exercised test suite. Source inspection found an audio recording adapter that composes the engine canvas with the engine audio output. Existing staged/unstaged engine work includes Plan 083 on addressable visual evidence and frame sidecars; do not overwrite or duplicate it.

**Proposal, not yet implemented.** A dedicated rover-delivery playground is a bounded first game: one rover, a pickup and a destination beacon, visible route/obstacle, manual driving and a game-owned assisted-drive action. Expose semantic actions/targets, follow/overview camera views, switchable tracked bounds/labels and a repeatable reset. Use the existing navigation patterns and test/audio adapter patterns as references. The first walkthrough selects the rover through normal picking, highlights it, engages assisted drive, changes camera view, reaches the destination and reports structured completion. A blocked-route/cancel case exercises failure and cleanup. Keep the page controller and pilot local initially; extract reusable target/presentation helpers only after their contract is demonstrated. Test recordings retain their existing budgets; the full narrated walkthrough uses the separately proposed Stop Motion continuous-capture path. Reuse frame-addressing work when available, without making this pilot depend on all of Plan 083.

**Scope boundary.** The playground should exercise interaction, automation, target tracking, camera changes, continuous capture and narration. Full orbital mechanics, flight autopilots, arbitrary NPC intelligence and a production mission system are unnecessary for this first proof. No demo-app, engine API or runtime recording changes were made in this exploration pass.

## 2026-11-05 — Preserve temporal compression in continuous video

**User clarification.** A core Stop Motion purpose is compressing long real operations without making the viewer endure them. Examples include a 40-second application sync and a long drive between game locations. The desired presentation shows recognisable motion/progress at an explicitly indicated 2x/5x/10x speed, with context and important moments preserved, rather than only an instantaneous before/after skip. This must remain central when adding continuous video.

**Existing implementation, source-verified.** ADR-010/011 and `AsyncWaitAction` already describe sampled full-frame waits with `realDurationMs`, compressed `frameDurationMs`, optional `maxDisplayMs` and an on-by-default speedup badge when compression applies. The maintained replay canvas calculates the badge from the duration ratio and draws it into exported frames. The newer `lib/capture.mjs` `demo.waitFor()` currently captures just an initial and final screenshot around the readiness callback; it records the duration but does not sample intermediate progress or gameplay. Thus the historical wait model supplies the concept and badge, while the new agent API does not yet deliver continuous sped-up motion.

**Proposed continuous-video design.** Author named source segments around actual actions/readiness conditions or game phase events. A segment can request a playback rate or a maximum output duration, with one explicit policy resolving the effective rate. Retain the full source recording and source-relative boundaries, then retime that segment during export; keep ordinary interactions and important phase transitions at 1x unless explicitly authored otherwise. Render the effective speed indicator and optionally a source-elapsed clock while compressed motion plays. Avoid rounding a genuinely non-1x rate to a misleading 1x label. An authoring cap is a visual-duration policy, not a promise to fit arbitrary narration into that time.

**Clocks and synchronization.** Default to changing presentation speed, without altering physics, simulation tick or the application's real network work. Game time warp is a separate explicit capability and must be distinguished from playback compression. Maintain output-to-source time mapping, and source-to-simulation time where available. Apply that mapping consistently to pointer tracks, target bounds, camera/state/frame references and captions so overlays follow the displayed frame, including segment boundaries. Keep narration intelligible at normal speech speed on the edited output timeline; author a short line, allow more output time or add an explicit hold when needed. Game audio needs a declared policy (for example mute/duck during accelerated travel), rather than blindly accelerating all speech/audio. Unexpected failures should stop or split the compressed section and remain visible; a duration or timeout should not be treated as successful arrival.

**Updated proposed playground acceptance.** The rover pilot should demonstrate a visible departure at 1x, a named travel segment compressed (for example 40 real seconds to 4 video seconds at 10x) with a speed badge, and pickup/arrival at 1x. A tracked highlight must remain aligned through the sped-up section. The source metadata retains the actual travel duration and final state, while narration remains at normal speed. This is a proposed implementation criterion for the next substantial feature plan, not a claim that continuous capture, retiming or the rover page exists. No runtime or media check was run in this documentation pass.

## 2026-11-05 — Cat Space Program demo-local proof delivered

The user authorized the dedicated engine-demo pilot as Cat Space Program: Operation Moon Boop, with one capsule human collector and upgrades to walking speed/carrying capacity. Triangular Plan/ER 084 records the bounded implementation. The demo route now combines Angular purchases/countdowns with capsule humans/cats, manual and automatic collection, semantic actions/targets, follow/overview/tower views, tracked focus bounds and an 18-cat Moon goal. Ten model checks, browser interaction/cancellation checks and all three testing-entry functional cases passed; performance was not measured and human visual/play acceptance remains pending.

A demo-local CDP/FFmpeg script produced a 34.73-second narrated H.264/AAC MP4 from 54.55 seconds of continuous browser footage. It retains source frames/timestamps and a segment-to-output mapping, labels 3x/5x footage acceleration, shows a synthetic pointer driven by actual browser input, and leaves narration at normal speed. Final sampled visual checks confirmed the game, focus box, speed badge and victory. This is useful evidence for the proposed direction, not a continuous backend implemented in this repository's packaged API or a runtime dependency between the two libraries. The next reusable-package feature should use this scene to prove continuous capture, segment retiming and synchronized cues. Detailed game code/evidence belongs in Triangular's pair; no public engine API or generic recording budget changed for this pilot.

## 2026-11-06 — Compression follow-up

The user reports the game pilot is working well and asked for a compact workflow trace and Daxur compression comparison. Triangular ER 084 records the actual test: the already-compressed 34.73-second H.264/AAC delivery clip is 1,426,555 bytes; `daxur --agent compress` created a separate 1,193,824-byte HEVC/AAC derivative (16.31% smaller). The original remains intact. This default changes codecs, so it is not a like-for-like H.264 optimization; HEVC phone playback and comparative quality were not checked. Prefer the small, established H.264 delivery format by default, with optional alternative compression rather than a mandatory second lossy pass. The game producer remains demo-local; continuous capture/segment retiming are not yet implemented in this package.

## 2026-11-06 — Roaming delivery trial

The owner requested testing the compressed derivative for mobile roaming. Compared decoded frames at 2, 12, 22 and 32 seconds: the reduced-size contact sheet showed no obvious visual difference; this does not establish full-resolution text, motion or listening quality. FFmpeg compared all 1,042 frames and reported aggregate SSIM 0.995933 against the H.264 delivery original (a similarity measure, not human acceptance). Both files decode, retain 1440x960 resolution and 34.73-second duration, and contain AAC narration. The HEVC derivative is being offered through an absolute-path inline chat embed for the owner's actual phone playback/quality check; that result remains pending.

Proposed interface, not implemented: an optional compression selection with a persistable per-project roaming preference and an explicit opt-out. Retain the original and clearly identify the derivative codec. Do not change the universal delivery default before the HEVC playback trial succeeds; prefer applying delivery settings during the final encode when the reusable exporter is implemented.

## 2026-11-06 — Phone trial accepted; cursor follow-up

The owner confirmed HEVC inline playback on their phone and requested compact output by default. This supersedes the earlier pending-playback recommendation above. Plan/ER 004 records 0.2.1's HEVC final-encode default with explicit H.264 override, maintained-renderer circle-to-wait/scroll continuity repair, and a fresh demo-local game recording using timed pointer motion. The narrated 42-second clip is 1,333,868 bytes. Continuous capture/retiming extraction remains the next integration task; this package does not yet own the pilot's continuous backend.

## History

Append dated findings, decisions, scope changes and verification. Do not erase earlier outcomes when a plan is superseded.

## 2026-11-06 — Continuous package extraction delivered

Plan/ER 005 packages continuous capture and retiming in 0.3.0 through `defineVideo`, using the same CLI as screenshot recipes. The game now consumes the installed archive with an app-owned recipe; a separate installed example passed. This supersedes the earlier statement that the continuous backend is solely demo-local. There is still no adapter to `triangular-engine/testing` result artifacts or its frame-identity contract.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
