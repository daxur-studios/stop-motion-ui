# ADR-008: Narration Audio Compression (Opus, not WAV)

**Status:** Accepted

**Context:** `scripts/generate-narration.mjs` (ADR-004) pre-generates narration audio via Daxur-Daemon's local Chatterbox TTS server and caches it alongside each scenario's manifest. It originally requested `response_format: 'wav'`, i.e. uncompressed PCM. WAV narration clips run roughly 1-2MB for a single sentence — multiplied across every event's short *and* long variant, across every scenario, this adds up fast for what's ultimately spoken-word audio with no fidelity requirement beyond "clearly intelligible."

**Decision:**
- Request `response_format: 'opus'` from Chatterbox's OpenAI-compatible `/v1/audio/speech` endpoint instead of `'wav'`. Checked Chatterbox's source (`_external/Chatterbox-TTS-Server/server.py` + `utils.py::encode_audio`) directly: the server already supports `Literal["wav", "opus", "mp3"]` and encodes Opus server-side via `soundfile.write(..., format="ogg", subtype="opus")` before the response ever leaves the TTS server. **No ffmpeg or other post-processing transcode step is needed** — this is the preferred "native" path, not a fallback.
- Saved cached clips get a `.ogg` extension (Ogg-encapsulated Opus), e.g. `narration/click-2-short.ogg`. Both `replay/player.js` and `ReplayPlayerComponent` load narration via plain `new Audio(); audio.src = <ref>` with no hardcoded extension/MIME assumptions, so this required no player code changes — Chrome/Edge/Firefox all play Ogg/Opus natively via `<audio>`.
- Bitrate is **not configurable** through Chatterbox's API — `encode_audio()` calls `soundfile`'s Opus encoder with no explicit bitrate argument, so libopus's own default applies. This is an accepted limitation: even at the encoder's default quality, Opus is dramatically smaller than 16-bit PCM WAV for speech (typically 80-90%+ smaller; see the worked example below). If finer bitrate control is ever needed, it would require either patching the vendored `Chatterbox-TTS-Server` (kept deliberately out-of-repo — see `docker-compose.yml` comments) or adding an ffmpeg transcode step after the fact; not done here since the default already meets the "clearly intelligible" bar for spoken narration.
- `manifest-types.ts`'s `narrationAudioShort`/`narrationAudioLong` doc comments updated to reflect `.ogg` instead of `.wav`.

**Consequences:**
- No new runtime dependency (no ffmpeg wired into the generation pipeline) — consistent with ADR-004's "no new runtime dependencies" goal.
- Smaller cached narration clips and a smaller overall repo/asset footprint per scenario.
- Pre-existing `.wav` clips generated before this change are not automatically deleted or migrated; regenerating a scenario with `--force` (or deleting its `narration/` folder first) produces fresh `.ogg` files alongside the now-orphaned `.wav` ones, which should be removed manually.
- If Chatterbox is ever swapped for a different TTS backend that lacks native Opus output, this decision should be revisited — at that point an ffmpeg transcode step (precedent: Daxur-Daemon's `cli/src/commands/media/compress.ts`, which already uses `fluent-ffmpeg`/`ffmpeg-static` for video) would be the fallback, run immediately after generation with the uncompressed intermediate discarded rather than kept.
