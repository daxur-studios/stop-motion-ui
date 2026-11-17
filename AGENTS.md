# Repository instructions for agents

## Project overview

Stop Motion UI turns UI walkthroughs into event-timed screenshots, animated cursor motion, optional narration and MP4 exports. The maintained replay player is in `replay-app/`; `replay/` is a deprecated no-build-step fallback. Capture code lives under `capture/`, shared capture and manifest types under `shared/`, and the root command dispatcher is `scripts/cli.mjs`.

The installed agent CLI is `bin/stop-motion-ui.mjs`, backed by `lib/`. Build the distributable with `npm run build:package`; `npm pack` runs this automatically. It bundles the maintained renderer and capture session into `dist/` and ships the adoption skill. Read `docs/agent-cli.md` for this workflow. The source-only dispatcher remains separate for prototype maintenance.

`defineDemo` reconstructs screenshot walkthroughs; `defineVideo` records continuous browser-page footage using declared segments and paced real input. Both use the installed CLI. Keep narration preparation outside continuous capture and accelerate footage explicitly, with its pointer parked and a visible speed badge. Neither mode records desktop or game audio; continuous mode mixes supplied/generated narration. See Plan 005 for extraction and consumer evidence.

Start with `README.md`, then read the relevant ADR and section of `docs/roadmap.md`. For capture work, also read the relevant `RUNBOOK.md` and `docs/demo-readiness-checklist.md`. Keep existing local changes intact.

## Plans and Engineering Records

Before a substantial feature, refactor or integration, create a numbered Plan and its reciprocal Engineering Record (ER) with the Triangular CLI. Plans state current scope, phases and observable acceptance criteria. ERs preserve dated decisions, findings, scope changes and verification evidence; append history instead of erasing it. Use the workflow in [`docs/plans-and-runbooks.md`](docs/plans-and-runbooks.md).

Prefer the installed command:

```sh
triangular docs plan new --title "Short title" --slug lower-kebab-case --root .
triangular docs records review docs/plans/NNN_short-title.md --reviewer agent --root .
triangular docs records check --root .
```

If `triangular` is not on `PATH`, use the `triangular-engine` checkout available in the development workspace by running its `projects/triangular-engine/bin/triangular.mjs` with the same arguments. Do not add a dependency on that checkout to this project's runtime package.

Keep completed, abandoned and superseded Plans and ERs as history. Update the Plan and append the outcome to its ER, then archive a completed pair with `triangular docs archive docs/plans/NNN_slug.md --root .`; use `triangular docs unarchive` to restore it. Archive only after the full pair is present in Git history so the CLI stubs remain restorable. Since agents do not commit in this repository, leave a completed pair intact until the user or maintainer commits it, then archive it. Do not use `--force` or point the stubs at a commit that does not contain the documents. Never delete or renumber these documents. Do not establish a scope baseline unless the user explicitly confirms the exact snapshot; a review or checked boxes are not approval.

## Evidence and verification

- For video handoffs, follow [Discovery and delivery](docs/agent-cli.md#discovery-and-delivery). In Codex, embed the absolute MP4 path with `![Demo](<absolute-path-to-demo.mp4>)`; phone playback was confirmed on 2026-11-05. Claude uses its available `SendUserFile` tool. Sharing is separate from inspecting or accepting the contents.
- Separate functional checks, performance measurements and human visual acceptance. A screenshot or video can support visual review; it does not establish performance.
- Record what was actually run and its observable result in the ER. State when browser, display, service or provider limitations prevented a check.
- For capture scripts, wait on application readiness and settled animations rather than fixed sleeps where the app exposes those signals. Stage generated screenshots outside folders watched by the dev server, then publish them after capture finishes.
- Keep the displayed cursor continuous across every action boundary. Cursor pacing is a code guarantee, not a guessed readiness sleep. For continuous capture, match the initial real/drawn positions and use awaited, timed movement before input; a Playwright step count alone is insufficient. See [cursor authoring guidance](docs/agent-cli.md#authoring). Compact HEVC exports are now the default; use `--codec h264` when a client needs it.
- Preserve the difference between simulated replays (screenshots plus generated cursor motion) and direct screen/video recordings. Do not claim Stop Motion UI is integrated with `triangular-engine/testing`; that remains an exploration in Plan 002.
- Do not commit changes. Leave the working tree ready for the user to review.
