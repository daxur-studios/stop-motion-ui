import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
export function mediaBinary(name) {
  if (process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH']) {
    return process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  }
  const base = path.join(homedir(), 'AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
  if (existsSync(base)) for (const entry of readdirSync(base)) {
    const candidate = path.join(base, entry, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return name;
}
export async function command(file, args, options = {}) {
  try {
    return await execute(file, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...options });
  } catch (error) {
    throw new Error(`${file} failed: ${error.stderr || error.message}`, { cause: error });
  }
}
export async function probe(file, signal) {
  const { stdout } = await command(mediaBinary('ffprobe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { signal });
  return JSON.parse(stdout);
}
