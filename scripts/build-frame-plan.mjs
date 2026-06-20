#!/usr/bin/env node
// Builds a headless "frame plan" for video export — see docs/adr/ADR-009-video-export.md.
//
// This is a deliberate fork of replay/player.js's timeline math (buildTimeline,
// sampleAt, mulberry32, easing/bezier/wobble helpers, drawRipples), NOT a new
// implementation — every function in the "ported from player.js" section below
// is meant to stay byte-for-byte identical in *behavior* to its player.js
// counterpart (same inputs => same outputs), so a video export and a live
// browser replay of the same manifest produce the same motion. The only
// changes are mechanical, not semantic:
//   - No DOM: `getNarration(ev)` returns { ms, el } where `el` is a narration
//     audio *relative path string* (e.g. "narration/click-2-short.ogg"),
//     not an HTMLAudioElement. buildTimeline() only ever assigns this value
//     to `phase.narration`, never calls a method on it — so the exact same
//     buildTimeline() logic works unchanged with either shape.
//   - sampleAt() returns the same { x, y, screenshot, orbit } shape
//     player.js's render() consumes (as of ADR-010, asyncWait frame-cycling
//     swaps `screenshot` directly — no separate region/composite field; see
//     that ADR for why the earlier region-cropped version was removed),
//     plus this file adds a parallel
//     computeRipples(phases, t) ported from drawRipples() — same arrival/age
//     math, but returning ripple circle parameters as data instead of issuing
//     canvas stroke calls.
// Whoever next touches replay/player.js's buildTimeline()/sampleAt()/
// drawRipples() should mirror the change here too (same discipline already
// applied between player.js and ReplayPlayerComponent — see ADR-004's
// closing "Consequences" note).
//
// Usage:
//   node scripts/build-frame-plan.mjs <scenario-dir> [--fps=30] [--narration=short|long|off]
//
// Output: writes <scenario-dir>/frame-plan.json
//   { viewport, fps, totalDurationMs, frames: [...], audioEvents: [...] }

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------- CLI args ----------

function parseArgs(argv) {
  const positional = [];
  const flags = { fps: 30, narration: 'short' };
  for (const arg of argv) {
    if (arg.startsWith('--fps=')) flags.fps = Number(arg.slice('--fps='.length));
    else if (arg.startsWith('--narration=')) flags.narration = arg.slice('--narration='.length);
    else positional.push(arg);
  }
  return { positional, flags };
}

// ---------- ported from replay/player.js (see file header) ----------

const RIPPLE_MS = 420;
const CIRCLE_LOOPS = 1.6;
const MOVE_WOBBLE_MAX_PX = 22;
const CIRCLE_RADIUS_WOBBLE_FRAC = 0.08;
const CIRCLE_ANGLE_WOBBLE_RAD = 0.12;
const TAIL_PAUSE_MS = 600;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
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
function quadBezier(p0, c, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}
function controlPointFor(from, to, seedTime, jitter) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: mx, y: my };
  const px = -dy / dist;
  const py = dx / dist;
  const sign = Math.floor(seedTime / 137) % 2 === 0 ? 1 : -1;
  const magnitude = clamp(dist * 0.18, 12, 90) * sign;
  let x = mx + px * magnitude;
  let y = my + py * magnitude;
  if (jitter) {
    x += Math.cos(jitter.angle) * jitter.mag;
    y += Math.sin(jitter.angle) * jitter.mag;
  }
  return { x, y };
}
function circleWobble(jitter, frac) {
  if (!jitter) return { radiusMul: 1, angleOffset: 0 };
  const envelope = Math.sin(clamp(frac, 0, 1) * Math.PI);
  const radiusMul = 1 + Math.sin(frac * jitter.radiusFreq * Math.PI * 2 + jitter.radiusPhase) * jitter.radiusAmp * envelope;
  const angleOffset = Math.sin(frac * jitter.angleFreq * Math.PI * 2 + jitter.anglePhase) * jitter.angleAmp * envelope;
  return { radiusMul, angleOffset };
}
function circleOrbitPoint(center, radius, frac) {
  const angle = -Math.PI / 2 + easeInOutCubic(frac) * Math.PI * 2 * CIRCLE_LOOPS;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function buildTimeline(manifest, getNarration) {
  const events = manifest.events;
  if (!events || events.length === 0) return { phases: [], totalDuration: 0 };
  const narrationFor = getNarration || function () { return null; };
  const rng = mulberry32((manifest.seed | 0) || 0);

  function moveJitter() {
    return { angle: rng() * Math.PI * 2, mag: rng() * MOVE_WOBBLE_MAX_PX };
  }
  function circleJitter() {
    return {
      radiusAmp: CIRCLE_RADIUS_WOBBLE_FRAC * (0.5 + rng() * 0.5),
      radiusFreq: 2 + Math.floor(rng() * 2),
      radiusPhase: rng() * Math.PI * 2,
      angleAmp: CIRCLE_ANGLE_WOBBLE_RAD * (0.5 + rng() * 0.5),
      angleFreq: 2 + Math.floor(rng() * 2),
      anglePhase: rng() * Math.PI * 2,
    };
  }

  const phases = [];
  const first = events[0];
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

  let prev = { x: first.cursor.x, y: first.cursor.y, t: firstHoldEnd, screenshot: first.screenshotRef };
  let prevManifestEnd = first.type === 'circle' ? first.timestamp + first.duration : first.timestamp;

  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    let visualDuration = 0;
    let movePhaseRef = null;

    const moveDur = ev.type === 'asyncWait' ? 0 : ev.timestamp - prevManifestEnd;
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
    let asyncWaitPhaseRef = null;
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
      const exitPoint = circleOrbitPoint({ x: ev.cursor.x, y: ev.cursor.y }, ev.radius, 1);
      prev = { x: exitPoint.x, y: exitPoint.y, t: t1, screenshot: ev.screenshotRef };
      prevManifestEnd = ev.timestamp + ev.duration;
    } else if (ev.type === 'asyncWait') {
      const t1 = prev.t + ev.frameDurationMs;
      asyncWaitPhaseRef = {
        kind: 'asyncWait',
        t0: prev.t,
        t1: t1,
        x: ev.cursor.x,
        y: ev.cursor.y,
        screenshot: ev.screenshotRef,
        frames: ev.frames,
      };
      phases.push(asyncWaitPhaseRef);
      visualDuration += ev.frameDurationMs;
      prev = { x: ev.cursor.x, y: ev.cursor.y, t: t1, screenshot: ev.screenshotRef };
      prevManifestEnd = ev.timestamp;
    } else {
      prev = { x: ev.cursor.x, y: ev.cursor.y, t: prev.t, screenshot: ev.screenshotRef };
      prevManifestEnd = ev.timestamp;
    }

    const narration = narrationFor(ev);
    const narrationMs = narration ? narration.ms : 0;
    const extra = Math.max(0, narrationMs - visualDuration);

    const narrationOwner = movePhaseRef || circlePhaseRef || asyncWaitPhaseRef;
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

  phases.push({ kind: 'show', t0: prev.t, t1: prev.t + TAIL_PAUSE_MS, x: prev.x, y: prev.y, screenshot: prev.screenshot });
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

function sampleAt(phases, t) {
  const phase = findPhase(phases, t);
  const span = Math.max(1, phase.t1 - phase.t0);
  const frac = clamp((t - phase.t0) / span, 0, 1);

  if (phase.kind === 'show') {
    return { x: phase.x, y: phase.y, screenshot: phase.screenshot, orbit: null };
  }
  if (phase.kind === 'move') {
    const eased = easeInOutCubic(frac);
    const control = controlPointFor(phase.from, phase.to, phase.t0, phase.jitter);
    const pos = quadBezier(phase.from, control, phase.to, eased);
    return { x: pos.x, y: pos.y, screenshot: phase.screenshot, orbit: null };
  }
  if (phase.kind === 'circle') {
    const eased = easeInOutCubic(frac);
    const wobble = circleWobble(phase.jitter, frac);
    const angle = -Math.PI / 2 + eased * Math.PI * 2 * CIRCLE_LOOPS + wobble.angleOffset;
    const radius = phase.radius * wobble.radiusMul;
    const x = phase.center.x + Math.cos(angle) * radius;
    const y = phase.center.y + Math.sin(angle) * radius;
    return { x, y, screenshot: phase.screenshot, orbit: { center: phase.center, radius: phase.radius, frac } };
  }
  if (phase.kind === 'asyncWait') {
    // Full-screen frame-cycling (ADR-010) — no region/base compositing.
    const frameIndex = phase.frames.length > 0 ? Math.min(phase.frames.length - 1, Math.floor(frac * phase.frames.length)) : -1;
    return {
      x: phase.x,
      y: phase.y,
      screenshot: frameIndex >= 0 ? phase.frames[frameIndex] : phase.screenshot,
      orbit: null,
    };
  }
  return { x: 0, y: 0, screenshot: phase.screenshot, orbit: null };
}

/** Ported from drawRipples() — same arrival/age math, returns data instead of stroking a canvas. */
function computeRipples(phases, t) {
  const ripples = [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (phase.kind !== 'move') continue;
    if (phases[i + 1] && phases[i + 1].kind === 'circle') continue;
    const arrivalT = phase.t1;
    const age = t - arrivalT;
    if (age >= 0 && age <= RIPPLE_MS) {
      const frac = age / RIPPLE_MS;
      ripples.push({ x: phase.to.x, y: phase.to.y, r: 6 + frac * 22, alpha: (1 - frac) * 0.8 });
    }
  }
  return ripples;
}

// ---------- narration duration lookup (replaces player.js's loadAudioMeta) ----------

async function ffprobeDurationMs(absPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    absPath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe returned non-numeric duration for ${absPath}`);
  return seconds * 1000;
}

// ---------- main ----------

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const scenarioDir = positional[0];
  if (!scenarioDir) {
    console.error('Usage: node scripts/build-frame-plan.mjs <scenario-dir> [--fps=30] [--narration=short|long|off]');
    process.exit(1);
  }

  const manifestPath = path.join(scenarioDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  const narrationMap = new Map(); // event id -> { ms, el: relPath }
  if (flags.narration !== 'off') {
    const field = flags.narration === 'long' ? 'narrationAudioLong' : 'narrationAudioShort';
    for (const ev of manifest.events) {
      const ref = ev[field];
      if (!ref) continue;
      const ms = await ffprobeDurationMs(path.join(scenarioDir, ref));
      narrationMap.set(ev.id, { ms, el: ref });
    }
  }
  const getNarration = (ev) => narrationMap.get(ev.id) || null;

  const { phases, totalDuration } = buildTimeline(manifest, getNarration);

  // Audio events: every phase buildTimeline() picked as a narration owner
  // (move/circle/asyncWait phase, or — if a step had no visual duration at
  // all — the synthetic extra 'show' hold) carries `.narration` set to the
  // relative audio path; its phase.t0 is exactly when the live player would
  // have triggered playback (see player.js's firePendingNarration()).
  const audioEvents = phases.filter((p) => p.narration).map((p) => ({ path: p.narration, startMs: p.t0 }));

  const fps = flags.fps;
  const frameCount = Math.max(1, Math.ceil((totalDuration / 1000) * fps));
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const t = (i / fps) * 1000;
    const sample = sampleAt(phases, t);
    const ripples = computeRipples(phases, t);
    frames.push({
      t,
      screenshot: sample.screenshot,
      cursor: { x: sample.x, y: sample.y },
      orbit: sample.orbit,
      ripples,
    });
  }

  const plan = {
    viewport: manifest.viewport,
    fps,
    totalDurationMs: totalDuration,
    frameCount,
    frames,
    audioEvents,
  };

  const outPath = path.join(scenarioDir, 'frame-plan.json');
  await writeFile(outPath, JSON.stringify(plan), 'utf8');
  console.log(`Wrote ${outPath}: ${frameCount} frames @ ${fps}fps, ${audioEvents.length} narration clip(s), totalDuration=${Math.round(totalDuration)}ms`);
}

main().catch((err) => {
  console.error('build-frame-plan failed:', err);
  process.exit(1);
});
