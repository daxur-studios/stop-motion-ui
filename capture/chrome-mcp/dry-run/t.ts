// Sanity check: confirms `node --experimental-strip-types` works in this
// environment before trusting dry-run.mts's output. Stray leftover from
// debugging an ESM import-resolution issue; kept (not deletable in the
// sandbox that wrote this) as a one-line smoke test instead of dead junk.
// Run: node --experimental-strip-types capture/chrome-mcp/dry-run/t.ts
console.log('node TS type-stripping OK');
