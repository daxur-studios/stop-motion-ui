# Adoption Guide: using stop-motion-ui from another repo

This guide is for taking the core idea of this project — capture sparse
screenshots + a metadata stream, then replay them with a faked animated
cursor instead of recording real video — and using it from a **separate**
Playwright test repo (e.g. at a different company), without that repo
depending on this one at runtime.

It's written for the case where you (human or agent) have this repo checked
out locally, but the place you actually want demos to come from is a
*different* repo whose Playwright tests you don't want to touch much, and
which won't have ongoing access back to this dev environment. If that's not
your situation, you may not need most of this — just use this repo directly
(see `README.md`).

There are four pieces, covered in order: packaging the shared capture
library, writing a capture script in the host repo, choosing a player, and
getting the resulting manifest into something that can preview/export video.
The fourth piece — the manifest import bridge — is the one that actually
makes this cross-repo, so if you only read one section, read that one.

## 0. The constraint this guide is written around

The working assumption is: no path back to this dev environment once you've
moved to the host repo/company, and no publishing this package to a public
or private npm registry either (it's a small POC, not something worth
standing up registry infra for, and a public registry would mean shipping
someone else's internal demo-capture code publicly). This isn't recorded
anywhere else in this repo's docs — it's a real-world constraint of the
adopting environment, not something this codebase enforces — so it's spelled
out here because it's the reason the recommendation in section 1 is "pack a
tarball," not "add a registry dependency" or "git submodule this repo."

If your situation is different (you do have a private registry, or the two
repos can share a monorepo), simpler options open up — a normal
`npm install @yourscope/stop-motion-shared` or an npm workspace spanning both
repos would both work fine and are less to maintain long-term than the
tarball approach below. The tarball is the answer for "I need this to work
today, offline, with no shared infrastructure."

## 1. Getting `shared/`'s types and `CaptureSession` into the host repo

The only piece of this repo a host repo actually needs at runtime is
`shared/` — `shared/capture-session.ts` (the `CaptureSession` class that
clicks/scrolls/circles get recorded into, plus manifest writing and
screenshot saving via `sharp`) and `shared/manifest-types.ts` (the
TypeScript shapes for `Manifest`/`ManifestEvent`/etc., consumed by both the
capture side and the player side — see `docs/adr/ADR-006-shared-capture-package.md`
for why this was consolidated into one package instead of living as
duplicated copies per capture backend).

**Recommended: `npm pack` → a `.tgz` tarball, copied into the host repo.**

From this repo:

```sh
cd shared
npm pack
# produces stop-motion-shared-0.1.0.tgz (or whatever version is current) in shared/
```

Copy that `.tgz` into the host repo (anywhere — a `vendor/` folder is a
reasonable convention) and install it as a normal local-file dependency:

```sh
# in the host repo
npm install ./vendor/stop-motion-shared-0.1.0.tgz
```

This is exactly what a registry install does (npm unpacks the tarball into
`node_modules/stop-motion-shared`), so the host repo's import sites look
completely normal — `import { CaptureSession } from 'stop-motion-shared/capture-session.js'`
— and `sharp` (the one runtime dependency `shared/package.json` declares)
gets installed for you as part of the host repo's own `npm install`, no
special handling needed. There's no path back to this dev environment after
that point and no registry account needed by anyone.

Why not the alternatives:

- **Git submodule / git subtree of this whole repo** — pulls in everything
  (the Angular app, both capture backends, docs, ADRs), when the host repo
  only wants `shared/`. More surface area to keep in sync for no benefit.
- **Copy-paste the two files directly into the host repo** — works in a
  pinch, but you lose any future fix made to `shared/` here, and you've now
  got an undeclared, untracked fork. Fine for a one-off, not a real adoption
  path.
- **Private npm registry** — the right answer if your company already runs
  one and this is going to be used by more than one team/repo long-term.
  Ruled out here only because that infrastructure doesn't exist for this
  specific case (see section 0) — if it does for you, prefer it over the
  tarball; it's the more normal long-term shape of the same idea.

When you cut a new tarball after a `shared/` change here, repeat the
`npm pack` + re-`npm install ./vendor/...tgz` steps in the host repo — npm
treats a re-install of the same filename as an update.

### Running this in CI (Azure Pipelines, or any pipeline that runs `npm install`/`npm ci` fresh)

The tarball approach above works in CI, but only if you account for one
thing it's easy to miss: **a pipeline agent only ever sees what's in source
control (or a configured feed) — it never sees the machine that ran
`npm pack`.** If you only copied the `.tgz` onto your own laptop and
`npm install`-ed it there, the pipeline's checkout won't have that file, the
`file:./vendor/...tgz` dependency in `package.json` won't resolve, and the
build will fail at the install step exactly as you'd expect.

Concretely, for this to work in an Azure Pipelines build (or any CI that
does a fresh checkout + `npm ci`/`npm install`):

- **Commit the `.tgz` itself to the repo** — don't `.gitignore` it. It needs
  to exist in the checked-out working tree at the path your `package.json`
  references (`vendor/stop-motion-shared-0.1.0.tgz` or wherever you put it),
  the same way any other source file does. There's no "install step" that
  fetches it from anywhere else — `npm install`/`npm ci` just unpacks a file
  that's already sitting on disk.
- **Commit the regenerated `package-lock.json` too.** When you run
  `npm install ./vendor/...tgz` locally, npm writes a `file:` resolution
  with an integrity hash into the lockfile. If your pipeline uses `npm ci`
  (common for reproducible CI installs — and stricter than `npm install`
  about the lockfile matching `package.json` exactly), an out-of-date
  lockfile will fail the build even if the tarball itself is present and
  correct. Run the install locally, then commit both the `.tgz` and the
  updated lockfile together.
- **Be aware this puts binary blobs in git history.** Every time you cut a
  new version of the tarball, that's another multi-KB-or-larger binary blob
  added to the repo permanently (git doesn't diff binaries usefully — each
  version is a full new object). Fine for occasional updates; if `shared/`
  changes often, this gets old, and that's the cue to revisit the next
  option.
- **If you don't need this to work "today, offline, with no shared
  infrastructure" (the constraint section 0 is built around) — check
  whether you already have a better option via Azure Artifacts.** Azure
  DevOps includes a private npm package feed (Azure Artifacts) scoped to
  your org/project. If one is already set up (or your platform/DevOps team
  can set one up), publish `stop-motion-shared` there instead of using a
  committed tarball at all: `npm publish` to the feed from wherever you cut
  releases, and a normal `npm install stop-motion-shared` (with an `.npmrc`
  pointing at the feed, authenticated via a pipeline service connection or
  PAT) in the host repo and in the pipeline — no tarball, no binary blobs in
  git, normal semver versioning, and it Just Works in CI the same way any
  other registry dependency does. This is exactly the "private registry"
  alternative mentioned in section 0 above — for an Azure DevOps shop
  specifically, it's very likely already available infrastructure, not
  something you'd need to stand up from scratch, which tips the tradeoff
  away from the tarball for any setup expected to live in CI long-term.

If you're not sure which to use: tarball-in-git is the faster thing to get
working in the next ten minutes; an Azure Artifacts feed is the thing to
switch to once this is a real, ongoing part of your pipeline rather than a
one-off experiment.

## 2. Writing a capture script in the host repo

Model your script directly on
`capture/playwright/src/capture-demo.ts` in this repo — read that file
end to end once before writing your own; it's a complete, real example
covering clicks, navigation, scrolling, a `circle` attention gesture, and
narration text, all in one flow.

The shape is the same regardless of what app you're capturing:

```ts
import { chromium } from 'playwright';
import { CaptureSession } from 'stop-motion-shared/capture-session.js';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const session = new CaptureSession({ backend: 'playwright', viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:YOUR_APP_PORT/');
session.addNavigate({ url: '/', narrationShort: 'Opening the app.', screenshotRef: await shot(session, page) });

// ...your app's real flow: page.locator(...).click(), session.addClick({...}), etc.

await session.save('./out/your-scenario-name'); // writes manifest.json + screenshots/
await browser.close();
```

A few things worth carrying over deliberately from `capture-demo.ts` rather
than reinventing:

- **Write screenshots to a staging directory outside any dev-server-watched
  folder, then copy the finished manifest+screenshots in at the very end.**
  This repo hit a real bug where writing screenshots straight into the
  Angular app's watched `public/` folder mid-capture caused live-reloads
  that tore down in-progress UI state (dialogs, dropdowns) Playwright was
  mid-interaction with — see RUNBOOK.md's "Fixed: dev-server reload
  mid-capture" section. The fix (stage outside, copy in once at the end) is
  the right default for any host app being captured while its own dev
  server is also watching the filesystem.
- **Wait on real signals, not fixed sleeps**, for anything async — an
  app-exposed idle flag (`data-busy`-style attribute), `getAnimations()` to
  wait out CSS transitions before a screenshot (catches mid-fade-in
  screenshots that look broken), that kind of thing. `capture-demo.ts`'s
  `waitForIdle()`/`waitForAnimationsToSettle()` helpers are good templates.
- **Narration text quality matters more than it looks like it should.**
  Don't author the same narration string twice in a row inside a loop (e.g.
  two clicks that bump a counter both getting "Incrementing the counter.")
  — see `docs/demo-readiness-checklist.md`'s "Narration authoring rules"
  section for the concrete bug this caught and the fix pattern (read back
  the actual resulting state and narrate that, instead of repeating the verb
  phrase). This is the single most common way a generated demo gives away
  that it isn't a real screen recording.

## 3. Which player to use

**Recommendation: the deprecated `replay/player.js` + `replay/index.html`,
not the Angular app (`replay-app/`).**

This sounds backwards given this repo's own README says `replay-app/` is
"the actively maintained player" and `replay/player.js` is "deprecated,
kept as a no-build-step fallback" — and that's all still true *for this
repo's own purposes*. But adoption at a different company is a different
set of constraints than maintaining this repo:

- `replay/player.js` is plain JS + Canvas 2D, loaded as a classic
  `<script>` tag. **Zero build step, zero dependencies, zero framework
  version to keep compatible with anything.** You can drop `index.html` +
  `player.js` + a manifest + screenshots into literally any folder a
  webserver can serve, and it works.
- `replay-app/` is a full Angular 20 app (standalone components, zoneless
  change detection) with its own `package.json`, its own `npm install`, its
  own dev server, and its own upgrade surface over time. That's the right
  tradeoff *here*, where the team already owns and actively develops this
  whole repo and wants new player features (the sped-up-indicator badge,
  etc.) to land somewhere real. It's the wrong tradeoff for a host repo that
  just wants to render a demo video occasionally and has zero interest in
  maintaining an Angular app it didn't ask for.

So the seeming contradiction is just two different questions getting two
different right answers: "what should *this* project invest further feature
work into" (Angular, clearly) versus "what should someone *else* run with
the least possible ongoing burden" (the dependency-free version, just as
clearly). Deprecated-for-active-development and best-for-a-light-touch-consumer
aren't in tension — they're often the same file for exactly this reason.

Practically: copy `replay/index.html` and `replay/player.js` into the host
repo (or just point a static file server at this repo's `replay/` folder
directly, read-only, if that's easier), and serve them over `http://`
(opening `index.html` via `file://` fails to fetch the manifest in Chrome —
serve with `python3 -m http.server` or `npx serve` from inside the folder;
see this repo's own README for the same caveat). Point its scenario picker
or manifest fetch at wherever you've imported your manifest (see section 4).

If a host team's situation changes — they end up wanting ongoing new
player features, multiple people maintaining it, etc. — revisit and use
`replay-app/` instead at that point. Nothing here is one-way.

## 4. Getting the host repo's manifest into something that can preview/export video — the actual cross-repo bridge

This is the centerpiece: everything above just gets you a `manifest.json` +
`screenshots/` folder sitting somewhere in the host repo's own output
directory (wherever your capture script's `session.save(...)` call pointed).
Neither player (Angular or plain-JS) can do anything with that file sitting
in an arbitrary host-repo location — both expect a manifest at a path they
already know about.

**This repo's `scripts/import-scenario.mjs` is the bridge.** It's a small
CLI that copies an externally-captured `manifest.json` + `screenshots/` pair
into this repo's own `replay-app/public/test-scenarios/<name>/`, where the
existing Angular player (and, with a one-time manual copy, the plain-JS
player's `replay/test-scenarios/`) already knows to look:

```sh
# from this repo's root, pointing at wherever the host repo wrote its capture output
npm run import-scenario -- /path/to/host-repo/capture-output/your-scenario --scenario=your-scenario
# or equivalently: node scripts/cli.mjs import-scenario /path/to/... --scenario=your-scenario
```

Re-running after a fresh capture is just `--force`:

```sh
npm run import-scenario -- /path/to/host-repo/capture-output/your-scenario --scenario=your-scenario --force
```

After that, the normal pipeline takes over completely unmodified — narrate,
preview, and export all work exactly as if this repo had captured the
scenario itself, because the imported files are byte-for-byte
indistinguishable from a manifest this repo produced natively:

```sh
npm run narrate -- replay-app/public/test-scenarios/your-scenario   # optional, generates narration audio (see section 5)
npm run dev                                                          # then pick "your-scenario" in the player's scenario picker
npm run export-video -- replay-app/public/test-scenarios/your-scenario
```

If you went with the plain-JS player from section 3 instead of the Angular
one, copy (or point your static server at) the same imported folder under
`replay/test-scenarios/your-scenario/` — same manifest shape, same files,
just a different folder the simpler player happens to read from.

**Why a copy-in CLI command, and not a configurable manifest-path
environment variable read directly by the Angular dev server, and not a
filesystem symlink:**

- A configurable path read by `ng serve` directly would mean pointing the
  live dev server at an arbitrary external folder without copying anything.
  This was considered and rejected: `ng serve` only serves static assets out
  of its own project's `public/` directory — making it serve from anywhere
  else needs custom Angular asset-serving configuration, and that
  configuration wouldn't carry over to a production-style `ng build` serve
  either. It's strictly more moving parts for the same result.
- A symlink (`replay-app/public/test-scenarios/your-scenario` → the host
  repo's output folder) was also considered and rejected, specifically
  because this repo's primary dev environment is Windows (see
  `RUNBOOK.md`'s prereqs) — creating a symlink on Windows needs either
  Developer Mode or admin privileges, which is exactly the kind of
  adoption-time friction this guide exists to avoid for "a fresh agent at a
  new company with no special permissions" doing this work.
- A plain recursive file copy (`scripts/import-scenario.mjs`, using Node's
  `cpSync`) has neither limitation, costs nothing to re-run after every
  fresh capture, and works identically on Windows/macOS/Linux.

The script also validates before copying anything — it checks the source
`manifest.json` parses as JSON and has an `events` array, refuses to
silently clobber an existing destination scenario unless you pass `--force`,
and warns (without failing) if there's no `screenshots/` folder next to the
manifest. Run `node scripts/import-scenario.mjs --help` for the full flag
reference, or read the script's own header comment
(`scripts/import-scenario.mjs`) — it documents this same decision inline.

## 5. Wiring up narration and video export

Both work from any machine, host-repo or not, once `shared/` + a player are
in place — narration and export aren't actually specific to *this* repo's
files once a manifest exists, they just need to be run somewhere that has
the right tools installed.

**Narration** (`npm run narrate -- <scenario-dir>` from this repo, against
the imported scenario folder) supports two interchangeable providers — see
`docs/adr/ADR-013-elevenlabs-tts-provider.md` for the full design:

- **Chatterbox (local, free):** the default. Needs a Chatterbox server
  reachable at `CHATTERBOX_TTS_URL` (default `http://localhost:8004/...`) —
  i.e. something running locally or on the same network. No cost, no
  external account, but you need that server actually up.
- **ElevenLabs (cloud, paid):** set `TTS_PROVIDER=elevenlabs` and
  `ELEVENLABS_API_KEY` in the environment — no Chatterbox server, no
  networking-between-machines setup at all, works from anywhere with
  internet access. This is the simpler option for a host-repo/new-company
  setup specifically because it has no "is the right server reachable"
  dependency — just an API key. There's also a Settings UI in the Angular
  player (`/settings`) that writes the same config to a gitignored local
  file instead of environment variables, if you're running the Angular
  player and prefer not to manage env vars.

**Video export** (`npm run export-video -- <scenario-dir>`) needs `ffmpeg`
on the machine doing the export, plus whichever player you chose actually
running:

- The **canonical** path (`scripts/playwright-export.mjs`, what `export-video`
  runs by default) drives the *live* Angular player via Playwright and
  records what's actually rendered on the canvas — pixel-identical to what a
  human sees, but it needs `npm run dev` already running (a real Angular
  dev server + a real launchable browser).
- The **legacy** path (`npm run export-video:legacy`, `scripts/export-video.mjs`)
  reimplements the same timeline math in plain Node + Python/Pillow and
  needs no browser or dev server at all — only Node, Python3+Pillow, and
  ffmpeg. This is the one to use in a sandboxed/CI/agent environment that
  can't launch a browser (see `docs/adr/ADR-012-export-pipeline-pivot-and-cli-consolidation.md`
  for why both paths exist and are kept).

If you went with the plain-JS player from section 3 instead of the Angular
one, the canonical (Playwright-driven) export path can still be pointed at
whatever URL is serving `replay/index.html` instead of the Angular dev
server's URL — same idea, it's just recording whatever's on screen,
regardless of which player produced it. The legacy path doesn't care about
either player at all; it draws frames itself from the manifest directly.

## Summary checklist

1. `cd shared && npm pack`, copy the `.tgz` into the host repo, `npm install` it there.
2. Write a capture script in the host repo against `CaptureSession`, modeled on `capture/playwright/src/capture-demo.ts`. Stage screenshots outside any watched folder; wait on real signals; vary narration text per iteration.
3. Use `replay/player.js` + `replay/index.html` (not `replay-app/`) unless you specifically expect to be doing ongoing player feature work.
4. Run `npm run import-scenario -- <host-repo-output-dir> --scenario=<name>` from this repo to bring the manifest in.
5. `npm run narrate` (Chatterbox or ElevenLabs) and `npm run export-video` (canonical or legacy) both work unmodified once the manifest is imported.

See also: `skills/adopt-stop-motion-capture/SKILL.md` for a self-contained,
step-by-step version of this same guide aimed at an agent doing this work
cold, with no access to the conversation history that produced this repo.
