# ADR-013: Pluggable TTS provider — Chatterbox (local) + ElevenLabs (cloud)

**Status:** Accepted

**Context:**

Narration generation (`scripts/generate-narration.mjs`) originally talked to exactly one TTS backend: a self-hosted Chatterbox server, hardcoded to `http://localhost:8004` (made configurable via `CHATTERBOX_TTS_URL` as part of the monorepo-extraction readiness pass — see that work's notes in `docs/roadmap.md`). Chatterbox is free and runs entirely locally, but it has to actually be running and reachable — on a laptop without the right GPU/setup, or one not on the same network as the machine hosting Chatterbox, that means a tunnel or no narration at all.

The ask: generate narration entirely from a work laptop, using an ElevenLabs account, with no dependency on Chatterbox, a second machine, or any networking-between-machines setup.

**Decision:**

- `scripts/generate-narration.mjs` now supports two providers behind one interface, selected via `TTS_PROVIDER=chatterbox|elevenlabs` (default: `chatterbox`, so existing usage is unaffected):
  - **`chatterbox`** — unchanged behavior. `CHATTERBOX_TTS_URL` (default `http://localhost:8004/v1/audio/speech`), `--voice` is a Chatterbox voice-clone filename (default `Abigail.wav`), uses Chatterbox's native `response_format: 'opus'`.
  - **`elevenlabs`** — new. Needs only `ELEVENLABS_API_KEY` set in the environment (never hardcoded, never logged — only the HTTP response body is included in error output, never request headers). `--voice` is an ElevenLabs `voice_id` (default `pNInz6obpgDQGcFmaJgB`, "Adam" — matches the default already used by this user's `hermes-agent` TTS integration, `tools/tts_tool.py`, for consistency). Model is `ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`). Calls `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=opus_48000_64` directly via `fetch` with an `xi-api-key` header — no SDK dependency added, matching the existing plain-`fetch` style used for Chatterbox.
- **ElevenLabs supports native Opus output** (`output_format=opus_48000_64` — codec_sampleRate_bitrate, confirmed against ElevenLabs' own API reference), so — same as Chatterbox — no ffmpeg transcode step is needed. Both providers produce the same `.ogg` (Ogg/Opus) files the rest of the pipeline (manifest fields, players, video export) already expects; nothing downstream of `generate-narration.mjs` needed to change.
- `--voice` defaults are now provider-aware (resolved at runtime based on `TTS_PROVIDER`) rather than a single hardcoded Chatterbox-shaped default, since a Chatterbox filename and an ElevenLabs `voice_id` are unrelated shapes.
- `scripts/dev-server.mjs`, `scripts/generate-all-narration.mjs`, and `scripts/cli.mjs` all spawn `generate-narration.mjs` as a child process without overriding `env`, so `TTS_PROVIDER`/`ELEVENLABS_API_KEY`/`ELEVENLABS_MODEL_ID` set on the parent process flow through unchanged — none of those files needed edits.
- Reference for the ElevenLabs integration pattern (auth header style, voice ID handling, native-Opus output-format string, error message wording) was this user's own working `hermes-agent` project (`_external/hermes-agent/tools/tts_tool.py`'s `_generate_elevenlabs`), not reinvented from scratch — and cross-checked against ElevenLabs' current API reference (`POST /v1/text-to-speech/{voice_id}`) since API shapes can drift from training-data knowledge.

**Consequences:**

- Narration can now be generated from any machine with internet access and an ElevenLabs API key — no Chatterbox install, no LAN/tunnel setup between a work laptop and a Chatterbox-hosting machine.
- ElevenLabs is a paid, metered API (unlike self-hosted Chatterbox) — cost is now a per-provider tradeoff the person running narration generation should be aware of, not something this doc tracks (pricing changes independently of this codebase).
- **Not yet tested against a real ElevenLabs account from this sandbox** — no `ELEVENLABS_API_KEY` is available here to run a live request. The code was verified via `node --check` (parses correctly) and by close reading against both the working `hermes-agent` reference implementation and ElevenLabs' published API reference, but not executed end-to-end. Treat the `elevenlabs` path as "implemented, structurally verified, not live-tested" until someone runs it with a real key.
- `ELEVENLABS_VOICE_ID`/`ELEVENLABS_MODEL_ID`/`ELEVENLABS_API_URL` are all environment-overridable for the same reason `CHATTERBOX_TTS_URL` is — different accounts will want different default voices.
