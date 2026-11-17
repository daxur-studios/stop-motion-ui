import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createPacedMouse } from '../lib/paced-mouse.mjs';
import { command, mediaBinary } from '../lib/system.mjs';
import { validateRecording } from '../lib/render-video.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
async function invoke(args) {
  try { const r = await exec(process.execPath, [path.join(root, 'bin/stop-motion-ui.mjs'), ...args, '--json'], { cwd: root, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }); return { code: 0, result: JSON.parse(r.stdout) }; }
  catch (error) { if (!error.stdout) throw error; return { code: error.code, result: JSON.parse(error.stdout) }; }
}
test('paced input renders intermediate positions and refuses covered or disabled targets', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<button style="position:absolute;left:600px;top:400px;width:120px;height:50px">Press</button><script>
      window.positions=[];let x=80;addEventListener('pointermove',e=>x=e.clientX);function tick(){positions.push(x);requestAnimationFrame(tick)}tick();
      document.querySelector('button').onclick=e=>window.clicked={x:e.clientX,y:e.clientY};</script>`);
    const mouse = await createPacedMouse(page);
    const start = performance.now();
    await mouse.click(page.getByRole('button'));
    assert.ok(performance.now() - start >= 500);
    assert.deepEqual(await page.evaluate(() => window.clicked), { x: 660, y: 425 });
    assert.ok(new Set(await page.evaluate(() => positions.filter(x => x > 80 && x < 660))).size >= 5);
    await page.getByRole('button').evaluate(el => el.disabled = true);
    await assert.rejects(mouse.click(page.getByRole('button')), /disabled/);
    await page.getByRole('button').evaluate(el => el.disabled = false);
    await page.evaluate(() => { const cover = document.createElement('div'); cover.style = 'position:absolute;inset:0;background:red;z-index:20'; document.body.append(cover); });
    await assert.rejects(mouse.click(page.getByRole('button')), /covered/);
    await assert.rejects(mouse.moveTo(-10, 10), /viewport/);
  } finally { await browser.close(); }
});

test('continuous CLI retains real footage, retimes waits, pads speech, rerenders and cancels', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(path.join(root, 'ignore/test-continuous-'));
  const tone = path.join(dir, 'tone.wav');
  await command(mediaBinary('ffmpeg'), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1.8', tone]);
  const server = createServer((_req, res) => res.end(`<style>body{background:#203040;color:white}button{position:absolute;left:440px;top:310px;width:130px;height:55px}#ball{position:absolute;top:140px;width:30px;height:30px;background:lime}</style><p>Frame <span id="count"></span></p><div id="ball"></div><button>Begin</button><script>
    let frame=0;function tick(){document.querySelector('#count').textContent=++frame;document.querySelector('#ball').style.left=(frame%400)+'px';requestAnimationFrame(tick)}if(!location.pathname.includes('static'))tick();
    document.querySelector('button').onclick=()=>{window.clicked=true;setTimeout(()=>window.done=true,2200)};</script>`));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const recipe = path.join(dir, 'continuous.ts'), out = path.join(dir, 'runs');
  const calls = path.join(dir, 'calls');
  const content = `import {defineVideo} from '@daxur-studios/stop-motion-ui';
    import {appendFile} from 'node:fs/promises';
    export default defineVideo({viewport:{width:640,height:480},captureFps:12,
    audioProvider:{id:'continuous-tone',version:'1',async synthesize(){await appendFile(${JSON.stringify(calls)},'x');return ${JSON.stringify(tone)};}},
    segments:[{id:'intro',caption:'An animated page',narration:'Fixture tone'}, {id:'press',caption:'Click'}, {id:'wait',caption:'Wait',speed:4}, {id:'done',caption:'Finished'}],
    async ready(page){await page.goto(${JSON.stringify(url)});await page.getByRole('button').waitFor();},
    async run({page,video}){
      await video.segment('intro',async()=>{});
      await video.segment('press',async()=>{await video.click(page.getByRole('button'));if(!await page.evaluate(()=>window.clicked))throw Error('no actual click');});
      await video.segment('wait',async()=>{await page.waitForFunction(()=>window.done);});
      await video.segment('done',async()=>{await video.hold(400);});
    }});`;
  try {
    await writeFile(recipe, content);
    const first = await invoke(['run', recipe, '--out', out, '--fps', '12', '--keep-source']);
    assert.equal(first.code, 0, JSON.stringify(first.result));
    const r = first.result;
    assert.equal(r.captureMode, 'continuous-browser-page');
    assert.equal(r.sourceRetained, true);
    assert.equal(r.media.streams.find(s => s.codec_type === 'video').codec_tag_string, 'hvc1');
    assert.ok(r.media.streams.some(s => s.codec_type === 'audio'));
    const recording = await validateRecording(r.scenarioDir);
    assert.ok(recording.frames.length > 20, 'real intermediate animation frames');
    assert.ok(recording.segments[0].end - recording.segments[0].start >= 1.8, 'speech must finish');
    const mapping = JSON.parse(await readFile(r.mapping));
    const wait = mapping.segments.find(s => s.id === 'wait');
    assert.ok(wait.end - wait.start > 1.5, 'actual readiness wait retained');
    assert.ok(Math.abs(wait.outputDuration - (wait.end - wait.start) / 4) <= 1 / 12);
    assert.ok(recording.pointerTrack.length >= 10);
    assert.ok(mapping.pointerTrack.filter(p => p.outputTime !== null).length >= 10);
    assert.ok(Math.abs(mapping.outputDuration - r.durationSeconds) < 0.1);
    await access(r.contactSheet);
    const silent = await invoke(['render', r.scenarioDir, '--out', out, '--fps', '12', '--codec', 'h264', '--narration', 'off']);
    assert.equal(silent.code, 0, JSON.stringify(silent.result));
    assert.equal(silent.result.captureMode, 'continuous-browser-page');
    assert.equal(silent.result.media.streams.find(s => s.codec_type === 'video').codec_name, 'h264');
    assert.equal(silent.result.media.streams.some(s => s.codec_type === 'audio'), false);
    const second = await invoke(['capture', recipe, '--out', out]);
    assert.equal(second.code, 0, JSON.stringify(second.result));
    assert.equal(second.result.sourceRetained, true);
    await validateRecording(second.result.scenarioDir);
    assert.equal(await readFile(calls, 'utf8'), 'x', 'speech is prepared once and cached across runs');
    await writeFile(recipe, content.replace(JSON.stringify(url), JSON.stringify(url + '/static')));
    const still = await invoke(['run', recipe, '--out', out, '--narration', 'off', '--fps', '12']);
    assert.equal(still.code, 0, JSON.stringify(still.result));
    assert.equal(still.result.sourceRetained, false);
    await assert.rejects(access(path.join(still.result.scenarioDir, 'frames')), { code: 'ENOENT' });
    await access(still.result.video);
    const stillMap = JSON.parse(await readFile(still.result.mapping));
    assert.ok(Math.abs(stillMap.outputDuration - still.result.durationSeconds) < 0.1, 'static source intervals retain their full edited duration');
    await writeFile(recipe, content.replace('await page.waitForFunction(()=>window.done);', "await video.click(page.getByRole('button'));"));
    const bad = await invoke(['capture', recipe, '--out', out]);
    assert.equal(bad.code, 1); assert.equal(bad.result.step, 'wait'); assert.match(bad.result.error, /must be 1x/);
    await access(path.join(bad.result.runDir, 'scenario/failure.png'));
    await writeFile(recipe, content.replace('await page.waitForFunction(()=>window.done);', 'await new Promise(resolve=>setTimeout(resolve,60000));'));
    const cancelled = await invoke(['capture', recipe, '--out', out, '--timeout-ms', '6000']);
    assert.equal(cancelled.code, 1); assert.match(cancelled.result.error, /exceeded/);
    const parent = await mkdtemp(path.join(tmpdir(), 'stop-motion-bad-video-'));
    const tampered = path.join(parent, 'scenario');
    await mkdir(tampered);
    await writeFile(path.join(parent, 'secret.jpg'), 'outside');
    await copyFile(path.join(r.scenarioDir, 'recording.json'), path.join(tampered, 'recording.json'));
    recording.frames[0].file = '../secret.jpg';
    await writeFile(path.join(tampered, 'recording.json'), JSON.stringify(recording));
    await assert.rejects(validateRecording(tampered), /escapes/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
