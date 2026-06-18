// Dry run of ../src/capture-session.ts with SYNTHETIC data — no real
// browser, no real Playwright navigation. Unlike capture/chrome-mcp's dry
// run, this ONE DOES use the real `sharp` package (once `npm install` has
// run) — it's only the "browser" half that's faked here, not the
// compression half. Useful as a fast sanity check that the harness +
// dependencies are wired up correctly before running the full
// `capture-demo.ts` against a live Angular app.
//
// Run: npm run dry-run   (from capture/playwright/)

import { CaptureSession } from '../src/capture-session.js';

const outDir = new URL('./output', import.meta.url).pathname;
const session = new CaptureSession({ outDir, viewport: { width: 1280, height: 800 }, seed: 42 });

function fakeRawScreenshot(): Buffer {
  // 1x1px placeholder PNG bytes, standing in for what page.screenshot() would return.
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
      '53de0000000c4944415478da6360000002000155027f72ac0000000049454e' +
      '44ae426082',
    'hex'
  );
}

async function main() {
  let ref = await session.saveScreenshot(fakeRawScreenshot());
  session.addNavigate({ url: 'http://localhost:4221/', cursor: { x: 0, y: 0 }, screenshotRef: ref });

  ref = await session.saveScreenshot(fakeRawScreenshot());
  session.addClick({ target: '[data-testid="nav-demos"]', cursor: { x: 1180, y: 24 }, screenshotRef: ref });

  ref = await session.saveScreenshot(fakeRawScreenshot());
  session.addClick({
    target: '[data-testid="demo-counter-increment"]',
    cursor: { x: 360, y: 220 },
    screenshotRef: ref,
  });

  ref = await session.saveScreenshot(fakeRawScreenshot());
  session.addCircle({
    target: '[data-testid="demo-counter-value"]',
    radius: 40,
    duration: 1200,
    cursor: { x: 320, y: 190 },
    screenshotRef: ref,
  });

  const manifestPath = session.save();
  console.log('Wrote', manifestPath);
  console.log('Events:', session.getEvents().length);
}

main();
