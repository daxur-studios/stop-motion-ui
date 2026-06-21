#!/usr/bin/env node
// Starts the Angular dev server and the companion HTTP dev-server together.
// Run from the stop-motion-ui root:  node scripts/dev.mjs  (or: npm run dev)
//
// Each process's output is prefixed with a colored label so you can follow
// both streams in one terminal without a separate split-pane tool.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === 'win32';

const RESET = '\x1b[0m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';

function spawnLabeled(label, color, cmd, args, cwd) {
  const pre = `${color}[${label}]${RESET} `;
  const child = spawn(cmd, args, {
    cwd,
    shell: isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  function printLines(buf, stream) {
    const text = buf.toString();
    // Prefix every non-empty line; preserve blank lines as-is.
    const prefixed = text.replace(/^(?=.)/gm, pre);
    stream.write(prefixed);
  }

  child.stdout.on('data', (buf) => printLines(buf, process.stdout));
  child.stderr.on('data', (buf) => printLines(buf, process.stderr));
  child.on('close', (code) => {
    process.stdout.write(`${pre}process exited (code ${code})\n`);
  });
  return child;
}

const angular   = spawnLabeled('angular ', CYAN,  'npm', ['start'], path.join(ROOT, 'replay-app'));
const devServer = spawnLabeled('dev-srv ', GREEN, 'node', [path.join(ROOT, 'scripts', 'dev-server.mjs')], ROOT);

function shutdown() {
  angular.kill();
  devServer.kill();
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
