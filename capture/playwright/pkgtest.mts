import { CaptureSession } from 'stop-motion-shared/capture-session.js';
import type { Manifest } from 'stop-motion-shared/manifest-types.js';

const session = new CaptureSession({ outDir: '/tmp/pkgtest-out', viewport: { width: 100, height: 100 }, seed: 1 });
console.log('CaptureSession instantiated OK:', typeof session.addNavigate === 'function');
