import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

const DEV_SERVER = 'http://localhost:3001';

export type ScriptResult = { ok: boolean; exitCode: number | null; output: string };

// Mirrors dev-server.mjs's maskTtsConfig() shape exactly — the real
// ElevenLabs API key never appears here, only `hasApiKey`. See ADR-014.
export type TtsConfig = {
  provider: 'chatterbox' | 'elevenlabs';
  chatterbox: { ttsUrl: string | null; voiceId: string | null };
  elevenlabs: { hasApiKey: boolean; voiceId: string | null; modelId: string | null };
};

// Body shape for POST /api/tts-config. `elevenlabs.apiKey` is write-only —
// omit/leave blank to keep whatever is already saved; set `clearApiKey: true`
// to remove a saved key instead.
export type TtsConfigUpdate = {
  provider?: 'chatterbox' | 'elevenlabs';
  chatterbox?: { ttsUrl?: string; voiceId?: string };
  elevenlabs?: { apiKey?: string; clearApiKey?: boolean; voiceId?: string; modelId?: string };
};

export type ElevenlabsVoiceOption = { voiceId: string; name: string; category?: string | null };

export type ElevenlabsVoicesResult =
  | { ok: true; voices: ElevenlabsVoiceOption[] }
  | { ok: false; status?: number; error: string };

// Chatterbox's /v1/audio/voices returns plain filenames (e.g. "Abigail.wav"),
// not voice objects — see dev-server.mjs's fetchChatterboxVoices() comment.
export type ChatterboxVoicesResult =
  | { ok: true; voices: string[] }
  | { ok: false; status?: number; error: string };

// dev-server.mjs always returns a JSON body shaped like { ok, ... } even on
// failure (400/500/502), but a genuine network failure (dev-server not
// running at all) gives HttpErrorResponse.error something else entirely
// (e.g. a ProgressEvent) — this guards against blindly trusting that shape.
function isVoicesErrorBody(value: unknown): value is { ok: false; error: string; status?: number } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

@Injectable({ providedIn: 'root' })
export class ScriptRunnerService {
  private http = inject(HttpClient);

  generateNarration(
    scenario: string,
    options?: { voice?: string; seed?: number; force?: boolean },
  ): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/narration`, { scenario, ...options });
  }

  exportVideo(scenario: string, narration: 'short' | 'long' | 'off' = 'short', fps = 30): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/video`, { scenario, narration, fps });
  }

  runCapture(scenario: string, headed: boolean): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/capture`, { scenario, headed });
  }

  uploadVoice(file: File): Observable<{ voice: string; path: string }> {
    return new Observable((observer) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        this.http
          .post<{ voice: string; path: string }>(`${DEV_SERVER}/api/voices/upload`, {
            filename: file.name,
            data: base64,
          })
          .subscribe(observer);
      };
      reader.onerror = () => observer.error(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // --- TTS settings (ADR-014) ----------------------------------------------
  // The API key never round-trips through any of these calls in plaintext —
  // GET only ever returns `hasApiKey: true/false`, and POST only sends a key
  // the user just typed once into the write-only password field.

  getTtsConfig(): Observable<TtsConfig> {
    return this.http.get<TtsConfig>(`${DEV_SERVER}/api/tts-config`);
  }

  saveTtsConfig(update: TtsConfigUpdate): Observable<TtsConfig> {
    return this.http.post<TtsConfig>(`${DEV_SERVER}/api/tts-config`, update);
  }

  // Both voice-list calls treat dev-server's non-2xx JSON error bodies
  // (e.g. "no API key saved yet", "Chatterbox unreachable") as normal
  // result values rather than thrown errors, so the component can render
  // them as inline feedback without a try/catch.

  getElevenlabsVoices(): Observable<ElevenlabsVoicesResult> {
    return this.http.get<ElevenlabsVoicesResult>(`${DEV_SERVER}/api/tts-config/elevenlabs-voices`).pipe(
      catchError((err: HttpErrorResponse) =>
        of(
          isVoicesErrorBody(err.error)
            ? err.error
            : { ok: false as const, status: err.status, error: err.message },
        ),
      ),
    );
  }

  getChatterboxVoices(): Observable<ChatterboxVoicesResult> {
    return this.http.get<ChatterboxVoicesResult>(`${DEV_SERVER}/api/tts-config/chatterbox-voices`).pipe(
      catchError((err: HttpErrorResponse) =>
        of(
          isVoicesErrorBody(err.error)
            ? err.error
            : { ok: false as const, status: err.status, error: err.message },
        ),
      ),
    );
  }
}
