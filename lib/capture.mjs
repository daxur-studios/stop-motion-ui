import { chromium } from 'playwright';
import { writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CaptureSession } from '../dist/capture-session.mjs';
import { prepareAudio } from './audio.mjs';
import { within } from './server.mjs';

export const defineDemo = definition => typeof definition === 'function' ? { run: definition } : definition;

/** Keep authored recipes immutable; every capture owns a new scenario directory. */
export async function captureDemo(definition, scenarioDir, { recipeDir, cacheDir, narration, signal, log = () => {} }) {
  const staging = await mkdtemp(path.join(tmpdir(), 'stop-motion-capture-'));
  try {
    await captureInto(definition, staging, { recipeDir, cacheDir, narration, signal, log });
  } finally {
    // Publish only after the capture browser has closed, including diagnostics
    // on failure. Screenshots must not trigger the host dev server mid-capture.
    try { await cp(staging, scenarioDir, { recursive: true }); }
    finally {
      if (!within(path.resolve(tmpdir()), path.resolve(staging))) throw new Error('Unexpected capture staging directory');
      await rm(staging, { recursive: true, force: true });
    }
  }
  return scenarioDir;
}

async function captureInto(definition, scenarioDir, { recipeDir, cacheDir, narration, signal, log }) {
  const viewport = definition.viewport || { width: 1280, height: 800 };
  if (![viewport.width, viewport.height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0)) throw new Error('Viewport dimensions must be even integers from 64 to 4096');
  const session = new CaptureSession({ outDir: scenarioDir, viewport, seed: definition.seed ?? 1 });
  const ids = new Set();
  let browser, step = 'setup', time = 500, cursor = { x: 80, y: 80 };
  const abort = () => { void browser?.close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  async function finish(event, options) {
    event.timestamp = time;
    event.cursor.timestamp = time;
    time += options.durationMs ?? 700;
    const audio = await prepareAudio(options, { definition, scenarioDir, recipeDir, cacheDir, narration, signal });
    if (audio) event[narration === 'long' ? 'narrationAudioLong' : 'narrationAudioShort'] = audio.ref;
  }
  function begin(options) {
    signal.throwIfAborted();
    if (!options || !/^[a-zA-Z0-9_-]+$/.test(options.id || '') || ids.has(options.id)) throw new Error('Every step needs a unique id containing letters, digits, _ or -');
    if (options.durationMs !== undefined && (!Number.isFinite(options.durationMs) || options.durationMs <= 0 || options.durationMs > 120_000)) throw new Error('Step durationMs must be greater than zero and at most 120000');
    ids.add(options.id); step = options.id; log(`Capture: ${step}`);
    return { id: options.id, [narration === 'long' ? 'narrationLong' : 'narrationShort']: options.narration };
  }
  try {
    signal.throwIfAborted();
    browser = await chromium.launch({ headless: true });
    signal.throwIfAborted();
    const page = await browser.newPage({ viewport, baseURL: definition.baseURL, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    page.setDefaultTimeout(definition.actionTimeoutMs ?? 15_000);
    const screenshot = async () => session.saveScreenshot(await page.screenshot({ animations: 'disabled' }));
    const position = async locator => {
      await locator.waitFor({ state: 'visible' });
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Step ${step}: target has no bounding box`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const demo = {
      async capture(options) {
        const args = begin(options);
        await options.ready?.(page);
        await finish(session.addNavigate({ ...args, url: page.url(), cursor, screenshotRef: await screenshot() }), options);
      },
      async click(locator, options) {
        const args = begin(options);
        const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        await locator.scrollIntoViewIfNeeded();
        const after = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        const target = await position(locator);
        if (before.x !== after.x || before.y !== after.y) {
          const autoId = `${options.id}--scroll`;
          if (ids.has(autoId)) throw new Error(`Reserved automatic step ID: ${autoId}`);
          ids.add(autoId);
          const event = session.addScroll({ id: autoId, scrollY: after.y, cursor, screenshotRef: await screenshot() });
          event.timestamp = time; event.cursor.timestamp = time; time += 500;
        }
        cursor = target;
        await locator.click();
        await options.ready?.(page);
        await finish(session.addClick({ ...args, target: locator.toString(), cursor, screenshotRef: await screenshot() }), options);
      },
      async circle(locator, options) {
        const args = begin(options);
        cursor = await position(locator);
        await finish(session.addCircle({ ...args, target: locator.toString(), cursor, radius: options.radius ?? 35, duration: options.durationMs ?? 1000, screenshotRef: await screenshot() }), options);
      },
      async scrollTo(y, options) {
        const args = begin(options);
        const initial = await page.evaluate(() => scrollY);
        const frames = [];
        for (let i = 1; i <= 6; i++) {
          await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), initial + (y - initial) * i / 6);
          frames.push(await screenshot());
        }
        const scrollY = await page.evaluate(() => window.scrollY);
        await finish(session.addScroll({ ...args, scrollY, cursor, frames, frameDurationMs: options.durationMs ?? 700, screenshotRef: frames.at(-1) }), options);
      },
      async waitFor(ready, options) {
        const args = begin(options);
        const start = Date.now();
        const frames = [await screenshot()];
        await ready(page);
        frames.push(await screenshot());
        await finish(session.addAsyncWait({ ...args, target: options.id, cursor, frames, realDurationMs: Math.max(1, Date.now() - start), frameDurationMs: options.durationMs ?? 700, screenshotRef: frames.at(-1) }), options);
      },
    };
    try {
      if (definition.ready) await definition.ready(page);
      await definition.run({ page, demo, signal });
      if (!session.getEvents().length) throw new Error('Recipe captured no steps');
      session.save();
      await writeFile(path.join(scenarioDir, 'capture.json'), JSON.stringify({ mode: 'reconstructed-screenshots', viewport, steps: [...ids] }, null, 2));
    } catch (error) {
      error.step = step;
      await page.screenshot({ path: path.join(scenarioDir, 'failure.png'), animations: 'disabled' }).catch(() => {});
      session.save();
      throw error;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await browser?.close().catch(() => {});
  }
  return scenarioDir;
}
