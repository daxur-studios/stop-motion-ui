// Chrome MCP capture harness — Phase 1 (click + navigate only).
//
// This module has NO dependency on Chrome MCP tools. It's the bookkeeping
// half of the capture path: an agent session that DOES have
// `mcp__Claude_in_Chrome__*` tools calls these helpers after each browser
// action to append a manifest event and track screenshot filenames.
//
// Why this shape: Chrome MCP tools only exist inside a live Claude agent
// turn (navigate / find / computer / screenshot etc.). There is no
// standalone Node library for them, so this harness can't "drive" the
// browser itself — it only models the manifest the agent should build
// while it drives the browser by hand. See RUNBOOK.md for the step-by-step
// loop an agent follows.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Manifest, ManifestEvent, ClickAction, NavigateAction, CircleAction, CursorPoint } from '../../shared/manifest-types';

export interface CaptureSessionOptions {
  /** Directory the manifest.json + screenshots/ folder will be written into. */
  outDir: string;
  viewport: { width: number; height: number };
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
      backend: 'chrome-mcp',
      viewport: opts.viewport,
      events: [],
    };
  }

  /** Next sequential screenshot filename, e.g. "0001.png". Caller saves the actual image bytes. */
  nextScreenshotName(): string {
    this.seq += 1;
    return `${String(this.seq).padStart(4, '0')}.png`;
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
