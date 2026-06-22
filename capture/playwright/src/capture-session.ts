// Re-export of the canonical CaptureSession — see ../../../shared/capture-session.ts.
//
// This used to be a full standalone copy. It (and an independently-drifted
// duplicate in Daxur-Daemon's daxur-daemon-web/e2e/) is now consolidated
// into shared/capture-session.ts (see ADR-006). Kept as a re-export here,
// rather than updating every import site in this folder, so dry-run.ts and
// capture-demo.ts's `from './capture-session.js'` imports keep working
// unchanged.
//
// IMPORTANT — why a plain `npm i` *inside this folder alone* isn't enough for
// `sharp`: this is a *relative-path* import into shared/'s real on-disk
// location (not through node_modules/stop-motion-shared), so Node resolves
// shared/capture-session.ts's own `import 'sharp'` starting from shared/'s
// real directory (and walking up its ancestor node_modules from there), not
// from this package's own node_modules. That means `sharp` must actually be
// reachable from shared/'s directory — either installed directly inside
// shared/node_modules, or hoisted into the repo root's node_modules where
// Node's ordinary upward node_modules search will still find it.
//
// As of the root-level npm workspaces setup (root package.json's
// "workspaces": ["shared", "capture/playwright", "replay-app"]), a single
// `npm install` run from the repo root installs every workspace's
// dependencies — including shared/package.json's `sharp` — in one pass, with
// npm hoisting what it can into the root node_modules. That single root
// install is sufficient on its own; no separate `npm install --prefix
// ../../shared` step is needed any more (an earlier version of this setup
// did that manually from this package's postinstall script — see
// RUNBOOK.md's history note if you're tracing why an old comment/log
// mentions it). If you ever see `Cannot find package 'sharp' imported from
// .../shared/capture-session.ts`, it means the root `npm install` hasn't
// been run (or didn't finish) — re-run `npm install` from the repo root, not
// from inside this folder.
export * from '../../../shared/capture-session.js';
