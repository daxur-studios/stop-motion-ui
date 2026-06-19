// Re-export of the canonical CaptureSession — see ../../../shared/capture-session.ts.
//
// This used to be a full standalone copy. It (and an independently-drifted
// duplicate in Daxur-Daemon's daxur-daemon-web/e2e/) is now consolidated
// into shared/capture-session.ts (see ADR-006). Kept as a re-export here,
// rather than updating every import site in this folder, so dry-run.ts and
// capture-demo.ts's `from './capture-session.js'` imports keep working
// unchanged.
export * from '../../../shared/capture-session.js';
