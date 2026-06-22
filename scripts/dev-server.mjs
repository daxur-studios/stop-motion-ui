#!/usr/bin/env node
// Companion dev server for the replay-app Angular UI — exposes HTTP endpoints
// so the browser can trigger TTS generation and video export without leaving
// the Angular dev tab.
//
// Start alongside `ng serve` with:
//   node scripts/dev-server.mjs
//
// Listens on port 3001 (Angular dev server uses 4221 by default).
// CORS is open to localhost:4221 only.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PORT = 3001;
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, "..");

// Gitignored folder for uploaded voice files and generated narration audio —
// outside Angular's watched asset paths so writes here do NOT trigger ng serve
// hot-reload. Sub-dirs: ignore/voices/ (uploaded cloning references) and
// ignore/audio/{scenario}/ (TTS output served via GET /narration/{scenario}/*).
const LOCAL_VOICES_DIR = process.env.LOCAL_VOICES_DIR ?? path.join(ROOT, "ignore");
const NARRATION_DIR = process.env.NARRATION_DIR ?? path.join(ROOT, "ignore", "audio");

// Chatterbox's own voices directory (Docker volume mount). Uploaded files are
// mirrored here so Chatterbox can find them by filename. Defaults to an
// in-repo, gitignored folder so this works out of the box on a fresh clone —
// override with CHATTERBOX_VOICES_DIR if your Chatterbox instance mounts a
// different host path (e.g. a sibling Chatterbox-TTS-Server checkout).
const CHATTERBOX_VOICES_DIR =
  process.env.CHATTERBOX_VOICES_DIR ??
  path.resolve(ROOT, "ignore", "chatterbox-voices");

// Gitignored local TTS settings file written by the Settings panel — see
// docs/adr/ADR-014-tts-settings-ui.md. Holds the active provider plus
// per-provider settings (including, for ElevenLabs, the API key). This file
// never leaves this machine and is never echoed back to the browser in
// plaintext — see maskTtsConfig() below.
const LOCAL_TTS_CONFIG_PATH = path.join(ROOT, ".local-tts-config.json");

const ALLOWED_VOICE_EXT = new Set([".wav", ".mp3", ".ogg", ".flac", ".m4a"]);
// No spaces — the filename is passed as a CLI arg and spaces break shell splitting on Windows.
const SAFE_FILENAME_RE = /^[\w][\w\-.]*$/;

// All Angular-served scenarios live here. This is the single canonical
// location for both TTS and video export so the generated files are
// immediately serveable by ng serve without a copy step.
function scenarioDir(name) {
  return path.join(ROOT, "replay-app", "public", "test-scenarios", name);
}

// Validate scenario name: must be a simple identifier, no path traversal.
function isValidScenario(name) {
  return typeof name === "string" && /^[\w-]+$/.test(name) && !name.includes("..");
}

// ---- local TTS config (provider choice + per-provider settings) ----------
//
// Shape on disk:
//   {
//     "provider": "chatterbox" | "elevenlabs",
//     "chatterbox": { "ttsUrl"?: string, "voiceId"?: string },
//     "elevenlabs": { "apiKey"?: string, "voiceId"?: string, "modelId"?: string }
//   }
//
// `provider` is independent state — it is NOT inferred from "does a key
// exist." Saved-but-inactive credentials for the other provider just sit
// here unused until someone switches `provider` back. See ADR-014.

function defaultTtsConfig() {
  return { provider: "chatterbox", chatterbox: {}, elevenlabs: {} };
}

async function loadTtsConfig() {
  try {
    const raw = await readFile(LOCAL_TTS_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider === "elevenlabs" ? "elevenlabs" : "chatterbox",
      chatterbox: { ...(parsed.chatterbox ?? {}) },
      elevenlabs: { ...(parsed.elevenlabs ?? {}) },
    };
  } catch {
    return defaultTtsConfig();
  }
}

async function saveTtsConfig(config) {
  await mkdir(path.dirname(LOCAL_TTS_CONFIG_PATH), { recursive: true });
  await writeFile(LOCAL_TTS_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

// Never sends the real API key to the browser, even after it's been saved —
// only a boolean. This is the ONLY way tts-config data should ever reach the
// client; the raw `config.elevenlabs.apiKey` value must never be passed to
// respond() or console.log()'d.
function maskTtsConfig(config) {
  return {
    provider: config.provider,
    chatterbox: {
      ttsUrl: config.chatterbox?.ttsUrl ?? null,
      voiceId: config.chatterbox?.voiceId ?? null,
    },
    elevenlabs: {
      hasApiKey: Boolean(config.elevenlabs?.apiKey),
      voiceId: config.elevenlabs?.voiceId ?? null,
      modelId: config.elevenlabs?.modelId ?? null,
    },
  };
}

// Applies a partial update from the Settings panel's POST body onto the
// existing saved config and persists the result. The API key is special:
// since GET never echoes the real value back, an empty/omitted
// `elevenlabs.apiKey` in the POST body always means "leave whatever is
// already saved unchanged" — the only way to remove a saved key is the
// explicit `elevenlabs.clearApiKey: true` flag.
async function applyTtsConfigUpdate(body) {
  const current = await loadTtsConfig();
  const next = {
    provider: current.provider,
    chatterbox: { ...current.chatterbox },
    elevenlabs: { ...current.elevenlabs },
  };

  if (typeof body.provider === "string") {
    if (body.provider !== "chatterbox" && body.provider !== "elevenlabs") {
      throw new Error(`Invalid provider "${body.provider}" — expected "chatterbox" or "elevenlabs".`);
    }
    next.provider = body.provider;
  }

  if (body.chatterbox && typeof body.chatterbox === "object") {
    if (typeof body.chatterbox.ttsUrl === "string") {
      next.chatterbox.ttsUrl = body.chatterbox.ttsUrl.trim() || undefined;
    }
    if (typeof body.chatterbox.voiceId === "string") {
      next.chatterbox.voiceId = body.chatterbox.voiceId.trim() || undefined;
    }
  }

  if (body.elevenlabs && typeof body.elevenlabs === "object") {
    if (body.elevenlabs.clearApiKey === true) {
      delete next.elevenlabs.apiKey;
    } else if (typeof body.elevenlabs.apiKey === "string" && body.elevenlabs.apiKey.trim()) {
      next.elevenlabs.apiKey = body.elevenlabs.apiKey.trim();
    }
    if (typeof body.elevenlabs.voiceId === "string") {
      next.elevenlabs.voiceId = body.elevenlabs.voiceId.trim() || undefined;
    }
    if (typeof body.elevenlabs.modelId === "string") {
      next.elevenlabs.modelId = body.elevenlabs.modelId.trim() || undefined;
    }
  }

  await saveTtsConfig(next);
  return next;
}

// Fetches the caller's ElevenLabs voice list server-side (never directly
// from the browser) so the API key never has to leave this process and the
// browser never hits ElevenLabs' CORS policy directly. Falls back to
// ELEVENLABS_API_KEY if no key has been saved via the Settings panel yet,
// matching generate-narration.mjs's own env-fallback precedence.
async function fetchElevenlabsVoices() {
  const config = await loadTtsConfig();
  const apiKey = config.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 400, error: "No ElevenLabs API key saved yet — save one in Settings first." };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      // Only the response body is logged/returned on failure — never the
      // request headers — so the API key can never leak via this endpoint.
      const text = await res.text().catch(() => "<no body>");
      return { ok: false, status: res.status, error: `ElevenLabs voices request failed (${res.status}): ${text}` };
    }
    const data = await res.json();
    const voices = (data.voices ?? []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category ?? null,
    }));
    return { ok: true, voices };
  } catch (err) {
    return { ok: false, status: 502, error: err.message };
  }
}

// Chatterbox's OpenAI-compatible server exposes voice listing at
// /v1/audio/voices, a sibling of the /v1/audio/speech route used for
// synthesis (confirmed in Chatterbox-TTS-Server's server.py —
// `@app.get("/v1/audio/voices")`, returns `{status, voices: [filename, ...]}`).
// Derives the voices URL from whichever speech URL is currently configured
// (saved config, else CHATTERBOX_TTS_URL env var, else the same localhost
// default generate-narration.mjs uses) so this always points at the same
// server actual synthesis would use.
function chatterboxVoicesUrl(ttsUrl) {
  return ttsUrl.replace(/\/v1\/audio\/speech\/?$/, "/v1/audio/voices");
}

async function fetchChatterboxVoices() {
  const config = await loadTtsConfig();
  const ttsUrl =
    config.chatterbox?.ttsUrl || process.env.CHATTERBOX_TTS_URL || "http://localhost:8004/v1/audio/speech";
  const voicesUrl = chatterboxVoicesUrl(ttsUrl);
  try {
    const res = await fetch(voicesUrl);
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      return { ok: false, status: res.status, error: `Chatterbox voices request failed (${res.status}): ${text}` };
    }
    const data = await res.json();
    const voices = Array.isArray(data.voices) ? data.voices : [];
    return { ok: true, voices };
  } catch (err) {
    return { ok: false, status: 502, error: `Could not reach Chatterbox at ${voicesUrl}: ${err.message}` };
  }
}

// Run a child process, wait for it to exit, return { ok, exitCode, output }.
// stdout + stderr are interleaved in insertion order and printed to this
// process's terminal so the operator can watch progress in real time.
function runProcess(cmd, args, label) {
  return new Promise((resolve) => {
    console.log(`\n[dev-server] Starting ${label}:\n  ${cmd} ${args.join(" ")}\n`);
    const lines = [];
    const child = spawn(cmd, args, {
      cwd: ROOT,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (buf) => {
      const text = buf.toString();
      process.stdout.write(text);
      lines.push(text);
    });
    child.stderr.on("data", (buf) => {
      const text = buf.toString();
      process.stderr.write(text);
      lines.push(text);
    });
    child.on("close", (code) => {
      const ok = code === 0;
      console.log(`\n[dev-server] ${label} ${ok ? "done ✓" : `failed (exit ${code})`}\n`);
      resolve({ ok, exitCode: code, output: lines.join("") });
    });
    child.on("error", (err) => {
      console.error(`[dev-server] spawn error for ${label}:`, err.message);
      resolve({ ok: false, exitCode: null, output: err.message });
    });
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "http://localhost:4221",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function respond(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(json);
}

const server = createServer(async (req, res) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET") {
    // GET /api/tts-config — current provider + settings, API key masked to
    // a boolean. Safe to expose to the browser as-is.
    if (req.url === "/api/tts-config") {
      const config = await loadTtsConfig();
      respond(res, 200, maskTtsConfig(config));
      return;
    }

    // GET /api/tts-config/elevenlabs-voices — server-side proxy to
    // ElevenLabs' voice list using the saved (or env-fallback) API key. The
    // key itself never appears in this response.
    if (req.url === "/api/tts-config/elevenlabs-voices") {
      const result = await fetchElevenlabsVoices();
      respond(res, result.ok ? 200 : result.status ?? 500, result);
      return;
    }

    // GET /api/tts-config/chatterbox-voices — server-side proxy to
    // Chatterbox's own /v1/audio/voices listing endpoint.
    if (req.url === "/api/tts-config/chatterbox-voices") {
      const result = await fetchChatterboxVoices();
      respond(res, result.ok ? 200 : result.status ?? 500, result);
      return;
    }

    // Serve generated narration audio from the gitignored ignore/audio/ tree.
    // GET /narration/{scenario}/{filename} — used by the Angular app when audio
    // was generated with --audio-dir so files live outside Angular's public/ dir.
    const match = req.url?.match(/^\/narration\/([^/?#]+)\/([^/?#]+)$/);
    if (match) {
      const [, scenario, filename] = match;
      const ext = path.extname(filename).toLowerCase();
      if (!isValidScenario(scenario) || !ALLOWED_VOICE_EXT.has(ext)) {
        respond(res, 400, { error: "Invalid path" });
        return;
      }
      const filePath = path.join(NARRATION_DIR, scenario, filename);
      try {
        const data = await readFile(filePath);
        const mime = { ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac" }[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, ...corsHeaders() });
        res.end(data);
      } catch {
        respond(res, 404, { error: "Audio file not found" });
      }
      return;
    }
    respond(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    respond(res, 405, { error: "POST only" });
    return;
  }

  const body = await readBody(req);

  if (req.url === "/api/tts-config") {
    try {
      const saved = await applyTtsConfigUpdate(body);
      console.log(
        `[dev-server] TTS config saved: provider=${saved.provider} ` +
        `chatterbox.voiceId=${saved.chatterbox.voiceId ?? "(default)"} ` +
        `elevenlabs.hasApiKey=${Boolean(saved.elevenlabs.apiKey)} ` +
        `elevenlabs.voiceId=${saved.elevenlabs.voiceId ?? "(default)"}`
      );
      respond(res, 200, maskTtsConfig(saved));
    } catch (err) {
      respond(res, 400, { error: err.message });
    }
    return;
  }

  if (req.url === "/api/voices/upload") {
    const { filename, data } = body;
    const ext = path.extname(filename ?? "").toLowerCase();
    // Normalize spaces → underscores so the name is always shell-safe.
    const base = path.basename(filename ?? "").replace(/\s+/g, "_");
    const stem = base.slice(0, -ext.length);
    if (!filename || !SAFE_FILENAME_RE.test(stem) || !ALLOWED_VOICE_EXT.has(ext)) {
      respond(res, 400, { error: `Invalid voice filename: ${filename}` });
      return;
    }
    if (typeof data !== "string") {
      respond(res, 400, { error: "Missing base64 data field" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    await mkdir(LOCAL_VOICES_DIR, { recursive: true });
    const dest = path.join(LOCAL_VOICES_DIR, base);
    await writeFile(dest, buffer);
    console.log(`[dev-server] Voice saved: ${dest}`);
    // Mirror to Chatterbox's voices dir so it can find the file by filename.
    if (CHATTERBOX_VOICES_DIR !== LOCAL_VOICES_DIR) {
      await mkdir(CHATTERBOX_VOICES_DIR, { recursive: true });
      await writeFile(path.join(CHATTERBOX_VOICES_DIR, base), buffer);
      console.log(`[dev-server] Voice mirrored to Chatterbox: ${path.join(CHATTERBOX_VOICES_DIR, base)}`);
    }
    respond(res, 200, { voice: base, path: dest });
    return;
  }

  const { scenario } = body;

  if (!isValidScenario(scenario)) {
    respond(res, 400, { error: `Invalid scenario name: ${scenario}` });
    return;
  }

  const dir = scenarioDir(scenario);

  if (req.url === "/api/narration") {
    // Redirect audio output to ignore/audio/{scenario}/ so Angular doesn't
    // hot-reload on every clip. The manifest stores absolute URLs served by
    // this dev-server's GET /narration/{scenario}/* endpoint.
    const audioDirForScenario = path.join(NARRATION_DIR, scenario);
    const audioBaseUrl = `http://localhost:${PORT}/narration/${scenario}`;
    const args = [
      path.join(SCRIPTS_DIR, "generate-narration.mjs"),
      dir,
      `--audio-dir=${audioDirForScenario}`,
      `--audio-base-url=${audioBaseUrl}`,
    ];
    if (typeof body.voice === "string" && body.voice) args.push(`--voice=${body.voice}`);
    if (typeof body.seed === "number") args.push(`--seed=${body.seed}`);
    if (body.force === true) args.push("--force");
    const result = await runProcess("node", args, `TTS for ${scenario}`);
    respond(res, result.ok ? 200 : 500, result);
    return;
  }

  if (req.url === "/api/video") {
    const narration = body.narration ?? "short";
    const fps = body.fps ?? 30;
    const outPath = path.join(dir, "export.mp4");
    // playwright-export.mjs drives the Angular canvas directly — no Python/Pillow
    // or ffprobe needed. Angular dev server must be running at localhost:4221.
    const result = await runProcess("node", [path.join(SCRIPTS_DIR, "playwright-export.mjs"), scenario, `--narration=${narration}`, `--fps=${fps}`, `--out=${outPath}`], `Video export for ${scenario}`);
    respond(res, result.ok ? 200 : 500, result);
    return;
  }

  if (req.url === "/api/capture") {
    const headed = body.headed === true;
    const captureDir = path.join(ROOT, "capture", "playwright");
    const env = { ...process.env, HEADLESS: headed ? "false" : "true" };
    const result = await new Promise((resolve) => {
      const label = `Playwright capture (${headed ? "headed" : "headless"})`;
      console.log(`\n[dev-server] Starting ${label}\n`);
      const lines = [];
      const child = spawn("npm", ["run", "capture:demo"], {
        cwd: captureDir,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      child.stdout.on("data", (buf) => { const t = buf.toString(); process.stdout.write(t); lines.push(t); });
      child.stderr.on("data", (buf) => { const t = buf.toString(); process.stderr.write(t); lines.push(t); });
      child.on("close", (code) => {
        const ok = code === 0;
        console.log(`\n[dev-server] ${label} ${ok ? "done ✓" : `failed (exit ${code})`}\n`);
        resolve({ ok, exitCode: code, output: lines.join("") });
      });
      child.on("error", (err) => resolve({ ok: false, exitCode: null, output: err.message }));
    });
    respond(res, result.ok ? 200 : 500, result);
    return;
  }

  respond(res, 404, { error: "Unknown endpoint" });
});

server.listen(PORT, () => {
  console.log(`[dev-server] Listening on http://localhost:${PORT}`);
  console.log(`[dev-server] GET  /api/tts-config                    -> { provider, chatterbox, elevenlabs: { hasApiKey, ... } }`);
  console.log(`[dev-server] POST /api/tts-config                    { provider?, chatterbox?: {...}, elevenlabs?: {...} }`);
  console.log(`[dev-server] GET  /api/tts-config/elevenlabs-voices  -> { voices: [...] } (needs a saved/env API key)`);
  console.log(`[dev-server] GET  /api/tts-config/chatterbox-voices  -> { voices: [...] }`);
  console.log(`[dev-server] POST /api/narration      { scenario: "scenario-1", voice?, seed?, force? }`);
  console.log(`[dev-server] POST /api/voices/upload  { filename: "my.mp3", data: "<base64>" }`);
  console.log(`[dev-server] POST /api/video          { scenario: "scenario-1", narration?: "short"|"long"|"off", fps?: 30 }`);
  console.log(`[dev-server] Voices (local):      ${LOCAL_VOICES_DIR}  (override with LOCAL_VOICES_DIR)`);
  console.log(`[dev-server] Voices (Chatterbox): ${CHATTERBOX_VOICES_DIR}  (override with CHATTERBOX_VOICES_DIR)`);
  console.log(`[dev-server] Narration audio dir: ${NARRATION_DIR}  (override with NARRATION_DIR)`);
  console.log(`[dev-server] Local TTS config:    ${LOCAL_TTS_CONFIG_PATH}  (gitignored, see ADR-014)`);
  console.log(`[dev-server] CORS open to http://localhost:4221`);
});
