---
type: Plan
title: "Agent Video Demo Workflow"
description: "Make narrated MP4 demos easy for agents to produce from consuming repositories, with a packaged CLI and skill."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record: /docs/engineering-records/003_agent-video-demo-workflow.md
map_schema: 1
document_id: plan-003
initiative_id: "agent-video-demo-workflow"
performance: []
---

# Plan 003: Agent Video Demo Workflow

Status: **in progress**. Evidence and decisions: [ER 003](/docs/engineering-records/003_agent-video-demo-workflow.md).

<!-- tri:scope -->

## Intended outcome

An agent working in a consuming repository can author a short walkthrough, run one command, and return an MP4 with animated cursor and optional speech. The viewer needs no replay app. Capture manifests, screenshots and narration remain intermediate inputs that make revision and rerendering possible.

The first adoption target is `@daxur-studios/ui` on the user's Windows laptop, operated remotely while the user is away. Ship the CLI, renderer assets and an agent skill together so another repository can use an installed package without a sibling Stop Motion UI checkout. The package name and command examples below are proposals, not existing interfaces.

Keep TTS generation behind an external audio boundary. The user will separately arrange `daxur` TTS; supplied audio and silent export must work independently. Keep the existing renderer initially, automate its lifecycle, and avoid making extraction of a new rendering engine a prerequisite for the first usable demo.

The user authorized proceeding on 2026-11-05. Implement the local package and consuming-repository pilot following each repository's instructions. Registry publication, remote access configuration and cloud TTS selection remain separate actions. No scope baseline is confirmed.

## Phases and acceptance

- **prove-current-export** — Run a short existing scenario through the canonical browser exporter on this laptop. Include clicks, scrolling, a wait and a supplied narration clip. Inspect the resulting video, cursor timing and audio; use media inspection for duration/streams. Acceptance: retain one playable MP4 and record exact prerequisites, commands, measured export time, observed defects and which playback clients were actually tried. Fix only blockers before building on this path; past sandbox limitations are historical observations, not assumptions about this laptop.
- **package-one-command** — Package the existing capture helpers, CLI and prebuilt renderer assets. Let the CLI privately serve the bundled renderer and scenario assets, launch the browser, render, encode and close its own processes. Accept an external scenario and caller-selected output directory without importing it into this checkout. Add a dependency/readiness check and machine-readable result output. Acceptance: an installed local tarball can produce a video from a separate scratch project without the source checkout, a manually started replay app, or writes to node_modules; missing prerequisites produce actionable nonzero failures. Evaluate a sharing preset using H.264/AAC and verify it in the intended clients before changing the existing HEVC default.
- **author-and-rerun** — Provide a small Playwright walkthrough API and one reference recipe: navigate, locate, move/click, scroll, wait for a real state, narrate and capture. Keep app-specific setup/assertions in the host repo. Store authored narration separately from generated capture data, assign stable step IDs and make reruns preserve authored inputs. Acceptance: the same recipe captures an external app twice with no manual screenshot copying, narration loss or dev-server reload; it can rerender captured inputs without rerunning the app. Return the failed step and diagnostic paths when capture fails.
- **external-narration** — Define an adapter contract taking step text/voice options and returning local audio files with inspected duration. Support supplied clips first; add a `daxur` adapter once its real command/API is confirmed. Cache by text, provider/voice/options and adapter version; invalidate only changed inputs. Acceptance: a short and a long audio clip stay aligned with their steps, unchanged clips are reused, and missing/requested TTS fails explicitly or follows an explicitly selected silent mode. Provider/model setup and cloud TTS development remain separate work.
- **ship-skill-and-pilot** — Update the existing adoption skill and guide around the actual installed CLI. Include the skill, examples and assets in the packed package; give consuming AGENTS.md files a concise pointer into node_modules. Pilot a useful component interaction in `@daxur-studios/ui`. Acceptance: an agent can follow only the installed skill plus host-repo instructions to produce an MP4 with cursor and speech; inspect the packed file list and demonstrate the installed package, rather than relying on source-only files. Reference the package's own skill version instead of copying a second full guide into each host repo.
- **remote-rehearsal** — From the user's intended remote chat workflow, request a small UI change and demo, then open the returned artifact on the remote device. Add a contact sheet, transcript and result JSON for clients that cannot play the video. Bound job duration and disk usage, use isolated run folders, clean up only owned processes, and preserve useful failure diagnostics. Acceptance: the remote user can retrieve and play the MP4 with speech; repeat a run and exercise one failure/cancellation without orphaned child processes or overwriting another run. Record actual Codex/Claude/Antigravity behavior only for clients tried. A local Windows path alone does not count as remote delivery.

## Proposed agent experience

Illustrative interface to settle during implementation:

```sh
stop-motion-ui doctor --json
stop-motion-ui run demos/button-demo.ts --out artifacts/button-demo --json
stop-motion-ui render artifacts/button-demo/scenario --out artifacts/button-demo/revised.mp4 --json
```

The host recipe or project config describes the target URL, optional app launch command, readiness signal, viewport, narration adapter and timeouts. The tool manages its renderer internally. Logs go to stderr when JSON output is requested; the final result identifies success/failure, failed stage, video path, metadata and diagnostics. Capture, narration and rendering remain separately rerunnable stages beneath the convenience command.

Proposed output: `demo.mp4`, `result.json`, `contact-sheet.jpg`, `transcript.txt`, plus intermediate scenario assets/logs under an explicitly retained run directory. Result metadata identifies tool/recipe version, capture mode, viewport, duration, audio mode and the source revision/dirty state where available. MP4 is the primary deliverable; previews support inspection and do not establish audio quality or performance.

## Priority and completion boundary

The pre-holiday milestone is one installed-package UI recipe producing a remotely retrievable narrated video, followed by a successful repeat run. Work through the phases as one thin end-to-end path before broadening the API. Supplied audio unblocks the pilot while `daxur` integration is being settled. A reliable silent video alone is useful progress but does not complete the narrated milestone.

Defer a renderer rewrite, editing UI, arbitrary test-suite conversion, direct triangular-engine integration and continuous game footage until this path works. For games, first choose a representative scene: menus and discrete interactions may suit screenshots; continuous gameplay may need real-time recording. Do not present reconstructed screenshots as evidence of animation smoothness. A future direct-recording mode needs its own scoped plan once that need is demonstrated.

## Relationships

- related-to: [/docs/plans/002_testing-video-workflows.md](/docs/plans/002_testing-video-workflows.md)
<!-- /tri:scope -->

## Current phase status

| Phase    | State   |
| -------- | ------- |
| prove-current-export | in_progress |
| package-one-command | done |
| author-and-rerun | done |
| external-narration | done |
| ship-skill-and-pilot | done |
| remote-rehearsal | in_progress |

<!-- tri:review version="1" scope-hash="552321a95e9ae9f45cb8b79a0afbb31a50231c7055dc2e6b6c910e4a3da68740" reviewed="2026-11-05" reviewer="agent" -->
<!-- tri:item id="Q1" kind="intent" applies-to="external-narration" blocks="none" state="resolved" -->

- [x] What is the supported `daxur` TTS invocation and output contract?
  - Why it matters: the adapter must use a real supported interface; local/cloud provider decisions belong to the user's separate TTS work.
  - Resolution: the user supplied `daxur generate gemini-speech <text> --out <wav> [--voice <name>] --agent`; installed help confirms Fola, model selection and the 2000-character default. Agent output reports success and an absolute local WAV path. Credentials and provider caching stay in Daxur.
  - Next action: verify the packaged adapter and narrated UI pilot; human listening acceptance remains distinct.
    <!-- /tri:item -->
    <!-- /tri:review -->

## Delivery progress

2026-11-05: Created in response to the user's video-first, agent-operated, remote UI-demo direction. Repository findings and the proposed sequence are in ER 003. No implementation phases have started.

2026-11-05 (implementation): The user requested proceeding. Added the packaged CLI, automated renderer lifecycle, recipe API, supplied/cached external audio, skill and real-browser tests. A separately installed tarball generated a narrated button demo against `@daxur-studios/ui`; durable consumer adoption is being verified. Local media checks and visual inspection do not complete human audio acceptance or remote device playback. `daxur` TTS remains unavailable in the installed CLI.

Scope history in the Engineering Record is append-only. Confirm a specific baseline only after
explicit developer confirmation; document review and checked boxes do not imply confirmation.

2026-11-05 (remote feedback): The user said the demo looks good and confirmed that the embedded MP4 now plays in this Codex chat on their phone. Remote delivery/playback is confirmed for this clip, replacing the earlier client limitation. The client-specific handoff is now documented in the packaged skill and guide, with user-level Codex discovery across repos on this laptop. Human listening quality, the `daxur` adapter and a full remote coding rehearsal remain open; the overall remote-rehearsal phase stays in progress.

2026-11-05 (Daxur): The user supplied the now-supported Gemini speech interface. Shipped `daxurSpeech()` with Fola, explicit model selection, cancellation/timeouts, JSON/output validation and shell-free invocation. Installed a fresh immutable snapshot in the UI host. Its ordinary demo command produced an 11.8-second H.264/AAC MP4 with three Gemini speech clips; a repeat capture reused all three normalized WAVs unchanged. The external-narration implementation phase is done. Human listening/timing acceptance and full remote coding rehearsal remain open in the other phases; no baseline or archive was created.

2026-11-05 (narrated pilot feedback): In response to the Gemini-narrated demo, the user confirmed "yeah works". Record this as human acceptance of the current narrated pilot, without claiming a separate listening study or a newly identified playback client. The next milestone is an actual remote UI-change request followed by checks, a regenerated narrated demo and remote review. Then trial adoption in a second repository to check that the packaged skill is sufficient beyond the first pilot. Existing phase states remain unchanged: the original exporter baseline and full remote coding rehearsal still have unfulfilled acceptance items.
