import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const replayRequire = createRequire(path.join(root, 'replay-app/package.json'));
await build({
  entryPoints: [path.join(root, 'shared/capture-session.ts')],
  outfile: path.join(root, 'dist/capture-session.mjs'),
  bundle: true, platform: 'node', format: 'esm', external: ['sharp'],
});
execFileSync(process.execPath, [
  path.join(path.dirname(replayRequire.resolve('@angular/cli/package.json')), 'bin/ng.js'),
  'build', '--configuration', 'package',
], { cwd: path.join(root, 'replay-app'), stdio: 'inherit' });
