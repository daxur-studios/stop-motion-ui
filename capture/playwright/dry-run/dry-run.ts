// Dry run of ../src/capture-session.ts with SYNTHETIC data — no real
// browser, no real Playwright navigation. Unlike capture/chrome-mcp's dry
// run, this ONE DOES use the real `sharp` package (once `npm install` has
// run) — it's only the "browser" half that's faked here, not the
// compression half. Useful as a fast sanity check that the harness +
// dependencies are wired up correctly before running the full
// `capture-demo.ts` against a live Angular app.
//
// Run: npm run dry-run   (from capture/playwright/)

import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CaptureSession } from '../src/capture-session.js';

// fileURLToPath (not .pathname) — on Windows, .pathname on a file:// URL
// yields a POSIX-style "/D:/code/..." string, which Node's path resolver
// then mis-resolves by re-prepending the cwd's drive (-> "D:\D:\code\...").
// fileURLToPath handles the platform-specific conversion correctly.
const outDir = fileURLToPath(new URL('./output', import.meta.url));
const session = new CaptureSession({ outDir, viewport: { width: 1280, height: 800 }, seed: 42 });

async function fakeRawScreenshot(): Promise<Buffer> {
  // 1x1px placeholder PNG, standing in for what page.screenshot() would
  // return. Generated via sharp itself (already a real dependency here)
  // rather than hand-rolled hex bytes — a hand-rolled minimal PNG previously
  // used here turned out to be malformed and tripped libspng on decode.
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function main() {
  let ref = await session.saveScreenshot(await fakeRawScreenshot());
  session.addNavigate({ url: 'http://localhost:4221/', cursor: { x: 0, y: 0 }, screenshotRef: ref });

  ref = await session.saveScreenshot(await fakeRawScreenshot());
  session.addClick({ target: '[data-testid="nav-demos"]', cursor: { x: 1180, y: 24 }, screenshotRef: ref });

  ref = await session.saveScreenshot(await fakeRawScreenshot());
  session.addClick({
    target: '[data-testid="demo-counter-increment"]',
    cursor: { x: 360, y: 220 },
    screenshotRef: ref,
  });

  ref = await session.saveScreenshot(await fakeRawScreenshot());
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
