// Re-export of the canonical CaptureSession — see ../../../shared/capture-session.ts.
//
// This used to be a full standalone copy. It (and an independently-drifted
// duplicate in Daxur-Daemon's daxur-daemon-web/e2e/) is now consolidated
// into shared/capture-session.ts (see ADR-006). Kept as a re-export here,
// rather than updating every import site in this folder, so dry-run.ts and
// capture-demo.ts's `from './capture-session.js'` imports keep working
// unchanged.
//
// IMPORTANT — why `npm i` here alone isn't enough for `sharp`: this is a
// *relative-path* import into shared/'s real on-disk location (not through
// node_modules/stop-motion-shared), so Node resolves shared/capture-session.ts's
// own `import 'sharp'` starting from shared/'s real directory, not from this
// package's node_modules. That means `sharp` must actually be installed
// inside shared/node_modules (or hoisted into the repo root's node_modules)
// — installing it here in capture/playwright/node_modules does not help this
// import site at all. package.json's `postinstall` runs
// `npm install --prefix ../../shared` for exactly this reason, so a single
// `npm i` in capture/playwright/ is enough; see ADR-006's "needs its own npm
// install (for sharp)" note for the original two-step version of this.
export * from '../../../shared/capture-session.js';
