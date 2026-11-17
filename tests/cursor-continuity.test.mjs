import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { serveRenderer } from '../lib/server.mjs';
import { rendererDir } from '../lib/render.mjs';

test('maintained renderer preserves cursor continuity across circle, scroll, wait and narration boundaries', { timeout: 30_000 }, async () => {
  const scenario = await mkdtemp(path.resolve('ignore/cursor-continuity-'));
  await sharp({ create: { width: 640, height: 480, channels: 3, background: '#202830' } }).jpeg().toFile(path.join(scenario, 'frame.jpg'));
  const events = [];
  const add = (type, x, y, extras = {}) => events.push({ id: `step-${events.length}`, type, timestamp: 500 + events.length * 10,
    cursor: { x, y }, screenshotRef: 'frame.jpg', ...extras });
  add('navigate', 40, 40, { url: 'about:blank' });
  add('circle', 320, 200, { radius: 80, duration: 800 });
  add('asyncWait', 320, 200, { frames: ['frame.jpg', 'frame.jpg'], realDurationMs: 40000, frameDurationMs: 500,
    narrationShort: 'Wait while this process finishes and then inspect the complete result with the cursor still visible.' });
  add('circle', 150, 300, { radius: 50, duration: 700 });
  add('scroll', 500, 350, { frames: ['frame.jpg', 'frame.jpg'], scrollY: 300, frameDurationMs: 500 });
  add('scroll', 100, 100, { scrollY: 0 });
  add('click', 400, 200, { target: 'button' });
  add('asyncWait', 400, 200, { frames: ['frame.jpg', 'frame.jpg'], realDurationMs: 1000, frameDurationMs: 500 });
  add('scroll', 400, 200, { frames: ['frame.jpg', 'frame.jpg'], scrollY: 100, frameDurationMs: 500 });
  await writeFile(path.join(scenario, 'manifest.json'), JSON.stringify({ viewport: { width: 640, height: 480 }, seed: 12, events }));
  const server = await serveRenderer(rendererDir, scenario);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    for (const narration of ['off', 'short']) {
      await page.goto(`${server.origin}/?scenario=input&narration=${narration}&export=1`);
      await page.waitForFunction(() => window.__stopMotion);
      await page.evaluate(() => window.__stopMotion.waitForReady());
      const phases = await page.evaluate(() => window.__stopMotion.cursorTimeline());
      for (let i = 1; i < phases.length; i++) {
        const previous = phases[i - 1], next = phases[i];
        assert.equal(next.t0, previous.t1, 'timeline must have no gaps');
        assert.ok(Math.hypot(previous.end.x - next.start.x, previous.end.y - next.start.y) < 1e-6,
          `${narration}: cursor jumps from ${previous.kind} to ${next.kind} at ${next.t0}`);
      }
      for (const kind of ['asyncWait', 'scroll']) {
        const parked = phases.findIndex(p => p.kind === kind);
        const approach = phases[parked - 1];
        assert.equal(approach.kind, 'move');
        assert.ok(approach.t1 - approach.t0 >= 500);
        assert.ok(Math.hypot(approach.middle.x - approach.start.x, approach.middle.y - approach.start.y) > 10,
          'an approach must contain intermediate positions');
      }
      const waits = phases.filter(p => p.kind === 'asyncWait');
      assert.equal(waits.length, 2);
      assert.equal(waits[0].t1 - waits[0].t0, 500, 'approach does not consume compressed wait duration');
      assert.equal(phases.filter(p => p.kind === 'move').length, 6, 'same-position sampled phases need no redundant glide');
      assert.equal(phases.at(-2).kind, 'scroll', 'same-position scroll needs no redundant glide');
      if (narration === 'short') assert.ok(phases.some((p, i) => p.kind === 'show' && phases[i - 1]?.kind === 'asyncWait'), 'long narration adds a continuous hold');
    }
  } finally { await browser?.close(); await server.close(); }
});
