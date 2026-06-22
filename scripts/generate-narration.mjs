#!/usr/bin/env node
// Pre-generates narration audio for a replay manifest via a pluggable TTS
// provider. Two providers are supported today: chatterbox (default, local/
// free) and elevenlabs (cloud/paid). See ADR-013 for the provider split and
// ADR-014 for the settings-precedence rules below.
//
// --- Config precedence (ADR-014) -----------------------------------------
// Settings are resolved in this order, per field:
//   1. .local-tts-config.json at repo root (written by the replay-app's
//      Settings panel via dev-server.mjs — gitignored, can contain a real
//      ElevenLabs API key)
//   2. Environment variables (TTS_PROVIDER, CHATTERBOX_TTS_URL,
//      ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID) — the
//      original config path, still fully supported standalone (CI, or
//      running this script without ever touching the Settings UI).
//   3. Hardcoded defaults.
// `provider` itself follows the same precedence and is independent of which
// provider has credentials saved — see dev-server.mjs's maskTtsConfig()
// comment for why switching providers never depends on "does a key exist."
//
// Usage:
//   node scripts/generate-narration.mjs <scenario-dir> [--voice=<id>] [--seed=42] [--force]
//
// Examples:
//   node scripts/generate-narration.mjs replay/test-scenarios/scenario-1
//   TTS_PROVIDER=elevenlabs ELEVENLABS_API_KEY=sk_... \\
//     node scripts/generate-narration.mjs replay/test-scenarios/scenario-1
//
// --voice means different things per provider: a Chatterbox voice-clone
// reference filename (e.g. "Abigail.wav") for chatterbox, or an ElevenLabs
// voice_id (e.g. "pNInz6obpgDQGcFmaJgB") for elevenlabs. Each provider falls
// back to its own sensible default if --voice is omitted.
//
// For each event in <scenario-dir>/manifest.json that has a `narrationShort`
// and/or `narrationLong` text field, this calls the configured provider once
// per variant present, and writes the result as Ogg/Opus into
// <scenario-dir>/narration/. The matching `narrationAudioShort` /
// `narrationAudioLong` manifest field is filled in with the relative path.
// The manifest is rewritten in place. Existing audio files are skipped
// unless --force is passed.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// Gitignored local TTS settings file written by the replay-app Settings
// panel via dev-server.mjs. See ADR-014. Read-only from here — this script
// never writes to it.
const LOCAL_TTS_CONFIG_PATH = path.join(ROOT, '.local-tts-config.json');

const DEFAULT_SEED = 42;

// --- chatterbox defaults ---------------------------------------------------
const CHATTERBOX_DEFAULT_TTS_URL = 'http://localhost:8004/v1/audio/speech';
const CHATTERBOX_DEFAULT_VOICE = 'Abigail.wav';
// Chatterbox's OpenAI-compatible endpoint natively supports `response_format:
// 'opus'` (in addition to 'wav'/'mp3') — it encodes server-side via libsndfile
// (Ogg container, Opus codec) before the bytes ever leave the TTS server, so
// no ffmpeg/post-processing step is needed here. See ADR-008.
const CHATTERBOX_RESPONSE_FORMAT = 'opus';
const AUDIO_EXT = 'ogg'; // Ogg-encapsulated Opus — plays natively via <audio> in Chrome/Edge/Firefox.

// --- elevenlabs defaults ----------------------------------------------------
// Defaults below match the ones already used by this user's hermes-agent TTS
// integration (tools/tts_tool.py: DEFAULT_ELEVENLABS_VOICE_ID /
// DEFAULT_ELEVENLABS_MODEL_ID) for consistency across tools.
const ELEVENLABS_API_BASE = process.env.ELEVENLABS_API_URL ?? 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // "Adam"
const ELEVENLABS_DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
// codec_sampleRate_bitrate — ElevenLabs' native Opus output, no ffmpeg
// transcode needed (same no-transcode property Chatterbox's response_format:
// 'opus' gives us). See ADR-013.
const ELEVENLABS_OUTPUT_FORMAT = 'opus_48000_64';

function parseArgs(argv) {
  const positional = [];
  // flags.voice intentionally starts as null (not a default string) so each
  // provider can apply its own provider-appropriate default below.
  const flags = { voice: null, seed: DEFAULT_SEED, force: false, audioDir: null, audioBaseUrl: null };
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

// Reads .local-tts-config.json if present. Returns null on any failure
// (missing file, invalid JSON) so callers cleanly fall back to env vars —
// this keeps plain env-var usage (CI, or this script run standalone without
// ever touching the Settings UI) working with zero config file required.
async function loadLocalTtsConfig() {
  try {
    const raw = await readFile(LOCAL_TTS_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Resolves the effective provider + per-provider settings per the
// precedence in the file header comment: local config file > env vars >
// hardcoded defaults, decided independently per field. `provider` itself
// follows the same precedence and is read verbatim from the config file —
// it is never inferred from "does a key exist for the other provider."
async function resolveTtsConfig() {
  const local = await loadLocalTtsConfig();

  const provider = (local?.provider ?? process.env.TTS_PROVIDER ?? 'chatterbox').toLowerCase();

  const chatterboxTtsUrl =
    local?.chatterbox?.ttsUrl || process.env.CHATTERBOX_TTS_URL || CHATTERBOX_DEFAULT_TTS_URL;
  const chatterboxDefaultVoice = local?.chatterbox?.voiceId || CHATTERBOX_DEFAULT_VOICE;

  // Never logged, never written anywhere by this script.
  const elevenlabsApiKey = local?.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY || null;
  const elevenlabsDefaultVoiceId =
    local?.elevenlabs?.voiceId || process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE_ID;
  const elevenlabsModelId =
    local?.elevenlabs?.modelId || process.env.ELEVENLABS_MODEL_ID || ELEVENLABS_DEFAULT_MODEL_ID;

  return {
    provider,
    configSource: local ? '.local-tts-config.json (env vars fill in any unset fields)' : 'environment variables',
    chatterbox: { ttsUrl: chatterboxTtsUrl, defaultVoice: chatterboxDefaultVoice },
    elevenlabs: { apiKey: elevenlabsApiKey, defaultVoiceId: elevenlabsDefaultVoiceId, modelId: elevenlabsModelId },
  };
}

async function synthesizeChatterbox(text, voice, seed, cfg) {
  const res = await fetch(cfg.chatterbox.ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'chatterbox',
      input: text,
      voice,
      response_format: CHATTERBOX_RESPONSE_FORMAT,
      speed: 1.0,
      seed,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Chatterbox TTS request failed (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function requireElevenlabsApiKey(cfg) {
  if (!cfg.elevenlabs.apiKey) {
    throw new Error(
      'No ElevenLabs API key found. Save one in the replay-app Settings panel, or set ' +
      'ELEVENLABS_API_KEY before running with TTS_PROVIDER=elevenlabs. Get a key at https://elevenlabs.io/.'
    );
  }
  return cfg.elevenlabs.apiKey;
}

async function synthesizeElevenlabs(text, voiceId, seed, cfg) {
  const apiKey = requireElevenlabsApiKey(cfg);
  const url = `${ELEVENLABS_API_BASE}/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: cfg.elevenlabs.modelId,
      // Best-effort determinism; ElevenLabs doesn't guarantee it. Harmless
      // to pass even when it has no effect.
      seed,
    }),
  });
  if (!res.ok) {
    // Only the response body is logged on failure — never request headers,
    // so the API key can never leak into console output or logs.
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`ElevenLabs TTS request failed (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function synthesize(text, voice, seed, cfg) {
  if (cfg.provider === 'elevenlabs') return synthesizeElevenlabs(text, voice, seed, cfg);
  if (cfg.provider === 'chatterbox') return synthesizeChatterbox(text, voice, seed, cfg);
  throw new Error(`Unknown provider "${cfg.provider}" — expected "chatterbox" or "elevenlabs".`);
}

function resolveDefaultVoice(cfg) {
  return cfg.provider === 'elevenlabs' ? cfg.elevenlabs.defaultVoiceId : cfg.chatterbox.defaultVoice;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const scenarioDir = positional[0];
  if (!scenarioDir) {
    console.error('Usage: node scripts/generate-narration.mjs <scenario-dir> [--voice=<id>] [--seed=42] [--force]');
    process.exit(1);
  }

  const cfg = await resolveTtsConfig();
  if (cfg.provider !== 'chatterbox' && cfg.provider !== 'elevenlabs') {
    console.error(`Unknown provider "${cfg.provider}" — expected "chatterbox" or "elevenlabs".`);
    process.exit(1);
  }

  const voice = flags.voice ?? resolveDefaultVoice(cfg);
  console.log(`[generate-narration] provider=${cfg.provider} voice=${voice} (config source: ${cfg.configSource})`);

  const manifestPath = path.join(scenarioDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // --audio-dir redirects audio output outside the Angular public/ tree so ng
  // serve doesn't hot-reload on each clip. Paired with --audio-base-url which
  // becomes the URL prefix stored in the manifest (absolute, served by dev-server).
  const narrationDir = flags.audioDir ?? path.join(scenarioDir, 'narration');

  // Build the full job list up front so `total` (and every clip's identity)
  // is known before any work starts — lets callers (dev-server.mjs's progress
  // endpoint) show every clip as a "pending" slot immediately, instead of
  // clips popping into existence one at a time.
  const jobs = [];
  for (const ev of manifest.events ?? []) {
    for (const [textField, audioField, label] of [
      ['narrationShort', 'narrationAudioShort', 'short'],
      ['narrationLong', 'narrationAudioLong', 'long'],
    ]) {
      const text = ev[textField];
      if (!text) continue;
      const fileName = `${ev.id}-${label}.${AUDIO_EXT}`;
      // When --audio-base-url is provided, store an absolute URL so the browser
      // can fetch audio from the dev-server instead of Angular's asset path.
      const storedPath = flags.audioBaseUrl ? `${flags.audioBaseUrl}/${fileName}` : `narration/${fileName}`;
      const absPath = path.join(narrationDir, fileName);
      jobs.push({ ev, audioField, label, text, fileName, storedPath, absPath });
    }
  }

  const total = jobs.length;
  // Machine-parseable progress lines, consumed by dev-server.mjs's
  // POST /api/narration handler (which tails this script's stdout) and
  // exposed to the Angular UI via GET /api/narration/progress. Plain prefix
  // + single-line JSON, easy to grep out of the human-readable lines around
  // it. See dev-server.mjs's applyProgressEvent().
  console.log(
    `__PROGRESS__ ${JSON.stringify({ phase: 'start', total, jobs: jobs.map((j) => ({ id: j.ev.id, label: j.label })) })}`,
  );

  // Generated audio is held in memory (Buffer + destination path) and only
  // written to disk in flush(), below — once, after the whole batch finishes
  // (successfully or not). Previously each clip was written to disk the
  // moment it finished synthesizing; even though narrationDir is normally
  // redirected outside Angular's watched public/ tree via --audio-dir, this
  // removes the per-clip disk write entirely as a structural fix, so a
  // mid-batch reload can't happen here regardless of where narrationDir
  // happens to point (e.g. when this script is run standalone, without
  // --audio-dir, and narrationDir IS the watched <scenarioDir>/narration/).
  const pendingWrites = [];
  const failures = [];
  let generated = 0;
  let skipped = 0;

  async function flush() {
    if (pendingWrites.length > 0) {
      await mkdir(narrationDir, { recursive: true });
      for (const { absPath, audio } of pendingWrites) {
        await writeFile(absPath, audio);
      }
    }
    // Manifest is rewritten exactly once, here, alongside the audio flush —
    // never per-clip.
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  try {
    let index = 0;
    for (const job of jobs) {
      index++;
      const { ev, audioField, label, text, absPath, storedPath } = job;

      if (!flags.force && (await fileExists(absPath))) {
        ev[audioField] = storedPath;
        skipped++;
        console.log(`skip  (exists) ${ev.id} [${label}]`);
        console.log(
          `__PROGRESS__ ${JSON.stringify({ phase: 'clip', index, total, id: ev.id, label, status: 'skipped' })}`,
        );
        continue;
      }

      console.log(`gen   ${ev.id} [${label}]: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
      console.log(
        `__PROGRESS__ ${JSON.stringify({ phase: 'clip', index, total, id: ev.id, label, status: 'running' })}`,
      );
      try {
        const audio = await synthesize(text, voice, flags.seed, cfg);
        pendingWrites.push({ absPath, audio });
        ev[audioField] = storedPath;
        generated++;
        console.log(
          `__PROGRESS__ ${JSON.stringify({ phase: 'clip', index, total, id: ev.id, label, status: 'done' })}`,
        );
      } catch (err) {
        // Don't let one bad clip take down the rest of the batch, and don't
        // touch ev[audioField] — leave whatever was already there (existing
        // audio from a previous successful run, or nothing) rather than
        // pointing the manifest at a clip that doesn't exist on disk.
        failures.push({ id: ev.id, label, error: err.message });
        console.error(`FAILED ${ev.id} [${label}]: ${err.message}`);
        console.log(
          `__PROGRESS__ ${JSON.stringify({ phase: 'clip', index, total, id: ev.id, label, status: 'failed', error: err.message })}`,
        );
      }
    }
  } finally {
    // Always flush whatever succeeded so far — even if something thrown from
    // outside the per-clip try/catch above (a bug, an out-of-memory, Ctrl+C
    // racing the loop) unwinds past this point, already-generated clips are
    // not silently discarded.
    await flush();
  }

  console.log(`\nDone. Generated ${generated} clip(s), skipped ${skipped} existing clip(s), failed ${failures.length}.`);
  console.log(`Manifest updated: ${manifestPath}`);
  console.log(
    `__PROGRESS__ ${JSON.stringify({ phase: 'end', total, generated, skipped, failed: failures.length, failures })}`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} clip(s) failed:`);
    for (const f of failures) console.error(`  - ${f.id} [${f.label}]: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('generate-narration failed:', err.message);
  process.exit(1);
});
