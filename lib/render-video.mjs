import { readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { localFile } from './server.mjs';
import { command, mediaBinary, probe } from './system.mjs';

export async function validateRecording(dir, narration = 'short', signal) {
  const data = JSON.parse(await readFile(path.join(dir, 'recording.json'), 'utf8'));
  const { width, height } = data.viewport || {};
  if (data.schema !== 1 || data.mode !== 'continuous-browser-page') throw new Error('Unsupported continuous recording');
  if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0)) throw new Error('Viewport dimensions must be even integers from 64 to 4096');
  if (!Number.isFinite(data.sourceDuration) || data.sourceDuration <= 0 || data.sourceDuration > 3600) throw new Error('Invalid continuous source duration');
  if (!Array.isArray(data.frames) || !data.frames.length || data.frames.length > 18000) throw new Error('Invalid continuous frames');
  let last = -1, bytes = 0;
  for (const frame of data.frames) {
    signal?.throwIfAborted();
    if (!Number.isFinite(frame.sourceTime) || frame.sourceTime < 0 || frame.sourceTime <= last || frame.sourceTime > data.sourceDuration) throw new Error('Invalid source frame timestamps');
    last = frame.sourceTime;
    const file = await localFile(dir, frame.file);
    const { size } = await stat(file);
    bytes += size;
    if (bytes > 512 * 1024 * 1024) throw new Error('Source frames exceed 512 MiB');
  }
  if (!Array.isArray(data.segments) || !data.segments.length || data.segments.length > 100) throw new Error('Invalid continuous segments');
  const ids = new Set(); let end = 0, duration = 0;
  for (const segment of data.segments) {
    if (!/^[a-zA-Z0-9_-]+$/.test(segment.id || '') || ids.has(segment.id)) throw new Error('Invalid or duplicate segment ID');
    ids.add(segment.id);
    if (![segment.start, segment.end, segment.speed].every(Number.isFinite) || Math.abs(segment.start - end) > 0.000001 || segment.end <= segment.start || segment.end > data.sourceDuration || segment.speed < 1 || segment.speed > 20) throw new Error(`Invalid segment timing: ${segment.id}`);
    if (narration !== 'off' && segment.narration && !segment.audio) throw new Error(`Step ${segment.id} needs audio or --narration off`);
    if (segment.audio && narration !== 'off') {
      if (segment.speed !== 1) throw new Error('Narrated segments must be 1x');
      const media = await probe(await localFile(dir, segment.audio), signal);
      if (!media.streams.some(s => s.codec_type === 'audio') || !(Number(media.format.duration) > 0) || Number(media.format.duration) > segment.end - segment.start + 0.05) throw new Error(`Narration exceeds or is invalid for segment ${segment.id}`);
    }
    end = segment.end; duration += (segment.end - segment.start) / segment.speed;
  }
  if (Math.abs(end - data.sourceDuration) > 0.000001 || duration > 120) throw new Error('Invalid edited duration; must cover source and be at most 120 seconds');
  return data;
}

/** Encode directly from retained source JPEGs; no lossy intermediate MP4. */
export async function renderVideo(scenarioDir, runDir, { fps = 30, codec = 'hevc', narration = 'short', signal, log = () => {} } = {}) {
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('fps must be an integer from 1 to 60');
  if (!['hevc', 'h264'].includes(codec)) throw new Error('codec must be h264 or hevc');
  if (!['off', 'short', 'long'].includes(narration)) throw new Error('narration must be off, short or long');
  const data = await validateRecording(scenarioDir, narration, signal);
  const work = path.join(runDir, 'render-work');
  await mkdir(work, { recursive: true });
  try {
    // Use controlled numeric names: neither concat syntax nor filter expressions
    // interpolate recipe paths, captions or other authored text.
    const filenames = [];
    for (const [i, frame] of data.frames.entries()) {
      signal?.throwIfAborted();
      const file = `${String(i).padStart(5, '0')}.jpg`;
      await copyFile(await localFile(scenarioDir, frame.file), path.join(work, file));
      filenames.push(file);
    }
    const inputs = [];
    // Clip frame *intervals*, not just frame timestamps. A static frame can
    // span a segment boundary; FFmpeg trim would otherwise discard its hold
    // when there is no new packet at the segment's starting timestamp.
    for (const [i, segment] of data.segments.entries()) {
      let first = data.frames.findLastIndex(f => f.sourceTime <= segment.start);
      first = Math.max(0, first);
      const selected = [{ index: first, time: segment.start }];
      for (let j = first + 1; j < data.frames.length && data.frames[j].sourceTime < segment.end; j++) selected.push({ index: j, time: data.frames[j].sourceTime });
      const lines = [];
      selected.forEach((frame, j) => lines.push(`file '${filenames[frame.index]}'`, 'option framerate 1000', `duration ${Math.max(0.001, (selected[j + 1]?.time ?? segment.end) - frame.time)}`));
      lines.push(`file '${filenames[selected.at(-1).index]}'`, 'option framerate 1000');
      const list = `segment-${i}.txt`;
      await writeFile(path.join(work, list), lines.join('\n') + '\n');
      inputs.push('-threads', '1', '-f', 'concat', '-safe', '0', '-i', list);
    }
    const filters = [], audio = [], segments = [];
    let output = 0, totalFrames = 0;
    for (const [i, segment] of data.segments.entries()) {
      const frameCount = Math.max(1, Math.ceil((segment.end - segment.start) / segment.speed * fps));
      const duration = frameCount / fps;
      segments.push({ ...segment, outputStart: output, outputDuration: duration, outputFrames: frameCount });
      output += duration; totalFrames += frameCount;
      filters.push(`[${i}:v]setpts=(PTS-STARTPTS)/${segment.speed},tpad=stop_mode=clone:stop_duration=1,fps=${fps},trim=end_frame=${frameCount},setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv,format=yuv420p[v${i}]`);
      if (narration !== 'off' && segment.audio) {
        const filename = `audio-${audio.length}${path.extname(segment.audio)}`;
        await copyFile(await localFile(scenarioDir, segment.audio), path.join(work, filename));
        inputs.push('-i', filename);
        audio.push(segments.at(-1));
      }
    }
    if (output > 120 || totalFrames > 3600) throw new Error('Video exceeds 120 seconds / 3600 output frames; split the recipe');
    filters.push(`${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[v]`);
    audio.forEach((segment, i) => filters.push(`[${i + segments.length}:a]adelay=${Math.round(segment.outputStart * 1000)}:all=1[a${i}]`));
    if (audio.length) filters.push(`${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0,apad,atrim=duration=${output}[a]`);
    await writeFile(path.join(work, 'filters.txt'), filters.join(';\n'));
    log(`Encoding continuous video: ${segments.length} segments, ${output.toFixed(2)}s`);
    await command(mediaBinary('ffmpeg'), ['-y', '-hide_banner', '-loglevel', 'error', ...inputs,
      '-filter_complex_script', 'filters.txt', '-map', '[v]',
      ...(audio.length ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '128k'] : []),
      '-c:v', codec === 'hevc' ? 'libx265' : 'libx264', '-preset', 'medium', '-crf', codec === 'hevc' ? '28' : '23',
      ...(codec === 'hevc' ? ['-tag:v', 'hvc1'] : []), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-movflags', '+faststart', 'demo.mp4'], { cwd: work, signal });
    const video = path.join(runDir, 'demo.mp4');
    const media = await probe(path.join(work, 'demo.mp4'), signal);
    if (!media.streams.some(s => s.codec_type === 'video') || (audio.length && !media.streams.some(s => s.codec_type === 'audio'))) throw new Error('Encoded media is missing an expected stream');
    if (Math.abs(Number(media.format.duration) - output) > 0.1) throw new Error('Encoded duration differs from source/output mapping');
    await copyFile(path.join(work, 'demo.mp4'), video, constants.COPYFILE_EXCL);
    const previews = [];
    for (let i = 0; i < 6; i++) {
      const frame = data.frames[Math.round(i * (data.frames.length - 1) / 5)];
      previews.push(await sharp(await localFile(scenarioDir, frame.file)).resize(320, 200, { fit: 'contain', background: '#111' }).toBuffer());
    }
    const contactSheet = path.join(runDir, 'contact-sheet.jpg');
    await sharp({ create: { width: 960, height: 400, channels: 3, background: '#111' } }).composite(previews.map((input, i) => ({ input, left: i % 3 * 320, top: Math.floor(i / 3) * 200 }))).jpeg({ quality: 85 }).toFile(contactSheet);
    await copyFile(await localFile(scenarioDir, data.frames[0].file), path.join(runDir, 'first-frame.jpg'));
    const transcript = path.join(runDir, 'transcript.txt'), mapping = path.join(runDir, 'timeline.json');
    await writeFile(transcript, segments.map(s => `${s.id} (${s.speed}x): ${s.narration || s.caption || ''}`).join('\n') + '\n');
    const pointerTrack = (data.pointerTrack || []).map(p => {
      const segment = segments.find(s => p.sourceTime >= s.start && p.sourceTime <= s.end);
      return { ...p, outputTime: segment ? segment.outputStart + Math.min(segment.outputDuration, (p.sourceTime - segment.start) / segment.speed) : null };
    });
    await writeFile(mapping, JSON.stringify({ sourceDuration: data.sourceDuration, outputDuration: output, fps, segments, pointerTrack }, null, 2));
    media.format.filename = video;
    return { video, durationSeconds: Number(media.format.duration), viewport: data.viewport, codec, fps, narration, audioClips: audio.length, sourceFrames: data.frames.length, captureFps: data.captureFps, media, contactSheet, transcript, mapping };
  } finally { await rm(work, { recursive: true, force: true }); }
}
