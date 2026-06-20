#!/usr/bin/env node
// Orchestrates the full headless video-export pipeline for one scenario —
// see docs/adr/ADR-009-video-export.md for the architecture and the matched
// compression settings this enforces in the final ffmpeg pass.
//
// Stages:
//   1. build-frame-plan.mjs   — port of buildTimeline()/sampleAt() math, no rendering
//   2. render-frames.py       — Pillow rasterizes the frame plan to a PNG sequence
//   3. ffmpeg (x2)            — mixes discrete narration clips into one audio track,
//                               then muxes frames + that track into the final .mp4
//                               using Daxur-Daemon's exact compress.ts settings
//                               (libx265, -crf 28, -preset medium, -tag:v hvc1,
//                               -pix_fmt yuv420p, aac 128k — see cli/src/commands/
//                               media/compress.ts in Daxur-Daemon).
//
// Usage:
//   node scripts/export-video.mjs <scenario-dir> [--fps=30] [--narration=short|long|off] [--out=<path.mp4>]
//
// Example:
//   node scripts/export-video.mjs replay/test-scenarios/scenario-1 --narration=short

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

function parseArgs(argv) {
  const positional = [];
  const flags = { fps: 30, narration: 'short', out: null };
  for (const arg of argv) {
    if (arg.startsWith('--fps=')) flags.fps = Number(arg.slice('--fps='.length));
    else if (arg.startsWith('--narration=')) flags.narration = arg.slice('--narration='.length);
    else if (arg.startsWith('--out=')) flags.out = arg.slice('--out='.length);
    else positional.push(arg);
  }
  return { positional, flags };
}

async function run(cmd, args, opts = {}) {
  console.log('+', cmd, args.join(' '));
  return execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 64, ...opts });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const scenarioDir = positional[0];
  if (!scenarioDir) {
    console.error('Usage: node scripts/export-video.mjs <scenario-dir> [--fps=30] [--narration=short|long|off] [--out=<path.mp4>]');
    process.exit(1);
  }
  const outPath = flags.out || path.join(scenarioDir, 'export.mp4');

  // Stage 1: timeline math -> frame-plan.json (also writes audioEvents).
  await run('node', [
    path.join(SCRIPT_DIR, 'build-frame-plan.mjs'),
    scenarioDir,
    `--fps=${flags.fps}`,
    `--narration=${flags.narration}`,
  ]);

  const plan = JSON.parse(await readFile(path.join(scenarioDir, 'frame-plan.json'), 'utf8'));

  const workDir = await mkdtemp(path.join(tmpdir(), 'export-video-'));
  const framesDir = path.join(workDir, 'frames');

  try {
    // Stage 2: Pillow rasterizes frame-plan.json -> PNG sequence.
    await run('python3', [path.join(SCRIPT_DIR, 'render-frames.py'), scenarioDir, framesDir]);

    // Stage 3a: mix discrete narration clips into one audio track via
    // adelay (per-clip start offset) + amix (combine), normalize=0 so
    // amix doesn't quietly attenuate every clip just because there are
    // multiple inputs (none of which actually overlap in practice).
    const audioPath = path.join(workDir, 'audio_mixed.wav');
    if (plan.audioEvents.length > 0) {
      const inputArgs = plan.audioEvents.flatMap((a) => ['-i', path.join(scenarioDir, a.path)]);
      const delays = plan.audioEvents.map((a, i) => `[${i}]adelay=${Math.round(a.startMs)}|${Math.round(a.startMs)}[a${i}]`);
      const mixInputs = plan.audioEvents.map((_, i) => `[a${i}]`).join('');
      const filterComplex = `${delays.join(';')};${mixInputs}amix=inputs=${plan.audioEvents.length}:duration=longest:normalize=0[aout]`;
      await run('ffmpeg', [
        '-y', ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[aout]',
        '-t', String(plan.totalDurationMs / 1000),
        audioPath,
      ]);
    }

    // Stage 3b: final encode, settings matched to Daxur-Daemon's
    // cli/src/commands/media/compress.ts non-GPU video path exactly.
    const videoArgs = [
      '-y',
      '-framerate', String(plan.fps),
      '-i', path.join(framesDir, 'frame_%05d.png'),
    ];
    if (plan.audioEvents.length > 0) videoArgs.push('-i', audioPath);
    videoArgs.push(
      '-c:v', 'libx265', '-crf', '28', '-preset', 'medium', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p',
      ...(plan.audioEvents.length > 0 ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
      outPath,
    );
    await run('ffmpeg', videoArgs);

    console.log(`\nDone: ${outPath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('export-video failed:', err);
  process.exit(1);
});
