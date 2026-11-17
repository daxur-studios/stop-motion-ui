#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, copyFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { chromium } from 'playwright';
import { renderScenario, rendererDir } from '../lib/render.mjs';
import { captureDemo } from '../lib/capture.mjs';
import { captureVideo } from '../lib/video.mjs';
import { renderVideo } from '../lib/render-video.mjs';
import { command, mediaBinary } from '../lib/system.mjs';
import { startApp } from '../lib/app-server.mjs';

const usage = `Usage: stop-motion-ui <doctor|run|capture|render> [recipe-or-scenario] [options]
  doctor                    Check browser, ffmpeg, ffprobe and bundled renderer.
  run <recipe.mjs|ts>        Capture and render an agent-authored demo.
  capture <recipe.mjs|ts>    Capture only; retain scenario for later rendering.
  render <scenario-dir>     Render an existing local manifest and assets.
  --out <directory>         Parent directory for isolated run folders (default artifacts/videos/stop-motion).
                           For render only, may be a new .mp4 path.
  --narration off|short|long Explicitly select silent video or supplied audio.
  --fps <1-60>              Default 30. --codec hevc|h264 (default hevc).
  --timeout-ms <ms>         Whole job limit; default 600000 (10 minutes).
  --keep-source             Retain continuous run frames for later rerendering.
  --json                    One result object on stdout; logs on stderr.
  --help                    Show this help.
Recipes import { defineDemo } or { defineVideo } from '@daxur-studios/stop-motion-ui'.
Read node_modules/@daxur-studios/stop-motion-ui/skills/adopt-stop-motion-capture/SKILL.md.`;

let runDir, stage = 'arguments', pendingLog = Promise.resolve();
const controller = new AbortController();
const signal = controller.signal;
const cancel = () => controller.abort(new Error('Job cancelled'));
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
let timer, stopApp = async () => {};
const printResult = (result, compact = true) => process.stdout.write(JSON.stringify(result, null, compact ? 0 : 2) + '\n');
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: 'string' }, narration: { type: 'string' }, fps: { type: 'string' }, codec: { type: 'string' },
    json: { type: 'boolean' }, help: { type: 'boolean' }, 'timeout-ms': { type: 'string' }, 'keep-source': { type: 'boolean' },
  } });
  const [action, input] = positionals;
  if (values.help || action === 'help' || !action) { console.log(usage); return; }
  if (values.json) {
    // Recipe diagnostics must not corrupt the single JSON result on stdout.
    console.log = console.error.bind(console);
    console.info = console.error.bind(console);
  }
  const timeout = Number(values['timeout-ms'] ?? 600_000);
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 3_600_000) throw new Error('timeout-ms must be between 100 and 3600000');
  timer = setTimeout(() => controller.abort(new Error(`Job exceeded ${timeout}ms`)), timeout);
  timer.unref();
  const log = message => {
    process.stderr.write(`${message}\n`);
    if (runDir) pendingLog = pendingLog.then(() => appendFile(path.join(runDir, 'run.log'), `${message}\n`));
  };
  if (action === 'doctor') {
    stage = 'doctor';
    const checks = {};
    for (const name of ['ffmpeg', 'ffprobe']) {
      try { const { stdout } = await command(mediaBinary(name), ['-version'], { signal }); checks[name] = { ok: true, version: stdout.split('\n')[0] }; }
      catch (error) { checks[name] = { ok: false, error: error.message }; }
    }
    try { await access(path.join(rendererDir, 'index.html')); checks.renderer = { ok: true }; }
    catch { checks.renderer = { ok: false, error: 'Bundled renderer missing; rebuild/reinstall the package' }; }
    let browser;
    try { browser = await chromium.launch({ headless: true }); checks.chromium = { ok: true, version: browser.version() }; }
    catch (error) { checks.chromium = { ok: false, error: `${error.message}\nInstall with: npx playwright install chromium` }; }
    finally { await browser?.close(); }
    const result = { ok: Object.values(checks).every(c => c.ok), checks };
    printResult(result, values.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!['run', 'capture', 'render'].includes(action) || !input || positionals.length !== 2) throw new Error(usage);
  const cwd = process.cwd();
  const source = path.resolve(input);
  const exactVideo = action === 'render' && values.out?.endsWith('.mp4') ? path.resolve(values.out) : null;
  if (exactVideo) { try { await access(exactVideo); throw new Error(`Refusing to overwrite ${exactVideo}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const output = exactVideo ? path.dirname(exactVideo) : path.resolve(values.out || 'artifacts/videos/stop-motion');
  await mkdir(output, { recursive: true });
  runDir = await mkdtemp(path.join(output, 'run-'));
  const resultPath = path.join(runDir, 'result.json');
  let definition;
  let scenarioDir = source;
  let narration = values.narration || 'short';
  let captureMode = 'reconstructed-screenshots';
  const job = async () => {
    if (action !== 'render') {
      stage = 'recipe';
      const loaded = await tsImport(pathToFileURL(source).href, import.meta.url);
      // tsx returns a CJS namespace for .ts recipes in repositories without
      // type:module; tolerate that wrapper without changing the host package.
      definition = loaded.default?.default ?? loaded.default;
      if (!definition || typeof definition.run !== 'function') throw new Error('Recipe must default-export defineDemo or defineVideo with run: async (...) => ...');
      captureMode = definition.mode === 'continuous-browser-page' ? definition.mode : 'reconstructed-screenshots';
      narration = values.narration || definition.narration || 'short';
      if (!['off', 'short', 'long'].includes(narration)) throw new Error('narration must be off, short or long');
      stage = 'app-start';
      stopApp = await startApp(definition.webServer, { cwd, signal, log });
      stage = 'capture';
      scenarioDir = path.join(runDir, 'scenario');
      const capture = captureMode === 'continuous-browser-page' ? captureVideo : captureDemo;
      await capture(definition, scenarioDir, { recipeDir: path.dirname(source), cacheDir: path.join(output, '.audio-cache'), narration, signal, log });
      await stopApp(); stopApp = async () => {};
    }
    stage = 'render';
    if (action === 'render') {
      try { await access(path.join(scenarioDir, 'recording.json')); captureMode = 'continuous-browser-page'; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const render = captureMode === 'continuous-browser-page' ? renderVideo : renderScenario;
    const rendered = action === 'capture' ? {} : await render(scenarioDir, runDir, { fps: Number(values.fps ?? 30), narration, codec: values.codec || 'hevc', signal, log });
    if (exactVideo) { await copyFile(rendered.video, exactVideo, constants.COPYFILE_EXCL); rendered.video = exactVideo; }
    // Only remove frames from the scenario created by this successful run.
    // Capture and explicit retention preserve rerenderable source material.
    const sourceRetained = action !== 'run' || captureMode !== 'continuous-browser-page' || Boolean(values['keep-source']);
    if (!sourceRetained) await rm(path.join(runDir, 'scenario', 'frames'), { recursive: true, force: true });
    let revision = null, dirty = null;
    try {
      revision = (await command('git', ['rev-parse', 'HEAD'], { cwd, signal })).stdout.trim();
      dirty = Boolean((await command('git', ['status', '--porcelain'], { cwd, signal })).stdout.trim());
    } catch {}
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    return { ok: true, action, toolVersion: pkg.version, captureMode, source, revision, dirty, runDir, resultPath, scenarioDir, sourceRetained, ...rendered };
  };
  const aborted = new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const result = await Promise.race([job(), aborted]);
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  printResult(result, values.json);
}
try { await main(); }
catch (error) {
  controller.abort(error);
  const result = { ok: false, stage, step: error.step || null, error: error.message, runDir, diagnostics: runDir ? path.join(runDir, 'run.log') : null };
  if (runDir) await writeFile(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2)).catch(() => {});
  printResult(result); process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await stopApp();
  await pendingLog.catch(() => {});
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
// Abort has already closed owned browsers/encoder and app processes. Avoid an
// uncooperative user recipe keeping the worker alive after its job deadline.
if (signal.aborted) { const exitTimer = setTimeout(() => process.exit(1), 1000); exitTimer.unref(); }
