import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { localFile } from '../lib/server.mjs';
import { validateScenario } from '../lib/render.mjs';
import { mediaBinary, command } from '../lib/system.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'bin/stop-motion-ui.mjs');
async function invoke(args) {
  try {
    const result = await exec(process.execPath, [cli, ...args, '--json'], { cwd: root, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    return { code: 0, result: JSON.parse(result.stdout) };
  } catch (error) {
    if (!error.stdout) throw error;
    return { code: error.code, result: JSON.parse(error.stdout) };
  }
}

test('scenario assets cannot escape their directory; malformed scenarios fail early', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stop-motion-paths-'));
  await mkdir(path.join(dir, 'scenario'));
  await writeFile(path.join(dir, 'outside.txt'), 'private');
  await assert.rejects(localFile(path.join(dir, 'scenario'), '../outside.txt'), /escapes/);
  await assert.rejects(localFile(dir, 'http://localhost/file'), /relative/);
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ viewport: { width: 961, height: 640 }, events: [] }));
  await assert.rejects(validateScenario(dir, 'off'), /even integers/);
});

test('real capture, cached audio, render, rerun and cancellation', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(path.join(root, 'ignore/test-workflow-'));
  const tone = path.join(dir, 'tone.wav');
  await command(mediaBinary('ffmpeg'), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.7', tone]);
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const app = path.join(dir, 'app.mjs');
  await writeFile(app, `import { createServer } from 'node:http'; import {writeFileSync} from 'node:fs';
writeFileSync(${JSON.stringify(path.join(dir, 'pid'))},String(process.pid));
createServer((req,res)=>res.end(${JSON.stringify('<button onclick="this.textContent=&#39;Saved&#39;">Save</button>')})).listen(${port},'127.0.0.1');`);
  const recipe = path.join(dir, 'recipe.ts');
  const content = `import { defineDemo } from ${JSON.stringify(pathToPackage())};
import {appendFile} from 'node:fs/promises';
export default defineDemo({ viewport:{width:640,height:480}, baseURL:'http://127.0.0.1:${port}',
webServer:{command:[process.execPath,${JSON.stringify(app)}],url:'http://127.0.0.1:${port}'},
audioProvider:{id:'test-tone',version:'1',options:{voice:'fixture'},async synthesize(){await appendFile(${JSON.stringify(path.join(dir, 'calls'))},'x');return ${JSON.stringify(tone)};}},
async run({page,demo}){const label: string='Saved';await page.goto('/');await demo.capture({id:'start',narration:'A test tone'});await demo.click(page.getByRole('button'),{id:'save',narration:'A different test tone',ready:async page=>page.getByRole('button',{name:label,exact:true}).waitFor()});}});`;
  await writeFile(recipe, content);
  const out = path.join(dir, 'runs');
  const first = await invoke(['run', recipe, '--out', out, '--fps', '6']);
  assert.equal(first.code, 0, JSON.stringify(first.result));
  const video = first.result.media.streams.find(s => s.codec_type === 'video');
  assert.equal(first.result.codec, 'hevc');
  assert.equal(video.codec_name, 'hevc');
  assert.equal(video.codec_tag_string, 'hvc1');
  assert.equal(video.width, 640); assert.equal(video.height, 480);
  assert.ok(first.result.media.streams.some(s => s.codec_type === 'audio'));
  const second = await invoke(['capture', recipe, '--out', out]);
  assert.equal(second.code, 0, JSON.stringify(second.result));
  assert.notEqual(first.result.runDir, second.result.runDir);
  assert.equal((await readFile(path.join(dir, 'calls'), 'utf8')).length, 2, 'unchanged speech should reuse cache');
  const commonJSRecipe = path.join(dir, 'recipe.cts');
  await writeFile(commonJSRecipe, content);
  const commonJS = await invoke(['capture', commonJSRecipe, '--out', out]);
  assert.equal(commonJS.code, 0, JSON.stringify(commonJS.result));
  assert.equal(await readFile(recipe, 'utf8'), content, 'authored recipe must stay unchanged');
  const rerender = await invoke(['render', first.result.scenarioDir, '--out', path.join(dir, 'revised.mp4'), '--fps', '6', '--codec', 'h264']);
  assert.equal(rerender.code, 0, JSON.stringify(rerender.result));
  assert.equal(rerender.result.codec, 'h264');
  assert.equal(rerender.result.media.streams.find(s => s.codec_type === 'video').codec_name, 'h264');
  const overwrite = await invoke(['render', first.result.scenarioDir, '--out', path.join(dir, 'revised.mp4')]);
  assert.equal(overwrite.code, 1); assert.match(overwrite.result.error, /overwrite/);
  await writeFile(recipe, content.replace('A test tone', 'Changed text'));
  const changed = await invoke(['capture', recipe, '--out', out]);
  assert.equal(changed.code, 0, JSON.stringify(changed.result));
  assert.equal((await readFile(path.join(dir, 'calls'), 'utf8')).length, 3);
  await writeFile(recipe, content.replace("audioProvider:{id:", "unusedProvider:{id:"));
  const missingAudio = await invoke(['capture', recipe, '--out', out]);
  assert.equal(missingAudio.code, 1); assert.equal(missingAudio.result.step, 'start');
  assert.match(missingAudio.result.error, /needs audio/);
  await writeFile(recipe, content.replace("await page.goto('/');", "console.log('recipe diagnostic');await page.goto('/');"));
  const diagnostics = await invoke(['capture', recipe, '--out', out]);
  assert.equal(diagnostics.code, 0, 'recipe console logs must stay off JSON stdout');
  await writeFile(recipe, content.replace("await demo.capture({id:'start',narration:'A test tone'});", "await demo.capture({id:'start',narration:'A test tone'});await new Promise(resolve=>setTimeout(resolve,60000));"));
  const cancelled = await invoke(['run', recipe, '--out', out, '--timeout-ms', '3000']);
  assert.equal(cancelled.code, 1); assert.match(cancelled.result.error, /exceeded/);
  const pid = Number(await readFile(path.join(dir, 'pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), 'owned app must stop after timeout');
  assert.ok((await readdir(first.result.runDir)).includes('contact-sheet.jpg'));
});

function pathToPackage() { return '@daxur-studios/stop-motion-ui'; }
