// Playwright capture — real, unattended browser script.
//
// Unlike capture/chrome-mcp (agent-driven only, see chrome-mcp/NOTES.md),
// this is a standalone Node script: `npm install && npm run capture:demo`
// launches a real Chromium, drives replay-app's Demo Gallery
// (replay-app/src/app/demo-gallery/) AND its Kitchen Sink page
// (replay-app/src/app/kitchen-sink/), and writes a manifest.json +
// screenshots/ that the existing replay players (replay/, replay-app/) can
// load unmodified.
//
// The Kitchen Sink leg (steps 7+ below) is a deliberate stress test, not
// more of the same — it exercises a long async wait, plain
// text-input/textarea fills, a mat-select, a mat-dialog, and scrolling
// between sections, specifically to surface what this capture backend
// doesn't yet represent well (see shared/manifest-types.ts's Phase 2 note on
// missing scroll/drag action types, and docs/roadmap.md's `asyncWait`/`type`
// entries). It is not meant to look good on replay yet.
//
// Prereq: the Angular app must already be running (`cd replay-app && npm
// start`) — this script does not start it for you, since the build/serve
// process is unrelated to capture and slow to spin up per run. See
// ../RUNBOOK.md for the full loop.

import { chromium, type Locator, type Page } from 'playwright';
import { mkdirSync, rmSync, cpSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CaptureSession } from './capture-session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_DEMO_URL = process.env['DEMO_URL'] ?? 'http://localhost:4221/';
// FAST_ASYNC=true appends ?fastAsync=1 to the initial navigation, which the
// Kitchen Sink component reads via window.location.search to shrink its
// ~40s async action down to ~4s. The query param only needs to be present
// on the very first page.goto — app.html's nav links use
// queryParamsHandling="preserve" (see ADR-007), so it survives the later
// real router navigation to /kitchen-sink instead of getting dropped.
const FAST_ASYNC = process.env['FAST_ASYNC'] === 'true';
const DEMO_URL = FAST_ASYNC
  ? `${BASE_DEMO_URL}${BASE_DEMO_URL.includes('?') ? '&' : '?'}fastAsync=1`
  : BASE_DEMO_URL;
// Final destination — INSIDE replay-app/public/, which `ng serve` watches
// and serves as static assets.
const FINAL_OUT_DIR = process.env['OUT_DIR']
  ?? resolve(__dirname, '..', '..', '..', 'replay-app', 'public', 'test-scenarios', 'demo-gallery');
// Staging dir the capture actually writes into WHILE running — deliberately
// outside replay-app entirely. CaptureSession.saveScreenshot() does a
// writeFileSync() after every single step (click, select, etc.), and
// writing those files straight into replay-app/public/ while `ng serve` is
// watching it mid-run was a real bug: each screenshot write triggers a dev-
// server rebuild + live-reload of the very page Playwright is mid-action
// on, severing open overlays (e.g. an open mat-select panel) and producing
// real `navigated to ...` events Playwright's auto-wait then blocks on —
// exactly the timeout + flicker seen in practice. Writing to staging here
// and copying into place only after the browser closes (see end of main())
// keeps the dev server untouched for the whole capture run.
const STAGING_DIR = resolve(__dirname, '..', '.capture-staging', 'demo-gallery');
const HEADLESS = process.env['HEADLESS'] !== 'false';
const VIEWPORT = { width: 1280, height: 800 };
const IDLE_TIMEOUT_MS = 5000;
// Must exceed the Kitchen Sink component's DEFAULT_ASYNC_DURATION_MS (40s,
// see kitchen-sink.component.ts) with margin — only used for that one wait.
// If FAST_ASYNC is set the real wait is ~4s, so this is a no-op upper bound.
const ASYNC_IDLE_TIMEOUT_MS = 65_000;

/** Polls the app-root `data-busy` attribute (see replay-app/src/app/app.html + shared/busy.service.ts)
 * instead of a fixed sleep — same idle signal the demo-readiness-check skill recommends apps expose. */
async function waitForIdle(page: Page, timeoutMs: number = IDLE_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('.app-shell');
      return !root || root.getAttribute('data-busy') !== 'true';
    },
    undefined,
    { timeout: timeoutMs }
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

/**
 * Scrolls the page by `deltaY` px. Deliberately NOT recorded as a manifest
 * event — there's no 'scroll' action type yet (see
 * shared/manifest-types.ts), so today's capture has no way to represent the
 * scroll itself. The next addClick/addCircle after this call will carry a
 * screenshot taken post-scroll, while the replay's cursor glide there still
 * shows the *pre-scroll* screenshot as its background for the whole move
 * (see replay-player.component.ts's buildTimeline/render — a 'move' phase
 * always shows the previous event's screenshot) — i.e. the page content
 * will hard-cut to the new scroll position only at the instant the cursor
 * arrives, with no visible scrolling motion. That mismatch is the thing this
 * page exists to surface.
 */
async function scrollBy(page: Page, deltaY: number): Promise<void> {
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(150); // let any scroll-driven layout settle before the next boundingBox() read
}

async function main(): Promise<void> {
  // Clean slate each run — stale screenshots from a previous failed attempt
  // shouldn't linger in staging.
  rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });
  const session = new CaptureSession({ outDir: STAGING_DIR, viewport: VIEWPORT, seed: 42 });

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

    // 7. Switch to the Kitchen Sink view.
    const navKitchenSink = page.locator('[data-testid="nav-kitchen-sink"]');
    const navKitchenSinkCursor = await centerOf(navKitchenSink);
    await navKitchenSink.click();
    await waitForIdle(page);
    session.addClick({
      target: '[data-testid="nav-kitchen-sink"]',
      cursor: navKitchenSinkCursor,
      screenshotRef: await shot(session, page),
    });

    // 8. Fill the plain text input. Click first (so the cursor lands on it),
    // then .fill() — .fill() sets the final value in one step with no
    // intermediate keystrokes/screenshots, which is exactly the `type`
    // action's problem case from docs/roadmap.md: the screenshot taken
    // right after this click already shows the fully-typed value.
    const textInput = page.locator('[data-testid="kitchen-sink-text-input"]');
    const textInputCursor = await centerOf(textInput);
    await textInput.click();
    await textInput.fill('Ada Lovelace');
    session.addClick({
      target: '[data-testid="kitchen-sink-text-input"]',
      cursor: textInputCursor,
      screenshotRef: await shot(session, page),
    });

    // 9. Fill the textarea — same jump-to-final-value caveat as step 8.
    const textarea = page.locator('[data-testid="kitchen-sink-textarea"]');
    const textareaCursor = await centerOf(textarea);
    await textarea.click();
    await textarea.fill('Recorded with the Playwright capture backend as-is, no asyncWait/type support yet.');
    session.addClick({
      target: '[data-testid="kitchen-sink-textarea"]',
      cursor: textareaCursor,
      screenshotRef: await shot(session, page),
    });

    // 10. Scroll down to the mat-select (not recorded — see scrollBy()),
    // open it, then pick an option.
    await scrollBy(page, 700);
    const select = page.locator('[data-testid="kitchen-sink-select"]');
    const selectCursor = await centerOf(select);
    await select.click();
    session.addClick({
      target: '[data-testid="kitchen-sink-select"]',
      cursor: selectCursor,
      screenshotRef: await shot(session, page),
    });

    const betaOption = page.locator('[data-testid="kitchen-sink-select-option-beta"]');
    const betaOptionCursor = await centerOf(betaOption);
    await betaOption.click();
    session.addClick({
      target: '[data-testid="kitchen-sink-select-option-beta"]',
      cursor: betaOptionCursor,
      screenshotRef: await shot(session, page),
    });

    // 11. Scroll down to the long async action and trigger it. This is the
    // capture's slowest step by design — real-time elapsed here becomes the
    // gap between this event's timestamp and the next, which the replay
    // player turns straight into real-time dead air (see
    // replay-player.component.ts: move-phase duration is just the raw
    // manifest timestamp delta, with no compression). That dead air is
    // exactly the problem docs/roadmap.md's `asyncWait` entry is meant to
    // fix; this capture deliberately does NOT fix it.
    await scrollBy(page, 700);
    const asyncTrigger = page.locator('[data-testid="kitchen-sink-async-trigger"]');
    const asyncTriggerCursor = await centerOf(asyncTrigger);
    await asyncTrigger.click();
    session.addClick({
      target: '[data-testid="kitchen-sink-async-trigger"]',
      cursor: asyncTriggerCursor,
      screenshotRef: await shot(session, page), // captured immediately — shows the spinner/bar at ~0%
    });

    await waitForIdle(page, ASYNC_IDLE_TIMEOUT_MS); // the real ~40s (or ~4s under FAST_ASYNC) wait happens here
    const asyncResult = page.locator('[data-testid="kitchen-sink-async-result"]');
    session.addCircle({
      target: '[data-testid="kitchen-sink-async-result"]',
      radius: 30,
      duration: 1000,
      cursor: await centerOf(asyncResult),
      screenshotRef: await shot(session, page),
    });

    // 12. Scroll down to the dialog trigger, open the dialog, then close it.
    await scrollBy(page, 700);
    const dialogTrigger = page.locator('[data-testid="kitchen-sink-dialog-trigger"]');
    const dialogTriggerCursor = await centerOf(dialogTrigger);
    await dialogTrigger.click();
    await page.locator('[data-testid="kitchen-sink-dialog"]').waitFor({ state: 'visible' });
    session.addClick({
      target: '[data-testid="kitchen-sink-dialog-trigger"]',
      cursor: dialogTriggerCursor,
      screenshotRef: await shot(session, page),
    });

    const dialogClose = page.locator('[data-testid="kitchen-sink-dialog-close"]');
    const dialogCloseCursor = await centerOf(dialogClose);
    await dialogClose.click();
    await page.locator('[data-testid="kitchen-sink-dialog"]').waitFor({ state: 'hidden' });
    session.addClick({
      target: '[data-testid="kitchen-sink-dialog-close"]',
      cursor: dialogCloseCursor,
      screenshotRef: await shot(session, page),
    });

    // 13. Scroll all the way to the bottom marker — proves the page can be
    // traversed end to end, and gives one more pre-scroll/post-scroll jump
    // for the replay to demonstrate.
    await scrollBy(page, 1200);
    const end = page.locator('[data-testid="kitchen-sink-end"]');
    session.addCircle({
      target: '[data-testid="kitchen-sink-end"]',
      radius: 24,
      duration: 900,
      cursor: await centerOf(end),
      screenshotRef: await shot(session, page),
    });

    session.save(); // writes STAGING_DIR/manifest.json — finished writing into staging
  } finally {
    await browser.close();
  }

  // Only now — browser closed, no more mid-run writes possible — copy the
  // finished manifest + screenshots from staging into replay-app/public/.
  // This is the one and only write into the dev-server-watched folder for
  // the whole run, and it happens after Playwright is done with the page,
  // so there's nothing left for a triggered reload to disrupt.
  rmSync(FINAL_OUT_DIR, { recursive: true, force: true });
  mkdirSync(dirname(FINAL_OUT_DIR), { recursive: true });
  cpSync(STAGING_DIR, FINAL_OUT_DIR, { recursive: true });

  console.log(`Wrote ${join(FINAL_OUT_DIR, 'manifest.json')}`);
  console.log(`Events: ${session.getEvents().length}`);
  console.log(`Screenshots: ${join(FINAL_OUT_DIR, 'screenshots')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
