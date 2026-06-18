// Stop-Motion UI — Replay player.
//
// Plain JS + Canvas 2D, no framework, no build step (per ADR-002).
// Loaded as a classic <script> (not type="module") so it also works when the
// page is opened directly via file:// in browsers that block module fetches
// across the file scheme. Manifest/image loading still goes through fetch()/
// <img>, which in Chrome requires the page be served over http (see README
// note) — file:// works fine in Firefox and in Chrome with
// --allow-file-access-from-files.
//
// Mirrors the shapes in shared/manifest-types.ts (kept as plain JS here,
// see that file for the canonical TypeScript definitions):
//   CursorPoint   = { x, y, timestamp }
//   ManifestEvent = ClickAction | NavigateAction | CircleAction
//   Manifest      = { version, capturedAt, backend, viewport, events[] }

(function () {
  'use strict';

  const TAIL_PAUSE_MS = 600; // hold on the final frame briefly before the timeline ends
  const RIPPLE_MS = 420; // click-feedback ripple duration
  const CIRCLE_LOOPS = 1.6; // how many times the cursor orbits during a 'circle' gesture

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const playBtn = document.getElementById('play-btn');
  const scrub = document.getElementById('scrub');
  const timeLabel = document.getElementById('time-label');
  const speedSelect = document.getElementById('speed-select');
  const scenarioSelect = document.getElementById('scenario-select');
  const statusEl = document.getElementById('status');

  /** @type {{phases: any[], totalDuration: number, baseDir: string}} */
  let timeline = null;
  /** @type {Map<string, HTMLImageElement>} */
  let images = new Map();

  let isPlaying = false;
  let currentTime = 0;
  let lastFrameTs = null;
  let speed = 1;

  // ---------- math helpers ----------

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** Quadratic bezier point at fraction t. */
  function quadBezier(p0, c, p1, t) {
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
  function controlPointFor(from, to, seedTime) {
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
    const magnitude = clamp(dist * 0.18, 12, 90) * sign;

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
  function buildTimeline(manifest) {
    const events = manifest.events;
    if (!events || events.length === 0) {
      return { phases: [], totalDuration: 0 };
    }

    const phases = [];
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

  function findPhase(phases, t) {
    for (let i = 0; i < phases.length; i++) {
      if (t < phases[i].t1 || i === phases.length - 1) return phases[i];
    }
    return phases[phases.length - 1];
  }

  /** Resolves cursor {x,y} and the active screenshot path for time t. */
  function sampleAt(phases, t) {
    const phase = findPhase(phases, t);
    const span = Math.max(1, phase.t1 - phase.t0);
    const frac = clamp((t - phase.t0) / span, 0, 1);

    if (phase.kind === 'show') {
      return { x: phase.x, y: phase.y, screenshot: phase.screenshot, ripple: null, orbit: null };
    }

    if (phase.kind === 'move') {
      const eased = easeInOutCubic(frac);
      const control = controlPointFor(phase.from, phase.to, phase.t0);
      const pos = quadBezier(phase.from, control, phase.to, eased);
      return { x: pos.x, y: pos.y, screenshot: phase.screenshot, ripple: null, orbit: null };
    }

    if (phase.kind === 'circle') {
      // Ease the angular speed in/out so the orbit doesn't snap to full
      // speed instantly — accelerate into the gesture, decelerate out.
      const eased = easeInOutCubic(frac);
      const angle = -Math.PI / 2 + eased * Math.PI * 2 * CIRCLE_LOOPS;
      const x = phase.center.x + Math.cos(angle) * phase.radius;
      const y = phase.center.y + Math.sin(angle) * phase.radius;
      return {
        x,
        y,
        screenshot: phase.screenshot,
        ripple: null,
        orbit: { center: phase.center, radius: phase.radius, frac },
      };
    }

    return { x: 0, y: 0, screenshot: phase.screenshot, ripple: null, orbit: null };
  }

  // ---------- asset loading ----------

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image: ' + src));
      img.src = src;
    });
  }

  async function loadScenario(scenarioId) {
    isPlaying = false;
    playBtn.disabled = true;
    scrub.disabled = true;
    statusEl.textContent = 'Loading manifest for ' + scenarioId + '…';

    const baseDir = 'test-scenarios/' + scenarioId + '/';
    let manifest;
    try {
      const res = await fetch(baseDir + 'manifest.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      manifest = await res.json();
    } catch (err) {
      statusEl.textContent =
        'Could not load manifest.json (' + err.message + '). ' +
        'If you opened this file directly (file://), serve the replay/ folder over ' +
        'http instead, e.g.: npx serve replay   (or) python3 -m http.server, from inside replay/.';
      return;
    }

    canvas.width = manifest.viewport.width;
    canvas.height = manifest.viewport.height;

    const built = buildTimeline(manifest);
    timeline = { ...built, baseDir };

    const refs = Array.from(new Set(manifest.events.map((e) => e.screenshotRef)));
    statusEl.textContent = 'Loading ' + refs.length + ' screenshot(s)…';

    images = new Map();
    try {
      await Promise.all(
        refs.map(async (ref) => {
          const img = await loadImage(baseDir + ref);
          images.set(ref, img);
        })
      );
    } catch (err) {
      statusEl.textContent = 'Error loading screenshots: ' + err.message;
      return;
    }

    currentTime = 0;
    lastFrameTs = null;
    scrub.min = '0';
    scrub.max = String(Math.max(1, Math.round(timeline.totalDuration)));
    scrub.value = '0';
    scrub.disabled = timeline.phases.length === 0;
    playBtn.disabled = timeline.phases.length === 0;
    playBtn.textContent = 'Play';
    statusEl.textContent =
      'Ready — ' + manifest.events.length + ' events, ' + Math.round(timeline.totalDuration) + 'ms';
    render();
  }

  // ---------- rendering ----------

  function drawCursor(x, y, sample) {
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

  function drawRipples(phases, t) {
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

  function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!timeline || timeline.phases.length === 0) return;

    const sample = sampleAt(timeline.phases, currentTime);
    const img = images.get(sample.screenshot);
    if (img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    drawRipples(timeline.phases, currentTime);
    drawCursor(sample.x, sample.y, sample);

    const total = timeline.totalDuration;
    timeLabel.textContent = (currentTime / 1000).toFixed(1) + 's / ' + (total / 1000).toFixed(1) + 's';
    if (!isScrubbing) scrub.value = String(Math.round(currentTime));
  }

  // ---------- playback loop ----------

  let isScrubbing = false;

  function tick(now) {
    if (isPlaying && timeline) {
      if (lastFrameTs != null) {
        currentTime += (now - lastFrameTs) * speed;
      }
      lastFrameTs = now;
      if (currentTime >= timeline.totalDuration) {
        currentTime = timeline.totalDuration;
        isPlaying = false;
        playBtn.textContent = 'Play';
      }
    } else {
      lastFrameTs = null;
    }
    render();
    requestAnimationFrame(tick);
  }

  // ---------- UI wiring ----------

  playBtn.addEventListener('click', () => {
    if (!timeline) return;
    if (currentTime >= timeline.totalDuration) currentTime = 0; // restart if at end
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? 'Pause' : 'Play';
  });

  scrub.addEventListener('input', () => {
    isScrubbing = true;
    currentTime = Number(scrub.value);
    isPlaying = false;
    playBtn.textContent = 'Play';
    render();
  });
  scrub.addEventListener('change', () => {
    isScrubbing = false;
  });

  speedSelect.addEventListener('change', () => {
    speed = Number(speedSelect.value);
  });

  scenarioSelect.addEventListener('change', () => {
    loadScenario(scenarioSelect.value);
  });

  // ---------- boot ----------

  function initialScenarioFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scenario');
    if (fromUrl) return fromUrl;
    return scenarioSelect.value;
  }

  const initial = initialScenarioFromUrl();
  scenarioSelect.value = initial;
  loadScenario(initial);
  requestAnimationFrame(tick);

  // Test hook only: lets a Node script exercise the pure timeline math
  // without a browser. `module` doesn't exist in a browser <script>, so this
  // is a no-op there.
  if (typeof module !== 'undefined') {
    module.exports = { buildTimeline, sampleAt, easeInOutCubic };
  }
})();
