// Node-side smoke test for replay/player.js timeline math, using real
// manifest.json fixtures from the test scenarios. There's no headless
// browser available in this environment, so this stubs out just enough DOM
// to load player.js and exercises buildTimeline()/sampleAt() directly
// against each scenario, checking for NaNs, monotonic time, and sane
// coordinate ranges. It does not replace an actual visual check in a real
// browser, but it does catch logic errors / thrown exceptions on load.

const path = require('path');
const fs = require('fs');

function fakeElement() {
  const el = {
    addEventListener() {},
    style: {},
    classList: { add() {}, remove() {} },
    disabled: false,
    textContent: '',
    value: '0',
    min: '0',
    max: '0',
    getContext() {
      return {
        fillRect() {},
        drawImage() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        save() {},
        restore() {},
        translate() {},
        setLineDash() {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
      };
    },
    width: 1280,
    height: 800,
  };
  return el;
}

global.document = {
  getElementById() {
    return fakeElement();
  },
};
global.window = { location: { search: '' } };
global.Image = class {
  set src(_v) {
    if (this.onload) setTimeout(() => this.onload(), 0);
  }
};
global.fetch = async () => ({ ok: false, status: 599 }); // not exercised in this test
global.requestAnimationFrame = () => {};
global.URLSearchParams = URLSearchParams;

const playerPath = path.join(__dirname, '..', 'player.js');
const { buildTimeline, sampleAt, easeInOutCubic } = require(playerPath);

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok  :', msg);
  }
}

// easing sanity
assert(easeInOutCubic(0) === 0, 'easeInOutCubic(0) === 0');
assert(Math.abs(easeInOutCubic(1) - 1) < 1e-9, 'easeInOutCubic(1) === 1');
assert(easeInOutCubic(0.5) === 0.5, 'easeInOutCubic(0.5) === 0.5 (symmetric)');

const scenarios = ['scenario-1', 'scenario-2', 'scenario-3'];
for (const s of scenarios) {
  const manifestPath = path.join(__dirname, s, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { phases, totalDuration } = buildTimeline(manifest);

  assert(phases.length > 0, s + ': has phases');
  assert(Number.isFinite(totalDuration) && totalDuration > 0, s + ': totalDuration is finite and positive');

  // sample densely across the whole timeline and check every value
  const STEPS = 200;
  let sawCircle = false;
  let prevT = -1;
  for (let i = 0; i <= STEPS; i++) {
    const t = (totalDuration * i) / STEPS;
    const sample = sampleAt(phases, t);
    assert(Number.isFinite(sample.x) && Number.isFinite(sample.y), s + ': finite cursor at t=' + t.toFixed(0));
    assert(
      sample.x >= -50 && sample.x <= manifest.viewport.width + 50 && sample.y >= -50 && sample.y <= manifest.viewport.height + 50,
      s + ': cursor roughly within viewport bounds at t=' + t.toFixed(0) + ' (' + sample.x.toFixed(1) + ',' + sample.y.toFixed(1) + ')'
    );
    assert(typeof sample.screenshot === 'string' && sample.screenshot.length > 0, s + ': screenshot ref set at t=' + t.toFixed(0));
    if (sample.orbit) sawCircle = true;
    prevT = t;
  }
  assert(sawCircle, s + ': circle phase produced orbit samples');

  // every screenshotRef referenced by phases must exist on disk
  const refs = new Set(phases.map((p) => p.screenshot));
  for (const ref of refs) {
    const imgPath = path.join(__dirname, s, ref);
    assert(fs.existsSync(imgPath), s + ': screenshot file exists on disk: ' + ref);
  }

  // timestamps strictly non-decreasing across phases
  let lastT1 = -1;
  let monotonic = true;
  for (const p of phases) {
    if (p.t0 < lastT1 - 1e-6 || p.t1 < p.t0) monotonic = false;
    lastT1 = p.t1;
  }
  assert(monotonic, s + ': phase time ranges are monotonic and non-overlapping');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
