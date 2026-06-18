// Dry run of manifest-builder.ts with SYNTHETIC data — no browser, no Chrome MCP.
// Proves the harness produces schema-valid manifest.json + a screenshots/
// folder whose files all exist. This is NOT a real capture; see RUNBOOK.md
// "Status" for why a live test-capture/ doesn't exist yet.
//
// Run: npx ts-node capture/chrome-mcp/dry-run/dry-run.ts
//   (or: npx tsx capture/chrome-mcp/dry-run/dry-run.ts)

import { writeFileSync } from 'fs';
import { join } from 'path';
import { CaptureSession } from '../manifest-builder';

const outDir = join(__dirname, 'output');
const session = new CaptureSession({
  outDir,
  viewport: { width: 1280, height: 800 },
});

function fakeScreenshot(name: string) {
  // 1x1 px placeholder PNG bytes — stands in for a real screenshot.
  const onePixelPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
      '53de0000000c4944415478da6360000002000155027f72ac0000000049454e' +
      '44ae426082',
    'hex'
  );
  writeFileSync(join(outDir, 'screenshots', name), onePixelPng);
}

let shot = session.nextScreenshotName();
fakeScreenshot(shot);
session.addNavigate({ url: 'https://example.com', cursor: { x: 0, y: 0 }, screenshotRef: `screenshots/${shot}` });

shot = session.nextScreenshotName();
fakeScreenshot(shot);
session.addClick({ target: 'a:has-text("More information...")', cursor: { x: 420, y: 310 }, screenshotRef: `screenshots/${shot}` });

shot = session.nextScreenshotName();
fakeScreenshot(shot);
session.addNavigate({ url: 'https://example.com', cursor: { x: 0, y: 0 }, screenshotRef: `screenshots/${shot}` });

const manifestPath = session.save();
console.log('Wrote', manifestPath);
console.log('Events:', session.getEvents().length);
