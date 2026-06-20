// Shared manifest types — used by both capture backends and the replay player.
// Phase 1 scope was 'click' | 'navigate' | 'circle' only; 'scroll' has since
// been added (see ScrollAction below) specifically to fix a real replay bug:
// without it, a captured scroll had no manifest representation at all, so
// the next click's cursor glide showed the *pre-scroll* screenshot while
// aiming at *post-scroll* coordinates — the click visually landed on the
// wrong part of the screen. 'drag' and animation-burst frames remain
// unimplemented (Phase 2).

export interface CursorPoint {
  x: number;
  y: number;
  timestamp: number; // ms since capture start
}

export type ActionType = 'click' | 'navigate' | 'circle' | 'scroll' | 'asyncWait';

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
  /**
   * Optional narration text for this step, in a concise and a detailed
   * flavor. Either or both may be present. Converted to audio by
   * `scripts/generate-narration.mjs` via Daxur-Daemon's local Chatterbox TTS
   * server — see ADR-004 and docs/roadmap.md.
   */
  narrationShort?: string;
  narrationLong?: string;
  /**
   * Relative path (alongside the manifest, e.g. `narration/click-2-short.ogg`)
   * to the pre-generated audio for `narrationShort`/`narrationLong`. Always a
   * `.ogg` file (Ogg-encapsulated Opus) — Chatterbox's OpenAI-compatible
   * endpoint encodes directly to Opus server-side (`response_format: 'opus'`),
   * no separate transcode step. See ADR-008. Filled in by
   * `scripts/generate-narration.mjs`; absent until that script has run.
   */
  narrationAudioShort?: string;
  narrationAudioLong?: string;
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
 * Records a scroll that happened before the *next* event. Deliberately not
 * "what the scroll motion looked like" (no intermediate frames) — its job is
 * narrower: capture the page's post-scroll state (screenshot + the upcoming
 * target's coordinates as `cursor`) as a single checkpoint, so the replay
 * can snap straight to it instead of gliding the cursor across a stale
 * pre-scroll screenshot toward post-scroll coordinates (see ScrollAction's
 * handling in replay-player.component.ts's buildTimeline()).
 */
export interface ScrollAction extends BaseEvent {
  type: 'scroll';
  /** Page's scrollY (px) immediately after the scroll, for debugging/reference only. */
  scrollY: number;
  /**
   * Optional ordered sequence of screenshots sampled evenly across the
   * scroll, from just after it starts to the final post-scroll state
   * (inclusive) — lets the replay animate smoothly through the scroll
   * instead of snapping. `screenshotRef` (inherited from BaseEvent) always
   * stays the *last* element of this array (the representative/fallback
   * frame), so anything reading just `screenshotRef` — including older
   * single-snap manifests, where `frames` is simply absent — keeps working
   * unchanged. See "scroll showcase" in docs/roadmap.md for the agreed
   * design language (oversample/downsample to evenly-spaced frames,
   * animate like the circle-gesture orbit); `scrollToAndRecord()` in
   * capture-demo.ts takes the simpler route of resolving the page's real,
   * clamped scroll target first and then setting `frames.length` evenly-
   * spaced *absolute* scrollY positions, instead of oversampling, since the
   * capture script fully controls scroll timing here (no real-world
   * duration to guess at, unlike asyncWait) — see that function's doc
   * comment for why absolute positions, not relative wheel deltas, turned
   * out to matter.
   */
  frames?: string[];
  /**
   * Optional explicit total duration (ms) the replay should spend
   * animating through `frames` — set via `scrollToAndRecord()`'s
   * `opts.durationMs` in capture-demo.ts (e.g. 12 frames over 750ms).
   * Ignored when `frames` is absent. When `frames` is present but this is
   * omitted, replay-player.component.ts's buildTimeline() falls back to
   * its own frame-count-based default duration instead.
   */
  frameDurationMs?: number;
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

/**
 * Records a long real-world wait (e.g. a ~40s network/processing action)
 * during which the page is mostly static except for some small moving
 * element (loading spinner/progress bar) — see "asyncWait" in
 * docs/roadmap.md.
 *
 * As of ADR-010, this is **plain full-screen frame sampling**, the same
 * shape as ScrollAction.frames — not region-cropped/composited. An earlier
 * version of this type (see ADR-010's "what changed" section, and the
 * now-historical write-up in docs/open-questions.md's "Element-region
 * screenshot compositing" entry) captured one full-screen backdrop plus
 * small cropped `frames` layered on top at a cached `regionRect` position,
 * to save bytes for the live in-browser player. That mechanism is removed:
 * video export (ADR-009) is now the primary deliverable, the live player is
 * an internal debug tool only, and region-cropping was solving an
 * asset-size problem that stopped mattering once video became the target —
 * h265 inter-frame compression already handles "mostly static + one small
 * moving region" content well on its own, and full-frame sampling also
 * makes the region/base layout-shift drift bug ADR-010 describes
 * structurally impossible (every frame is a complete, coherent screenshot,
 * never a stale base + crop composite).
 *
 * `frames` is oversampled continuously during the real wait, then
 * downsampled to an evenly-spaced, capped count once the real duration is
 * known (see ASYNC_REGION_MAX_FRAMES in capture-demo.ts) — same "oversample
 * then downsample" technique as before, just over full screenshots instead
 * of crops.
 */
export interface AsyncWaitAction extends BaseEvent {
  type: 'asyncWait';
  /** CSS selector for the element whose change motivated this wait, for debugging/reference only. */
  target: string;
  /**
   * Ordered sequence of full-screen screenshots sampled across the real
   * wait, oversampled then downsampled to an evenly-spaced, capped count
   * (see ASYNC_REGION_MAX_FRAMES in capture-demo.ts) — last element is
   * always the final/representative frame, captured right at the idle
   * transition.
   */
  frames: string[];
  /**
   * Real wall-clock duration (ms) of the actual wait. Informational only —
   * NOT used for replay timing (that's `frameDurationMs`). Kept so a real
   * capture's manifest documents how much dead air this event compressed.
   */
  realDurationMs: number;
  /**
   * Compressed replay duration (ms) the player should spend cycling through
   * `frames` before holding on the last one — the actual time-compression
   * mechanism. Unlike ScrollAction.frameDurationMs this is required, not
   * optional: there's no sane frame-count-based default duration for a real
   * wait that could be anywhere from a few seconds to over a minute.
   */
  frameDurationMs: number;
}

export type ManifestEvent = ClickAction | NavigateAction | CircleAction | ScrollAction | AsyncWaitAction;

export interface Manifest {
  version: string;
  capturedAt: string; // ISO timestamp
  /** Which capture backend produced this manifest. */
  backend: 'chrome-mcp' | 'playwright';
  viewport: {
    width: number;
    height: number;
  };
  /**
   * Seeds the small deterministic PRNG (mulberry32 — see ADR-004) used to add
   * natural-looking imperfections to cursor movement (bezier control-point
   * wobble, circle-gesture radius/angle wobble) without affecting where the
   * cursor actually ends up. Same seed + same manifest always replays with
   * the same wobble. Optional — defaults to 0 if omitted.
   */
  seed?: number;
  events: ManifestEvent[];
}
