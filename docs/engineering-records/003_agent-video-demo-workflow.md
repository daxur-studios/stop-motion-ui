---
type: EngineeringRecord
title: "Agent Video Demo Workflow"
description: "Dated decisions, findings and evidence for Agent Video Demo Workflow."
timestamp: 2026-11-05T00:00:00Z
tags: [engineering-records]
record_id: er-003
scope_history_schema: 1
plans:
  - /docs/plans/003_agent-video-demo-workflow.md
performance: []
---

# Engineering Record 003: Agent Video Demo Workflow

Plan: [PLAN-003](/docs/plans/003_agent-video-demo-workflow.md).

## 2026-11-05 — Starting

**Goal.** Plan a packaged agent workflow that produces narrated MP4 demonstrations from consuming repositories, beginning with `@daxur-studios/ui`, for remote review while the user is away.

**User direction.** Video is the primary output and recipients should not need a replay app. Agents should generate demos with a mouse and speech, discover usage through a skill shipped in the installed package, and eventually use the separately managed `daxur` CLI for TTS. No holiday date or time budget was supplied, so the plan defines a minimum milestone rather than inventing a schedule.

**Repository findings.** `docs/roadmap.md` already calls video the primary deliverable, citing ADR-010. ADR-012 and `scripts/playwright-export.mjs` establish the current canonical exporter as a browser-driven Angular canvas renderer requiring a running replay dev server. `scripts/cli.mjs` dispatches separate capture, narrate, import and export commands and anchors execution to this checkout. Root `package.json` is private and has no installed CLI bin. The existing adoption guide asks consumers to pack shared helpers and copy/import scenarios; it also recommends the deprecated player. Those instructions need replacement when the new installed-package path exists, rather than a promise that the current path already works this way.

**Packaging precedent.** Read `D:/code/@daxur-studios/portal-layout/projects/portal-layout/ng-package.json`: its asset configuration copies `.agents/skills` into published `skills/`. This supports the requested package-relative skill pattern. The UI workspace already declares Playwright and a demo application test command. No consuming repository was modified; mermaid-runtime packaging was not inspected.

**Recommended architecture.** Retain screenshots/manifests as editable inputs and use MP4 as the handoff. First package and automatically manage the existing renderer behind a CLI; evaluate extraction only if packaging exposes a concrete blocker. Accept pre-generated narration, define a narrow external TTS adapter, then connect `daxur` after inspecting its supported interface. Use an isolated output folder and JSON result to make the command usable by agents. Derive contact sheets/transcripts for chat inspection while retaining the video as the deliverable. Treat codec compatibility and remote delivery as observable pilot checks, not assumed client capabilities.

**Scope relationship.** Plan 002 remains the comparison record for triangular-engine/testing artifacts and sharing patterns. Plan 003 applies the user's new direction to a concrete proposed delivery sequence; direct integration with triangular-engine is deferred. Game motion fidelity needs a representative example before adding continuous recording.

**Checks.** Inspected local documentation, CLI/export source and package configuration. No capture, TTS invocation, video export, playback check or remote rehearsal was performed during planning. Implementation phases remain planned and the scope baseline is unconfirmed.

## 2026-11-05 — Planning validation

Created the pair using `triangular docs plan new` through the sibling CLI checkout. Refreshed scope reviews for Plans 002 and 003. The first check rejected an empty `blocks` attribute and a nonstandard resolution label; corrected these to the CLI's required `blocks="none"`, `Resolution:` and `Next action:` syntax. The final `docs records check --root .` passed: 3 mapped plans, valid review freshness, phase readiness, relations and reciprocal record links. `git diff --check` reported no whitespace errors in tracked changes, with only the repository's LF/CRLF normalization warning for README. No product implementation or media verification was run. Plan 003 remains planned, so it is not ready for archival.

## 2026-11-05 — Implementation and first installed-package pilot

**Authorization.** The user asked to proceed after discussing per-repository dev dependencies, an installed CLI and Playwright recipe helpers. This authorizes implementation; it does not establish a scope baseline.

**Implementation.** Added `bin/stop-motion-ui.mjs` (`doctor`, `run`, `capture`, `render`) and `lib/` for capture, asset serving, rendering, media inspection and owned app lifecycle. `npm pack` builds the existing Angular renderer with no scenario assets and bundles the existing shared capture session. Local tarballs contain the renderer, API declarations, examples and skill; the package stays private. Every job owns an isolated folder, retains scenarios/diagnostics, bounds rendering and job duration, and closes its app/browser/encoder. Render accepts local scenarios without copy-in to the source checkout or writes into node_modules. It exports H.264/AAC by default; old source exporters retain HEVC. Corrected hard-coded export canvas CSS so non-1280x800 viewports are preserved.

**Narration boundary.** Supplied clips are inspected/copied into scenarios; requested text without audio fails unless silent mode is explicitly selected. An external `audioProvider` callback can return a local clip; normalized audio is cached by text, provider ID/version and options. `daxur --help` currently lists no speech command. For the pilot only, Windows System.Speech generated three supplied WAV clips. This is fixture preparation, not a production TTS/provider choice. Extended mixed audio with silence through the full timeline to avoid cutting video short when speech ends early.

**Verification.** Installed dependencies and ran `doctor`: Chromium 156.0.8078.4, ffmpeg/ffprobe 8.1.1 and bundled renderer all passed. Built the package and inspected its packed files (23 files, initially about 221 kB compressed, without Angular runtime dependencies in consumers). Installed the tarball into `C:/Users/cicas/AppData/Local/Temp/stop-motion-consumer-6bead2a8bc164106b05bdb43ea06cea3`, outside the source checkouts. Its copied example captured and rendered a 960x640 fixture without a replay dev server. Then its TypeScript recipe captured the real UI chamfered-button spike and asserted trigger count 1 and toggle true. `ignore/ui-pilot/run-us2dV2/demo.mp4` is 12.5 seconds, 1280x800, 12 fps H.264 with AAC and three speech clips. Inspected its six-frame contact sheet; the expected UI and active toggle are visible. Listening quality and remote playback remain unaccepted.

**Failures and fixes.** Two pilot recipes initially asserted UI text before Angular updated it; retained failure screenshots/results and replaced immediate reads with waits on actual displayed state. Initial integration-test fixture strings had escaping errors; corrected the fixture generator. `npm test` then passed both tests, including real capture/render, audio caching and changed-text invalidation, separate rerun folders, rerender without the app, overwrite refusal, missing speech errors, JSON output despite recipe logs, invalid/path-escaping assets, nondefault dimensions, and timeout cleanup of the owned app. The tests use synthetic tones for stream/timing checks, not human speech quality evidence. The skill validator passed after installing its missing PyYAML dependency.

**Existing exporter baseline.** Started the source replay dev server and ran `scripts/playwright-export.mjs scenario-1 --narration=off --fps=6 --out=.../ignore/verification/baseline.mp4`; it completed 33 frames / 5.5 seconds through the original canonical path. Its historical scenario narration references point to a separate dev server, so the baseline was deliberately silent. Browser-less sandbox claims in older runbooks do not describe this laptop.

**Dependency observation.** The first consumer audit identified inherited sharp/libvips advisories; upgraded the newly packaged root dependency to sharp 0.35.5. The source workspace still has older Angular/tooling and shared-package dependencies with audit findings; upgrading those is separate maintenance, not a claim made by this package verification.

## 2026-11-05 — Durable UI adoption and final local checks

**Consumer adoption.** Added `demos/buttons.demo.ts`, `demo:video`/`demo:video:doctor` scripts, a package-relative skill pointer and Plan/Runbook 10 in `@daxur-studios/ui`. Installed the immutable local snapshot `ignore/packages/daxur-studios-stop-motion-ui-0.2.0-c222d8a2.tgz` (SHA256 `c222d8a26c126084a47b79f888d748dc663b14e1856145572cf182b6834a1204`). The same archive is retained in this checkout under `ignore/packages/agent-cli-0.2.0-consumer/`. It is about 222 kB compressed and contains 23 files. Consumers receive no source workspace or Angular npm dependency.

**Compatibility and staging.** The real UI host has no `type: module`, so its `.ts` recipe exposed a CJS namespace/exports issue that the initial ESM scratch consumer did not exercise. Added a default ESM export condition supported by the required Node version and namespace unwrapping in the recipe loader; added a CommonJS recipe regression. Captures stage screenshots under the OS temporary directory, then publish after the capture browser closes, including diagnostics on failure. JSON mode redirects recipe console diagnostics to stderr. The final `npm test` passed both tests including these cases. Final build/pack, skill validation and records checks passed.

**Actual app result.** `npm.cmd run demo:video -- --json` from the UI repository succeeded, starting and stopping its own app on 4239. Artifact: `D:/code/@daxur-studios/ui/ignore/demo-videos/run-i4wKHf/demo.mp4`; 12.467 seconds, 1280x800 at 30 fps, H.264/AAC with three supplied clips, about 199 kB. `demo:video:doctor` passed. Local Chromium playback of the earlier 12.5-second pilot advanced normally with the expected dimensions and no media error; this was muted playback and does not establish listening quality. Temporary manually started development servers on 4221/4238 were stopped, and a port check found no remaining listeners on 4221/4237/4238/4239 after the run.

**Remaining acceptance.** Need the user's actual remote chat/device delivery and playback rehearsal, human listening/visual acceptance, and the separately developed `daxur` TTS contract. The implementation plan remains active and unarchived. No code was committed or package published.

**Repeat run.** `npm.cmd run demo:video -- --fps 6 --json` from the UI repository produced a separate `ignore/demo-videos/run-JaH8XO/` with another 12.5-second narrated video, preserving the earlier 30 fps artifact and authored recipe/audio. A standalone recipe type check identified missing Node declarations in the UI workspace, so the consuming dev workflow adds `@types/node` rather than relying on transpilation alone.

**Final check result.** The consuming recipe's standalone NodeNext TypeScript check passed after adding Node 22 declarations. Whitespace checks passed in both repositories. Reviewed the final 30 fps contact sheet. No listeners remained on the temporary development/capture ports. All required local changes are left uncommitted for review.

## 2026-11-05 — User-confirmed phone delivery and reusable handoff instructions

**New evidence.** After saying the demo looks good, the user opened the attached video on their phone and confirmed it plays in this Codex chat. The artifact is `D:/code/@daxur-studios/ui/ignore/demo-videos/run-i4wKHf/demo.mp4`, 12.467 seconds, 1280x800, H.264/AAC, about 199 kB. The response embeds the absolute local path using Markdown image/media syntax with a leading `!`. There was no upload-tool call, public URL, replay app or HTTP video server for this delivery. This establishes remote playback for this clip/client workflow; no new capture or human listening acceptance is claimed.

**Documentation.** Added exact Codex syntax and client limitations to the source adoption skill/guide and AGENTS.md. Created `~/.codex/skills/share-media-in-chat/SKILL.md` and linked it from user-level AGENTS.md for discovery in every repo on this laptop. Triangular now has a generic packaged multi-client skill, linked from its root agent instructions, main/testing skills, testing guide and existing Claude-only skill. Claude continues using its available `SendUserFile` tool. The UI pilot's instructions and Plan/Runbook 10 record the confirmed method. Antigravity remains untested.

**Scope and distribution.** Documentation only; no runtime integration, external publication or package snapshot replacement. Existing immutable tarballs keep their prior skill text until a fresh package is installed; explicit pilot guidance and the personal Codex skill cover this machine now. Other machines need the user-level setup or updated packaged guidance. The overall plan remains active for the separate TTS contract, listening acceptance and full remote coding rehearsal. No scope baseline or commit was created.

**Checks.** Skill validation passed for the personal Codex, Stop Motion UI adoption, Triangular multi-client, main/testing and existing Claude skills (used Python UTF-8 mode for existing Unicode text). Stop Motion UI's records check passed for all three mapped plans; whitespace checks passed for the edited tracked docs in all three repos. `npm pack --dry-run --ignore-scripts --json` includes the updated adoption skill and CLI guide, without creating/replacing an archive. Confirmed the shared MP4 still exists at 198,593 bytes. Triangular's repository-wide records check reports a stale review in unrelated Plan 081; left it untouched. No runtime build or capture was repeated for this documentation change.

## 2026-11-05 — Supported Daxur speech interface and adapter work

The user supplied the supported `generate gemini-speech` command and agent JSON contract. Inspected installed help: voice defaults to Fola, model to `gemini-3.8-flash-tts`, and text limit to 2000 characters. This resolves the earlier missing-interface finding; its historical entries above remain intact. Daxur owns its encrypted credentials and content cache. No credential access or provider implementation belongs in Stop Motion UI.

Continuing Plan 003's existing external-narration phase: add an exported `daxurSpeech()` recipe helper, pass a capture-owned absolute output path through the existing provider contract, retain normalized local audio caching keyed by voice/model/version, validate agent JSON/output, and honor subprocess cancellation/timeouts. On Windows resolve the npm shim's Node entrypoint rather than passing narration through a shell. Verify error/cancellation behavior with a fake command, then build a fresh immutable package and rerun the UI pilot using actual Gemini speech. Human listening quality and a full remote coding rehearsal remain separate acceptance steps.

## 2026-11-05 — Daxur adapter verified in the installed UI pilot

**Implementation.** Exported `daxurSpeech({voice, model, command, timeoutMs})` and its declarations. Defaults are Fola, `gemini-3.8-flash-tts` and 120 seconds per subprocess, also bounded by the capture job signal. Narration must contain 1–2000 characters. Invocation uses literal arguments and resolves standard Windows npm shims to Node rather than a shell. Validate agent JSON, success status, expected absolute path and nonempty output before existing audio-stream/duration validation and PCM normalization. The extended provider request supplies `outputPath`; capture removes that generated source after normalization, including on failure. Existing providers returning supplied paths remain supported. No credential access, provider SDK or Daxur runtime dependency was added. Supplied audio overrides synthesis and silent mode skips it.

**Package.** Built and packed a new immutable local snapshot, retained in `ignore/packages/daxur-speech-20261105/daxur-studios-stop-motion-ui-0.2.0.tgz`, SHA256 `218a6be5aa4a6dc43813a7c7d35dbd69f96f855262970177a0829108f9f81adf`, 225113 bytes. Installed the same bytes in the UI repo as `ignore/packages/daxur-studios-stop-motion-ui-0.2.0-218a6be5.tgz`; manifest and lock identify it. The previous snapshot is preserved. Verified installed adapter/capture/types/skill/guide match source byte-for-byte. The updated adoption skill is included. No registry publication or commit.

**Actual speech and capture.** A first direct helper call generated the intro WAV. A second direct Daxur request for identical text/voice/model returned `status: success`, `cached: true`, 318764 bytes. The UI recipe now defaults to Daxur/Fola, retaining `STOP_MOTION_AUDIO_DIR` as an optional supplied-audio override. `npm.cmd run demo:video -- --json` produced `D:/code/@daxur-studios/ui/ignore/demo-videos/run-WLRWyH/demo.mp4`: 11.8 seconds, 1280x800 at 30 fps, H.264/AAC, 225542 bytes with three speech clips. UI assertions passed. Inspected the contact sheet: expected button page/action/toggle states are present. A second installed `capture` invocation produced `run-k9KYuo`; all three cached normalized WAV filenames and modification times were unchanged, with no extra cache files. The owned Angular server on 4239 stopped. No performance benchmark or human listening acceptance is claimed.

**Checks and limits.** `npm test` passed all three tests: existing real-browser capture/render/cache/invalidation/failure/job-cancellation coverage plus new Daxur literal metacharacter/newline/space arguments, agent failures/malformed responses/unexpected output/empty output, text length, pre-aborted signal and subprocess-timeout cleanup. The Daxur test also passed after the final stat refactor. Package build succeeded, installed recipe NodeNext TypeScript check passed, skill validation passed, and records/whitespace checks passed after refreshing Plan 003's review to resolve the now-answered interface question. External-narration implementation is complete; human listening/timing acceptance and full remote coding rehearsal keep the plan active. No archive until the full pair is committed by the maintainer.

## 2026-11-05 — User accepted the Gemini-narrated pilot

**Feedback.** The user replied "yeah works, what's next?" after receiving the Gemini-narrated UI demo at `D:/code/@daxur-studios/ui/ignore/demo-videos/run-WLRWyH/demo.mp4`. This accepts the current narrated pilot. It does not identify a new playback client or establish broader narration-quality results.

**Next milestone.** Use a real remote UI-change request to exercise the complete loop: make the requested change in the UI host, run appropriate checks, update the authored walkthrough if needed, generate the narrated MP4 through the installed package, and embed it for remote review. After that, try a second consuming repository using its own installed package and the shipped skill. For a game pilot, start with a menu or another discrete interaction. No arbitrary product change has been selected or made in response to this status question.

**Status.** Plan 003 stays active; its original-export baseline and full remote coding acceptance have remaining items. No scope baseline, commit or archive. This update records feedback only; no new media generation or runtime test was needed.

## History

Append dated findings, decisions, scope changes and verification. Do not erase earlier outcomes when a plan is superseded.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
