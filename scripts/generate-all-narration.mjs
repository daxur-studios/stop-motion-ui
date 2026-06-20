#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenariosDir = path.resolve(__dirname, '../replay-app/public/test-scenarios');
const scriptPath = path.join(__dirname, 'generate-narration.mjs');

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
  const result = spawnSync('node', [scriptPath, scDir], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  
  if (result.status !== 0) {
    console.error(`Warning: Generation for ${sc} failed with code ${result.status}`);
  }
}
console.log('\nBatch generation complete.');
