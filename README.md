# Stop-Motion UI

Create narrated MP4 walkthroughs from UI screenshots or continuous browser gameplay, with a paced cursor and accelerated waits.

## Core idea

- Capture sparse **screenshots** keyed to events (click, navigate, scroll/drag, animation start/end)
- Capture a **metadata stream**: cursor positions + timestamps + action types
- On playback, render a **fake animated cursor** that moves smoothly between recorded points (bezier easing, not linear)
- Sync whichever screenshot is "current" to the timeline as the cursor moves

MP4 is the primary output; recipients need no replay app. `defineDemo` reconstructs event-timed screenshots with cursor motion and optional narration, using a privately served bundled renderer. `defineVideo` records continuous browser footage with timed input and explicit speed segments. The installed command and skill manage both modes for agents working in other repositories. Stop Motion remains separate from `triangular-engine/testing` test-result recordings.

## Why

- A reconstructed walkthrough can be smaller and easier to revise than a conventional capture, while MP4 export is available when a video artifact is needed
- Most of a UI recording is static frames between discrete actions — recording every pixel of every frame is wasteful
- A manifest + screenshots + animated cursor can fake the "recording" feel at a fraction of the size

## Stack

- Plain Node.js + TypeScript for capture scripts — no framework
- Standalone HTML + Canvas page for the replay player — no Angular needed, this is a utility not an app
- An optional Angular wrapper (`replay-app/`) around that same player, for anyone who'd rather work in Angular
- Two capture backends for comparison: Chrome MCP and Playwright (see [`docs/adr/ADR-001-dual-capture-backends.md`](docs/adr/ADR-001-dual-capture-backends.md))

## Status

- **Replay player:** `replay-app/` is the maintained Angular player, with narration, settings, seeded cursor motion, async-wait and scroll presentation support. The plain-JS player (`replay/index.html` + `replay/player.js`) remains a deprecated no-build-step fallback.
- **Capture:** both a Chrome MCP capture guide and an unattended Playwright capture script exist. The Playwright demo covers navigation, clicks, forms, scrolling, dialogs and async waits, and stages output outside the watched app folder. The capture runbook says its complete live-browser loop still needs a fresh end-to-end confirmation; the Chrome MCP runbook also records no live capture.
- **Output:** MP4 export is available through the canonical Playwright-driven canvas path and a legacy browser-free renderer. The installed agent workflow supports `daxurSpeech()` for Daxur Gemini narration or supplied clips; the older source narration workflow supports Chatterbox and ElevenLabs.
- **Integration boundary:** this remains a separate Stop Motion UI tool. It has an import path for manifest-plus-screenshot scenarios, but no adapter from `triangular-engine/testing` WebM result artifacts. See [Plan 002](docs/plans/002_testing-video-workflows.md) for the exploration.

The original POC has therefore grown into a substantial prototype, but its documented live-capture verification and integration into test-result workflows remain open.

Opening `replay/index.html` directly via `file://` may fail to load manifests in Chrome (fetch is blocked cross-origin for the file scheme); serve the `replay/` folder over http instead, e.g. `python3 -m http.server` from inside it, or `npx serve replay`. The Angular app doesn't have this problem — `ng serve` always serves over http.

## Setup

For use from **another repository**, install the local packed package and follow
the [agent CLI guide](docs/agent-cli.md). The installed `stop-motion-ui` command
provides `doctor`, `run`, `capture` and `render`; it privately serves the bundled
renderer and produces MP4 without a manually started replay app. The package
includes the [adoption skill](skills/adopt-stop-motion-capture/SKILL.md).

Version 0.3.0 adds `defineVideo` for continuous animation/game footage, alongside
`defineDemo` for screenshot reconstruction. Both use the same CLI. Continuous
recipes name segments, await paced input and mark long waits with `speed: 3` or
`5`; captions, speed badges and normal-rate narration are included in the MP4.
See [continuous recipes](docs/agent-cli.md#continuous-games-and-animation).

The commands below describe maintaining this source checkout.

```sh
npm install
```

One command, run once from the repo root. The root `package.json` declares an npm **workspaces** array covering `shared/`, `capture/playwright/`, and `replay-app/`, so this single install covers all three sub-packages' dependencies (Angular toolchain, Playwright + sharp, etc.) — no need to `cd` into each subfolder and install separately. (`npm run setup` is an identical, more-discoverable alias for the same command.)

## Commands

Run from the repo root via `npm run <command>` (forwards to `scripts/cli.mjs` — see that file's header for the full subcommand list, or `node scripts/cli.mjs help`):

- `npm run dev` — starts the Angular dev server (`:4221`) and the companion HTTP dev-server (`:3001`) together.
- `npm run capture [-- --headed]` — runs the Playwright capture script.
- `npm run narrate -- <scenario-dir> [...]` — generates narration audio for one scenario. Uses Chatterbox (local, free) by default; set `TTS_PROVIDER=elevenlabs` plus `ELEVENLABS_API_KEY` to use ElevenLabs (cloud, paid) instead — no Chatterbox server or network setup needed in that case. See [`docs/adr/ADR-013-elevenlabs-tts-provider.md`](docs/adr/ADR-013-elevenlabs-tts-provider.md).
- **TTS provider/credentials can also be set from the UI** instead of environment variables: open the Angular app (`npm run dev`) and go to **Settings** (`/settings`). Choose Chatterbox or ElevenLabs, fill in the relevant fields (ElevenLabs API key is write-only — never shown again once saved), and hit Save. This writes to a gitignored `.local-tts-config.json` at the repo root via the dev-server, which takes precedence over the `TTS_PROVIDER`/`CHATTERBOX_TTS_URL`/`ELEVENLABS_API_KEY` env vars above when present (env vars remain the fallback for CI/terminal-only use). See [`docs/adr/ADR-014-tts-settings-ui.md`](docs/adr/ADR-014-tts-settings-ui.md).
- `npm run generate-narration` — generates narration audio for every scenario (same `TTS_PROVIDER` switch applies).
- `npm run export-video -- <scenario-dir> [...]` — exports a video via the **canonical** path (`scripts/playwright-export.mjs`, drives the live Angular canvas — needs `npm run dev` already running and a real browser). This is also what the Angular app's "Export Video" button runs.
- `npm run export-video:legacy -- <scenario-dir> [...]` — exports a video via the **legacy** path (`scripts/export-video.mjs`, Node timeline math + Python/Pillow + ffmpeg, no browser needed). Kept specifically as a fallback for environments that can't launch a browser. See [`docs/adr/ADR-012-export-pipeline-pivot-and-cli-consolidation.md`](docs/adr/ADR-012-export-pipeline-pivot-and-cli-consolidation.md) for why both exist.

See [`docs/concept.md`](docs/concept.md) and [`docs/open-questions.md`](docs/open-questions.md).
