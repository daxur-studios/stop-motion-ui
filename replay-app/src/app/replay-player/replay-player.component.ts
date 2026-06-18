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

type ShowPhase = { kind: 'show'; t0: number; t1: number; x: number; y: number; screenshot: string };
type MovePhase = {
  kind: 'move';
  t0: number;
  t1: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  screenshot: string;
};
type CirclePhase = {
  kind: 'circle';
  t0: number;
  t1: number;
  center: { x: number; y: number };
  radius: number;
  screenshot: string;
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

  private ctx!: CanvasRenderingContext2D;
  private timeline: Timeline | null = null;
  private images = new Map<string, HTMLImageElement>();

  private lastFrameTs: number | null = null;
  private isScrubbing = false;
  private rafHandle: number | null = null;

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
  }

  // ---------- math helpers (unchanged from replay/player.js) ----------

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
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
    seedTime: number
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

    return { x: mx + px * magnitude, y: my + py * magnitude };
  }

  // ---------- timeline construction ----------

  /**
   * Builds a flat list of "phases" covering the whole manifest:
   *   { kind: 'move',   t0, t1, from, to, screenshot }
   *   { kind: 'circle', t0, t1, center, radius, screenshot }
   *   { kind: 'show',   t0, t1, x, y, screenshot }   // static hold (start/end)
   *
   * The screenshot on a phase is whatever should be on-screen for the
   * *duration* of that phase. A new screenshot only becomes visible once its
   * owning event's timestamp is reached.
   */
  private buildTimeline(manifest: Manifest): { phases: Phase[]; totalDuration: number } {
    const events = manifest.events;
    if (!events || events.length === 0) {
      return { phases: [], totalDuration: 0 };
    }

    const phases: Phase[] = [];
    const first = events[0];

    // Hold on the very first frame from t=0 until the first event's own
    // timestamp (covers manifests where event[0].timestamp > 0).
    phases.push({
      kind: 'show',
      t0: 0,
      t1: first.timestamp,
      x: first.cursor.x,
      y: first.cursor.y,
      screenshot: first.screenshotRef,
    });

    let prev = {
      x: first.cursor.x,
      y: first.cursor.y,
      t: first.timestamp,
      screenshot: first.screenshotRef,
    };

    for (let i = 1; i < events.length; i++) {
      const ev = events[i];

      // Glide from wherever we ended up to this event's cursor point, while
      // showing whatever screenshot was current *before* this event landed.
      if (ev.timestamp > prev.t) {
        phases.push({
          kind: 'move',
          t0: prev.t,
          t1: ev.timestamp,
          from: { x: prev.x, y: prev.y },
          to: { x: ev.cursor.x, y: ev.cursor.y },
          screenshot: prev.screenshot,
        });
      }

      if (ev.type === 'circle') {
        const t1 = ev.timestamp + ev.duration;
        phases.push({
          kind: 'circle',
          t0: ev.timestamp,
          t1: t1,
          center: { x: ev.cursor.x, y: ev.cursor.y },
          radius: ev.radius,
          screenshot: ev.screenshotRef,
        });
        prev = { x: ev.cursor.x, y: ev.cursor.y, t: t1, screenshot: ev.screenshotRef };
      } else {
        prev = { x: ev.cursor.x, y: ev.cursor.y, t: ev.timestamp, screenshot: ev.screenshotRef };
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

  private findPhase(phases: Phase[], t: number): Phase {
    for (let i = 0; i < phases.length; i++) {
      if (t < phases[i].t1 || i === phases.length - 1) return phases[i];
    }
    return phases[phases.length - 1];
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
      const control = this.controlPointFor(phase.from, phase.to, phase.t0);
      const pos = this.quadBezier(phase.from, control, phase.to, eased);
      return { x: pos.x, y: pos.y, screenshot: phase.screenshot, orbit: null };
    }

    // circle
    // Ease the angular speed in/out so the orbit doesn't snap to full
    // speed instantly — accelerate into the gesture, decelerate out.
    const eased = this.easeInOutCubic(frac);
    const angle = -Math.PI / 2 + eased * Math.PI * 2 * CIRCLE_LOOPS;
    const x = phase.center.x + Math.cos(angle) * phase.radius;
    const y = phase.center.y + Math.sin(angle) * phase.radius;
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

  private async loadScenario(scenarioId: string): Promise<void> {
    this.isPlaying.set(false);
    this.ready.set(false);
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

    const built = this.buildTimeline(manifest);
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
    this.totalDurationMs.set(this.timeline.totalDuration);
    this.ready.set(this.timeline.phases.length > 0);
    this.status.set(
      'Ready — ' + manifest.events.length + ' events, ' + Math.round(this.timeline.totalDuration) + 'ms'
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
        } else {
          this.currentTimeMs.set(next);
        }
      }
      this.lastFrameTs = now;
    } else {
      this.lastFrameTs = null;
    }
    this.render();
    this.rafHandle = requestAnimationFrame(this.tick);
  };

  // ---------- UI wiring ----------

  togglePlay(): void {
    if (!this.timeline) return;
    if (this.currentTimeMs() >= this.totalDurationMs()) this.currentTimeMs.set(0); // restart if at end
    this.isPlaying.set(!this.isPlaying());
  }

  onScrubInput(event: Event): void {
    this.isScrubbing = true;
    const value = Number((event.target as HTMLInputElement).value);
    this.currentTimeMs.set(value);
    this.isPlaying.set(false);
    this.render();
  }

  onScrubChange(): void {
    this.isScrubbing = false;
  }

  onSpeedChange(event: Event): void {
    this.speed.set(Number((event.target as HTMLSelectElement).value));
  }

  onScenarioChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.scenario.set(value);
    this.loadScenario(value);
  }

  // ---------- boot ----------

  private initialScenarioFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scenario');
    if (fromUrl) return fromUrl;
    return this.scenario();
  }
}
