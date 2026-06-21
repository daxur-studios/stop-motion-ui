#!/usr/bin/env node
// Captures the replay-app Angular canvas frame-by-frame via Playwright and
// encodes a video with ffmpeg. Replaces the Python/Pillow render step —
// every frame is pixel-identical to what the live browser shows, including
// the dashed orbit guide, ripple rings, speedup badge, and cursor shadow.
// Audio timing comes from the browser's own audio-metadata loading, so
// ffprobe is no longer needed anywhere in the pipeline.
//
// Requires:
//   - Angular dev server running at http://localhost:4221 (npm run dev)
//   - ffmpeg on PATH (for audio mix + final encode)
//
// Usage:
//   node scripts/playwright-export.mjs <scenario> [--fps=30] [--narration=short|long|off] [--out=<path.mp4>]

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Resolve the ffmpeg binary. winget installs it but does not always add it to
// the current shell's PATH (a terminal restart is normally required), so we
// fall back to the known winget install location before giving up. Override
// with the FFMPEG_PATH env var if ffmpeg lives somewhere else.
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Glob the Gyan.FFmpeg winget package dir — version is in the folder name.
  const wingetBase = path.join(
    homedir(),
    'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
  );
  const gyanDir = path.join(
    wingetBase,
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
  );
  if (existsSync(gyanDir)) {
    // ffmpeg-<version>-full_build/bin/ffmpeg.exe
    for (const entry of readdirSync(gyanDir)) {
      const candidate = path.join(gyanDir, entry, 'bin', 'ffmpeg.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  // Fall back to bare name and hope it is on PATH.
  return 'ffmpeg';
}

// Reuse the playwright installation from the capture sub-project so we don't
// need a separate npm install at the stop-motion-ui root level.
const captureReq = createRequire(path.join(ROOT, 'capture', 'playwright', 'package.json'));
const { chromium } = captureReq('playwright');

const ANGULAR_ORIGIN = 'http://localhost:4221';
// Canvas is 1280×800 — viewport must be at least that wide so export-mode CSS
// can render the canvas at its full pixel dimensions for 1:1 screenshots.
const VIEWPORT = { width: 1280, height: 820 };

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
  return execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 64, shell: process.platform === 'win32', ...opts });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const scenario = positional[0];
  if (!scenario) {
    console.error('Usage: node scripts/playwright-export.mjs <scenario> [--fps=30] [--narration=short|long|off] [--out=<path.mp4>]');
    process.exit(1);
  }

  const scenarioDir = path.join(ROOT, 'replay-app', 'public', 'test-scenarios', scenario);
  const outPath = flags.out || path.join(scenarioDir, 'export.mp4');
  const fps = flags.fps;

  const ffmpeg = resolveFfmpeg();
  console.log(`[playwright-export] ffmpeg: ${ffmpeg}`);

  const workDir = await mkdtemp(path.join(tmpdir(), 'pw-export-'));
  const framesDir = path.join(workDir, 'frames');
  await mkdir(framesDir, { recursive: true });

  let browser;
  try {
    // --- Stage 1: capture frames via the Angular canvas ---
    const url = `${ANGULAR_ORIGIN}/?scenario=${encodeURIComponent(scenario)}&narration=${flags.narration}&export=1`;
    console.log(`\n[playwright-export] Opening ${url}`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);

    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for scenario load + images preload; get totalDurationMs and any
    // audio events the timeline math produced (path + start offset in ms).
    const { totalDurationMs, audioEvents } = await page.evaluate(() =>
      window['__stopMotion'].waitForReady()
    );

    const frameCount = Math.max(1, Math.ceil((totalDurationMs / 1000) * fps));
    console.log(`[playwright-export] ${frameCount} frames @ ${fps}fps (${Math.round(totalDurationMs)}ms total)`);

    const canvas = page.locator('#stage');

    for (let i = 0; i < frameCount; i++) {
      const t = (i / fps) * 1000;
      await page.evaluate((t) => window['__stopMotion'].seekTo(t), t);
      await canvas.screenshot({ path: path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`) });
      if (i % fps === 0) process.stdout.write(`\r  frame ${i}/${frameCount}`);
    }
    process.stdout.write(`\r  frame ${frameCount}/${frameCount}\n`);

    await browser.close();
    browser = undefined;

    // --- Stage 2a: mix narration clips into one audio track ---
    const audioPath = path.join(workDir, 'audio_mixed.wav');
    if (audioEvents.length > 0) {
      const inputArgs = audioEvents.flatMap((a) => ['-i', path.join(scenarioDir, a.path)]);
      const delays = audioEvents.map((a, i) => `[${i}]adelay=${Math.round(a.startMs)}|${Math.round(a.startMs)}[a${i}]`);
      const mixInputs = audioEvents.map((_, i) => `[a${i}]`).join('');
      const filterComplex = `${delays.join(';')};${mixInputs}amix=inputs=${audioEvents.length}:duration=longest:normalize=0[aout]`;
      await run(ffmpeg, [
        '-y', ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', '[aout]',
        '-t', String(totalDurationMs / 1000),
        audioPath,
      ]);
    }

    // --- Stage 2b: final encode (settings matched to Daxur-Daemon compress.ts) ---
    const videoArgs = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%05d.png'),
    ];
    if (audioEvents.length > 0) videoArgs.push('-i', audioPath);
    videoArgs.push(
      '-c:v', 'libx265', '-crf', '28', '-preset', 'medium', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p',
      ...(audioEvents.length > 0 ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
      outPath,
    );
    await run(ffmpeg, videoArgs);

    console.log(`\n[playwright-export] Done: ${outPath}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\n[playwright-export] failed:', err.message || err);
  process.exit(1);
});
