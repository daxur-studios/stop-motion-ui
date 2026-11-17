import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { command } from './system.mjs';

// npm's Windows .cmd shims require a shell. Resolve the Node entrypoint instead
// so quotes, newlines and shell metacharacters in narration stay literal args.
async function daxurCommand() {
  if (process.platform !== 'win32') return ['daxur'];
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const exe = path.join(directory, 'daxur.exe');
    try { await access(exe); return [exe]; } catch {}
    const shim = path.join(directory, 'daxur.cmd');
    let contents;
    try { contents = await readFile(shim, 'utf8'); } catch { continue; }
    const relative = contents.match(/"%dp0%[\\/]([^"\r\n]+\.(?:cjs|mjs|js))"/i)?.[1];
    if (!relative) throw new Error('Unsupported daxur.cmd shim; set daxurSpeech({ command: [nodePath, daxurEntrypoint] })');
    const entrypoint = path.resolve(directory, relative);
    await access(entrypoint);
    return [process.execPath, entrypoint];
  }
  throw new Error('Daxur not found on PATH; install it or set daxurSpeech({ command: [executable, ...args] })');
}

/** External speech boundary: Daxur owns credentials, provider calls and its cache. */
export function daxurSpeech({ voice = 'Fola', model = 'gemini-3.8-flash-tts', command: invocation, timeoutMs = 120_000 } = {}) {
  if (typeof voice !== 'string' || !voice.trim() || typeof model !== 'string' || !model.trim()) throw new Error('Daxur voice and model must be nonempty strings');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Daxur timeoutMs must be a positive integer');
  if (invocation !== undefined && (!Array.isArray(invocation) || !invocation.length || invocation.some(arg => typeof arg !== 'string' || !arg))) throw new Error('Daxur command must be a nonempty argument array');
  return {
    id: 'daxur-gemini-speech', version: '1', options: { voice, model },
    async synthesize({ text, outputPath, signal }) {
      signal.throwIfAborted();
      if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Daxur narration must contain 1–2000 characters; split longer narration into steps');
      if (!outputPath || !path.isAbsolute(outputPath)) throw new Error('Daxur speech requires an absolute outputPath');
      const [executable, ...prefix] = invocation || await daxurCommand();
      const { stdout } = await command(executable, [...prefix, 'generate', 'gemini-speech', text, '--out', outputPath, '--voice', voice, '--model', model, '--agent'], { signal, timeout: timeoutMs });
      let result;
      try { result = JSON.parse(stdout); } catch { throw new Error('Daxur speech returned invalid agent JSON'); }
      if (result.status !== 'success' || typeof result.out !== 'string' || !path.isAbsolute(result.out)) throw new Error('Daxur speech did not report success with an absolute output path');
      if (path.resolve(result.out) !== path.resolve(outputPath)) throw new Error('Daxur speech returned an unexpected output path');
      const output = await stat(result.out);
      if (!output.isFile() || output.size === 0) throw new Error('Daxur speech output is empty or not a file');
      return result.out;
    },
  };
}
