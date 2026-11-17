# Agent video demos

Install `@daxur-studios/stop-motion-ui` as a dev dependency in each consuming repo. The package is currently private, distributed through local tarballs. Node 22.18+, Chromium, ffmpeg and ffprobe are required. `FFMPEG_PATH` and `FFPROBE_PATH` override binary discovery. Install a browser once with `npx playwright install chromium`.

In this checkout, create `ignore/packages`, then run `npm pack --pack-destination ignore/packages`. In a consumer, run `npm install --save-dev <archive-path>`. The tarball includes the built renderer, capture helpers, CLI, examples and skill; consumers need no Angular dependency or source checkout.

```sh
npx --no-install stop-motion-ui doctor --json
npx --no-install stop-motion-ui run demos/save.demo.mjs --out artifacts/videos/save-project --json
npx --no-install stop-motion-ui capture demos/save.demo.ts --out artifacts/videos/save-project --json
npx --no-install stop-motion-ui render artifacts/videos/save-project/run-ABC/scenario --out artifacts/videos/save-project/revised.mp4 --json
```

`run` captures and renders; `capture` retains a scenario; `render` needs only that scenario. Put new outputs under gitignored `artifacts/videos/<topic>/` in the consuming repository; without `--out`, the CLI defaults to `artifacts/videos/stop-motion/`. Each invocation creates an isolated `run-*` folder beneath `--out`, preserving earlier evidence and authored inputs. These files do not automatically expire. For render only, `--out <new.mp4>` also copies the video to that exact path and refuses overwrite. JSON results identify artifacts and diagnostics. Failed jobs retain `result.json`, `run.log` and any captured `scenario/failure.png`.

The installed CLI defaults to compact HEVC/H.265 video (CRF 28, `hvc1`) with AAC narration. Use `--codec h264` for H.264 compatibility output (CRF 23). These settings are applied at the final encode; no separate Daxur compression command or extra lossy pass is needed. The owner confirmed HEVC playback in this Codex chat on their phone on 2026-11-06. Older source exporters also default to HEVC. `--fps` defaults to 30. Exports are limited to 120 seconds, 3600 frames and 512 MiB of temporary frame data. `--timeout-ms` bounds the job (default ten minutes). Cancellation closes owned browser/app processes; a deliberately reused app remains running. A successful continuous `run` removes its captured JPEG frames by default; use `--keep-source` to retain them for rerendering. `capture` retains its scenario, and failed jobs may retain diagnostic source frames. Temporary rendered frames are removed. Delete old run folders when no longer needed.

## Authoring

Copy [the example](../examples/save-project.demo.mjs) and [its fixture server](../examples/fixture-server.mjs) into a scratch repo to try the full loop. `.mjs` and `.ts` recipes default-export `defineDemo` imported from the package. The passed `page` is an ordinary Playwright Page; normal locators/assertions work.

`webServer.command` is an argument array executed without a shell in the caller's working directory. On Windows use `process.execPath` plus a JS entrypoint rather than a `.cmd` file. `webServer.url` is the HTTP readiness check; `baseURL` controls relative page URLs. Explicitly set `reuseExistingServer: true` to use an already-running app. Step `ready` callbacks should assert the resulting app state before capture.

Each `demo.capture`, `click`, `circle`, `scrollTo` or `waitFor` step needs a unique `id` containing letters, digits, `_` or `-`. Start with a `capture` to establish the initial frame. `click` captures after its optional `ready` callback and records scrolling if it must bring the target into view. `scrollTo` samples six controlled positions. `waitFor(callback, options)` captures endpoints around a real readiness condition; it does not continuously record the wait. Screenshots settle finite CSS animations and disable infinite ones. Use direct recording to assess continuous gameplay/animation; these reconstructed demos do not establish performance or motion fidelity.

Cursor continuity belongs to the renderer: moves and circles connect at their displayed endpoints; waits and animated scrolls add a visible approach if their requested pointer position differs. Recipe authors do not need to sleep for reconstructed cursor movement: await the `demo` helper and use `ready` for application state. Use `defineVideo` below for continuous motion; its awaited mouse helpers provide real-time pacing.

## Continuous games and animation

Version 0.3.0 adds `defineVideo` using the same `run`, `capture` and `render` commands. Copy [the continuous example](../examples/continuous.demo.mjs) alongside the fixture server, or use this shape against your app:

```js
import { defineVideo, daxurSpeech } from '@daxur-studios/stop-motion-ui';

export default defineVideo({
  baseURL: 'http://localhost:4200',
  audioProvider: daxurSpeech({ voice: 'Fola' }),
  segments: [
    { id: 'intro', caption: 'Starting a round', narration: 'Our collector is ready.' },
    { id: 'start', caption: 'Assigning the collector' },
    { id: 'travel', caption: 'Travelling to the garden', speed: 5 },
    { id: 'arrival', caption: 'Arrived', narration: 'The collector has reached the garden.' },
  ],
  async ready(page) {
    await page.goto('/game');
    await page.getByTestId('game-ready').waitFor();
    // Set up deterministic starting state here, before capture begins.
  },
  async run({ page, video }) {
    await video.segment('intro', async () => {});
    await video.segment('start', async () => {
      await video.click(page.getByRole('button', { name: 'Start collecting', exact: true }));
    });
    await video.segment('travel', async () => {
      await page.getByTestId('collector-at-garden').waitFor();
    });
    await video.segment('arrival', async () => {});
  },
});
```

Declare every segment up front and await it once, in order. `ready(page)` navigates and prepares the application before recording. Speech is resolved and cached before launching the browser, so TTS latency never becomes footage. Each segment captures its real callback duration; when speech is longer, recording continues until speech plus a short tail fits. Speech segments must use 1x. `--narration off` skips all speech requests. The short/long switch selects speech or silence as in screenshot recipes; a continuous recipe contains one authored speech variant.

`video.click(locator)` waits for a visible main-frame control, scrolls it into view, glides for 0.5–1.1 seconds, checks its current bounds/hit target and presses at arrival. `video.moveTo(x, y)` and `video.clickAt(x, y)` use viewport pixels, useful for page-provided projected scene targets. Await all helpers. A click on a covered, disabled, offscreen-center or repeatedly moving control fails. Iframe controls and drag/keyboard gesture helpers are not supported yet. Keep interactions at 1x; accelerated segments reject these pointer helpers. Use normal Playwright readiness conditions for real app state and `video.hold(ms)` only for authored presentation pauses. Raw `page.mouse`/`locator.click` bypass pacing and can reintroduce teleports.

`speed` ranges from 1 to 20 and changes **footage time**, never simulation speed. Captions and a visible `3× SPEED`/`5× SPEED` badge are baked into captured frames. The pointer stays where the last helper left it during accelerated waits. Prefer semantic app actions, stable DOM locators, and page-exposed scene bounds/readiness; the recorder does not inspect Three.js internals. Route changes during capture are unsupported: prepare/navigate in `ready` and record one page per recipe.

Optional settings: `viewport` (default 1280×800), `pointer: { x, y }` (default 80,80), `captureFps` (1–30, default 15), and `browser: { channel: 'chrome', args: [...] }` for an installed Chrome/game GPU setup. Browsers always run headless. CDP page screencasting is Chromium-only and samples up to `captureFps`; a busy renderer can deliver fewer frames. Output `--fps` controls the encoded cadence, not the captured motion detail. This records the browser viewport, not native dialogs, desktop UI or game/system audio. Only narration is mixed. Diagnostic capture is not performance evidence.

Continuous capture records timestamped JPEGs, source wall time, segment timing, narration refs and the pointer track. Artifacts stage outside the watched app until its browser closes. Source JPEGs are encoded directly into the final HEVC/H.264 MP4, avoiding an intermediate lossy video. For later rerendering without the app or TTS, use `capture` or `run --keep-source`; `result.json` reports `sourceRetained`. Otherwise successful continuous runs remove the JPEGs, and the remaining `recording.json` is metadata, not a rerenderable recording. Final `timeline.json` maps source segments and pointer samples onto output time, including frame-rate rounding; `result.json` reports `captureMode: "continuous-browser-page"`. Contact sheets show source-frame samples; review the edited video for transition timing and speech. Source capture is capped at 18,000 frames / 512 MiB, edited output at 120 seconds / 3600 frames. These are per-run limits; retained runs and failed captures can still accumulate.

This generic package has no dependency on Triangular or its testing entry point. A game recipe may use its existing page helpers alongside the recorder; attaching videos to shared testing result artifacts remains separate integration work.

## Narration

Default mode is `short`. A step can provide `narration` text and `audio: './audio/save.wav'`, relative to its recipe. Audio is inspected and copied into the isolated scenario. `--narration off` explicitly generates silent video while retaining text. Missing requested audio fails instead of silently dropping speech.

A recipe can automate generation with an adapter:

```js
audioProvider: {
  id: 'my-local-tts', version: '1', options: { voice: 'example' },
  async synthesize({ text, options, signal }) {
    // Call the supported speech tool, honoring cancellation.
    return '/absolute/path/to/generated.wav';
  },
}
```

Audio is normalized and cached beneath the output root by text, provider ID/version and options. Change the version when changing the adapter or model. Providers receive a capture-owned absolute `outputPath` for generated audio (removed after normalization); returning another supplied file still works. Providers must honor the signal for their owned requests/subprocesses.

### Daxur Gemini speech

With the configured `daxur` CLI installed on PATH, recipes can generate speech directly from step narration:

```js
import { defineDemo, daxurSpeech } from '@daxur-studios/stop-motion-ui';

export default defineDemo({
  audioProvider: daxurSpeech({ voice: 'Fola' }),
  async run({ page, demo }) {
    await page.goto('http://localhost:4200');
    await demo.capture({ id: 'intro', narration: 'Here is the application.' });
  },
});
```

The helper invokes `daxur generate gemini-speech <text> --out <absolute.wav> --voice Fola --model gemini-3.8-flash-tts --agent` using argument arrays without a shell. Daxur owns the encrypted API key and its automatic content cache; no key is read or stored by this package. Stop Motion UI additionally caches normalized WAVs by text, voice, model and adapter version. Repeating unchanged steps against the same output root avoids invoking Daxur at all. Changing text, voice or model requests new audio; Daxur may then serve its own cache. The adapter never requests `--force`.

Keep each step's narration within 2000 characters; longer text fails before calling Daxur and should be split into steps. `model` and `timeoutMs` are configurable (default 120000 ms per call, also bounded by the job timeout). `command: [executable, ...prefixArgs]` supports custom installations; on Windows use Node plus the CLI JS entrypoint for a custom command. Standard Windows npm shims are resolved automatically. Invalid JSON, non-success status, missing/empty or unexpected output paths and provider errors fail the capture with diagnostics. Audio stream/duration checks still run after generation. Supplied step `audio` takes priority; `--narration off` skips synthesis entirely. The older source replay settings/narration commands are separate and are unchanged.

## Discovery and delivery

Add to the consuming repo's AGENTS.md:

> For UI demo videos, read `node_modules/@daxur-studios/stop-motion-ui/skills/adopt-stop-motion-capture/SKILL.md`.

In **Codex desktop app / remote chat**, include the returned video's absolute filesystem path in a Markdown image/media embed in the assistant response:

```markdown
![Button demo](D:/code/app/artifacts/demos/run-123/demo.mp4)
```

Replace the example with the actual result path. Use forward slashes on Windows. For spaces use `![Demo](<D:/code/My App/artifacts/demo.mp4>)`. Keep the leading `!`: a plain file link or printed path is only a fallback; relative paths are insufficient. The app presents the local media through the chat. No separate upload tool, hosted URL, local HTTP server or replay app was used for this handoff.

On 2026-11-05 the user confirmed that the pilot video embedded in this Codex chat plays on their phone. The actual embed targets `D:/code/@daxur-studios/ui/ignore/demo-videos/run-i4wKHf/demo.mp4` (12.467 s, 1280x800, H.264/AAC, about 199 kB). On 2026-11-06 they also confirmed playback of the 34.73-second HEVC/AAC Moon Boop derivative (1,193,824 bytes) and requested compact output by default. These confirmations supersede the earlier report that Codex phone video did not work; they do not establish every client/version or human listening acceptance. Both supported export codecs use `yuv420p` and `+faststart`.

In **Claude Code in the Claude app**, use its available `SendUserFile` tool with absolute `files`, `display: "render"`, `status: "normal"` and a descriptive `caption`. Do not invent that tool in Codex. Antigravity remains untested.

Confirm the file exists and retain the run folder during review. Sharing for user playback does not require opening the video in agent vision/audio context. Contact sheets and transcripts support inspection; actual listening is needed to verify speech quality. If inline playback fails, give the absolute artifact link and useful previews, and state the limitation; a printed laptop path or localhost URL alone is not confirmed remote delivery. No external hosting is configured by this CLI.

For all repositories on one Codex machine, install a personal `share-media-in-chat` skill and reference it from the user-level `~/.codex/AGENTS.md`; this laptop has that setup. Package-relative adoption pointers above carry these instructions to other machines once the updated package is installed. Already installed immutable tarballs retain their earlier skill text until replaced; do not edit node_modules to update them.
