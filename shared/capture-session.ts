// Canonical Playwright-style capture harness — manifest bookkeeping +
// screenshot compression in one place.
//
// This used to exist as two copies: one in this repo at
// `capture/playwright/src/capture-session.ts` and a second, independently
// drifted copy in Daxur-Daemon at `daxur-daemon-web/e2e/capture-session.ts`
// (that copy inlined its own version of `manifest-types.ts` too, see the
// "Local types matching stop-motion-ui shared/manifest-types.ts" comment it
// carried). Both copies implemented the same `CaptureSession` API
// (addNavigate / addClick / addCircle / nextScreenshotName / save) and the
// same `saveScreenshot()` sharp/mozjpeg compression step from ADR-003. This
// file is now the single source of truth for that logic; both repos consume
// it as a package (see shared/package.json — installed via a `file:`
// dependency, not npm link).
//
// Note: this is NOT the ADR-001 backend duplication (chrome-mcp vs
// playwright manifest builders) — that duplication is intentional and
// stays as-is. This is cross-repo duplication of the *playwright* backend
// specifically, which has no reason to drift between the two repos.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type {
  Manifest,
  ManifestEvent,
  ClickAction,
  NavigateAction,
  CircleAction,
  ScrollAction,
  CursorPoint,
} from './manifest-types.js';

export interface CaptureSessionOptions {
  /** Directory the manifest.json + screenshots/ folder will be written into. */
  outDir: string;
  viewport: { width: number; height: number };
  /** Forwarded to manifest.seed — see manifest-types.ts. */
  seed?: number;
}

export interface XY {
  x: number;
  y: number;
}

export interface AddNavigateArgs {
  url: string;
  cursor: XY;
  screenshotRef: string;
  id?: string;
  narrationShort?: string;
  narrationLong?: string;
}

export interface AddClickArgs {
  target: string;
  cursor: XY;
  screenshotRef: string;
  id?: string;
  narrationShort?: string;
  narrationLong?: string;
}

export interface AddCircleArgs {
  target: string;
  radius: number;
  duration: number;
  cursor: XY;
  screenshotRef: string;
  id?: string;
  narrationShort?: string;
  narrationLong?: string;
}

export interface AddScrollArgs {
  /** Page's scrollY (px) immediately after the scroll — informational only. */
  scrollY: number;
  /** Position of the *upcoming* interaction target, post-scroll — see ScrollAction's doc comment. */
  cursor: XY;
  screenshotRef: string;
  /** Optional animated-scroll frame sequence — see ScrollAction's doc comment in manifest-types.ts. */
  frames?: string[];
  /** Optional explicit replay duration (ms) for the `frames` animation — see ScrollAction's doc comment. */
  frameDurationMs?: number;
  id?: string;
  narrationShort?: string;
  narrationLong?: string;
}

export class CaptureSession {
  private manifest: Manifest;
  private outDir: string;
  private screenshotsDir: string;
  private startTime: number;
  private seq = 0;

  constructor(opts: CaptureSessionOptions) {
    this.outDir = opts.outDir;
    this.screenshotsDir = join(this.outDir, 'screenshots');
    this.startTime = Date.now();
    if (!existsSync(this.screenshotsDir)) {
      mkdirSync(this.screenshotsDir, { recursive: true });
    }
    this.manifest = {
      version: '1.0.0',
      capturedAt: new Date().toISOString(),
      backend: 'playwright',
      viewport: opts.viewport,
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      events: [],
    };
  }

  /** Next sequential screenshot filename, e.g. "0001.jpg". */
  nextScreenshotName(): string {
    this.seq += 1;
    return `${String(this.seq).padStart(4, '0')}.jpg`;
  }

  /**
   * Compresses a raw screenshot buffer (straight from Playwright's
   * `page.screenshot()`) using mozjpeg, writes it into screenshots/, and
   * returns the manifest-relative `screenshotRef` (e.g. "screenshots/0001.jpg")
   * ready to pass to addNavigate/addClick/addCircle/addScroll.
   *
   * `quality` defaults to **80** — the ADR-003 setting used for every
   * "real" frame (the one a step actually holds on). Pass a lower value for
   * high-volume, low-individual-value frames where this default would be
   * wasteful — the original motivating case is scroll-animation frames
   * (see scrollToAndRecord()'s `SCROLL_FRAME_QUALITY` in capture-demo.ts):
   * each one is only ever on screen for a fraction of a short animation, so
   * spending full quality-80 budget on all of them (frameCount per scroll,
   * by default 6-12) adds up fast for frames nobody pauses on individually.
   */
  async saveScreenshot(rawBuffer: Buffer, opts?: { quality?: number }): Promise<string> {
    const quality = opts?.quality ?? 80;
    const name = this.nextScreenshotName();
    const compressed = await sharp(rawBuffer).jpeg({ mozjpeg: true, quality }).toBuffer();
    writeFileSync(join(this.screenshotsDir, name), compressed);
    return `screenshots/${name}`;
  }

  private elapsed(): number {
    return Date.now() - this.startTime;
  }

  private cursorAt(x: number, y: number): CursorPoint {
    return { x, y, timestamp: this.elapsed() };
  }

  addNavigate(args: AddNavigateArgs): NavigateAction {
    const event: NavigateAction = {
      id: args.id ?? `nav-${this.seq}`,
      type: 'navigate',
      timestamp: this.elapsed(),
      cursor: this.cursorAt(args.cursor.x, args.cursor.y),
      screenshotRef: args.screenshotRef,
      url: args.url,
      ...(args.narrationShort ? { narrationShort: args.narrationShort } : {}),
      ...(args.narrationLong ? { narrationLong: args.narrationLong } : {}),
    };
    this.manifest.events.push(event);
    return event;
  }

  addClick(args: AddClickArgs): ClickAction {
    const event: ClickAction = {
      id: args.id ?? `click-${this.seq}`,
      type: 'click',
      timestamp: this.elapsed(),
      cursor: this.cursorAt(args.cursor.x, args.cursor.y),
      screenshotRef: args.screenshotRef,
      target: args.target,
      ...(args.narrationShort ? { narrationShort: args.narrationShort } : {}),
      ...(args.narrationLong ? { narrationLong: args.narrationLong } : {}),
    };
    this.manifest.events.push(event);
    return event;
  }

  addCircle(args: AddCircleArgs): CircleAction {
    const event: CircleAction = {
      id: args.id ?? `circle-${this.seq}`,
      type: 'circle',
      timestamp: this.elapsed(),
      cursor: this.cursorAt(args.cursor.x, args.cursor.y),
      screenshotRef: args.screenshotRef,
      target: args.target,
      radius: args.radius,
      duration: args.duration,
      ...(args.narrationShort ? { narrationShort: args.narrationShort } : {}),
      ...(args.narrationLong ? { narrationLong: args.narrationLong } : {}),
    };
    this.manifest.events.push(event);
    return event;
  }

  addScroll(args: AddScrollArgs): ScrollAction {
    const event: ScrollAction = {
      id: args.id ?? `scroll-${this.seq}`,
      type: 'scroll',
      timestamp: this.elapsed(),
      cursor: this.cursorAt(args.cursor.x, args.cursor.y),
      screenshotRef: args.screenshotRef,
      scrollY: args.scrollY,
      ...(args.frames && args.frames.length > 1 ? { frames: args.frames } : {}),
      ...(args.frames && args.frames.length > 1 && args.frameDurationMs
        ? { frameDurationMs: args.frameDurationMs }
        : {}),
      ...(args.narrationShort ? { narrationShort: args.narrationShort } : {}),
      ...(args.narrationLong ? { narrationLong: args.narrationLong } : {}),
    };
    this.manifest.events.push(event);
    return event;
  }

  getEvents(): ManifestEvent[] {
    return this.manifest.events;
  }

  /** Writes manifest.json into outDir. Call once after the capture loop ends. */
  save(): string {
    const manifestPath = join(this.outDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
    return manifestPath;
  }
}
