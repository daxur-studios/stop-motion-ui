// Playwright capture — real, unattended browser script.
//
// Unlike capture/chrome-mcp (agent-driven only, see chrome-mcp/NOTES.md),
// this is a standalone Node script: `npm install && npm run capture:demo`
// launches a real Chromium, drives replay-app's Demo Gallery
// (replay-app/src/app/demo-gallery/), and writes a manifest.json +
// screenshots/ that the existing replay players (replay/, replay-app/) can
// load unmodified.
//
// Prereq: the Angular app must already be running (`cd replay-app && npm
// start`) — this script does not start it for you, since the build/serve
// process is unrelated to capture and slow to spin up per run. See
// ../RUNBOOK.md for the full loop.

import { chromium, type Locator, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CaptureSession } from './capture-session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEMO_URL = process.env['DEMO_URL'] ?? 'http://localhost:4221/';
const OUT_DIR = process.env['OUT_DIR']
  ?? resolve(__dirname, '..', '..', '..', 'replay-app', 'public', 'test-scenarios', 'demo-gallery');
const HEADLESS = process.env['HEADLESS'] !== 'false';
const VIEWPORT = { width: 1280, height: 800 };
const IDLE_TIMEOUT_MS = 5000;

/** Polls the app-root `data-busy` attribute (see replay-app/src/app/app.html + shared/busy.service.ts)
 * instead of a fixed sleep — same idle signal the demo-readiness-check skill recommends apps expose. */
async function waitForIdle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('.app-shell');
      return !root || root.getAttribute('data-busy') !== 'true';
    },
    undefined,
    { timeout: IDLE_TIMEOUT_MS }
  );
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Element not visible — boundingBox() returned null for ${locator}`);
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Takes a screenshot, compresses+saves it via the session, returns the screenshotRef. */
async function shot(session: CaptureSession, page: Page): Promise<string> {
  const buffer = await page.screenshot();
  return session.saveScreenshot(buffer);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const session = new CaptureSession({ outDir: OUT_DIR, viewport: VIEWPORT, seed: 42 });

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    // 1. Navigate to the app (lands on the Replay Player view).
    await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
    await waitForIdle(page);
    session.addNavigate({ url: DEMO_URL, cursor: { x: 0, y: 0 }, screenshotRef: await shot(session, page) });

    // 2. Switch to the Demo Gallery view.
    const navDemos = page.locator('[data-testid="nav-demos"]');
    const navDemosCursor = await centerOf(navDemos);
    await navDemos.click();
    await waitForIdle(page);
    session.addClick({
      target: '[data-testid="nav-demos"]',
      cursor: navDemosCursor,
      screenshotRef: await shot(session, page),
    });

    // 3. Counter section — increment twice.
    const incrementBtn = page.locator('[data-testid="demo-counter-increment"]');
    for (let i = 0; i < 2; i++) {
      const cursor = await centerOf(incrementBtn);
      await incrementBtn.click();
      await waitForIdle(page);
      session.addClick({
        target: '[data-testid="demo-counter-increment"]',
        cursor,
        screenshotRef: await shot(session, page),
      });
    }

    // 4. Draw attention to the resulting count with a circle gesture (no click).
    const counterValue = page.locator('[data-testid="demo-counter-value"]');
    session.addCircle({
      target: '[data-testid="demo-counter-value"]',
      radius: 40,
      duration: 1200,
      cursor: await centerOf(counterValue),
      screenshotRef: await shot(session, page),
    });

    // 5. Contact form — fill, submit, wait out the simulated network delay via the idle signal.
    await page.locator('[data-testid="demo-form-name"]').fill('Ada Lovelace');
    await page.locator('[data-testid="demo-form-email"]').fill('ada@example.com');
    const submitBtn = page.locator('[data-testid="demo-form-submit"]');
    const submitCursor = await centerOf(submitBtn);
    await submitBtn.click();
    await waitForIdle(page); // covers the SUBMIT_DELAY_MS simulated latency
    session.addClick({
      target: '[data-testid="demo-form-submit"]',
      cursor: submitCursor,
      screenshotRef: await shot(session, page),
    });

    // 6. Step through the 3-step wizard to completion.
    for (let i = 0; i < 3; i++) {
      const nextBtn = page.locator('[data-testid="demo-wizard-next"]');
      const cursor = await centerOf(nextBtn);
      await nextBtn.click();
      await waitForIdle(page);
      session.addClick({
        target: '[data-testid="demo-wizard-next"]',
        cursor,
        screenshotRef: await shot(session, page),
      });
    }

    const manifestPath = session.save();
    console.log(`Wrote ${manifestPath}`);
    console.log(`Events: ${session.getEvents().length}`);
    console.log(`Screenshots: ${join(OUT_DIR, 'screenshots')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
