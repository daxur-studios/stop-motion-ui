#!/usr/bin/env node
// Single root-level entry point for stop-motion-ui — see docs/agent-maintainability.md's
// "Fragmented entry points" gap and docs/roadmap.md's CLI-consolidation entry for why this
// exists. This file is a thin dispatcher: every subcommand just spawns the existing,
// already-working script with the right cwd/args — no pipeline logic is reimplemented here,
// so this file is safe to read top-to-bottom as "the map of what runs where."
//
// Usage:
//   node scripts/cli.mjs <command> [...args]
//   npm run <command> -- [...args]   (root package.json forwards to this for every command)
//
// Commands:
//   dev                          Start Angular (ng serve) + the companion dev-server together.
//   capture [--headed]           Run the Playwright capture script (capture/playwright).
//   narrate <scenario-dir> [...] Generate narration audio for one scenario (generate-narration.mjs).
//   narrate-all [...]            Generate narration audio for every scenario (generate-all-narration.mjs).
//   export <scenario-dir> [...]  Export a video. Canonical path: drives the live Angular canvas
//                                 via Playwright (playwright-export.mjs) — pixel-identical to what
//                                 the browser shows, but requires `npm run dev` already running and
//                                 a real launchable browser (see docs/adr/ADR-012).
//   export <scenario-dir> --legacy [...]
//                                 Export via the older Node-timeline-math + Python/Pillow pipeline
//                                 (export-video.mjs). No browser required — this is the path to use
//                                 in a sandboxed/CI/agent environment that can't launch Chromium.
//                                 See ADR-012 for why both paths are kept.
//   help                         Show this message.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    console.log('+', cmd, args.join(' '));
    const child = spawn(cmd, args, { stdio: 'inherit', shell: isWin, cwd: ROOT, ...opts });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to start ${cmd}:`, err.message);
      resolve(1);
    });
  });
}

function printHelp() {
  console.log(`Usage: node scripts/cli.mjs <command> [...args]

Commands:
  dev                            Start Angular dev server + companion dev-server together.
  capture [--headed]             Run Playwright capture (capture/playwright/src/capture-demo.ts).
  narrate <scenario-dir> [...]   Generate narration audio for one scenario.
  narrate-all [...]              Generate narration audio for every scenario.
  export <scenario-dir> [...]    Export video — canonical Playwright-canvas path (needs 'npm run dev'
                                  already running, and a real browser; see docs/adr/ADR-012).
  export <scenario-dir> --legacy [...]
                                  Export video — Node/Pillow path, no browser required (sandbox/CI-safe
                                  fallback; see docs/adr/ADR-012).
  help                            Show this message.
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      printHelp();
      process.exit(command === undefined ? 1 : 0);
      break;

    case 'dev': {
      const code = await run('node', [path.join(SCRIPTS_DIR, 'dev.mjs'), ...rest]);
      process.exit(code);
      break;
    }

    case 'capture': {
      const headed = rest.includes('--headed');
      const code = await run('npm', ['run', 'capture:demo'], {
        cwd: path.join(ROOT, 'capture', 'playwright'),
        env: { ...process.env, HEADLESS: headed ? 'false' : 'true' },
      });
      process.exit(code);
      break;
    }

    case 'narrate': {
      const code = await run('node', [path.join(SCRIPTS_DIR, 'generate-narration.mjs'), ...rest]);
      process.exit(code);
      break;
    }

    case 'narrate-all': {
      const code = await run('node', [path.join(SCRIPTS_DIR, 'generate-all-narration.mjs'), ...rest]);
      process.exit(code);
      break;
    }

    case 'export': {
      const legacy = rest.includes('--legacy');
      const args = rest.filter((a) => a !== '--legacy');
      const script = legacy ? 'export-video.mjs' : 'playwright-export.mjs';
      const code = await run('node', [path.join(SCRIPTS_DIR, script), ...args]);
      process.exit(code);
      break;
    }

    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main();
