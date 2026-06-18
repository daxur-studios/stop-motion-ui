// Playwright capture harness — manifest bookkeeping half.
//
// Same CaptureSession-style API as `capture/chrome-mcp/manifest-builder.ts`
// (addNavigate / addClick / addCircle / nextScreenshotName / save), kept as
// its own copy rather than a shared import — this repo already tolerates
// that duplication between the two backends (see chrome-mcp/manifest-builder.mts),
// and the two backends are deliberately allowed to drift if one needs to
// (ADR-001: "capture backend logic must stay isolated"). The one real
// addition here is `saveScreenshot()`, which actually performs the
// sharp/mozjpeg compression from ADR-003 — chrome-mcp's harness doesn't do
// this yet because Chrome MCP's `computer` screenshot tool already returns
// encoded bytes; Playwright's `page.screenshot()` returns a raw buffer, so
// this backend is the one that needs (and gets) the real compression step.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type {
  Manifest,
  ManifestEvent,
  ClickAction,
  NavigateAction,
  CircleAction,
  CursorPoint,
} from '../../../shared/manifest-types.js';

export interface CaptureSessionOptions {
  /** Directory the manifest.json + screenshots/ folder will be written into. */
  outDir: string;
  viewport: { width: number; height: number };
  /** Forwarded to manifest.seed — see shared/manifest-types.ts. */
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
}

export interface AddClickArgs {
  target: string;
  cursor: XY;
  screenshotRef: string;
  id?: string;
}

export interface AddCircleArgs {
  target: string;
  radius: number;
  duration: number;
  cursor: XY;
  screenshotRef: string;
  id?: string;
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
   * `page.screenshot()`) using the exact mozjpeg/quality-80 settings from
   * ADR-003, writes it into screenshots/, and returns the manifest-relative
   * `screenshotRef` (e.g. "screenshots/0001.jpg") ready to pass to
   * addNavigate/addClick/addCircle.
   */
  async saveScreenshot(rawBuffer: Buffer): Promise<string> {
    const name = this.nextScreenshotName();
    const compressed = await sharp(rawBuffer).jpeg({ mozjpeg: true, quality: 80 }).toBuffer();
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
