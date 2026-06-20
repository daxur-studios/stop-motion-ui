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

  // Wobble tuning (see ADR-004) — kept small so the cursor still reads as
  // precise/intentional, just not laser-straight.
  const MOVE_WOBBLE_MAX_PX = 22; // extra control-point jitter on top of the deterministic arc offset
  const CIRCLE_RADIUS_WOBBLE_FRAC = 0.08; // +/- 8% of radius
  const CIRCLE_ANGLE_WOBBLE_RAD = 0.12; // +/- ~7 degrees, eased to 0 at both ends

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const playBtn = document.getElementById('play-btn');
  const scrub = document.getElementById('scrub');
  const timeLabel = document.getElementById('time-label');
  const speedSelect = document.getElementById('speed-select');
  const scenarioSelect = document.getElementById('scenario-select');
  const narrationSelect = document.getElementById('narration-select');
  const statusEl = document.getElementById('status');

  /** @type {{phases: any[], totalDuration: number, baseDir: string}} */
  let timeline = null;
  /** @type {Map<string, HTMLImageElement>} */
  let images = new Map();

  let isPlaying = false;
  let currentTime = 0;
  let lastFrameTs = null;
  let speed = 1;
  let narrationMode = 'off'; // 'off' | 'short' | 'long'
  let lastPhaseIndex = -1; // tracks which phase's narration audio we've already triggered

  // ---------- math helpers ----------

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * mulberry32 — tiny deterministic PRNG (see ADR-004). Returns a function
   * that yields floats in [0, 1) on each call, fully determined by `seed`.
   * Chosen over Math.random() specifically because demos must be
   * reproducible: same manifest + same seed => same "natural" wobble every
   * time it's replayed.
   */
  function mulberry32(seed) {
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
  function controlPointFor(from, to, seedTime, jitter) {
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
  function circleWobble(jitter, frac) {
    if (!jitter) return { radiusMul: 1, angleOffset: 0 };
    const envelope = Math.sin(clamp(frac, 0, 1) * Math.PI);
    const radiusMul = 1 + Math.sin(frac * jitter.radiusFreq * Math.PI * 2 + jitter.radiusPhase) * jitter.radiusAmp * envelope;
    const angleOffset = Math.sin(frac * jitter.angleFreq * Math.PI * 2 + jitter.anglePhase) * jitter.angleAmp * envelope;
    return { radiusMul, angleOffset };
  }

  /**
   * Point on the circle-gesture orbit at progress `frac` (0 = where the
   * gesture starts, 1 = where it ends) — same formula as sampleAt()'s
   * 'circle' branch, minus the jitter wobble. Safe to drop the wobble term
   * here because circleWobble()'s envelope (sin(frac * PI)) is exactly 0 at
   * frac=0 and frac=1, the only two fracs this helper is ever called with —
   * used to anchor the move phases immediately before/after a circle
   * gesture to the orbit's actual edge, not the literal center. The circle
   * never visits its own center (radius is constant, only the angle
   * sweeps), so a move phase that glides to/from the center would always
   * end in a `radius`-sized snap the instant the circle phase starts/ends.
   * See buildTimeline()'s 'circle' handling.
   */
  function circleOrbitPoint(center, radius, frac) {
    const angle = -Math.PI / 2 + easeInOutCubic(frac) * Math.PI * 2 * CIRCLE_LOOPS;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
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
   * move begins. Phase t0/t1 are therefore *playback* time (already
   * accounting for any such stretching), not raw manifest timestamps —
   * though they're numerically identical to manifest timestamps whenever no
   * narration is present, which is why this stays backward compatible with
   * callers (e.g. test-scenarios/verify.js) that never pass `getNarration`.
   */
  function buildTimeline(manifest, getNarration) {
    const events = manifest.events;
    if (!events || events.length === 0) {
      return { phases: [], totalDuration: 0 };
    }
    const narrationFor = getNarration || function () { return null; };
    const rng = mulberry32((manifest.seed | 0) || 0);

    function moveJitter() {
      return { angle: rng() * Math.PI * 2, mag: rng() * MOVE_WOBBLE_MAX_PX };
    }
    function circleJitter() {
      return {
        radiusAmp: CIRCLE_RADIUS_WOBBLE_FRAC * (0.5 + rng() * 0.5),
        radiusFreq: 2 + Math.floor(rng() * 2), // 2-3 wobble cycles across the gesture
        radiusPhase: rng() * Math.PI * 2,
        angleAmp: CIRCLE_ANGLE_WOBBLE_RAD * (0.5 + rng() * 0.5),
        angleFreq: 2 + Math.floor(rng() * 2),
        anglePhase: rng() * Math.PI * 2,
      };
    }

    const phases = [];
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
      let movePhaseRef = null;

      // Glide from wherever we ended up to this event's cursor point, while
      // showing whatever screenshot was current *before* this event landed.
      const moveDur = ev.timestamp - prevManifestEnd;
      // For a 'circle' event, the cursor doesn't actually rest at the
      // literal center once the gesture starts — sampleAt()'s 'circle'
      // branch always renders it offset by the full radius (the orbit's
      // angle sweeps, but the radius itself is constant; the wobble that
      // could shrink it toward 0 is itself eased to exactly 0 right at the
      // gesture's start). So gliding this move phase to the center, like
      // every other move target, would end in an instant `radius`-sized
      // snap the moment the circle phase takes over. Glide to the orbit's
      // actual starting point instead — see circleOrbitPoint().
      const moveTarget = ev.type === 'circle'
        ? circleOrbitPoint({ x: ev.cursor.x, y: ev.cursor.y }, ev.radius, 0)
        : { x: ev.cursor.x, y: ev.cursor.y };
      if (moveDur > 0) {
        movePhaseRef = {
          kind: 'move',
          t0: prev.t,
          t1: prev.t + moveDur,
          from: { x: prev.x, y: prev.y },
          to: moveTarget,
          screenshot: prev.screenshot,
          jitter: moveJitter(),
        };
        phases.push(movePhaseRef);
        prev = { x: prev.x, y: prev.y, t: prev.t + moveDur, screenshot: prev.screenshot };
        visualDuration += moveDur;
      }

      let circlePhaseRef = null;
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
        // Likewise, the gesture's *exit* point is wherever the orbit
        // actually ends (frac=1), not the center — the next move phase's
        // 'from' needs to match that so there's no snap on the way out
        // either.
        const exitPoint = circleOrbitPoint({ x: ev.cursor.x, y: ev.cursor.y }, ev.radius, 1);
        prev = { x: exitPoint.x, y: exitPoint.y, t: t1, screenshot: ev.screenshotRef };
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

  function findPhaseIndex(phases, t) {
    for (let i = 0; i < phases.length; i++) {
      if (t < phases[i].t1 || i === phases.length - 1) return i;
    }
    return phases.length - 1;
  }

  function findPhase(phases, t) {
    return phases[findPhaseIndex(phases, t)];
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
      const control = controlPointFor(phase.from, phase.to, phase.t0, phase.jitter);
      const pos = quadBezier(phase.from, control, phase.to, eased);
      return { x: pos.x, y: pos.y, screenshot: phase.screenshot, ripple: null, orbit: null };
    }

    if (phase.kind === 'circle') {
      // Ease the angular speed in/out so the orbit doesn't snap to full
      // speed instantly — accelerate into the gesture, decelerate out.
      const eased = easeInOutCubic(frac);
      const wobble = circleWobble(phase.jitter, frac);
      const angle = -Math.PI / 2 + eased * Math.PI * 2 * CIRCLE_LOOPS + wobble.angleOffset;
      const radius = phase.radius * wobble.radiusMul;
      const x = phase.center.x + Math.cos(angle) * radius;
      const y = phase.center.y + Math.sin(angle) * radius;
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

  /**
   * Loads an <audio> element far enough to know its duration (metadata
   * load), without necessarily downloading the whole file. Resolves to null
   * (rather than rejecting) on error so a single missing/broken narration
   * clip doesn't block the rest of the scenario from loading — narration is
   * an enhancement, not a hard requirement for playback.
   */
  function loadAudioMeta(src) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('loadedmetadata', () => resolve(audio), { once: true });
      audio.addEventListener('error', () => resolve(null), { once: true });
      audio.src = src;
    });
  }

  /** All currently-playing narration <audio> elements, so speed changes can retune them live. */
  const activeNarrationAudio = new Set();

  function stopAllNarration() {
    for (const el of activeNarrationAudio) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch (_e) {
        // ignore — element may already be detached/broken
      }
    }
    activeNarrationAudio.clear();
  }

  async function loadScenario(scenarioId) {
    isPlaying = false;
    stopAllNarration();
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

    // Preload narration audio (if any, and if a narration mode other than
    // 'off' is selected) so buildTimeline() can know each clip's duration
    // up front — needed to decide whether a step's hold time must stretch.
    // See docs/roadmap.md "Open problem: timing sync".
    const narrationMap = new Map(); // event id -> { ms, el }
    if (narrationMode !== 'off') {
      statusEl.textContent = 'Loading narration audio…';
      await Promise.all(
        manifest.events.map(async (ev) => {
          const ref = narrationMode === 'long' ? ev.narrationAudioLong : ev.narrationAudioShort;
          if (!ref) return;
          const el = await loadAudioMeta(baseDir + ref);
          if (el) narrationMap.set(ev.id, { ms: el.duration * 1000, el });
        })
      );
    }
    const getNarration = (ev) => narrationMap.get(ev.id) || null;

    const built = buildTimeline(manifest, getNarration);
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
    lastPhaseIndex = -1;
    scrub.min = '0';
    scrub.max = String(Math.max(1, Math.round(timeline.totalDuration)));
    scrub.value = '0';
    scrub.disabled = timeline.phases.length === 0;
    playBtn.disabled = timeline.phases.length === 0;
    playBtn.textContent = 'Play';
    statusEl.textContent =
      'Ready — ' + manifest.events.length + ' events, ' + Math.round(timeline.totalDuration) + 'ms' +
      (narrationMap.size > 0 ? ', ' + narrationMap.size + ' narration clip(s)' : '');
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
    // Exception: a move phase whose very next phase is a 'circle' isn't an
    // arrival at a click target — it's the glide *into* a circle gesture
    // (see buildTimeline()'s 'circle' handling, which now targets the
    // orbit's edge, not the center, for exactly this kind of continuity). A
    // circle is "look here," not "click here," so it shouldn't get a
    // click-feedback ripple at its start — that was a leftover from before
    // 'move' phases were ever used to approach anything but a real click.
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.kind !== 'move') continue;
      if (phases[i + 1] && phases[i + 1].kind === 'circle') continue;
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

  // ---------- narration playback sync ----------

  /**
   * Plays a step's narration audio at the same rate as visual playback, so
   * a 2x-speed replay also sounds 2x faster (simple playbackRate change —
   * pitch will rise/fall with it; not pitch-corrected, see ADR-004 for why
   * that's an acceptable tradeoff here).
   */
  function playNarration(el) {
    if (!el) return;
    try {
      el.currentTime = 0;
      el.playbackRate = clamp(speed, 0.25, 4);
      activeNarrationAudio.add(el);
      el.addEventListener('ended', () => activeNarrationAudio.delete(el), { once: true });
      const playResult = el.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => activeNarrationAudio.delete(el));
      }
    } catch (_e) {
      activeNarrationAudio.delete(el);
    }
  }

  function pauseAllNarration() {
    for (const el of activeNarrationAudio) {
      try {
        el.pause();
      } catch (_e) {
        // ignore
      }
    }
  }

  /** Fires narration for every phase between (lastPhaseIndex, newIndex], in order, moving forward only. */
  function advanceNarration(newIndex) {
    if (!timeline) return;
    if (newIndex > lastPhaseIndex) {
      for (let i = Math.max(lastPhaseIndex + 1, 0); i <= newIndex; i++) {
        const phase = timeline.phases[i];
        if (phase && phase.narration) playNarration(phase.narration);
      }
    }
    lastPhaseIndex = newIndex;
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
        pauseAllNarration();
      }
      if (timeline.phases.length > 0) {
        advanceNarration(findPhaseIndex(timeline.phases, currentTime));
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
    if (currentTime >= timeline.totalDuration) {
      currentTime = 0; // restart if at end
      lastPhaseIndex = -1;
    }
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? 'Pause' : 'Play';
    if (isPlaying) {
      for (const el of activeNarrationAudio) {
        try {
          el.play();
        } catch (_e) {
          // ignore
        }
      }
    } else {
      pauseAllNarration();
    }
  });

  scrub.addEventListener('input', () => {
    isScrubbing = true;
    currentTime = Number(scrub.value);
    isPlaying = false;
    playBtn.textContent = 'Play';
    stopAllNarration();
    if (timeline) lastPhaseIndex = findPhaseIndex(timeline.phases, currentTime);
    render();
  });
  scrub.addEventListener('change', () => {
    isScrubbing = false;
  });

  speedSelect.addEventListener('change', () => {
    speed = Number(speedSelect.value);
    for (const el of activeNarrationAudio) {
      el.playbackRate = clamp(speed, 0.25, 4);
    }
  });

  scenarioSelect.addEventListener('change', () => {
    loadScenario(scenarioSelect.value);
  });

  if (narrationSelect) {
    narrationSelect.addEventListener('change', () => {
      narrationMode = narrationSelect.value;
      loadScenario(scenarioSelect.value);
    });
  }

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
    module.exports = { buildTimeline, sampleAt, easeInOutCubic, mulberry32 };
  }
})();
