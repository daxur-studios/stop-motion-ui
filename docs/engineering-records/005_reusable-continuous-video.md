---
type: EngineeringRecord
title: "Reusable continuous video recipes"
description: "Dated decisions, findings and evidence for Reusable continuous video recipes."
timestamp: 2026-11-06T00:00:00Z
tags: [engineering-records]
record_id: er-005
scope_history_schema: 1
plans:
  - /docs/plans/005_reusable-continuous-video.md
performance: []
---

# Engineering Record 005: Reusable continuous video recipes

Plan: [PLAN-005](/docs/plans/005_reusable-continuous-video.md).

## 2026-11-06 — Starting

**Goal.** Package the accepted continuous-video pilot so consumer repos author recipes rather than copy recorder infrastructure. The owner accepted the paced clip on 2026-11-06 and requested adoption by other repos.

**Decisions.** Add explicit `defineVideo` alongside `defineDemo`, sharing the CLI and narration adapter. Predeclare ordered segments so speech is prepared before capture. Pointer interactions and narrated segments remain 1x; accelerate waits with a parked pointer. Retain timestamped JPEG source frames; encode the final deliverable directly from these frames to avoid an intermediate lossy video. Captions and speed labels are browser overlays, avoiding platform font paths. Continuous page capture excludes system/game audio; supplied/generated speech is mixed at normal rate.

**Checks.** Record commands and observable outcomes. Keep functional, performance and human visual evidence distinct.

## History

Plan 004 motion review: the owner said the new video was better on 2026-11-06. This is human feedback on that pilot, not performance evidence. Keep the Plan 004 pair intact pending maintainer commit and later CLI archival.

Append dated findings, decisions, scope changes and verification. Do not erase earlier outcomes when a plan is superseded.

## 2026-11-06 — Implementation and verification

**API.** Version 0.3.0 exports `defineVideo` alongside `defineDemo`. The installed CLI dispatches both modes for `run`/`capture`, and recognizes continuous `recording.json` on `render`. Ordered predeclared segments allow shared supplied/provider speech preparation before browser capture. The Daxur adapter and screenshot workflow reuse an extracted audio helper; existing cache behavior is covered by regression tests. Headless Chromium CDP records timestamped JPEGs, synthetic-pointer input and browser-rendered captions/speed badges. Staging remains outside the watched app until browser closure. Timed controls refuse disabled/covered/moving targets and accelerate only parked-pointer waits. This captures the page and narration, excluding game/system audio, desktop/native dialogs and navigation during capture.

**Timing finding.** An initial isolated installed-example export failed the encoded-duration check although the animated fixture and game worked. CDP emits few frames for static pages; trimming packet timestamps discarded static-frame intervals straddling segment boundaries. The renderer now intersects source frame intervals with each segment, retaining its initial held frame, then retimes and rounds segments to output frames. A static-page regression and the installed example pass. JPEGs feed the final encode directly, avoiding an intermediate lossy source MP4. The timeline preserves source/output mapping, including frame rounding.

**Automated checks.** `npm test` passed all six tests after the fix (38.4 seconds): paced intermediate pointer positions/press location/covered-disabled refusal; continuous capture with 4x readiness wait, speech completion, cache reuse, static intervals, HEVC/AAC, silent H.264 rerender, containment and cancellation; maintained-renderer continuity; Daxur failure/cancellation; existing screenshot capture/rerender/cache/owned-server cancellation. `npm pack` rebuilt the renderer successfully. Declaration checking with `node replay-app/node_modules/typescript/bin/tsc --noEmit --skipLibCheck --module NodeNext --moduleResolution NodeNext --target es2022 lib/index.d.ts` passed. The skill-creator validator reported the adoption skill valid. Document checks pass for all five mapped Stop Motion plans. No performance baseline was created.

**Installed archive.** Final snapshot: `ignore/packages/continuous-video-20261106/daxur-studios-stop-motion-ui-0.3.0.tgz`, 235,683 bytes; SHA256 `20F71FC826C051A8E0AC2C7115E285CF14B25AA59C8A196F85E2AAC187C8911E`. The earlier development archive remains separate. Installed the final tarball in a temporary standalone package, copied the example/fixture from its installed files, and ran from that directory. Doctor passed. The scratch project explicitly selects Playwright 1.64.1 within the supported range to reuse installed Chromium; fresh resolution may require its matching browser installed. The real game independently used package-nested Playwright 1.65.0 and installed Chrome. Neither runtime imports this source checkout or needs Angular. Scratch result `ignore/installed-030-checks/run-QUYJMk`: 4.25 seconds, 51 frames at 12 fps, HEVC/hvc1, 29,707 bytes, explicitly silent, 14 source frames. Earlier failed trial `run-VbRHcn` is retained.

**Real consumer.** The demo installs a named copy of the final archive as a dev dependency. Its recording/export script is now a small launcher, with app-owned `moon-boop.video.mjs` importing the public package. Game actions/readiness remain unchanged. Initial startup retained a blank failure screenshot while the owned dev app rebuilt; daemon status confirmed success, and retry worked without starting a server. Initial npm resolution hit an existing Three/postprocessing peer conflict; `--legacy-peer-deps` installed the tool without changing those versions. Preserved unrelated edits and reduced lockfile formatting churn while retaining the new graph. Full engine library build passed (32.6 seconds); no public engine/testing API changed.

**Artifacts.** Captured `D:/code/triangular-workspace/ignore/moon-boop-videos/run-AxqEpp/scenario`: 59.195 seconds, 786 JPEGs, 237 pointer samples, six segments and four supplied cached speech clips. Assertions confirmed 18 stacked cats and victory. After upgrading to the final archive, rerendering produced `run-HodOuK/demo.mp4`: 42.867 seconds, 1440x960 at 30 fps, HEVC/hvc1 limited-range yuv420p and AAC, 1,400,410 bytes. Mapping covers 1x input/speech, 3x countdown and 5x gathering, with matching rounded output duration. Source and output time remain separate from simulation time. No new TTS calls were made.

**Review and boundary.** Inspected the source contact sheet, a full frame and six decoded final-video segment samples: badges, captions, focus box, follow view and victory are present. This does not establish continuous-motion or listening quality of the new export; deliver it for owner playback. The packaged skill documents mode choice, awaited input, readiness, speech, rerendering and chat delivery. Generic testing result-artifact attachment, iframe/drag/keyboard helpers, registry publication and upgrading other existing consumers remain outside this completed extraction. Keep the full Plan/ER pair until maintainer commit before CLI archival.

## Scope history

<!-- tri:scope-history -->
<!-- tri:scope-baseline state="unconfirmed" -->
<!-- /tri:scope-baseline -->
<!-- /tri:scope-history -->
