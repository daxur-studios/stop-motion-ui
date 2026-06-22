#!/usr/bin/env node
// Imports an externally-captured manifest + screenshots (and any already-
// generated narration audio sitting alongside them) into THIS app's expected
// location — replay-app/public/test-scenarios/{scenario}/ — so an unrelated
// repo's capture output can be previewed, narrated, and exported by this
// app without that repo needing to vendor in the Angular player itself.
//
// This is the bridge piece for cross-repo adoption (see
// docs/ADOPTION-GUIDE.md): a host repo writes its own capture script against
// `shared/`'s CaptureSession (modeled on capture/playwright/src/capture-demo.ts)
// however/wherever it wants, producing a manifest.json + screenshots/ folder
// pair anywhere on disk — it does NOT need to know anything about this
// repo's internal directory layout. This script is the one place that
// layout knowledge lives; everything downstream (narrate/export/the player)
// already works unmodified once the files land in the right spot, because
// they're indistinguishable from a manifest this repo captured itself.
//
// Why a copy-in import command rather than (a) a configurable manifest-path
// env var read directly by the Angular app, or (b) a symlink: `ng serve`
// only serves static assets from its own project's `public/` directory, so
// pointing the live dev server at an arbitrary external folder without
// either copying or symlinking would require a custom Angular asset-serving
// config (extra build complexity, and still dev-server-specific — wouldn't
// help `ng build` production-style serving either). Symlinks were
// considered and rejected: this repo's primary dev environment is Windows
// (see RUNBOOK.md), where creating symlinks requires either Developer Mode
// or admin privileges — a real adoption-time footgun for exactly the
// "hand this to a fresh agent at a new company" scenario this exists for.
// A plain recursive file copy has no such caveat and is trivially
// re-runnable (re-import after a fresh capture run just overwrites).
//
// Usage:
//   node scripts/import-scenario.mjs <source-dir> [--scenario=<name>] [--force]
//   npm run import-scenario -- <source-dir> [--scenario=<name>] [--force]
//
//   <source-dir>       Directory containing manifest.json + a sibling
//                       screenshots/ folder (exactly what CaptureSession.save()
//                       produces — see shared/capture-session.ts).
//   --scenario=<name>  Destination scenario id under test-scenarios/. Defaults
//                       to the basename of <source-dir>.
//   --force            Overwrite an existing destination scenario folder.
//                       Without this flag, an existing destination is left
//                       untouched and the script exits with an error.
//
// After importing, the normal pipeline takes over unmodified:
//   npm run narrate -- replay-app/public/test-scenarios/<name>
//   npm run dev                       # then pick <name> in the scenario picker
//   npm run export-video -- replay-app/public/test-scenarios/<name>

import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const DEST_BASE = path.join(ROOT, 'replay-app', 'public', 'test-scenarios');

function fail(message) {
  console.error(`[import-scenario] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let scenario = null;
  let force = false;
  for (const arg of argv) {
    if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length);
    } else if (arg === '-h' || arg === '--help') {
      positional.push('--help');
    } else {
      positional.push(arg);
    }
  }
  return { positional, scenario, force };
}

function main() {
  const { positional, scenario: scenarioOpt, force } = parseArgs(process.argv.slice(2));

  if (positional.length === 0 || positional[0] === '--help') {
    console.log(
      'Usage: node scripts/import-scenario.mjs <source-dir> [--scenario=<name>] [--force]\n\n' +
        '<source-dir> must contain manifest.json and a sibling screenshots/ folder\n' +
        '(exactly what CaptureSession.save() produces). See this file\'s header\n' +
        'comment, and docs/ADOPTION-GUIDE.md, for the full cross-repo workflow.'
    );
    process.exit(positional[0] === '--help' ? 0 : 1);
    return;
  }

  const sourceDir = path.resolve(positional[0]);

  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    fail(`source directory not found: ${sourceDir}`);
  }

  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail(
      `no manifest.json found in ${sourceDir} — expected a CaptureSession.save() output ` +
        `(manifest.json + screenshots/ as siblings). See shared/capture-session.ts.`
    );
  }

  // Validate it's at least parseable JSON with the shape we expect before
  // copying anything — a clearer failure than discovering a malformed
  // manifest later inside the Angular app's fetch() error path.
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`manifest.json in ${sourceDir} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(manifest.events)) {
    fail(`manifest.json in ${sourceDir} has no "events" array — does not look like a stop-motion-ui manifest.`);
  }

  const screenshotsDir = path.join(sourceDir, 'screenshots');
  if (!existsSync(screenshotsDir)) {
    console.warn(
      `[import-scenario] warning: no screenshots/ folder found next to manifest.json — ` +
        `importing the manifest anyway, but replay will fail to load images.`
    );
  }

  const scenario = scenarioOpt || path.basename(sourceDir);
  if (!/^[a-zA-Z0-9_-]+$/.test(scenario)) {
    fail(
      `scenario name "${scenario}" contains characters other than letters, digits, "-", "_" — ` +
        `pass an explicit --scenario=<name> with a clean identifier.`
    );
  }

  const destDir = path.join(DEST_BASE, scenario);
  if (existsSync(destDir) && !force) {
    fail(`destination already exists: ${destDir}\nRe-run with --force to overwrite it.`);
  }

  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  cpSync(sourceDir, destDir, { recursive: true });

  console.log(`[import-scenario] Imported ${manifest.events.length} event(s) from:`);
  console.log(`  ${sourceDir}`);
  console.log(`into:`);
  console.log(`  ${destDir}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  npm run narrate -- ${path.relative(ROOT, destDir)}     # optional — generate narration audio`);
  console.log('  npm run dev                                            # then pick the scenario in the picker');
  console.log(`  npm run export-video -- ${path.relative(ROOT, destDir)}`);
}

main();
