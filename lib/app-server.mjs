import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { command } from './system.mjs';

async function responds(url, signal) {
  try { const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) }); await res.body?.cancel(); return res.ok; } catch { signal.throwIfAborted(); return false; }
}
export async function startApp(config, { cwd, signal, log }) {
  if (!config) return async () => {};
  if (!Array.isArray(config.command) || !config.command.length || config.command.some(a => typeof a !== 'string') || !config.url) throw new Error('webServer requires command: [executable, ...args] and url');
  if (await responds(config.url, signal)) {
    if (!config.reuseExistingServer) throw new Error(`App already responds at ${config.url}; explicitly enable reuseExistingServer to use it`);
    return async () => {};
  }
  const child = spawn(config.command[0], config.command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  child.stdout.on('data', data => log(String(data)));
  child.stderr.on('data', data => log(String(data)));
  let exited = false, launchError;
  child.once('exit', () => { exited = true; });
  child.once('error', error => { launchError = error; exited = true; });
  const stop = async () => {
    if (!child.pid) return;
    if (process.platform === 'win32') await command('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { timeout: 10_000 }).catch(() => {});
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  };
  try {
    const deadline = Date.now() + (config.timeoutMs ?? 120_000);
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (exited) throw new Error(`App process stopped before readiness: ${launchError?.message || child.exitCode}`);
      if (await responds(config.url, signal)) return stop;
      await delay(200, undefined, { signal });
    }
    throw new Error(`App did not become ready at ${config.url}`);
  } catch (error) { await stop(); throw error; }
}
