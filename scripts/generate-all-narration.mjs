#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenariosDir = path.resolve(__dirname, '../replay-app/public/test-scenarios');
const scriptPath = path.join(__dirname, 'generate-narration.mjs');

const scenarios = ['scenario-1', 'scenario-2', 'scenario-3', 'daxur-daemon'];

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
