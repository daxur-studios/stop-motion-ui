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
type Phase = ShowPhase | MovePhase | CirclePhase;

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
   *
   * The screenshot on a phase is whatever should be on-screen for the
   * *duration* of that phase. A new screenshot only becomes visible once its
   * owning event's timestamp is reached.
   *
   * `getNarration(ev)`, if provided, returns `{ ms, el }` (or null) for an
   * event: `ms` is that narration clip's raw duration in milliseconds (used
   * to decide whether to stretch the step), `el` is the <audio> element to
   * play when the step starts (or null if no audio is loaded for it yet).
   * Per the timing rule in docs/roadmap.md: a step's hold time is whichever
   * is LONGER of its visual action duration or its narration duration — if
   * narration runs long, an extra 'show' phase is appended right after the
   * step's own phase(s) to make up the difference, before the next step's
   * move begins. Byte-for-byte port of replay/player.js's buildTimeline.
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

      // Glide from wherever we ended up to this event's cursor point, while
      // showing whatever screenshot was current *before* this event landed.
      const moveDur = ev.timestamp - prevManifestEnd;
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

      let circlePhaseRef: CirclePhase | null = null;
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

      // If this step's narration runs longer than its visual action, hold
      // on the arrived-at frame for the difference before moving on.
      const narration = narrationFor(ev);
      const narrationMs = narration ? narration.ms : 0;
      const extra = Math.max(0, narrationMs - visualDuration);

      // Trigger narration at whichever phase starts this step (move, else
      // circle, else — if the step has no visual duration at all — the
      // extra hold phase below).
      const narrationOwner = movePhaseRef || circlePhaseRef;
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
    const narrationMap = new Map<string, NarrationInfo>();
    const mode = this.narrationMode();
    if (mode !== 'off') {
      this.status.set('Loading narration audio…');
      await Promise.all(
        manifest.events.map(async (ev) => {
          const ref = mode === 'long' ? ev.narrationAudioLong : ev.narrationAudioShort;
          if (!ref) return;
          const el = await this.loadAudioMeta(baseDir + ref);
          if (el) narrationMap.set(ev.id, { ms: el.duration * 1000, el });
        })
      );
    }
    const getNarration = (ev: Manifest['events'][number]) => narrationMap.get(ev.id) ?? null;

    const built = this.buildTimeline(manifest, getNarration);
    this.timeline = { ...built, baseDir };

    const refs = Array.from(new Set(manifest.events.map((e) => e.screenshotRef)));
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
    this.status.set(
      'Ready — ' +
        manifest.events.length +
        ' events, ' +
        Math.round(this.timeline.totalDuration) +
        'ms' +
        (narrationMap.size > 0 ? ', ' + narrationMap.size + ' narration clip(s)' : '')
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
