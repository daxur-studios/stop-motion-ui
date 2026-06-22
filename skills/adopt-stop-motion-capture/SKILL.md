---
name: adopt-stop-motion-capture
description: Use this skill when asked to bring "stop-motion-ui"-style fake-screen-recording demos (sparse screenshots + animated cursor, no real video capture) into a DIFFERENT repo that doesn't already have this tooling — e.g. "make a stop-motion demo for our Playwright tests", "set up the daxur-studios stop-motion-ui capture in this repo", or any request to generate a lightweight UI walkthrough demo/video from an existing Playwright test suite without recording real video. Not relevant if the user is already working inside the stop-motion-ui repo itself (use its own docs/README directly in that case).
---

# Adopting stop-motion-ui capture in a new repo

You are an agent working in some repo (call it the **host repo**) that is
**not** `stop-motion-ui` itself, and you have no access to any conversation
history about that other project — only this file, and whatever you
discover by reading code. Your job: get a lightweight, fake-screen-recording
demo (screenshots + an animated cursor that fakes a smooth video) working
for part of the host repo's existing UI, end to end — capture, optional
narration, and a playable/exportable result.

## What this actually is, in one paragraph

Instead of recording real video (heavy: storage, encoding, playback cost),
you capture **sparse screenshots keyed to discrete UI events** (click,
navigate, scroll) plus a **metadata stream** (cursor positions + timestamps
+ action type, optionally narration text/audio). A player then renders a
fake cursor that glides smoothly between the recorded points with
bezier-style easing, swapping in whichever screenshot is "current" as the
fake cursor moves. Looks like a screen recording. Is mostly stills.

## Step 0 — locate the source project, decide what you need from it

You need exactly one thing out of the original `stop-motion-ui` project: its
`shared/` package (`CaptureSession` + manifest TypeScript types). Everything
else (the Angular player, the Playwright capture *demo* specifically, the
docs) is either reference material to read once, or an alternative you don't
strictly need.

If you have filesystem access to a checkout of `stop-motion-ui` (ask the
user where it lives if it's not obvious — common answer: a sibling folder,
or it was shared as a zip/tarball), do this once:

```sh
cd <stop-motion-ui-checkout>/shared
npm pack
# -> stop-motion-shared-<version>.tgz, written into that shared/ folder
```

Copy that `.tgz` into the host repo (a `vendor/` folder is a reasonable
place) and install it as a local dependency:

```sh
# in the HOST repo
npm install ./vendor/stop-motion-shared-<version>.tgz
```

This is the recommended approach **specifically because** there is normally
no path back to the original dev environment after this point, and no npm
registry to publish to (a small POC package, not worth standing up registry
infrastructure for) — `npm pack` produces a fully self-contained tarball, so
once it's installed, the host repo has zero further dependency on anything
outside itself. If you instead have access to a private registry your
company already runs, a normal registry dependency is simpler long-term —
use that instead if it's available; the tarball is the fallback for "make
this work today with nothing else required."

After install, the host repo can import:

```ts
import { CaptureSession } from 'stop-motion-shared/capture-session.js';
import type { Manifest, ManifestEvent } from 'stop-motion-shared/manifest-types.js';
```

`sharp` (used for screenshot encoding) is a declared dependency of that
package and installs automatically as part of the host repo's own
`npm install` — no extra step needed.

## Step 1 — write a capture script against the host repo's own Playwright setup

Whatever the host repo's existing Playwright config looks like, add a new
script (don't touch existing test files) that drives the same app through a
short demo flow and records it with `CaptureSession`:

```ts
import { chromium } from 'playwright'; // or reuse the host repo's existing Playwright setup/fixtures
import { CaptureSession } from 'stop-motion-shared/capture-session.js';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const session = new CaptureSession({ backend: 'playwright', viewport: { width: 1280, height: 800 } });

async function shot(page) {
  return session.saveScreenshot(await page.screenshot({ type: 'jpeg', quality: 80 }));
}

await page.goto('http://localhost:PORT/'); // wherever the host app runs
session.addNavigate({ url: '/', narrationShort: 'Opening the app.', screenshotRef: await shot(page) });

const button = page.locator('[data-testid="some-button"]');
const box = await button.boundingBox();
await button.click();
session.addClick({
  target: '[data-testid="some-button"]',
  cursor: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  narrationShort: 'Clicking the button.',
  narrationLong: 'Clicking the button triggers the next step in the flow.',
  screenshotRef: await shot(page),
});

await session.save('./capture-output/your-scenario'); // -> manifest.json + screenshots/
await browser.close();
```

Rules that matter, learned from real bugs hit building the original
project — don't skip these:

1. **Stage output outside any folder your dev server watches, copy in only
   at the end.** Writing screenshots live into a watched `public/`-style
   folder mid-capture can trigger live-reloads that tear down in-progress
   UI (open dialogs/dropdowns) Playwright is mid-interaction with. Write to
   a scratch directory for the whole run; only copy the finished
   `manifest.json` + `screenshots/` into their real destination after
   `browser.close()`.
2. **Wait on real signals, not fixed `sleep()` calls**, for anything async —
   an app-exposed idle/busy flag if one exists, or
   `await el.getAnimations()` resolved/finished before screenshotting
   anything mid-transition (a screenshot taken mid-fade-in looks broken —
   half-opacity dialogs, etc.).
3. **Narration text must never repeat the same phrase back-to-back.** This
   is the single most common tell that a demo isn't a real recording. If a
   loop performs the same physical action more than once (e.g. clicking
   "increment" twice), don't give both iterations identical narration —
   read back the actual resulting on-screen state (a counter value, a label)
   and narrate that:

   ```ts
   for (let i = 0; i < 2; i++) {
     await incrementBtn.click();
     const count = (await counterValue.textContent())?.trim();
     session.addClick({
       target: '[data-testid="increment"]',
       cursor: await centerOf(incrementBtn),
       narrationShort: `Incrementing the counter to ${count}.`, // varies per iteration — NOT a static string repeated
       screenshotRef: await shot(page),
     });
   }
   ```

   Bad: both iterations narrated as `"Incrementing the counter."` — sounds
   like a stutter on playback, breaks the illusion at the exact moment a
   number visibly changes on screen (the most noticeable moment in the demo).

## Step 2 — pick a player

You have two real options. Pick based on how much this host repo is going
to keep using this, not by "newest tech":

- **Plain JS + Canvas player (recommended default for adoption).** Zero
  build step, zero framework dependency, just an HTML file + a JS file
  loaded via classic `<script>` tag. If you have access to the original
  `stop-motion-ui` checkout, copy its `replay/index.html` and
  `replay/player.js` into the host repo (any folder a static server can
  serve). If you don't have that checkout available at all, you can
  reconstruct an equivalent minimal player: it needs to fetch a
  `manifest.json` (shape: `{ events: [{ type, timestamp, cursor, target?,
  screenshotRef, narrationShort?, narrationLong? }, ...] }`), preload the
  referenced screenshots, and on a timer/rAF loop draw the current
  screenshot plus a cursor dot/circle interpolated between the current and
  next event's cursor positions using an eased (not linear) curve. Serve it
  over `http://`, not `file://` (Chrome blocks the manifest fetch under
  `file://`).
- **A full framework-based player (only if you expect ongoing feature
  work).** More setup, more long-term maintenance, only worth it if more
  than one person will be extending the player itself over time. Don't
  default to this for a one-off or occasional-use demo need.

## Step 3 — get the manifest somewhere the player can read it

Whatever player you're using needs the manifest + screenshots sitting at a
path it already knows to fetch from (a static-served folder, typically).
There is no special tooling required for this step in the host repo itself
— it's just "put the files where the static server serves them from," e.g.
copy `capture-output/your-scenario/` to wherever your chosen player's
manifest folder convention expects it.

(If you happen to *also* have the original `stop-motion-ui` repo checked out
and want to preview/export using its existing Angular player instead of
building your own, that repo has a ready-made import command for exactly
this — `npm run import-scenario -- <your-capture-output-dir> --scenario=<name>`
from inside that repo, documented in its `docs/ADOPTION-GUIDE.md` and
`scripts/import-scenario.mjs`. Optional, not required for a standalone
adoption.)

## Step 4 — narration (optional)

Two ways to turn `narrationShort`/`narrationLong` text into actual audio,
both behind a simple HTTP call you can replicate without any special SDK:

- **Local TTS server** (e.g. Chatterbox or any self-hosted TTS exposing an
  HTTP endpoint) — call it per narration string, save the audio next to the
  manifest, reference the file from a `narrationAudioShort`/`...Long` field
  on the manifest event if your player supports playing it.
- **Cloud TTS with an API key** (e.g. ElevenLabs) — `POST` to the provider's
  text-to-speech endpoint with your API key header, same idea. No local
  server needed, works from anywhere with internet access — generally the
  simpler option for a fresh environment with no existing local TTS setup.

Narration is optional — every player here can estimate timing from a
words-per-minute heuristic on the narration *text* alone, even with no audio
file at all, so skip this step entirely if you just want a silent visual
demo.

## Step 5 — export to video (optional)

If you need an actual video file rather than a live interactive page:

- **Browser-driven recording**: serve your player, drive it with Playwright
  (or any browser-automation tool) recording the page/canvas, drain frames
  to `ffmpeg`. Most faithful to what a viewer would actually see, needs a
  real launchable browser.
- **Headless frame-by-frame rendering**: reimplement the player's timeline
  math (interpolate cursor position + pick current screenshot at each
  sampled timestamp) in plain code, rasterize each frame (e.g. via a Python
  Pillow script or any image library), pipe the PNG sequence into `ffmpeg`.
  No browser needed at all — the right choice in a sandboxed/CI/agent
  environment that can't launch Chromium.

Both approaches are legitimate; pick based on whether a real browser is
available in the environment doing the export.

## Done-checklist

- [ ] `shared/` (or an equivalent `CaptureSession` + manifest types) is
      installed in the host repo via a tarball (or registry/workspace, if
      available) — no remaining dependency on the original dev environment.
- [ ] A capture script exists in the host repo, staged-write pattern used,
      real-signal waits used, narration text varies per loop iteration.
- [ ] A player (plain-JS recommended) can load the resulting manifest and
      play it back over `http://`.
- [ ] (Optional) Narration audio generated via a local or cloud TTS call.
- [ ] (Optional) A video file exported via either the browser-driven or
      headless-rendering approach.
