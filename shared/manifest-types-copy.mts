// NOTE: stray artifact from a `node --experimental-strip-types` ESM test run
// in capture/chrome-mcp/dry-run/ (Node's ESM loader needs explicit file
// extensions in relative imports, which .ts doesn't have). The session that
// created this file could not delete it (sandbox denied file-delete
// permission) and repurposed it as a thin re-export so it doesn't fork the
// type definitions. The canonical source is `manifest-types.ts` in this same
// folder — edit that one, not this one. Safe to delete this file manually.
export * from './manifest-types.ts';
