import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import type { Manifest } from '@shared/manifest-types';

// Stop-Motion UI — Replay player, Angular port.
//
// This is a structural relocation of replay/player.js into an Angular
// component — the bezier/easing/circle-orbit math is unchanged from the
// original plain-JS version (see replay/player.js for the source of truth
// this was ported from). Canvas drawing stays imperative, same as before;
// signals just drive the surrounding template (status text, button label,
// scrub bar) under zoneless change detection.

const TAIL_PAUSE_MS = 600; // hold on the final frame briefly before the timeline ends
const RIPPLE_MS = 420; // click-feedback ripple duration
const CIRCLE_LOOPS = 1.6; // how many times the cursor orbits during a 'circle' gesture

// Default move-phase duration band — used instead of the *raw* real-world
// gap between two captured events whenever there's no narration audio long
// enough to need that real gap honored. Two real problems this fixes, both
// surfaced by the kitchen-sink fixture (see docs/roadmap.md's `asyncWait`
// entry): (1) a long real wait (e.g. the kitchen-sink page's ~40s async
// action) used to become ~40s of literal dead air on replay — now capped at
// MOVE_MAX_MS; (2) two clicks captured back-to-back in real time (e.g. the
// dialog's open click immediately followed by its close click) used to play
// back as a near-instant, flickery jump-cut — now floored at MOVE_MIN_MS so
// every step gets at least a perceptible hold. This is a default *estimate*,
// not the full `asyncWait` proposal from the roadmap (which is about
// sampling real frames within a long wait) — it's the smaller, narration-
// agnostic fix for "don't show literal real-time," applied unconditionally
// to every move phase's natural (un-narrated) duration.
const MOVE_MIN_MS = 500; // floor — every step reads as an intentional pause, not a snap-cut
const MOVE_MAX_MS = 2200; // ceiling — long real-world gaps compress to a normal-feeling cursor move

// Hold duration for an *animated* scroll (manifest event has a `frames`
// array — see ScrollAction in shared/manifest-types.ts and the "scroll
// showcase" entry in docs/roadmap.md) — cycles through `frames.length`
// screenshots instead of gliding straight to one, so it needs noticeably
// more time on screen than a plain move to read as a smooth scroll rather
// than a flicker. Scales with frame count (more frames implies a longer
// real scroll worth showing more of), clamped to a sensible band either way.
const SCROLL_ANIM_MS_PER_FRAME = 40;
const SCROLL_ANIM_MIN_MS = 500;
const SCROLL_ANIM_MAX_MS = 1800;

// Sanity-clamp band for an *explicit* `ScrollAction.frameDurationMs` (set via
// scrollToAndRecord()'s `opts.durationMs` in capture-demo.ts — e.g. "12
// frames over 750ms"). Deliberately wider than SCROLL_ANIM_MIN_MS/MAX_MS
// above, since a caller asking for an explicit duration is making a real
// creative choice, not relying on the frame-count-based default — this just
// guards against a stray 0 or absurdly large value in the manifest.
const SCROLL_ANIM_EXPLICIT_MIN_MS = 100;
const SCROLL_ANIM_EXPLICIT_MAX_MS = 10000;

// Estimated narration duration, used when a step has narration *text*
// (`narrationShort`/`narrationLong`) but no real TTS audio has been
// generated for it yet (`narrationAudioShort`/`narrationAudioLong` absent,
// or the file failed to load). Lets playback pace itself as if the eventual
// clip were already there — "whichever is longer, the UI action or the
// narration" — instead of silently ignoring narration timing whenever audio
// happens to be missing. Once a real clip exists for a step, its actual
// duration always wins over this estimate (see loadScenario()).
const ESTIMATED_NARRATION_WPM = 165; // average conversational TTS pace
const ESTIMATED_NARRATION_MIN_MS = 900; // floor so even a short phrase reads as a deliberate beat

function estimateNarrationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = (words / ESTIMATED_NARRATION_WPM) * 60_000;
  return Math.max(ESTIMATED_NARRATION_MIN_MS, ms);
}

// Wobble tuning (see ADR-004) — kept small so the cursor still reads as
// precise/intentional, just not laser-straight. Mirrors replay/player.js.
const MOVE_WOBBLE_MAX_PX = 22; // extra control-point jitter on top of the deterministic arc offset
const CIRCLE_RADIUS_WOBBLE_FRAC = 0.08; // +/- 8% of radius
const CIRCLE_ANGLE_WOBBLE_RAD = 0.12; // +/- ~7 degrees, eased to 0 at both ends

type MoveJitter = { angle: number; mag: number };
type CircleJitter = {
  radiusAmp: number;
  radiusFreq: number;
  radiusPhase: number;
  angleAmp: number;
  angleFreq: number;
  anglePhase: number;
};

type NarrationInfo = { ms: number; el: HTMLAudioElement | null };

type ShowPhase = {
  kind: 'show';
  t0: number;
  t1: number;
  x: number;
  y: number;
  screenshot: string;
  narration?: HTMLAudioElement | null;
};
type MovePhase = {
  kind: 'move';
  t0: number;
  t1: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  screenshot: string;
  jitter: MoveJitter;
  narration?: HTMLAudioElement | null;
};
type CirclePhase = {
  kind: 'circle';
  t0: number;
  t1: number;
  center: { x: number; y: number };
  radius: number;
  screenshot: string;
  jitter: CircleJitter;
  narration?: HTMLAudioElement | null;
};
// Animated scroll — cycles through an ordered sequence of screenshots over
// the phase's duration while the cursor stays parked at `x`/`y` (the
// upcoming target's post-scroll position) — the moving background already
// conveys the scroll, so animating the cursor on top of it too would be
// redundant. Non-animated scrolls don't get this phase kind at all anymore;
// see buildTimeline()'s 'scroll' handling, which gives them a regular
// MovePhase instead (rendered over the post-scroll screenshot). See
// sampleAt()'s 'scroll' branch for this phase's frame-selection math.
type ScrollPhase = {
  kind: 'scroll';
  t0: number;
  t1: number;
  x: number;
  y: number;
  frames: string[];
  narration?: HTMLAudioElement | null;
};
type Phase = ShowPhase | MovePhase | CirclePhase | ScrollPhase;

type Sample = {
  x: number;
  y: number;
  screenshot: string;
  orbit: { center: { x: number; y: number }; radius: number; frac: number } | null;
};

interface Timeline {
  phases: Phase[];
  totalDuration: number;
  baseDir: string;
}

@Component({
  selector: 'app-replay-player',
  standalone: true,
  templateUrl: './replay-player.component.html',
  styleUrl: './replay-player.component.scss',
})
export class ReplayPlayerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('stage', { static: true }) private stageRef!: ElementRef<HTMLCanvasElement>;

  // Exposed to the template for the [max] binding.
  readonly Math = Math;

  readonly scenario = signal('scenario-1');
  readonly status = signal('Loading…');
  readonly isPlaying = signal(false);
  readonly currentTimeMs = signal(0);
  readonly totalDurationMs = signal(0);
  readonly speed = signal(1);
  readonly ready = signal(false);
  readonly timeLabel = signal('0.0s / 0.0s');
  readonly narrationMode = signal<'off' | 'short' | 'long'>('off');

  private ctx!: CanvasRenderingContext2D;
  private timeline: Timeline | null = null;
  private images = new Map<string, HTMLImageElement>();

  private lastFrameTs: number | null = null;
  private isScrubbing = false;
  private rafHandle: number | null = null;
  private lastPhaseIndex = -1; // tracks which phase's narration audio we've already triggered
  private readonly activeNarrationAudio = new Set<HTMLAudioElement>();

  ngAfterViewInit(): void {
    const canvas = this.stageRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    const initial = this.initialScenarioFromUrl();
    this.scenario.set(initial);
    this.loadScenario(initial);

    this.rafHandle = requestAnimationFrame(this.tick);
  }

  ngOnDestroy(): void {
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.stopAllNarration();
  }

  // ---------- math helpers (unchanged from replay/player.js) ----------

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * mulberry32 — tiny deterministic PRNG (see ADR-004). Returns a function
   * that yields floats in [0, 1) on each call, fully determined by `seed`.
   * Chosen over Math.random() specifically because demos must be
   * reproducible: same manifest + same seed => same "natural" wobble every
   * time it's replayed. Byte-for-byte port of replay/player.js's mulberry32.
   */
  private mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Quadratic bezier point at fraction t. */
  private quadBezier(
    p0: { x: number; y: number },
    c: { x: number; y: number },
    p1: { x: number; y: number },
    t: number
  ): { x: number; y: number } {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
    };
  }

  /**
   * Deterministic perpendicular offset for a from->to move, so the cursor
   * arcs naturally instead of cutting a straight line. Direction/magnitude
   * are derived from the segment's own start time so repeated plays of the
   * same manifest always produce the same curve (and different segments
   * don't all bow the same way).
   */
  private controlPointFor(
    from: { x: number; y: number },
    to: { x: number; y: number },
    seedTime: number,
    jitter?: MoveJitter
  ): { x: number; y: number } {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return { x: mx, y: my };

    // unit perpendicular
    const px = -dy / dist;
    const py = dx / dist;

    const sign = Math.floor(seedTime / 137) % 2 === 0 ? 1 : -1;
    const magnitude = this.clamp(dist * 0.18, 12, 90) * sign;

    let x = mx + px * magnitude;
    let y = my + py * magnitude;

    // Seeded "human" imperfection: a small extra offset on the control
    // point only. Bezier endpoints are always exactly `from`/`to` regardless
    // of the control point, so this never affects where the cursor actually
    // lands — only the shape of the arc on the way there.
    if (jitter) {
      x += Math.cos(jitter.angle) * jitter.mag;
      y += Math.sin(jitter.angle) * jitter.mag;
    }

    return { x, y };
  }

  /**
   * Seeded radius/angle wobble for a 'circle' phase, eased to exactly 0 at
   * both frac=0 and frac=1 (via a sin(frac*PI) envelope) so the gesture
   * still starts and ends precisely on the nominal circle — only the path
   * in between wobbles.
   */
  private circleWobble(jitter: CircleJitter | undefined, frac: number): { radiusMul: number; angleOffset: number } {
    if (!jitter) return { radiusMul: 1, angleOffset: 0 };
    const envelope = Math.sin(this.clamp(frac, 0, 1) * Math.PI);
    const radiusMul =
      1 + Math.sin(frac * jitter.radiusFreq * Math.PI * 2 + jitter.radiusPhase) * jitter.radiusAmp * envelope;
    const angleOffset =
      Math.sin(frac * jitter.angleFreq * Math.PI * 2 + jitter.anglePhase) * jitter.angleAmp * envelope;
    return { radiusMul, angleOffset };
  }

  // ---------- timeline construction ----------

  /**
   * Builds a flat list of "phases" covering the whole manifest:
   *   { kind: 'move',   t0, t1, from, to, screenshot, jitter }
   *   { kind: 'circle', t0, t1, center, radius, screenshot, jitter }
   *   { kind: 'show',   t0, t1, x, y, screenshot, narration? }   // static hold (start/end/narration catch-up)
   *   { kind: 'scroll', t0, t1, x, y, frames }                   // cycles backgrounds, cursor static — opt-in animated scroll
   *
   * The screenshot on a phase is whatever should be on-screen for the
   * *duration* of that phase. A new screenshot only becomes visible once its
   * owning event's timestamp is reached.
   *
   * Each move phase's own (un-narrated) duration is a default estimate
   * clamped to [MOVE_MIN_MS, MOVE_MAX_MS] — never the raw real-world gap
   * between two captured events' timestamps. Real captures range from
   * near-zero gaps (e.g. two clicks captured back-to-back, like a dialog's
   * open immediately followed by its close) to tens of seconds (e.g. a long
   * async wait) — neither extreme plays back well as literal real time, so
   * both get pulled into a normal-feeling band by default. This is distinct
   * from the narration-driven stretch below, which DOES use a real (audio
   * clip) duration when one exists.
   *
   * `getNarration(ev)`, if provided, returns `{ ms, el }` (or null) for an
   * event: `ms` is that narration clip's raw duration in milliseconds (used
   * to decide whether to stretch the step), `el` is the <audio> element to
   * play when the step starts (or null if no audio is loaded for it yet).
   * Per the timing rule in docs/roadmap.md: a step's hold time is whichever
   * is LONGER of its visual action duration or its narration duration — if
   * narration runs long, an extra 'show' phase is appended right after the
   * step's own phase(s) to make up the difference, before the next step's
   * move begins.
   *
   * `'scroll'`-type events (see shared/manifest-types.ts's ScrollAction) do
   * still get a 'move' phase like any other step, but — unlike the default
   * case — it renders over the event's own (POST-scroll) screenshot rather
   * than the previous step's (PRE-scroll) one. Gliding across the
   * pre-scroll screenshot toward post-scroll coordinates was the original
   * click-misalignment bug this action type exists to fix; cutting straight
   * to a parked, ungliding snap was an earlier fix for that, but it
   * introduced a new problem — the cursor would visibly teleport with no
   * motion in between whenever a scroll preceded the next interaction.
   * Gliding over the already-correct post-scroll background avoids both.
   *
   * Otherwise a byte-for-byte port of replay/player.js's buildTimeline.
   */
  private buildTimeline(
    manifest: Manifest,
    getNarration?: (ev: Manifest['events'][number]) => NarrationInfo | null
  ): { phases: Phase[]; totalDuration: number } {
    const events = manifest.events;
    if (!events || events.length === 0) {
      return { phases: [], totalDuration: 0 };
    }
    const narrationFor = getNarration || (() => null);
    const rng = this.mulberry32((manifest.seed ?? 0) | 0 || 0);

    const moveJitter = (): MoveJitter => ({ angle: rng() * Math.PI * 2, mag: rng() * MOVE_WOBBLE_MAX_PX });
    const circleJitter = (): CircleJitter => ({
      radiusAmp: CIRCLE_RADIUS_WOBBLE_FRAC * (0.5 + rng() * 0.5),
      radiusFreq: 2 + Math.floor(rng() * 2), // 2-3 wobble cycles across the gesture
      radiusPhase: rng() * Math.PI * 2,
      angleAmp: CIRCLE_ANGLE_WOBBLE_RAD * (0.5 + rng() * 0.5),
      angleFreq: 2 + Math.floor(rng() * 2),
      anglePhase: rng() * Math.PI * 2,
    });

    const phases: Phase[] = [];
    const first = events[0];

    // Hold on the very first frame from t=0 until the first event's own
    // timestamp (covers manifests where event[0].timestamp > 0). Stretched
    // if event[0] carries narration that runs longer than that natural gap.
    const firstNarration = narrationFor(first);
    const firstHoldEnd = Math.max(first.timestamp, firstNarration ? firstNarration.ms : 0);
    phases.push({
      kind: 'show',
      t0: 0,
      t1: firstHoldEnd,
      x: first.cursor.x,
      y: first.cursor.y,
      screenshot: first.screenshotRef,
      narration: firstNarration ? firstNarration.el : null,
    });

    // `prev.t` is *playback* time (stretched so far); `prevManifestEnd` is
    // the raw manifest-time end of the previous step (its timestamp, plus
    // its own duration if it was a circle) — used only to compute each new
    // step's natural, un-stretched visual duration.
    let prev = {
      x: first.cursor.x,
      y: first.cursor.y,
      t: firstHoldEnd,
      screenshot: first.screenshotRef,
    };
    let prevManifestEnd = first.type === 'circle' ? first.timestamp + first.duration : first.timestamp;

    for (let i = 1; i < events.length; i++) {
      const ev = events[i];
      let visualDuration = 0;
      let movePhaseRef: MovePhase | null = null;
      let circlePhaseRef: CirclePhase | null = null;
      let scrollPhaseRef: ScrollPhase | null = null;

      if (ev.type === 'scroll' && ev.frames && ev.frames.length > 1) {
        // Animated scroll (opted in at capture time — see scrollToAndRecord()
        // in capture-demo.ts and ScrollAction's `frames` field in
        // shared/manifest-types.ts) — the cursor stays parked at its
        // post-scroll position for this phase (unlike the non-animated
        // 'scroll' case below, which now glides the cursor), because the
        // *background* itself cycles through `ev.frames` to convey the
        // scroll motion — animating the cursor on top of an already-moving
        // background would be redundant motion, not a fix for anything. See
        // sampleAt()'s 'scroll' branch for how a given playback time picks a
        // frame index.
        //
        // `ev.frameDurationMs` (set via scrollToAndRecord()'s
        // `opts.durationMs` in capture-demo.ts) lets a capture call site
        // pin the exact replay duration (e.g. "12 frames over 750ms")
        // instead of leaving it to the frame-count-based default below —
        // still sanity-clamped so a stray manifest value can't produce a
        // zero-length or runaway-long hold. Falls back to the existing
        // frame-count estimate when omitted, so older/duration-less
        // manifests animate exactly as before this option existed.
        const animDuration = ev.frameDurationMs
          ? this.clamp(ev.frameDurationMs, SCROLL_ANIM_EXPLICIT_MIN_MS, SCROLL_ANIM_EXPLICIT_MAX_MS)
          : this.clamp(
              ev.frames.length * SCROLL_ANIM_MS_PER_FRAME,
              SCROLL_ANIM_MIN_MS,
              SCROLL_ANIM_MAX_MS
            );
        const animEnd = prev.t + animDuration;
        scrollPhaseRef = {
          kind: 'scroll',
          t0: prev.t,
          t1: animEnd,
          x: ev.cursor.x,
          y: ev.cursor.y,
          frames: ev.frames,
        };
        phases.push(scrollPhaseRef);
        prev = { x: ev.cursor.x, y: ev.cursor.y, t: animEnd, screenshot: ev.screenshotRef };
        visualDuration += animDuration;
        prevManifestEnd = ev.timestamp;
      } else if (ev.type === 'scroll') {
        // A 'scroll' event's `cursor`/`screenshotRef` are already the
        // *post-scroll* state (see ScrollAction's doc comment in
        // shared/manifest-types.ts and scrollToAndRecord() in
        // capture-demo.ts). Gliding the cursor across the *pre-scroll*
        // screenshot toward post-scroll coordinates was the original
        // click-misalignment bug (cursor visually arriving before the page
        // had visually caught up). The first fix for that avoided gliding
        // altogether — an instant cut straight to the post-scroll
        // background with the cursor pre-parked at its destination — but
        // that traded the misalignment bug for a new one: the cursor
        // teleports with zero visible motion every time a scroll precedes
        // the next interaction (reported: cursor jumping straight from one
        // step to the next, e.g. an async-result callout straight to a
        // dialog-open click, with nothing in between). Since the
        // post-scroll screenshot is already *correct, current* content,
        // there's no reason not to glide across it — same 'move' machinery
        // as the default case below, just with the post-scroll screenshot
        // as the background instead of the pre-scroll one. Gets both: no
        // stale content, and a real, visible cursor move instead of a snap.
        const rawGap = ev.timestamp - prevManifestEnd;
        const moveDur = this.clamp(Math.max(rawGap, 0), MOVE_MIN_MS, MOVE_MAX_MS);
        movePhaseRef = {
          kind: 'move',
          t0: prev.t,
          t1: prev.t + moveDur,
          from: { x: prev.x, y: prev.y },
          to: { x: ev.cursor.x, y: ev.cursor.y },
          screenshot: ev.screenshotRef,
          jitter: moveJitter(),
        };
        phases.push(movePhaseRef);
        prev = { x: ev.cursor.x, y: ev.cursor.y, t: prev.t + moveDur, screenshot: ev.screenshotRef };
        visualDuration += moveDur;
        prevManifestEnd = ev.timestamp;
      } else {
        // Glide from wherever we ended up to this event's cursor point, while
        // showing whatever screenshot was current *before* this event landed.
        // Duration is a default estimate clamped to [MOVE_MIN_MS, MOVE_MAX_MS]
        // — NOT the raw real-world gap — so a long real wait doesn't become
        // long dead air and two clicks captured back-to-back don't become an
        // instant flicker. If this step's narration needs more room than
        // MOVE_MAX_MS gives it, the "extra" hold phase below still extends
        // playback to the real narration length; this clamp only governs the
        // step's own un-narrated visual pacing.
        const rawGap = ev.timestamp - prevManifestEnd;
        // Always >= MOVE_MIN_MS (even when rawGap is 0 or negative), so two
        // events captured at the exact same instant still get a perceptible
        // step instead of a zero-length one.
        const moveDur = this.clamp(Math.max(rawGap, 0), MOVE_MIN_MS, MOVE_MAX_MS);
        if (moveDur > 0) {
          movePhaseRef = {
            kind: 'move',
            t0: prev.t,
            t1: prev.t + moveDur,
            from: { x: prev.x, y: prev.y },
            to: { x: ev.cursor.x, y: ev.cursor.y },
            screenshot: prev.screenshot,
            jitter: moveJitter(),
          };
          phases.push(movePhaseRef);
          prev = { x: prev.x, y: prev.y, t: prev.t + moveDur, screenshot: prev.screenshot };
          visualDuration += moveDur;
        }

        if (ev.type === 'circle') {
          const t1 = prev.t + ev.duration;
          circlePhaseRef = {
            kind: 'circle',
            t0: prev.t,
            t1: t1,
            center: { x: ev.cursor.x, y: ev.cursor.y },
            radius: ev.radius,
            screenshot: ev.screenshotRef,
            jitter: circleJitter(),
          };
          phases.push(circlePhaseRef);
          visualDuration += ev.duration;
          prev = { x: ev.cursor.x, y: ev.cursor.y, t: t1, screenshot: ev.screenshotRef };
          prevManifestEnd = ev.timestamp + ev.duration;
        } else {
          prev = { x: ev.cursor.x, y: ev.cursor.y, t: prev.t, screenshot: ev.screenshotRef };
          prevManifestEnd = ev.timestamp;
        }
      }

      // If this step's narration runs longer than its visual action, hold
      // on the arrived-at frame for the difference before moving on.
      const narration = narrationFor(ev);
      const narrationMs = narration ? narration.ms : 0;
      const extra = Math.max(0, narrationMs - visualDuration);

      // Trigger narration at whichever phase starts this step (move — which
      // now also covers non-animated scrolls — else circle, else the
      // animated-scroll phase, else — if the step has no visual duration at
      // all — the extra hold phase below).
      const narrationOwner = movePhaseRef || circlePhaseRef || scrollPhaseRef;
      if (narration && narration.el && narrationOwner) {
        narrationOwner.narration = narration.el;
      }

      if (extra > 0) {
        phases.push({
          kind: 'show',
          t0: prev.t,
          t1: prev.t + extra,
          x: prev.x,
          y: prev.y,
          screenshot: prev.screenshot,
          narration: narrationOwner ? null : narration ? narration.el : null,
        });
        prev = { x: prev.x, y: prev.y, t: prev.t + extra, screenshot: prev.screenshot };
      }
    }

    // Tail hold so playback doesn't snap to black the instant the last
    // action lands.
    phases.push({
      kind: 'show',
      t0: prev.t,
      t1: prev.t + TAIL_PAUSE_MS,
      x: prev.x,
      y: prev.y,
      screenshot: prev.screenshot,
    });

    const totalDuration = prev.t + TAIL_PAUSE_MS;
    return { phases, totalDuration };
  }

  private findPhaseIndex(phases: Phase[], t: number): number {
    for (let i = 0; i < phases.length; i++) {
      if (t < phases[i].t1 || i === phases.length - 1) return i;
    }
    return phases.length - 1;
  }

  private findPhase(phases: Phase[], t: number): Phase {
    return phases[this.findPhaseIndex(phases, t)];
  }

  /** Resolves cursor {x,y} and the active screenshot path for time t. */
  private sampleAt(phases: Phase[], t: number): Sample {
    const phase = this.findPhase(phases, t);
    const span = Math.max(1, phase.t1 - phase.t0);
    const frac = this.clamp((t - phase.t0) / span, 0, 1);

    if (phase.kind === 'show') {
      return { x: phase.x, y: phase.y, screenshot: phase.screenshot, orbit: null };
    }

    if (phase.kind === 'move') {
      const eased = this.easeInOutCubic(frac);
      const control = this.controlPointFor(phase.from, phase.to, phase.t0, phase.jitter);
      const pos = this.quadBezier(phase.from, control, phase.to, eased);
      return { x: pos.x, y: pos.y, screenshot: phase.screenshot, orbit: null };
    }

    if (phase.kind === 'scroll') {
      // Cursor stays parked (no glide — see ScrollPhase's doc comment);
      // only the background cycles through `frames` as frac advances.
      // `frac === 1` (the very end of the phase) intentionally lands on
      // the last frame, the same final post-scroll state `screenshotRef`
      // already pointed to before animation existed.
      const index = Math.min(phase.frames.length - 1, Math.floor(frac * phase.frames.length));
      return { x: phase.x, y: phase.y, screenshot: phase.frames[index], orbit: null };
    }

    // circle
    // Ease the angular speed in/out so the orbit doesn't snap to full
    // speed instantly — accelerate into the gesture, decelerate out.
    const eased = this.easeInOutCubic(frac);
    const wobble = this.circleWobble(phase.jitter, frac);
    const angle = -Math.PI / 2 + eased * Math.PI * 2 * CIRCLE_LOOPS + wobble.angleOffset;
    const radius = phase.radius * wobble.radiusMul;
    const x = phase.center.x + Math.cos(angle) * radius;
    const y = phase.center.y + Math.sin(angle) * radius;
    return {
      x,
      y,
      screenshot: phase.screenshot,
      orbit: { center: phase.center, radius: phase.radius, frac },
    };
  }

  // ---------- asset loading ----------

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image: ' + src));
      img.src = src;
    });
  }

  /**
   * Loads an <audio> element far enough to know its duration (metadata
   * load), without necessarily downloading the whole file. Resolves to null
   * (rather than rejecting) on error so a single missing/broken narration
   * clip doesn't block the rest of the scenario from loading — narration is
   * an enhancement, not a hard requirement for playback.
   */
  private loadAudioMeta(src: string): Promise<HTMLAudioElement | null> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('loadedmetadata', () => resolve(audio), { once: true });
      audio.addEventListener('error', () => resolve(null), { once: true });
      audio.src = src;
    });
  }

  private stopAllNarration(): void {
    for (const el of this.activeNarrationAudio) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // ignore — element may already be detached/broken
      }
    }
    this.activeNarrationAudio.clear();
  }

  private pauseAllNarration(): void {
    for (const el of this.activeNarrationAudio) {
      try {
        el.pause();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Plays a step's narration audio at the same rate as visual playback, so
   * a 2x-speed replay also sounds 2x faster (simple playbackRate change —
   * pitch will rise/fall with it; not pitch-corrected, see ADR-004 for why
   * that's an acceptable tradeoff here).
   */
  private playNarration(el: HTMLAudioElement | null | undefined): void {
    if (!el) return;
    try {
      el.currentTime = 0;
      el.playbackRate = this.clamp(this.speed(), 0.25, 4);
      this.activeNarrationAudio.add(el);
      el.addEventListener('ended', () => this.activeNarrationAudio.delete(el), { once: true });
      const playResult = el.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => this.activeNarrationAudio.delete(el));
      }
    } catch {
      this.activeNarrationAudio.delete(el);
    }
  }

  /** Fires narration for every phase between (lastPhaseIndex, newIndex], in order, moving forward only. */
  private advanceNarration(newIndex: number): void {
    if (!this.timeline) return;
    if (newIndex > this.lastPhaseIndex) {
      for (let i = Math.max(this.lastPhaseIndex + 1, 0); i <= newIndex; i++) {
        const phase = this.timeline.phases[i];
        if (phase && phase.narration) this.playNarration(phase.narration);
      }
    }
    this.lastPhaseIndex = newIndex;
  }

  private async loadScenario(scenarioId: string): Promise<void> {
    this.isPlaying.set(false);
    this.ready.set(false);
    this.stopAllNarration();
    this.status.set('Loading manifest for ' + scenarioId + '…');

    const baseDir = 'test-scenarios/' + scenarioId + '/';
    let manifest: Manifest;
    try {
      const res = await fetch(baseDir + 'manifest.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      manifest = await res.json();
    } catch (err) {
      this.status.set(
        'Could not load manifest.json (' +
          (err instanceof Error ? err.message : String(err)) +
          '). Make sure test-scenarios/ was copied into replay-app/public/.'
      );
      return;
    }

    const canvas = this.stageRef.nativeElement;
    canvas.width = manifest.viewport.width;
    canvas.height = manifest.viewport.height;

    // Preload narration audio (if any, and if a narration mode other than
    // 'off' is selected) so buildTimeline() can know each clip's duration
    // up front — needed to decide whether a step's hold time must stretch.
    //
    // A real audio clip's duration always wins when one loads successfully.
    // When it doesn't (not generated yet, or failed to load) but the step
    // still has narration *text* for this mode, fall back to a
    // words-per-minute estimate (see estimateNarrationMs()) so the timing
    // model still honors "whichever is longer, the UI action or the
    // narration" — just with an estimate standing in for the real clip.
    // `el` stays null for estimated entries since there's nothing to
    // actually play; only the duration affects pacing.
    const narrationMap = new Map<string, NarrationInfo>();
    let estimatedCount = 0;
    const mode = this.narrationMode();
    if (mode !== 'off') {
      this.status.set('Loading narration audio…');
      await Promise.all(
        manifest.events.map(async (ev) => {
          const audioRef = mode === 'long' ? ev.narrationAudioLong : ev.narrationAudioShort;
          const text = mode === 'long' ? ev.narrationLong : ev.narrationShort;
          if (audioRef) {
            const el = await this.loadAudioMeta(baseDir + audioRef);
            if (el) {
              narrationMap.set(ev.id, { ms: el.duration * 1000, el });
              return;
            }
          }
          if (text) {
            narrationMap.set(ev.id, { ms: estimateNarrationMs(text), el: null });
            estimatedCount++;
          }
        })
      );
    }
    const getNarration = (ev: Manifest['events'][number]) => narrationMap.get(ev.id) ?? null;

    const built = this.buildTimeline(manifest, getNarration);
    this.timeline = { ...built, baseDir };

    // Include animated-scroll `frames` alongside each event's own
    // screenshotRef — otherwise an animated scroll's intermediate frames
    // would never get preloaded into `this.images` and sampleAt()'s
    // 'scroll' branch would draw nothing for them.
    const refs = Array.from(
      new Set(
        manifest.events.flatMap((e) =>
          e.type === 'scroll' && e.frames ? [e.screenshotRef, ...e.frames] : [e.screenshotRef]
        )
      )
    );
    this.status.set('Loading ' + refs.length + ' screenshot(s)…');

    this.images = new Map();
    try {
      await Promise.all(
        refs.map(async (ref) => {
          const img = await this.loadImage(baseDir + ref);
          this.images.set(ref, img);
        })
      );
    } catch (err) {
      this.status.set('Error loading screenshots: ' + (err instanceof Error ? err.message : String(err)));
      return;
    }

    this.currentTimeMs.set(0);
    this.lastFrameTs = null;
    this.lastPhaseIndex = -1;
    this.totalDurationMs.set(this.timeline.totalDuration);
    this.ready.set(this.timeline.phases.length > 0);
    const realNarrationCount = narrationMap.size - estimatedCount;
    this.status.set(
      'Ready — ' +
        manifest.events.length +
        ' events, ' +
        Math.round(this.timeline.totalDuration) +
        'ms' +
        (realNarrationCount > 0 ? ', ' + realNarrationCount + ' narration clip(s)' : '') +
        (estimatedCount > 0 ? ', ' + estimatedCount + ' estimated (no audio yet)' : '')
    );
    this.render();
  }

  // ---------- rendering ----------

  private drawCursor(x: number, y: number, sample: Sample): void {
    const ctx = this.ctx;

    // Orbit guide trail for circle gestures, drawn first so the cursor sits
    // on top of it.
    if (sample.orbit) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 210, 70, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(sample.orbit.center.x, sample.orbit.center.y, sample.orbit.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Soft shadow.
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.arc(x + 1.5, y + 2.5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Cursor pointer (simple arrow polygon, screen-style).
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4, 12.5);
    ctx.lineTo(7, 19);
    ctx.lineTo(9.5, 17.7);
    ctx.lineTo(6.7, 11.3);
    ctx.lineTo(11.5, 11.3);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawRipples(phases: Phase[], t: number): void {
    const ctx = this.ctx;
    // A ripple fires for any non-circle, non-initial-show phase boundary
    // we've just crossed (i.e. an arrival), to visually punctuate clicks.
    for (const phase of phases) {
      if (phase.kind !== 'move') continue;
      const arrivalT = phase.t1;
      const age = t - arrivalT;
      if (age >= 0 && age <= RIPPLE_MS) {
        const frac = age / RIPPLE_MS;
        const r = 6 + frac * 22;
        const alpha = 1 - frac;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(120, 200, 255, ' + (alpha * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.arc(phase.to.x, phase.to.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.stageRef.nativeElement;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.timeline || this.timeline.phases.length === 0) return;

    const currentTime = this.currentTimeMs();
    const sample = this.sampleAt(this.timeline.phases, currentTime);
    const img = this.images.get(sample.screenshot);
    if (img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    this.drawRipples(this.timeline.phases, currentTime);
    this.drawCursor(sample.x, sample.y, sample);

    const total = this.timeline.totalDuration;
    this.timeLabel.set((currentTime / 1000).toFixed(1) + 's / ' + (total / 1000).toFixed(1) + 's');
  }

  // ---------- playback loop ----------

  private tick = (now: number): void => {
    if (this.isPlaying() && this.timeline) {
      if (this.lastFrameTs != null) {
        const next = this.currentTimeMs() + (now - this.lastFrameTs) * this.speed();
        if (next >= this.timeline.totalDuration) {
          this.currentTimeMs.set(this.timeline.totalDuration);
          this.isPlaying.set(false);
          this.pauseAllNarration();
        } else {
          this.currentTimeMs.set(next);
        }
      }
      this.lastFrameTs = now;
      if (this.timeline.phases.length > 0) {
        this.advanceNarration(this.findPhaseIndex(this.timeline.phases, this.currentTimeMs()));
      }
    } else {
      this.lastFrameTs = null;
    }
    this.render();
    this.rafHandle = requestAnimationFrame(this.tick);
  };

  // ---------- UI wiring ----------

  togglePlay(): void {
    if (!this.timeline) return;
    if (this.currentTimeMs() >= this.totalDurationMs()) {
      this.currentTimeMs.set(0); // restart if at end
      this.lastPhaseIndex = -1;
    }
    const next = !this.isPlaying();
    this.isPlaying.set(next);
    if (next) {
      for (const el of this.activeNarrationAudio) {
        try {
          el.play();
        } catch {
          // ignore
        }
      }
    } else {
      this.pauseAllNarration();
    }
  }

  onScrubInput(event: Event): void {
    this.isScrubbing = true;
    const value = Number((event.target as HTMLInputElement).value);
    this.currentTimeMs.set(value);
    this.isPlaying.set(false);
    this.stopAllNarration();
    if (this.timeline) this.lastPhaseIndex = this.findPhaseIndex(this.timeline.phases, value);
    this.render();
  }

  onScrubChange(): void {
    this.isScrubbing = false;
  }

  onSpeedChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.speed.set(value);
    for (const el of this.activeNarrationAudio) {
      el.playbackRate = this.clamp(value, 0.25, 4);
    }
  }

  onScenarioChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.scenario.set(value);
    this.loadScenario(value);
  }

  onNarrationChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'off' | 'short' | 'long';
    this.narrationMode.set(value);
    this.loadScenario(this.scenario());
  }

  // ---------- boot ----------

  private initialScenarioFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scenario');
    if (fromUrl) return fromUrl;
    return this.scenario();
  }
}
