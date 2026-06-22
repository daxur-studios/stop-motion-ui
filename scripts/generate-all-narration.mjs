#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const scenariosDir = path.resolve(__dirname, '../replay-app/public/test-scenarios');
const scriptPath = path.join(__dirname, 'generate-narration.mjs');

// Dev-server port that serves generated narration audio back to the browser
// (see scripts/dev-server.mjs's GET /narration/{scenario}/* route). Override
// with NARRATION_SERVER_PORT if dev-server.mjs is running on a non-default
// port. Only matters for playback after generation — irrelevant in CI.
const DEV_SERVER_PORT = process.env.NARRATION_SERVER_PORT ?? 3001;

// Gitignored folder for generated narration audio — outside Angular's
// watched "public" assets glob, so writing each clip here does NOT trigger
// ng serve's full-page reload. Mirrors dev-server.mjs's NARRATION_DIR
// exactly; must stay in sync with it (and with the same fix's rationale) —
// see ADR for the original "Redirect audio output ... so Angular doesn't
// hot-reload on every clip" fix. Without this, every clip written straight
// into <scenarioDir>/narration/ (the default fallback when --audio-dir is
// omitted) lands inside the watched public/ tree and reloads the page once
// per clip, aborting whatever the dev UI was doing mid-batch.
const NARRATION_DIR = process.env.NARRATION_DIR ?? path.join(ROOT, 'ignore', 'audio');

// Discover scenarios dynamically — any direct subdirectory of scenariosDir
// that contains a manifest.json. Previously this was a hardcoded array, which
// silently skipped any new scenario directory (e.g. demo-gallery) added after
// the list was last updated. Don't reintroduce a hardcoded list here.
function discoverScenarios(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'manifest.json')))
    .sort();
}

const scenarios = discoverScenarios(scenariosDir);
console.log(`Discovered ${scenarios.length} scenario(s): ${scenarios.join(', ')}`);

console.log('Starting batch narration generation...');
for (const sc of scenarios) {
  const scDir = path.join(scenariosDir, sc);
  if (!fs.existsSync(scDir)) {
    console.log(`Directory not found, skipping: ${scDir}`);
    continue;
  }
  
  console.log(`\n--- Generating narration for scenario: ${sc} ---`);
  // --audio-dir/--audio-base-url redirect audio output to ignore/audio/{sc}/
  // instead of the default <scenarioDir>/narration/ fallback — see NARRATION_DIR
  // comment above for why this is required whenever ng serve may be running.
  const audioDirForScenario = path.join(NARRATION_DIR, sc);
  const audioBaseUrl = `http://localhost:${DEV_SERVER_PORT}/narration/${sc}`;
  const result = spawnSync(
    'node',
    [
      scriptPath,
      scDir,
      `--audio-dir=${audioDirForScenario}`,
      `--audio-base-url=${audioBaseUrl}`,
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  
  if (result.status !== 0) {
    console.error(`Warning: Generation for ${sc} failed with code ${result.status}`);
  }
}
console.log('\nBatch generation complete.');
