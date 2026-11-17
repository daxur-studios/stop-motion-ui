import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { daxurSpeech } from '../lib/daxur-speech.mjs';

test('Daxur adapter preserves literal narration, validates output and stops owned processes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stop-motion-daxur-'));
  const fake = path.join(directory, 'fake daxur.mjs');
  await writeFile(fake, `import {writeFileSync} from 'node:fs';
const [mode,...args]=process.argv.slice(2);
const out=args[args.indexOf('--out')+1];
writeFileSync(out+'.args.json',JSON.stringify(args));
if(mode==='failure') {console.error('Provider unavailable');process.exit(1);}
if(mode==='hang') {writeFileSync(out+'.pid',String(process.pid));setInterval(()=>{},1000);}
else if(mode==='invalid') console.log('not JSON');
else if(mode==='status') console.log(JSON.stringify({status:'error'}));
else if(mode==='wrong-path') console.log(JSON.stringify({status:'success',out:out+'.other'}));
else {writeFileSync(out,mode==='empty'?'':'RIFF-fixture');console.log(JSON.stringify({status:'success',out,cached:true,bytes:12}));}
`);
  const outputPath = path.join(directory, 'speech with spaces.wav');
  const text = 'Quotes "hello", $(literal), `backticks`, & | < > %PATH%\nSecond line.';
  const request = { text, outputPath, signal: new AbortController().signal };
  const provider = mode => daxurSpeech({ command: [process.execPath, fake, mode] });
  assert.equal(await provider('ok').synthesize(request), outputPath);
  const args = JSON.parse(await readFile(outputPath + '.args.json', 'utf8'));
  assert.equal(args[2], text);
  assert.equal(args[args.indexOf('--voice') + 1], 'Fola');
  assert.equal(args.at(-1), '--agent');
  await assert.rejects(provider('failure').synthesize(request), /Provider unavailable/);
  await assert.rejects(provider('invalid').synthesize(request), /invalid agent JSON/);
  await assert.rejects(provider('status').synthesize(request), /did not report success/);
  await assert.rejects(provider('wrong-path').synthesize(request), /unexpected output path/);
  await assert.rejects(provider('empty').synthesize(request), /empty/);
  await assert.rejects(provider('ok').synthesize({ ...request, text: 'x'.repeat(2001) }), /2000/);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(provider('ok').synthesize({ ...request, signal: aborted.signal }), { name: 'AbortError' });
  // A per-provider timeout must terminate the CLI, independently of job timeout.
  await assert.rejects(daxurSpeech({ command: [process.execPath, fake, 'hang'], timeoutMs: 1000 }).synthesize(request), /failed/);
  const pid = Number(await readFile(outputPath + '.pid', 'utf8'));
  assert.throws(() => process.kill(pid, 0), 'timed-out speech process must stop');
});
