#!/usr/bin/env node
// Pre-generates narration audio for a replay manifest via Daxur-Daemon's local
// Chatterbox TTS server (OpenAI-compatible /v1/audio/speech route). See ADR-004
// for why this is a pre-generation/caching step rather than live in-browser TTS,
// and ADR-008 for why the cached audio is compressed Ogg/Opus rather than WAV.
//
// Usage:
//   node scripts/generate-narration.mjs <scenario-dir> [--voice=Abigail.wav] [--seed=42] [--force]
//
// Example:
//   node scripts/generate-narration.mjs replay/test-scenarios/scenario-1
//
// For each event in <scenario-dir>/manifest.json that has a `narrationShort`
// and/or `narrationLong` text field, this calls the TTS server once per
// variant present, requesting `response_format: 'opus'` so Chatterbox itself
// returns a compressed Ogg/Opus stream (no separate transcode step needed —
// see ADR-008). The result is written as .ogg into <scenario-dir>/narration/,
// and the matching `narrationAudioShort` / `narrationAudioLong` manifest field
// is filled in with the relative path. The manifest is rewritten in place.
//
// Requires the Chatterbox TTS server to be running and reachable at
// http://localhost:8004 (either via `docker-compose up chatterbox-tts`, or
// Daxur-Daemon's daemon-managed local process — see services-manager.ts).
// Existing audio files are skipped unless --force is passed.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const TTS_URL = 'http://localhost:8004/v1/audio/speech';
const DEFAULT_VOICE = 'Abigail.wav';
const DEFAULT_SEED = 42;

function parseArgs(argv) {
  const positional = [];
  const flags = { voice: DEFAULT_VOICE, seed: DEFAULT_SEED, force: false, audioDir: null, audioBaseUrl: null };
  for (const arg of argv) {
    if (arg === '--force') {
      flags.force = true;
    } else if (arg.startsWith('--voice=')) {
      flags.voice = arg.slice('--voice='.length);
    } else if (arg.startsWith('--seed=')) {
      flags.seed = Number(arg.slice('--seed='.length));
    } else if (arg.startsWith('--audio-dir=')) {
      flags.audioDir = arg.slice('--audio-dir='.length);
    } else if (arg.startsWith('--audio-base-url=')) {
      flags.audioBaseUrl = arg.slice('--audio-base-url='.length);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Chatterbox's OpenAI-compatible endpoint natively supports `response_format:
// 'opus'` (in addition to 'wav'/'mp3') — it encodes server-side via libsndfile
// (Ogg container, Opus codec) before the bytes ever leave the TTS server, so
// no ffmpeg/post-processing step is needed here. See ADR-008.
const RESPONSE_FORMAT = 'opus';
const AUDIO_EXT = 'ogg'; // Ogg-encapsulated Opus — plays natively via <audio> in Chrome/Edge/Firefox.

async function synthesize(text, voice, seed) {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'chatterbox',
      input: text,
      voice,
      response_format: RESPONSE_FORMAT,
      speed: 1.0,
      seed,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`TTS request failed (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const scenarioDir = positional[0];
  if (!scenarioDir) {
    console.error('Usage: node scripts/generate-narration.mjs <scenario-dir> [--voice=Abigail.wav] [--seed=42] [--force]');
    process.exit(1);
  }

  const manifestPath = path.join(scenarioDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // --audio-dir redirects audio output outside the Angular public/ tree so ng
  // serve doesn't hot-reload on each clip. Paired with --audio-base-url which
  // becomes the URL prefix stored in the manifest (absolute, served by dev-server).
  const narrationDir = flags.audioDir ?? path.join(scenarioDir, 'narration');
  await mkdir(narrationDir, { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (const ev of manifest.events ?? []) {
    const variants = [
      ['narrationShort', 'narrationAudioShort', 'short'],
      ['narrationLong', 'narrationAudioLong', 'long'],
    ];

    for (const [textField, audioField, label] of variants) {
      const text = ev[textField];
      if (!text) continue;

      const fileName = `${ev.id}-${label}.${AUDIO_EXT}`;
      // When --audio-base-url is provided, store an absolute URL so the browser
      // can fetch audio from the dev-server instead of Angular's asset path.
      const storedPath = flags.audioBaseUrl ? `${flags.audioBaseUrl}/${fileName}` : `narration/${fileName}`;
      const absPath = path.join(narrationDir, fileName);

      if (!flags.force && (await fileExists(absPath))) {
        ev[audioField] = storedPath;
        skipped++;
        console.log(`skip  (exists) ${ev.id} [${label}]`);
        continue;
      }

      console.log(`gen   ${ev.id} [${label}]: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
      const audio = await synthesize(text, flags.voice, flags.seed);
      await writeFile(absPath, audio);
      ev[audioField] = storedPath;
      generated++;
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nDone. Generated ${generated} clip(s), skipped ${skipped} existing clip(s).`);
  console.log(`Manifest updated: ${manifestPath}`);
}

main().catch((err) => {
  console.error('generate-narration failed:', err.message);
  process.exit(1);
});
