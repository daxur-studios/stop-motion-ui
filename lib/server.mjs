import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff2': 'font/woff2' };
export function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function localFile(root, ref) {
  if (typeof ref !== 'string' || !ref || ref.includes('\\') || ref.includes(':') || ref.startsWith('/')) throw new Error(`Expected a local relative asset path: ${ref}`);
  const resolvedRoot = await realpath(root);
  const candidate = await realpath(path.resolve(root, ref));
  if (!within(resolvedRoot, candidate)) throw new Error(`Asset escapes scenario directory: ${ref}`);
  return candidate;
}
/** A private ephemeral server; only renderer assets and this run's scenario are served. */
export async function serveRenderer(rendererDir, scenarioDir) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const scenario = pathname.startsWith('/test-scenarios/input/');
      const root = scenario ? scenarioDir : rendererDir;
      const ref = scenario ? pathname.slice('/test-scenarios/input/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = await localFile(root, ref);
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Accept-Ranges', 'bytes');
      let start = 0, end = info.size - 1;
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!range) { res.writeHead(416).end(); return; }
        start = Number(range[1]); end = range[2] ? Number(range[2]) : end;
        if (start > end || end >= info.size) { res.writeHead(416).end(); return; }
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      res.setHeader('Content-Length', end - start + 1);
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404).end('Not found'); else res.destroy(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
