# ADR-014: TTS settings UI, backed by a local gitignored config file

**Status:** Accepted

**Context:**

ADR-013 made the TTS provider pluggable (`chatterbox` | `elevenlabs`), but configuring it meant setting environment variables (`TTS_PROVIDER`, `CHATTERBOX_TTS_URL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`) before every run, or baking them into a shell profile. That's fine for CI or a one-off terminal session, but the `replay-app` already has a dev-server (`scripts/dev-server.mjs`) backing other one-click actions from the UI (narration, video export, voice upload) — there was no equivalent "set it once, from the browser" path for TTS provider/credentials, and no in-app way to see what's currently configured.

The ask: a Settings panel in `replay-app` to choose the provider and enter credentials, persisted locally, without ever putting an API key at risk of round-tripping into client-side JS, localStorage, or a network-tab-visible response after the initial save.

**Decision:**

- **New local config file:** `.local-tts-config.json` at the repo root, gitignored. Read/written exclusively by `scripts/dev-server.mjs`; `scripts/generate-narration.mjs` reads it (read-only, never writes). Shape:

  ```json
  {
    "provider": "chatterbox",
    "chatterbox": { "ttsUrl": "http://localhost:8004/v1/audio/speech", "voiceId": "Abigail.wav" },
    "elevenlabs": { "apiKey": "sk_...", "voiceId": "pNInz6obpgDQGcFmaJgB", "modelId": "eleven_multilingual_v2" }
  }
  ```

  All fields are optional except `provider`; `chatterbox`/`elevenlabs` always exist as (possibly empty) objects. A missing or unparsable file is treated as `{ provider: "chatterbox", chatterbox: {}, elevenlabs: {} }` — there's no error state for "no config file yet," just defaults.

- **`provider` is independent state, not inferred.** Switching `provider` to `"chatterbox"` does not require clearing `elevenlabs.apiKey`, and vice versa. Saved-but-inactive credentials for the other provider just sit in the file unused until someone switches back. This was an explicit, non-negotiable design constraint going in — `applyTtsConfigUpdate()` in `dev-server.mjs` and `resolveTtsConfig()` in `generate-narration.mjs` both read `provider` as its own field, never derived from "does `elevenlabs.apiKey` exist."

- **Precedence, per field, resolved in `generate-narration.mjs`'s `resolveTtsConfig()`:**
  1. `.local-tts-config.json` (if the file exists and the field is set)
  2. Environment variable (`TTS_PROVIDER`, `CHATTERBOX_TTS_URL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`) — unchanged from ADR-013, still fully supported standalone for CI or terminal-only use that never touches the Settings UI
  3. Hardcoded default (e.g. `http://localhost:8004/v1/audio/speech`, `Abigail.wav`, `pNInz6obpgDQGcFmaJgB`, `eleven_multilingual_v2`)

  `provider` itself follows the same three-tier precedence.

- **The API key never leaves this machine in plaintext, and never round-trips back to the browser:**
  - `GET /api/tts-config` returns `maskTtsConfig()`'s output — `elevenlabs.hasApiKey: boolean` instead of the real key. The real `elevenlabs.apiKey` value is never passed to `respond()` anywhere in `dev-server.mjs`, and the one `console.log` of a saved config logs `hasApiKey` (boolean) only, never the key.
  - `POST /api/tts-config`'s body sends a freshly-typed key exactly once, only when the user actually types one. An empty/omitted `elevenlabs.apiKey` in the POST body means "leave whatever is saved unchanged" — it's indistinguishable from "no change" by design, so there's no way to accidentally blank a saved key by saving the form with the password field empty. Explicit removal is a separate flag, `elevenlabs.clearApiKey: true`, wired to its own "Remove saved key" button in the UI, not just "save with an empty field."
  - On the Angular side, `elevenlabsApiKeyInput` is a signal that only ever holds a value the user just typed in *this* page load — it's never populated from the GET response, and is reset to `''` immediately after a successful save so the typed value doesn't linger in memory either.
  - Voice listing for ElevenLabs is **proxied server-side** (`GET /api/tts-config/elevenlabs-voices` → `fetchElevenlabsVoices()` → `https://api.elevenlabs.io/v2/voices`, auth via `xi-api-key` header) rather than called directly from the browser. This avoids both CORS (ElevenLabs' API doesn't allow direct browser-origin calls) and a second path where the key would otherwise have to live in client-side JS just to make the request.

- **Chatterbox voice listing:** confirmed via reading `_external/Chatterbox-TTS-Server/server.py` that the server exposes `GET /v1/audio/voices` (a sibling route to the `/v1/audio/speech` synthesis route used by `generate-narration.mjs`), returning `{ status: "ok", voices: [filename, ...] }` — plain filename strings, not voice objects with separate IDs/names like ElevenLabs. `chatterboxVoicesUrl()` derives the voices URL from whichever speech URL is currently active (regex swap of the path suffix) so the listing always points at the same server actual synthesis would use. Also proxied server-side (`GET /api/tts-config/chatterbox-voices`), mainly for consistency with the ElevenLabs proxy and to keep both providers' UI code shaped the same way, though Chatterbox has no credential to protect.

- **New dev-server endpoints** (`scripts/dev-server.mjs`):
  - `GET /api/tts-config` → masked config
  - `POST /api/tts-config` → partial update, merged onto the existing saved config, returns the new masked config
  - `GET /api/tts-config/elevenlabs-voices` → `{ ok: true, voices: [{voiceId, name, category}] }` or `{ ok: false, status, error }`
  - `GET /api/tts-config/chatterbox-voices` → `{ ok: true, voices: [string] }` or `{ ok: false, status, error }`

- **New Angular UI:** `replay-app/src/app/settings/` (`SettingsComponent`, standalone, routed at `/settings`, linked from the top nav). Provider radio group; Chatterbox section (TTS URL text input, voice `mat-select` populated via the Chatterbox proxy, refresh button); ElevenLabs section (password-type write-only API key input with a dynamic placeholder reflecting `hasApiKey`, "Remove saved key" button, model ID input, voice `mat-select` populated via the ElevenLabs proxy, refresh button); a Save button with inline success/error feedback. Both voice `mat-select`s fall back to showing the currently-saved voice id/filename as a synthetic "(saved)" option if it isn't present in the freshly-loaded list (e.g. the list hasn't loaded yet, or the saved value is stale) — added via `ScriptRunnerService.getTtsConfig/saveTtsConfig/getElevenlabsVoices/getChatterboxVoices`.
  - This is a **global** settings page, distinct from the per-scenario voice picker already on the Replay Player page (`ttsPremadeVoice`/`ttsCustomVoice` in `ReplayPlayerComponent`): Settings controls *which provider and account* `generate-narration.mjs` uses; the per-scenario picker controls *which voice clone* to apply within whichever provider is currently active here.

**Consequences:**

- Anyone using the `replay-app` UI can now switch providers and manage credentials without touching environment variables or a terminal at all — a real quality-of-life improvement over ADR-013's env-var-only setup, especially for the ElevenLabs path (pasting a key into a form is friendlier than exporting it into a shell session every time).
- The terminal/CI/env-var path from ADR-013 is fully preserved as a fallback — nothing about this change requires the Settings UI to ever be opened. A CI job or a quick one-off terminal run still works exactly as before.
- New attack surface to be deliberate about: `.local-tts-config.json` is a plaintext file on disk containing a real API key once saved. It's gitignored (verified the entry is present and correctly named), but it is **not encrypted at rest** — anyone with filesystem access to this machine can read the key directly from the file, same exposure level as an API key sitting in a `.env` file or shell history would have. This is an accepted tradeoff for a local dev tool, not a production secrets-management story.
- **Verification performed:** `node --check` on both touched plain-JS files (`scripts/dev-server.mjs`, `scripts/generate-narration.mjs`) — both pass. The Angular side was verified with the actual Angular template compiler (`node_modules/.bin/ngc -p tsconfig.app.json --noEmit`), which type-checks both the component class and the template (including strict-template-mode checks) — this caught and fixed one real bug before it could ship: Angular template expressions don't support arrow functions (`=>`), so an initial `@if` using an inline `.some((v) => ...)` had to be moved into a plain `isKnownElevenlabsVoice()` method on the component instead. A plain `tsc --noEmit` pass (without Angular's compiler) on the same project also returned clean.
- **Not verified:** no live browser run, no real ElevenLabs or Chatterbox server hit from this sandbox (no network egress to either, and `ng serve`'s dev server / a real browser aren't launchable here — same `esbuild` platform-mismatch limitation already hit in earlier work in this repo, see `docs/agent-maintainability.md`). The save/load round-trip, the "(saved)" fallback option rendering, and the actual masking behavior over a live HTTP request have only been verified by static code reading, not by exercising the running app. Treat this feature as "implemented, compiler-verified, not live-tested" until someone runs `npm run dev`, opens `/settings`, and saves a real key.
