import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, mkdir, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFile, serveRenderer } from './server.mjs';
import { command, mediaBinary, probe } from './system.mjs';

export const rendererDir = fileURLToPath(new URL('../dist/renderer/browser/', import.meta.url));
export async function validateScenario(dir, narration) {
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const { width, height } = manifest.viewport || {};
  if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0)) throw new Error('Viewport dimensions must be even integers from 64 to 4096');
  if (!Array.isArray(manifest.events) || !manifest.events.length) throw new Error('Scenario has no events');
  const ids = new Set();
  for (const event of manifest.events) {
    if (!event.id || ids.has(event.id)) throw new Error(`Missing or duplicate step ID: ${event.id}`);
    ids.add(event.id);
    if (!['navigate', 'click', 'circle', 'scroll', 'asyncWait'].includes(event.type) || !Number.isFinite(event.timestamp) || event.timestamp < 0 || !Number.isFinite(event.cursor?.x) || !Number.isFinite(event.cursor?.y)) throw new Error(`Invalid event: ${event.id}`);
    if (event.type === 'asyncWait' && (!event.frames?.length || !(event.frameDurationMs > 0))) throw new Error(`Invalid wait: ${event.id}`);
    if (event.type === 'circle' && (!(event.duration > 0) || !(event.radius > 0))) throw new Error(`Invalid circle: ${event.id}`);
    for (const ref of [event.screenshotRef, ...(event.frames || [])]) await localFile(dir, ref);
    if (narration !== 'off') {
      const audio = event[narration === 'long' ? 'narrationAudioLong' : 'narrationAudioShort'];
      const text = event[narration === 'long' ? 'narrationLong' : 'narrationShort'];
      if (text && !audio) throw new Error(`Step ${event.id} has narration text but no audio. Supply audio or explicitly use --narration off.`);
      if (audio) await localFile(dir, audio);
    }
  }
  return manifest;
}

/** Reuses the maintained Angular canvas; no dev server or source checkout required. */
export async function renderScenario(scenarioDir, runDir, { fps = 30, narration = 'short', codec = 'hevc', signal, log = () => {} } = {}) {
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('fps must be an integer from 1 to 60');
  if (!['off', 'short', 'long'].includes(narration)) throw new Error('narration must be off, short or long');
  if (!['h264', 'hevc'].includes(codec)) throw new Error('codec must be h264 or hevc');
  const manifest = await validateScenario(scenarioDir, narration);
  await stat(path.join(rendererDir, 'index.html')).catch(() => { throw new Error('Bundled renderer missing. Build the package with npm run build:package.'); });
  const workDir = path.join(runDir, 'render-work');
  const framesDir = path.join(workDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const server = await serveRenderer(rendererDir, scenarioDir);
  let browser;
  const abort = () => { void browser?.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    browser = await chromium.launch({ headless: true });
    signal?.throwIfAborted();
    const page = await browser.newPage({ viewport: { width: manifest.viewport.width + 32, height: manifest.viewport.height + 120 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30_000);
    page.on('console', msg => { if (msg.type() === 'error') log(msg.text()); });
    await page.goto(`${server.origin}/?scenario=input&narration=${narration}&export=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stopMotion);
    const timeline = await page.evaluate(() => Promise.race([
      window.__stopMotion.waitForReady(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Renderer did not become ready within 30s')), 30_000)),
    ]));
    const { totalDurationMs, audioEvents } = timeline;
    const frameCount = Math.ceil(totalDurationMs / 1000 * fps);
    if (!Number.isFinite(frameCount) || frameCount < 1 || frameCount > 3600 || totalDurationMs > 120_000) throw new Error('Video must be nonempty and at most 120 seconds / 3600 frames; split the walkthrough');
    const expectedAudio = narration === 'off' ? 0 : manifest.events.filter(e => e[narration === 'long' ? 'narrationAudioLong' : 'narrationAudioShort']).length;
    if (audioEvents.length !== expectedAudio) throw new Error(`Renderer loaded ${audioEvents.length}/${expectedAudio} narration clips`);
    const canvas = page.locator('#stage');
    let bytes = 0;
    const thumbnails = [];
    log(`Rendering ${frameCount} frames (${(totalDurationMs / 1000).toFixed(1)}s)`);
    for (let i = 0; i < frameCount; i++) {
      signal?.throwIfAborted();
      await page.evaluate(t => window.__stopMotion.seekTo(t), i * 1000 / fps);
      const frame = await canvas.screenshot({ animations: 'disabled' });
      for (let k = 0; k < 6; k++) {
        if (i === Math.round(k * (frameCount - 1) / 5)) thumbnails[k] = await sharp(frame).resize(320, 200, { fit: 'contain', background: '#111111' }).toBuffer();
      }
      bytes += frame.length;
      if (bytes > 512 * 1024 * 1024) throw new Error('Temporary frames exceeded 512 MiB; shorten the demo or lower fps');
      await writeFile(path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`), frame);
      if (i === 0) await copyFile(path.join(framesDir, 'frame_00000.png'), path.join(runDir, 'first-frame.png'));
    }
    await browser.close(); browser = undefined;
    const ffmpeg = mediaBinary('ffmpeg');
    const audioPath = path.join(workDir, 'audio.wav');
    if (audioEvents.length) {
      const inputs = [];
      for (const event of audioEvents) {
        const ref = new URL(event.path, server.origin).pathname.replace('/test-scenarios/input/', '');
        inputs.push('-i', await localFile(scenarioDir, decodeURIComponent(ref)));
      }
      const delays = audioEvents.map((e, i) => `[${i}:a]adelay=${Math.round(e.startMs)}:all=1[a${i}]`);
      const mix = `${delays.join(';')};${audioEvents.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioEvents.length}:normalize=0,apad[aout]`;
      await command(ffmpeg, ['-y', ...inputs, '-filter_complex', mix, '-map', '[aout]', '-t', String(frameCount / fps), audioPath], { signal });
    }
    const temporaryVideo = path.join(workDir, 'demo.mp4');
    await command(ffmpeg, ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'frame_%05d.png'),
      ...(audioEvents.length ? ['-i', audioPath] : []),
      '-c:v', codec === 'h264' ? 'libx264' : 'libx265', '-crf', codec === 'h264' ? '23' : '28', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      ...(codec === 'hevc' ? ['-tag:v', 'hvc1'] : []),
      ...(audioEvents.length ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []), '-movflags', '+faststart', temporaryVideo], { signal });
    const media = await probe(temporaryVideo, signal);
    if (!media.streams.some(s => s.codec_type === 'video') || (expectedAudio && !media.streams.some(s => s.codec_type === 'audio'))) throw new Error('Encoded media is missing an expected stream');
    const video = path.join(runDir, 'demo.mp4');
    await copyFile(temporaryVideo, video, constants.COPYFILE_EXCL);
    await sharp({ create: { width: 960, height: 400, channels: 3, background: '#111111' } })
      .composite(thumbnails.map((input, i) => ({ input, left: (i % 3) * 320, top: Math.floor(i / 3) * 200 })))
      .jpeg({ quality: 85 }).toFile(path.join(runDir, 'contact-sheet.jpg'));
    media.format.filename = video;
    const transcript = manifest.events.map(e => `${e.id}: ${e[narration === 'long' ? 'narrationLong' : 'narrationShort'] || ''}`).join('\n');
    await writeFile(path.join(runDir, 'transcript.txt'), transcript + '\n');
    return { video, durationSeconds: Number(media.format.duration), viewport: manifest.viewport, fps, codec, narration, audioClips: audioEvents.length, media, contactSheet: path.join(runDir, 'contact-sheet.jpg'), transcript: path.join(runDir, 'transcript.txt') };
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
    await server.close();
    await rm(workDir, { recursive: true, force: true });
  }
}
