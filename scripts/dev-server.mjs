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
import path from "node:path";

const PORT = 3001;
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, "..");

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (req.method !== "POST") {
    respond(res, 405, { error: "POST only" });
    return;
  }

  const body = await readBody(req);
  const { scenario } = body;

  if (!isValidScenario(scenario)) {
    respond(res, 400, { error: `Invalid scenario name: ${scenario}` });
    return;
  }

  const dir = scenarioDir(scenario);

  if (req.url === "/api/narration") {
    const result = await runProcess("node", [path.join(SCRIPTS_DIR, "generate-narration.mjs"), dir], `TTS for ${scenario}`);
    respond(res, result.ok ? 200 : 500, result);
    return;
  }

  if (req.url === "/api/video") {
    const narration = body.narration ?? "short";
    const fps = body.fps ?? 30;
    const outPath = path.join(dir, "export.mp4");
    const result = await runProcess("node", [path.join(SCRIPTS_DIR, "export-video.mjs"), dir, `--narration=${narration}`, `--fps=${fps}`, `--out=${outPath}`], `Video export for ${scenario}`);
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
  console.log(`[dev-server] POST /api/narration  { scenario: "scenario-1" }`);
  console.log(`[dev-server] POST /api/video       { scenario: "scenario-1", narration?: "short"|"long"|"off", fps?: 30 }`);
  console.log(`[dev-server] CORS open to http://localhost:4221`);
});
