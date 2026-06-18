// Shared manifest types — used by both capture backends and the replay player.
// Phase 1 scope: 'click' | 'navigate' | 'circle' action types only.
// Phase 2 will add: 'scroll' | 'drag' | animation-burst frames.

export interface CursorPoint {
  x: number;
  y: number;
  timestamp: number; // ms since capture start
}

export type ActionType = 'click' | 'navigate' | 'circle';

interface BaseEvent {
  id: string;
  type: ActionType;
  timestamp: number; // ms since capture start
  cursor: CursorPoint;
  /**
   * Relative path into the screenshots/ folder for the frame at this event.
   * Always a `.jpg` file — frames are compressed with sharp (mozjpeg, quality 80),
   * the same settings Daxur-Daemon's `media compress` command uses. See ADR-003.
   */
  screenshotRef: string;
}

export interface ClickAction extends BaseEvent {
  type: 'click';
  /** CSS selector or coordinate fallback for the clicked target. */
  target: string;
}

export interface NavigateAction extends BaseEvent {
  type: 'navigate';
  url: string;
}

/**
 * Cursor draws a small circling/orbiting motion around a target,
 * the way a person gestures to draw attention to something.
 * Distinct action type — not inferred from cursor path.
 */
export interface CircleAction extends BaseEvent {
  type: 'circle';
  /** CSS selector or coordinates of the element being circled. */
  target: string;
  /** Radius of the circling motion, in px. */
  radius: number;
  /** Duration of the circling motion, in ms. */
  duration: number;
}

export type ManifestEvent = ClickAction | NavigateAction | CircleAction;

export interface Manifest {
  version: string;
  capturedAt: string; // ISO timestamp
  /** Which capture backend produced this manifest. */
  backend: 'chrome-mcp' | 'playwright';
  viewport: {
    width: number;
    height: number;
  };
  events: ManifestEvent[];
}
