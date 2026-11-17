import { mkdir, access, rm, rename, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { command, mediaBinary, probe } from './system.mjs';

/** Resolve speech before continuous capture; shared with screenshot steps. */
export async function prepareAudio(options, { definition, scenarioDir, recipeDir, cacheDir, narration, signal }) {
  if (narration === 'off') return null;
  const text = options.narration;
  const audioDir = path.join(scenarioDir, 'narration');
  let audio = options.audio && path.resolve(recipeDir, options.audio);
  if (!audio && text && definition.audioProvider) {
    const provider = definition.audioProvider;
    if (!provider.id || !provider.version || typeof provider.synthesize !== 'function') throw new Error('audioProvider requires id, version and synthesize');
    const hash = createHash('sha256').update(JSON.stringify({ text, id: provider.id, version: provider.version, options: provider.options || {} })).digest('hex');
    await mkdir(cacheDir, { recursive: true });
    audio = path.join(cacheDir, `${hash}.wav`);
    try { await access(audio); } catch {
      await mkdir(audioDir, { recursive: true });
      const outputPath = path.join(audioDir, `.generated-${hash}.wav`);
      const temporary = `${audio}.${process.pid}.tmp.wav`;
      try {
        const generated = await provider.synthesize({ text, options: provider.options || {}, outputPath, signal });
        await command(mediaBinary('ffmpeg'), ['-y', '-i', path.resolve(recipeDir, generated), '-vn', '-c:a', 'pcm_s16le', temporary], { signal });
        await rename(temporary, audio);
      } finally {
        await rm(temporary, { force: true });
        await rm(outputPath, { force: true });
      }
    }
  }
  if (text && !audio) throw new Error(`Step ${options.id} needs audio: supply audio, configure audioProvider, or select --narration off`);
  if (!audio) return null;
  const media = await probe(audio, signal);
  const duration = Number(media.format.duration);
  if (!media.streams.some(s => s.codec_type === 'audio') || !(duration > 0)) throw new Error(`Invalid narration clip for ${options.id}`);
  await mkdir(audioDir, { recursive: true });
  const ref = `narration/${options.id}${path.extname(audio)}`;
  await copyFile(audio, path.join(scenarioDir, ref));
  return { ref, duration };
}
