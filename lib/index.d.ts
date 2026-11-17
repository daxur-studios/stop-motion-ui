import type { Page, Locator } from 'playwright';
export interface StepOptions {
  /** Stable unique ID; used in diagnostics and audio asset filenames. */
  id: string;
  narration?: string;
  /** Audio file relative to the recipe. */
  audio?: string;
  durationMs?: number;
  ready?: (page: Page) => Promise<unknown>;
  radius?: number;
}
export interface Demo {
  capture(options: StepOptions): Promise<void>;
  click(locator: Locator, options: StepOptions): Promise<void>;
  circle(locator: Locator, options: StepOptions): Promise<void>;
  scrollTo(y: number, options: StepOptions): Promise<void>;
  /** Captures endpoints around a real readiness wait; does not record continuous motion. */
  waitFor(ready: (page: Page) => Promise<unknown>, options: StepOptions): Promise<void>;
}
export interface DemoContext { page: Page; demo: Demo; signal: AbortSignal }
export interface AudioProvider {
  id: string;
  version: string;
  options?: Record<string, unknown>;
  /** Write to outputPath or return another local clip. Honor cancellation. */
  synthesize(request: { text: string; options: Record<string, unknown>; outputPath: string; signal: AbortSignal }): Promise<string>;
}
/** Uses the installed Daxur CLI; credentials and provider caching stay in Daxur. */
export function daxurSpeech(options?: {
  voice?: string;
  model?: string;
  /** Executable and prefix args, without a shell. Windows: Node + CLI JS entrypoint. */
  command?: string[];
  timeoutMs?: number;
}): AudioProvider;
export interface DemoDefinition {
  run(context: DemoContext): Promise<void>;
  baseURL?: string;
  viewport?: { width: number; height: number };
  seed?: number;
  actionTimeoutMs?: number;
  narration?: 'off' | 'short' | 'long';
  ready?: (page: Page) => Promise<unknown>;
  webServer?: { command: string[]; url: string; timeoutMs?: number; reuseExistingServer?: boolean };
  audioProvider?: AudioProvider;
}
export function defineDemo(definition: DemoDefinition | DemoDefinition['run']): DemoDefinition;

/** A contiguous piece of source footage. Speech and pointer input require 1x. */
export interface VideoSegment {
  id: string;
  caption?: string;
  /** Footage speed, 1–20; does not change simulation speed. Default 1. */
  speed?: number;
  narration?: string;
  /** Supplied speech path relative to the recipe, taking priority over synthesis. */
  audio?: string;
}
export interface Video {
  /** Run every declared segment once, in order. Always await this call. */
  segment(id: string, run: () => Promise<unknown>): Promise<void>;
  /** Glide to a visible main-frame control, verify its hit target, then press. */
  click(locator: Locator): Promise<void>;
  /** Glide to a viewport point then press, e.g. a projected scene target. */
  clickAt(x: number, y: number): Promise<void>;
  moveTo(x: number, y: number): Promise<void>;
  /** Authored presentation time, not an application readiness condition. */
  hold(milliseconds: number): Promise<void>;
}
export interface VideoContext { page: Page; video: Video; signal: AbortSignal }
export interface VideoDefinition extends Omit<DemoDefinition, 'run' | 'seed'> {
  run(context: VideoContext): Promise<void>;
  /** Navigate and prepare the app before capture; navigation during capture is unsupported. */
  ready: (page: Page) => Promise<unknown>;
  /** Predeclared in playback order so speech resolves before recording begins. */
  segments: VideoSegment[];
  /** Maximum source sample rate, 1–30. Default 15; capture may deliver fewer frames. */
  captureFps?: number;
  pointer?: { x: number; y: number };
  /** Optional Chromium launch settings for a game needing installed Chrome/WebGPU. Always headless. */
  browser?: { channel?: string; args?: string[] };
}
/** Continuous browser-page capture, separate from screenshot reconstruction. */
export function defineVideo(definition: VideoDefinition): VideoDefinition & { mode: 'continuous-browser-page' };
