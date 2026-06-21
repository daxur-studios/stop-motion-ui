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
// doesn't yet represent well (scrolling now has a real 'scroll' manifest
// action, see shared/manifest-types.ts and scrollToAndRecord() below;
// 'drag' and docs/roadmap.md's `asyncWait`/`type` entries remain
// unimplemented). It is not meant to look good on replay yet.
//
// Prereq: the Angular app must already be running (`cd replay-app && npm
// start`) — this script does not start it for you, since the build/serve
// process is unrelated to capture and slow to spin up per run. See
// ../RUNBOOK.md for the full loop.

import { chromium, type Locator, type Page } from "playwright";
import { mkdirSync, rmSync, cpSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { CaptureSession } from "./capture-session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_DEMO_URL = process.env["DEMO_URL"] ?? "http://localhost:4221/";
// FAST_ASYNC=true appends ?fastAsync=1 to the initial navigation, which the
// Kitchen Sink component reads via window.location.search to shrink its
// ~40s async action down to ~4s. The query param only needs to be present
// on the very first page.goto — app.html's nav links use
// queryParamsHandling="preserve" (see ADR-007), so it survives the later
// real router navigation to /kitchen-sink instead of getting dropped.
const FAST_ASYNC = process.env["FAST_ASYNC"] === "true";
const DEMO_URL = FAST_ASYNC ? `${BASE_DEMO_URL}${BASE_DEMO_URL.includes("?") ? "&" : "?"}fastAsync=1` : BASE_DEMO_URL;
// Final destination — INSIDE replay-app/public/, which `ng serve` watches
// and serves as static assets.
const FINAL_OUT_DIR = process.env["OUT_DIR"] ?? resolve(__dirname, "..", "..", "..", "replay-app", "public", "test-scenarios", "demo-gallery");
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
const STAGING_DIR = resolve(__dirname, "..", ".capture-staging", "demo-gallery");
const HEADLESS = process.env["HEADLESS"] !== "false";
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
      const root = document.querySelector(".app-shell");
      return !root || root.getAttribute("data-busy") !== "true";
    },
    undefined,
    { timeout: timeoutMs },
  );
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Element not visible — boundingBox() returned null for ${locator}`);
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Takes a screenshot, compresses+saves it via the session, returns the screenshotRef.
 * `quality` defaults to ADR-003's 80 (see CaptureSession.saveScreenshot()); pass a lower
 * value for high-volume/low-individual-value frames, e.g. scroll animation frames. */
async function shot(session: CaptureSession, page: Page, opts?: { quality?: number }): Promise<string> {
  const buffer = await page.screenshot();
  return session.saveScreenshot(buffer, opts);
}

// Default frame count when a scroll opts into animation (`animated: true`
// with no explicit `frameCount`) — see scrollToAndRecord()'s doc comment.
const DEFAULT_SCROLL_FRAME_COUNT = 6;

// Quality used for the *transient* frames captured during an animated
// scroll (scrollToAndRecord()'s `frames` loop below) — every frame except
// the last one, which stays at the ADR-003 default; see the loop for why.
// Each transient frame is only ever on screen for a fraction of a short
// scroll animation — by default 6-12 of them per animated scroll — so
// paying full quality-80 cost per frame is wasteful for something nobody
// pauses on individually. Measured against a real capture's scroll frames
// (1280x800 UI screenshots): quality 30 only saved ~33%, quality 80->20
// saved ~46% — 20 is the chosen value, the point where savings are
// substantial without the artifacts becoming distracting even on a
// freeze-frame. Revisit if real captures show banding/blockiness that's
// noticeable mid-animation, not just on pause.
const SCROLL_FRAME_QUALITY = 20;

// --- asyncWait full-screen sampling (see captureAsyncWait() below) ---
// As of ADR-010, asyncWait frames are plain full-screen screenshots, not
// region-cropped composites — see shared/manifest-types.ts's AsyncWaitAction
// doc comment for why the region-crop version was removed. Same
// transient-vs-lingering quality split as SCROLL_FRAME_QUALITY above is kept:
// both are "a frame that's only ever on screen for a slice of a compressed
// animation," so there's no reason to expect a different sweet spot here
// without real measurements suggesting otherwise.
const ASYNC_WAIT_FRAME_QUALITY = 20;
// How often to sample a full-screen frame while the real wait is in flight.
// 400ms keeps the determinate progress bar's motion legible (kitchen-sink's
// PROGRESS_TICK_MS is 200ms, so this samples roughly every other real tick)
// without oversampling a 40s wait into hundreds of frames we'd just throw
// away at downsample time.
const ASYNC_WAIT_SAMPLE_MS = 400;
// Downsample cap, matching roadmap.md's asyncWait entry ("~4-6 frames —
// enough to convey motion ... discard the rest"). One slot is always the
// final/lingering full-quality frame, so this is "N-1 transient + 1 final."
const ASYNC_WAIT_MAX_FRAMES = 6;
// Compressed replay duration for cycling through the frames — within
// roadmap.md's stated ~2-4s sensible-default band.
const ASYNC_WAIT_DISPLAY_MS = 2500;

/**
 * Evenly samples `maxCount` items out of `items` (inclusive of both ends),
 * preserving order. No-op if `items` already fits within `maxCount`. Used to
 * downsample the raw oversampled region-crop buffers down to a small,
 * evenly-spaced set after the real wait duration is known — see
 * docs/roadmap.md's "oversample continuously, then downsample after the
 * fact" refinement, which this is the first real implementation of (the
 * scroll-frame downsampling above takes a simpler route since its full
 * duration is chosen by the capture script itself, not discovered after the
 * fact like a real-world async wait's duration is).
 */
function downsampleEvenly<T>(items: T[], maxCount: number): T[] {
  if (maxCount <= 0 || items.length === 0) return [];
  if (items.length <= maxCount) return items;
  if (maxCount === 1) return [items[items.length - 1]];
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.round((i * (items.length - 1)) / (maxCount - 1));
    result.push(items[idx]);
  }
  return result;
}

/**
 * Captures a long real wait as a sequence of full-screen screenshots,
 * oversampled continuously while the wait is in flight and downsampled once
 * the real duration is known — see roadmap.md's asyncWait entry and ADR-010
 * (which removed an earlier region-cropped-composite version of this
 * function; see that ADR for why full-screen sampling is now preferred over
 * cropping, not just a fallback).
 *
 * Mechanism unchanged from the prior region-cropped version: polls the same
 * `.app-shell[data-busy]` idle signal `waitForIdle()` uses elsewhere in this
 * file, but — unlike `waitForFunction()` — does so in an explicit loop so a
 * frame can be taken on *every* poll, not just once at the end. This is the
 * "oversample continuously, downsample once real duration is known"
 * technique from roadmap.md: it doesn't know or guess the wait's real
 * duration upfront, it just keeps sampling every `ASYNC_WAIT_SAMPLE_MS`
 * until the busy flag clears, then downsamples whatever it collected. The
 * only change from before is *what* gets captured each poll — a full-page
 * `page.screenshot()` instead of a `clip`-scoped crop — which also removes
 * the prior version's documented bounding-box-drift risk entirely: there's
 * no cached region rect to go stale, since every frame is a complete,
 * self-contained screenshot.
 */
async function captureAsyncWait(
  page: Page,
  idleTimeoutMs: number,
): Promise<{ rawFrames: Buffer[]; realDurationMs: number }> {
  const start = Date.now();
  const deadline = start + idleTimeoutMs;
  const rawFrames: Buffer[] = [];
  const isIdle = () =>
    page.evaluate(() => {
      const root = document.querySelector(".app-shell");
      return !root || root.getAttribute("data-busy") !== "true";
    });

  // Capture-then-check, not check-then-capture: guarantees at least one
  // frame even if the wait is already over by the time this function is
  // called (shouldn't happen at this call site, but cheap to make safe).
  for (;;) {
    rawFrames.push(await page.screenshot());
    if (await isIdle()) break;
    if (Date.now() > deadline) {
      throw new Error(`captureAsyncWait: timed out after ${idleTimeoutMs}ms waiting for idle`);
    }
    await page.waitForTimeout(ASYNC_WAIT_SAMPLE_MS);
  }
  const realDurationMs = Date.now() - start;
  return { rawFrames, realDurationMs };
}

/**
 * Scrolls the page by `deltaY` px, then records the result as a real
 * 'scroll' manifest event (see shared/manifest-types.ts's ScrollAction) —
 * `cursor` is the *upcoming* `nextTarget`'s post-scroll position, and
 * `screenshotRef` is a fresh post-scroll screenshot, so the event is a
 * self-consistent checkpoint the replay can snap straight to. Fixes a real
 * bug: with scrolling unrecorded, the next click's cursor glide used to show
 * the *pre-scroll* screenshot as its background while gliding toward
 * *post-scroll* coordinates — the click visually landed on the wrong part
 * of the screen (see replay-player.component.ts's buildTimeline() 'scroll'
 * handling for the other half of this fix). Returns the computed cursor
 * position so callers can reuse it for the click/circle that follows,
 * rather than recomputing `centerOf(nextTarget)` a second time.
 *
 * Pass `opts.animated: true` to additionally record a `frames` sequence
 * (defaulting to DEFAULT_SCROLL_FRAME_COUNT, override via
 * `opts.frameCount`) so the replay can animate smoothly through the scroll
 * instead of snapping straight to the end state — see docs/roadmap.md's
 * "scroll showcase" entry for the agreed design language. Omitting `opts`
 * (or `animated: false`) keeps today's default: a single post-scroll
 * screenshot, snap-replayed, unchanged from before this option existed.
 *
 * `opts.durationMs` optionally pins how long the *replay* should spend
 * animating through the frames (e.g. `{ animated: true, frameCount: 12,
 * durationMs: 750 }` plays those 12 frames over 0.75s) — written into the
 * manifest as `frameDurationMs` (see ScrollAction in
 * shared/manifest-types.ts) and read by replay-player.component.ts's
 * buildTimeline() in place of its own frame-count-based default. This is
 * purely a *replay-timing* knob, not a real-capture-speed one — same
 * "recorded timestamps are an estimate input, not gospel" spirit as
 * MOVE_MIN_MS/MOVE_MAX_MS elsewhere in this pipeline, so the real
 * Playwright-side per-step settle wait below is unaffected by it and the
 * real capture doesn't get any slower or faster for setting this. Omitting
 * `durationMs` leaves the replay-side default (frame count × a fixed
 * per-frame duration, clamped) in place, same as before this option
 * existed.
 *
 * Implementation note: docs/roadmap.md's asyncWait/scroll-showcase entries
 * describe an "oversample continuously, then downsample to N evenly-spaced
 * frames" technique — that's needed *there* because the real wait/scroll
 * duration isn't known in advance. Here the duration is known (this script
 * drives the scroll itself), so this takes a simpler route: resolve the
 * page's real, clamped scroll target first (`deltaY` is just a requested
 * amount — it routinely overshoots the page's actual remaining scroll
 * room, which the non-animated path never had to care about, since the
 * browser silently clamps and only the single end screenshot mattered),
 * then animate by setting `frameCount` evenly-spaced *absolute* scrollY
 * positions between the real start and real end via `window.scrollTo()`
 * (not relative wheel deltas — an earlier version of this split `deltaY`
 * into N relative wheel ticks, which broke as soon as the real available
 * scroll room was smaller than the requested `deltaY`: real motion front-
 * loaded into the first couple of ticks and every remaining tick became a
 * silent no-op, producing a long run of duplicate frames at the end).
 */
async function scrollToAndRecord(session: CaptureSession, page: Page, deltaY: number, nextTarget: Locator, narration: { short: string; long: string }, opts?: { animated?: boolean; frameCount?: number; durationMs?: number }): Promise<{ x: number; y: number }> {
  const frameCount = opts?.animated ? (opts.frameCount ?? DEFAULT_SCROLL_FRAME_COUNT) : 0;
  const frameDurationMs = opts?.animated ? opts.durationMs : undefined;

  let frames: string[] | undefined;
  if (frameCount > 1) {
    frames = [];
    // `deltaY` is a guessed/estimated scroll amount picked by the caller,
    // not necessarily the page's real remaining scroll room — it's
    // routinely an overestimate (e.g. "scroll roughly a screen's worth"),
    // which the non-animated path never had to care about since the
    // browser auto-clamps and only the single end-state screenshot
    // mattered. Splitting a guessed, possibly-too-large deltaY into N even
    // *relative* wheel ticks was the real bug here: real motion front-
    // loads into however many ticks it actually takes to hit the page's
    // true max scroll, then every remaining tick is a no-op — producing a
    // long run of byte-identical frames at the end (confirmed via
    // md5sum across a real capture: ~20 of 24 frames identical, or all 24
    // identical when the page was already at max scroll before the call
    // even started). Fix: resolve the *actual* clamped target position
    // first, then animate by setting N evenly-spaced *absolute* scrollY
    // values between the real start and real (clamped) end — frames stay
    // evenly spread across whatever scroll distance genuinely exists,
    // however much that turns out to be, regardless of how `deltaY`
    // compares to it.
    const startY = await page.evaluate(() => window.scrollY);
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.max(0, Math.min(maxY, startY + deltaY));
    for (let i = 1; i <= frameCount; i++) {
      const y = startY + ((targetY - startY) * i) / frameCount;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(20); // brief per-step settle; cheap since each step is a small delta
      // The *last* frame is a special case: it gets reused below as this
      // event's `screenshotRef`, which means it's not just "on screen for a
      // fraction of the animation" like the others — it stays up for the
      // rest of the step's hold phase, which can stretch well past the
      // animation if narration audio runs longer (ADR-004's "whichever is
      // longer" timing sync). Compressing it as hard as the throwaway
      // in-between frames meant the low-quality frame was exactly the one
      // viewers had the most time to actually look at. So: low quality for
      // every frame except the last, full ADR-003 quality (80) for the last.
      const isLastFrame = i === frameCount;
      frames.push(await shot(session, page, isLastFrame ? undefined : { quality: SCROLL_FRAME_QUALITY }));
    }
    await page.waitForTimeout(150); // final settle, same margin as the non-animated path, before reading boundingBox()
  } else {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(150); // let any scroll-driven layout settle before the next boundingBox() read
  }

  const cursor = await centerOf(nextTarget);
  const scrollY = await page.evaluate(() => window.scrollY);
  // The last animated frame already shows the final post-scroll state, so
  // reuse it as screenshotRef instead of taking a redundant extra shot —
  // it was captured at full quality above for exactly this reason.
  const screenshotRef = frames ? frames[frames.length - 1] : await shot(session, page);
  session.addScroll({
    scrollY,
    cursor,
    narrationShort: narration.short,
    narrationLong: narration.long,
    screenshotRef,
    ...(frames ? { frames } : {}),
    ...(frames && frameDurationMs ? { frameDurationMs } : {}),
  });
  return cursor;
}

/**
 * Waits for `locator`'s element (and its descendants) to finish any
 * in-flight CSS transitions/animations, using the real Web Animations API
 * (`Element.getAnimations()`) instead of a fixed sleep. Real bug this fixes:
 * the mat-dialog open capture used to land mid-fade-in (a faint ~50%-opacity
 * dialog), because `waitFor({ state: 'visible' })` resolves the instant the
 * element has any non-zero-size layout box — i.e. right as the enter
 * animation *starts*, not when it ends. `getAnimations()` returns the
 * actual running Animation objects Chromium is applying to the CSS
 * transition (opacity/transform), so awaiting their `.finished` promises is
 * a real "has this stopped animating" check, not a guessed duration.
 * Bounded by `timeoutMs` as a safety net (e.g. a reduced-motion environment
 * with zero animations, or one that never settles) so this can't hang a
 * capture run indefinitely.
 */
async function waitForAnimationsToSettle(locator: Locator, timeoutMs = 1000): Promise<void> {
  await locator.evaluate(async (el, timeoutMs) => {
    const animations = (el as Element).getAnimations({ subtree: true });
    if (animations.length === 0) return;
    await Promise.race([Promise.all(animations.map((a) => a.finished.catch(() => undefined))), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }, timeoutMs);
}

async function main(): Promise<void> {
  // Clean slate each run — stale screenshots from a previous failed attempt
  // shouldn't linger in staging.
  rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });
  const session = new CaptureSession({ outDir: STAGING_DIR, viewport: VIEWPORT, seed: 42 });

  const browser = await chromium.launch({
    headless: HEADLESS,
    // Force 1x device scale factor in headed mode so Chromium doesn't need to
    // zoom the window to compensate for OS display scaling (125%, 150%, etc.).
    // Without this, each page.screenshot() triggers a zoom↔unzoom that causes
    // visible flicker between screenshots. Headless ignores DPI so this is a
    // no-op there — same 1280×800 output either way.
    args: HEADLESS ? [] : ["--force-device-scale-factor=1"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    // 1. Navigate to the app (lands on the Replay Player view).
    await page.goto(DEMO_URL, { waitUntil: "networkidle" });
    await waitForIdle(page);
    session.addNavigate({
      url: DEMO_URL,
      cursor: { x: 0, y: 0 },
      narrationShort: "Starting on the Replay Player view.",
      narrationLong: "This is the Replay Player view, where a previously captured manifest plays back.",
      screenshotRef: await shot(session, page),
    });

    // 2. Switch to the Demo Gallery view.
    const navDemos = page.locator('[data-testid="nav-demos"]');
    const navDemosCursor = await centerOf(navDemos);
    await navDemos.click();
    await waitForIdle(page);
    session.addClick({
      target: '[data-testid="nav-demos"]',
      cursor: navDemosCursor,
      narrationShort: "Switching to the Demo Gallery.",
      narrationLong: "Clicking the Demo Gallery tab navigates to a page with several small example widgets.",
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
        narrationShort: "Incrementing the counter.",
        narrationLong: "Clicking the increment button increases the counter value by one.",
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
      narrationShort: "Here is the updated count.",
      narrationLong: "Circling the counter value draws attention to the result after both increments.",
      screenshotRef: await shot(session, page),
    });

    // 5. Contact form — fill, submit, wait out the simulated network delay via the idle signal.
    await page.locator('[data-testid="demo-form-name"]').fill("Ada Lovelace");
    await page.locator('[data-testid="demo-form-email"]').fill("ada@example.com");
    const submitBtn = page.locator('[data-testid="demo-form-submit"]');
    const submitCursor = await centerOf(submitBtn);
    await submitBtn.click();
    await waitForIdle(page); // covers the SUBMIT_DELAY_MS simulated latency
    session.addClick({
      target: '[data-testid="demo-form-submit"]',
      cursor: submitCursor,
      narrationShort: "Submitting the form.",
      narrationLong: "After filling in a name and email, submitting the form waits out a simulated network delay before confirming.",
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
        narrationShort: `Wizard step ${i + 1} of 3.`,
        narrationLong: `Clicking Next advances the wizard from step ${i + 1} to the following step.`,
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
      narrationShort: "Opening the Kitchen Sink page.",
      narrationLong: "Switching to the Kitchen Sink page, a stress-test fixture covering text input, a long wait, a select, and a dialog.",
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
    await textInput.fill("Ada Lovelace");
    session.addClick({
      target: '[data-testid="kitchen-sink-text-input"]',
      cursor: textInputCursor,
      narrationShort: "Typing a name into the text field.",
      narrationLong: "Clicking the text input and filling it with a name, set in one step rather than keystroke by keystroke.",
      screenshotRef: await shot(session, page),
    });

    // 9. Fill the textarea — same jump-to-final-value caveat as step 8.
    const textarea = page.locator('[data-testid="kitchen-sink-textarea"]');
    const textareaCursor = await centerOf(textarea);
    await textarea.click();
    await textarea.fill("Recorded with the Playwright capture backend as-is, no asyncWait/type support yet.");
    session.addClick({
      target: '[data-testid="kitchen-sink-textarea"]',
      cursor: textareaCursor,
      narrationShort: "Adding some notes.",
      narrationLong: "Filling in the textarea with a short note about this capture run.",
      screenshotRef: await shot(session, page),
    });

    // 10. Scroll down to the mat-select, open it, then pick an option.
    // Animated (24 frames, see DEFAULT_SCROLL_FRAME_COUNT) as a test case —
    // this is the page's very first scroll, starting from scrollY=0 with
    // the full requested 700px of real room available (confirmed via a
    // real capture's resulting `scrollY: 700`, i.e. nothing clamped), so
    // it's a strong showcase: 24 frames evenly spread across a real,
    // substantial scroll distance, not a handful of px of leftover room.
    const select = page.locator('[data-testid="kitchen-sink-select"]');
    const selectCursor = await scrollToAndRecord(
      session,
      page,
      700,
      select,
      {
        short: "Scrolling down to the dropdown.",
        long: "Scrolling further down the page brings the select field into view.",
      },
      { animated: true },
    );
    await select.click();
    // Same mid-fade issue as the dialog: the panel's enter transition is
    // still running when this resolves. Waits on the panel itself, not the
    // trigger — see waitForAnimationsToSettle()'s doc comment.
    await waitForAnimationsToSettle(page.locator(".mat-mdc-select-panel"));
    session.addClick({
      target: '[data-testid="kitchen-sink-select"]',
      cursor: selectCursor,
      narrationShort: "Opening the dropdown.",
      narrationLong: "Clicking the select field opens its dropdown panel of options.",
      screenshotRef: await shot(session, page),
    });

    const betaOption = page.locator('[data-testid="kitchen-sink-select-option-beta"]');
    const betaOptionCursor = await centerOf(betaOption);
    await betaOption.click();
    // Panel close also transitions briefly before the overlay detaches, but
    // by the time we get here it may already be gone entirely — .count()
    // resolves immediately either way, unlike .evaluate()'s own (much
    // longer) actionability wait, so this can't stall the capture if
    // there's nothing left to wait on.
    if ((await page.locator(".mat-mdc-select-panel").count()) > 0) {
      await waitForAnimationsToSettle(page.locator(".mat-mdc-select-panel"));
    }
    session.addClick({
      target: '[data-testid="kitchen-sink-select-option-beta"]',
      cursor: betaOptionCursor,
      narrationShort: "Picking the Beta option.",
      narrationLong: "Selecting Beta from the dropdown list closes the panel and updates the field.",
      screenshotRef: await shot(session, page),
    });

    // 11. Scroll down to the long async action and trigger it, then capture
    // the real wait as a sequence of full-screen `asyncWait` frames instead
    // of just waiting it out — see captureAsyncWait()'s doc comment for the
    // mechanism, and shared/manifest-types.ts's AsyncWaitAction for what
    // gets written to the manifest. This step originally just waited out
    // the real ~40s with no compression at all (reading the dead air
    // straight off the manifest's timestamp gap); a later iteration tried
    // region-cropped compositing to save bytes for the live player, which
    // ADR-010 then removed in favor of this full-screen version once video
    // export (ADR-009) became the primary deliverable.
    // Animated as the second test case — confirmed via a real capture's
    // resulting `scrollY: ~1186.67` (started at 700, ~487px of real room
    // out of the requested 700 — still substantial, unlike the two scroll
    // points further down the page, see steps 12-13's comments below).
    // Also doubles as the test case for explicit `opts.durationMs`: 12
    // frames (the default) played back over a pinned 750ms instead of the
    // frame-count-based default duration — see scrollToAndRecord()'s doc
    // comment.
    const asyncTrigger = page.locator('[data-testid="kitchen-sink-async-trigger"]');
    const asyncTriggerCursor = await scrollToAndRecord(
      session,
      page,
      700,
      asyncTrigger,
      {
        short: "Scrolling down to the long action.",
        long: "Scrolling further down the page brings the long async action into view.",
      },
      { animated: true, durationMs: 750 },
    );
    await asyncTrigger.click();
    session.addClick({
      target: '[data-testid="kitchen-sink-async-trigger"]',
      cursor: asyncTriggerCursor,
      narrationShort: "Starting the long action.",
      narrationLong: "This simulates a real network request that can take many seconds to finish, while a progress bar and spinner show that it is working.",
      screenshotRef: await shot(session, page), // captured immediately — shows the spinner/bar at ~0%
    });

    const { rawFrames, realDurationMs } = await captureAsyncWait(page, ASYNC_IDLE_TIMEOUT_MS);

    // Downsample to the capped count, reserving the last slot for a final,
    // full-quality frame taken fresh (the loop's last rawFrame is whatever
    // was on screen right as the busy flag cleared — close enough in
    // practice, but taking one more after the loop exits guarantees the
    // lingering frame shows the truly-settled state, not a mid-poll one).
    const transientFrames = downsampleEvenly(rawFrames, Math.max(1, ASYNC_WAIT_MAX_FRAMES - 1));
    const frames: string[] = [];
    for (const buf of transientFrames) {
      frames.push(await session.saveScreenshot(buf, { quality: ASYNC_WAIT_FRAME_QUALITY }));
    }
    frames.push(await session.saveScreenshot(await page.screenshot()));

    // maxDisplayMs/speedupIndicator/speedupIndicatorCorner are demonstrated
    // here on purpose: this real ~40s (or ~4s under FAST_ASYNC) wait is
    // exactly the case those fields exist for. maxDisplayMs is set equal to
    // ASYNC_WAIT_DISPLAY_MS — same effective result as before this feature
    // existed (frameDurationMs alone already capped it identically) — so
    // this call site's behavior is unchanged; the field is included purely
    // so a real manifest.json produced by this script shows the field in
    // use. speedupIndicator/speedupIndicatorCorner are left at their
    // defaults (shown, 'top-right') — see AsyncWaitAction's doc comments in
    // shared/manifest-types.ts and ADR-011 for the on-by-default reasoning.
    session.addAsyncWait({
      target: '[data-testid="kitchen-sink-async-active"]',
      frames,
      realDurationMs,
      frameDurationMs: ASYNC_WAIT_DISPLAY_MS,
      maxDisplayMs: ASYNC_WAIT_DISPLAY_MS,
      cursor: asyncTriggerCursor, // cursor doesn't move during the wait; reuse the trigger's position
      screenshotRef: frames[frames.length - 1],
      narrationShort: "Waiting for the action to finish.",
      narrationLong: "The action runs in the background while a progress bar and spinner show it working, compressed here from its real duration.",
    });

    const asyncResult = page.locator('[data-testid="kitchen-sink-async-result"]');
    session.addCircle({
      target: '[data-testid="kitchen-sink-async-result"]',
      radius: 30,
      duration: 1000,
      cursor: await centerOf(asyncResult),
      narrationShort: "Done — the action completed.",
      narrationLong: "The long-running action has finished and the result is now shown.",
      screenshotRef: await shot(session, page),
    });

    // 12. Scroll down to the dialog trigger, open the dialog, then close it.
    // NOT animated — left on the default single-snap behavior deliberately.
    // A real capture showed this point in the page only has ~45px of real
    // scroll room left (scrollY goes from ~1186.67 to 1232 — the requested
    // 700px is almost entirely clamped), so animating it would mean
    // spending 24 frames on a scroll that barely moves. This is also the
    // exact scroll that used to precede the reported dialog-button
    // misalignment bug, so it still doubles as confirmation that the snap
    // fix itself (distinct from this animated-frames option) keeps working.
    const dialogTrigger = page.locator('[data-testid="kitchen-sink-dialog-trigger"]');
    const dialogTriggerCursor = await scrollToAndRecord(session, page, 700, dialogTrigger, {
      short: "Scrolling down to the dialog trigger.",
      long: "Scrolling further down the page brings the dialog trigger button into view.",
    });
    await dialogTrigger.click();
    await page.locator('[data-testid="kitchen-sink-dialog"]').waitFor({ state: "visible" });
    // `waitFor('visible')` resolves as soon as the dialog has a layout box —
    // right as the MDC enter transition *starts* — so without this, the
    // screenshot lands mid-fade (the ~50% opacity capture seen in practice).
    // The transition itself runs on the dialog container, not the title
    // element `kitchen-sink-dialog` points at, so wait on the container.
    await waitForAnimationsToSettle(page.locator(".mat-mdc-dialog-container"));
    session.addClick({
      target: '[data-testid="kitchen-sink-dialog-trigger"]',
      cursor: dialogTriggerCursor,
      narrationShort: "Opening the dialog.",
      narrationLong: "Clicking the dialog trigger opens a modal dialog on top of the page.",
      screenshotRef: await shot(session, page),
    });

    const dialogClose = page.locator('[data-testid="kitchen-sink-dialog-close"]');
    const dialogCloseCursor = await centerOf(dialogClose);
    await dialogClose.click();
    await page.locator('[data-testid="kitchen-sink-dialog"]').waitFor({ state: "hidden" });
    session.addClick({
      target: '[data-testid="kitchen-sink-dialog-close"]',
      cursor: dialogCloseCursor,
      narrationShort: "Closing the dialog.",
      narrationLong: "Clicking Close dismisses the dialog and returns to the page underneath.",
      screenshotRef: await shot(session, page),
    });

    // 13. Scroll all the way to the bottom marker — proves the page can be
    // traversed end to end, and gives one more pre-scroll/post-scroll jump
    // for the replay to demonstrate.
    // NOT animated — a real capture showed the page is already at its max
    // scroll position by this point (scrollY stays at 1232, identical to
    // step 12's end position — the dialog-trigger scroll already used up
    // the page's last real scroll room), so there is zero real distance
    // left for this specific call to animate. Confirms why deltaY alone
    // can't be trusted to pick good animation candidates — see steps 10-11
    // above, where the real remaining room is checked instead.
    const end = page.locator('[data-testid="kitchen-sink-end"]');
    const endCursor = await scrollToAndRecord(session, page, 1200, end, {
      short: "Scrolling to the bottom of the page.",
      long: "Scrolling all the way down brings the bottom marker into view.",
    });
    session.addCircle({
      target: '[data-testid="kitchen-sink-end"]',
      radius: 24,
      duration: 900,
      cursor: endCursor,
      narrationShort: "And that is the whole page.",
      narrationLong: "Reaching the bottom marker confirms the page can be traversed end to end.",
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

  console.log(`Wrote ${join(FINAL_OUT_DIR, "manifest.json")}`);
  console.log(`Events: ${session.getEvents().length}`);
  console.log(`Screenshots: ${join(FINAL_OUT_DIR, "screenshots")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
