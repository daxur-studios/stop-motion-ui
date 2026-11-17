import { chromium } from 'playwright';
import { mkdir, mkdtemp, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { within } from './server.mjs';
import { prepareAudio } from './audio.mjs';
import { createPacedMouse } from './paced-mouse.mjs';
import { installVideoOverlay, setVideoCaption } from './video-overlay.mjs';

export const defineVideo = definition => ({ ...definition, mode: 'continuous-browser-page' });

export async function captureVideo(definition, scenarioDir, options) {
  const staging = await mkdtemp(path.join(tmpdir(), 'stop-motion-video-'));
  try { await captureInto(definition, staging, options); }
  finally {
    try { await cp(staging, scenarioDir, { recursive: true }); }
    finally {
      if (!within(path.resolve(tmpdir()), path.resolve(staging))) throw new Error('Unexpected video staging directory');
      await rm(staging, { recursive: true, force: true });
    }
  }
  return scenarioDir;
}

async function captureInto(definition, dir, { recipeDir, cacheDir, narration, signal, log = () => {} }) {
  const viewport = definition.viewport || { width: 1280, height: 800 };
  if (![viewport.width, viewport.height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0)) throw new Error('Viewport dimensions must be even integers from 64 to 4096');
  const captureFps = definition.captureFps ?? 15;
  if (!Number.isInteger(captureFps) || captureFps < 1 || captureFps > 30) throw new Error('captureFps must be an integer from 1 to 30');
  const pointer = definition.pointer || { x: 80, y: 80 };
  if (![pointer.x, pointer.y].every(Number.isFinite) || pointer.x < 0 || pointer.x >= viewport.width || pointer.y < 0 || pointer.y >= viewport.height) throw new Error('Initial pointer must be inside the viewport');
  const declared = definition.segments;
  if (typeof definition.ready !== 'function') throw new Error('defineVideo requires ready(page) to navigate and prepare the app before capture');
  if (!Array.isArray(declared) || !declared.length || declared.length > 100) throw new Error('defineVideo requires 1–100 declared segments');
  const ids = new Set(), prepared = [];
  let browser, page, cdp, active, step = 'setup', recording = false, origin, captureError, lastTime = -Infinity, bytes = 0;
  const frames = [], pointerTrack = [], segments = [], writes = new Set();
  const errors = [];
  const abort = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const clock = () => Date.now() / 1000 - origin;
  async function saveFrame(buffer, sourceTime, capturedAt) {
    if (frames.length >= 18000 || bytes + buffer.length > 512 * 1024 * 1024) throw new Error('Continuous capture exceeded 18000 frames / 512 MiB; split the recipe');
    bytes += buffer.length;
    const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ file, sourceTime, capturedAt });
    lastTime = sourceTime;
    const pending = writeFile(path.join(dir, file), buffer).catch(error => { captureError ??= error; });
    writes.add(pending); void pending.then(() => writes.delete(pending));
  }
  async function boundaryFrame() {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 85 });
    await saveFrame(buffer, frames.length ? Math.max(lastTime + 0.000001, clock()) : 0, Date.now() / 1000);
  }
  function check() { signal.throwIfAborted(); if (captureError) throw captureError; }
  try {
    await mkdir(path.join(dir, 'frames'), { recursive: true });
    for (const item of declared) {
      step = item.id || 'segments';
      if (!/^[a-zA-Z0-9_-]+$/.test(item.id || '') || ids.has(item.id)) throw new Error('Every segment needs a unique id containing letters, digits, _ or -');
      ids.add(item.id);
      const speed = item.speed ?? 1;
      if (!Number.isFinite(speed) || speed < 1 || speed > 20) throw new Error('Segment speed must be between 1 and 20');
      if (speed !== 1 && (item.narration || item.audio)) throw new Error('Narrated segments must be 1x; separate accelerated waits from speech');
      check();
      const audio = await prepareAudio(item, { definition, scenarioDir: dir, recipeDir, cacheDir, narration, signal });
      prepared.push({ ...item, speed, audio: audio?.ref, audioDuration: audio?.duration || 0 });
    }
    step = 'setup';
    check();
    browser = await chromium.launch({ ...definition.browser, headless: true });
    check();
    page = await browser.newPage({ viewport, baseURL: definition.baseURL, deviceScaleFactor: 1 });
    page.setDefaultTimeout(definition.actionTimeoutMs ?? 30_000);
    page.on('pageerror', error => errors.push(error.message));
    await definition.ready?.(page);
    await installVideoOverlay(page, pointer);
    const mouse = await createPacedMouse(page, { ...pointer, signal, onSample: sample => pointerTrack.push(sample) });
    await setVideoCaption(page, prepared[0]);
    origin = Date.now() / 1000;
    await boundaryFrame();
    cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', frame => {
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
      const sourceTime = frame.metadata.timestamp - origin;
      if (!recording || sourceTime - lastTime < 1 / captureFps) return;
      void saveFrame(Buffer.from(frame.data, 'base64'), sourceTime, frame.metadata.timestamp).catch(error => { captureError ??= error; });
    });
    recording = true;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
    let next = 0;
    function requireSegment(input = false) {
      check();
      if (!active) throw new Error('Video helpers must be awaited inside video.segment()');
      if (input && active.speed !== 1) throw new Error('Pointer interactions must be 1x; park the pointer during accelerated waits');
    }
    const video = {
      async segment(id, run) {
        check();
        if (active || prepared[next]?.id !== id) throw new Error('Run each declared segment once, in order, without nesting');
        step = id; log(`Video: ${id}`);
        const item = prepared[next++];
        await setVideoCaption(page, item);
        const start = segments.length ? segments.at(-1).end : 0;
        active = item;
        try {
          await run();
          // Speech is never time-stretched. Let its normal-rate cue finish.
          const remaining = item.audioDuration + 0.2 - (clock() - start);
          if (item.audio && remaining > 0) await page.waitForTimeout(remaining * 1000);
          await boundaryFrame();
          check();
          const end = clock();
          segments.push({ ...item, start, end });
        } finally { active = undefined; }
      },
      async click(locator) { requireSegment(true); await mouse.click(locator); },
      async clickAt(x, y) { requireSegment(true); await mouse.clickAt(x, y); },
      async moveTo(x, y) { requireSegment(true); await mouse.moveTo(x, y); },
      async hold(milliseconds) {
        requireSegment();
        if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 120_000) throw new Error('hold must be 0–120000 ms');
        await page.waitForTimeout(milliseconds);
      },
    };
    await definition.run({ page, video, signal });
    if (active || next !== prepared.length) throw new Error('Recipe must await every declared segment');
    check();
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    recording = false;
    await cdp.send('Page.stopScreencast');
    await Promise.all(writes);
    check();
    // Browser timestamps can lead the wall clock by a few milliseconds. The
    // final declared interval must include every frame actually recorded.
    segments.at(-1).end = Math.max(segments.at(-1).end, lastTime);
    let output = 0;
    for (const entry of segments) {
      entry.outputStart = output; entry.outputDuration = (entry.end - entry.start) / entry.speed;
      output += entry.outputDuration;
    }
    if (output > 120) throw new Error('Edited video exceeds 120 seconds; split the recipe');
    const duration = segments.at(-1).end;
    const track = pointerTrack.map(p => ({ ...p, sourceTime: Math.max(0, p.at - origin) }));
    await writeFile(path.join(dir, 'recording.json'), JSON.stringify({ schema: 1, mode: 'continuous-browser-page', viewport, captureFps, sourceDuration: duration, outputDuration: output, frames, pointerTrack: track, segments, errors, audioCapture: 'narration-only' }, null, 2));
  } catch (error) {
    error.step = step;
    await page?.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
    await writeFile(path.join(dir, 'failure.json'), JSON.stringify({ error: error.message, step, frames, segments, errors }, null, 2));
    throw error;
  } finally {
    recording = false;
    await cdp?.send('Page.stopScreencast').catch(() => {});
    await Promise.allSettled(writes);
    signal.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
  }
}
