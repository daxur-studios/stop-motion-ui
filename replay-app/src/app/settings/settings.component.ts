import { Component, OnInit, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ScriptRunnerService,
  type ElevenlabsVoiceOption,
  type TtsConfigUpdate,
} from '../shared/script-runner.service';

// Global TTS provider/credentials settings panel — see ADR-014. This is a
// separate, global concern from the per-scenario voice picker already on
// the Replay Player page (ttsPremadeVoice/ttsCustomVoice in
// replay-player.component.ts): this page controls *which provider and
// account* generate-narration.mjs uses; that one controls *which voice
// clone* to apply within whichever provider is currently active here.
//
// SECURITY: the ElevenLabs API key field is write-only. It is never
// pre-filled with a real value (the GET /api/tts-config response from
// dev-server.mjs only ever returns `hasApiKey: true/false`, never the key
// itself — see ScriptRunnerService.getTtsConfig()), and the local
// `elevenlabsApiKeyInput` signal is cleared immediately after a successful
// save so the key value doesn't linger in this component's memory either.
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatRadioModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly scriptRunner = inject(ScriptRunnerService);

  // ---- loaded/saved config state ----
  readonly loading = signal(true);
  readonly provider = signal<'chatterbox' | 'elevenlabs'>('chatterbox');

  readonly chatterboxTtsUrl = signal('');
  readonly chatterboxVoiceId = signal('');

  // Write-only — never populated from the server. Blank means "leave the
  // saved key, if any, unchanged" on save.
  readonly elevenlabsApiKeyInput = signal('');
  readonly elevenlabsHasApiKey = signal(false);
  readonly elevenlabsVoiceId = signal('');
  readonly elevenlabsModelId = signal('');

  // ---- voice lists (fetched server-side via dev-server proxies) ----
  readonly chatterboxVoices = signal<string[]>([]);
  readonly chatterboxVoicesLoading = signal(false);
  readonly chatterboxVoicesError = signal<string | null>(null);

  readonly elevenlabsVoices = signal<ElevenlabsVoiceOption[]>([]);
  readonly elevenlabsVoicesLoading = signal(false);
  readonly elevenlabsVoicesError = signal<string | null>(null);

  // ---- save feedback ----
  readonly saving = signal(false);
  readonly saveFeedback = signal<{ kind: 'success' | 'error'; message: string } | null>(null);

  ngOnInit(): void {
    this.scriptRunner.getTtsConfig().subscribe({
      next: (config) => {
        this.provider.set(config.provider);
        this.chatterboxTtsUrl.set(config.chatterbox.ttsUrl ?? '');
        this.chatterboxVoiceId.set(config.chatterbox.voiceId ?? '');
        this.elevenlabsHasApiKey.set(config.elevenlabs.hasApiKey);
        this.elevenlabsVoiceId.set(config.elevenlabs.voiceId ?? '');
        this.elevenlabsModelId.set(config.elevenlabs.modelId ?? '');
        this.loading.set(false);
        // Best-effort: load voice list for whichever provider is currently
        // active so the picker isn't empty on first paint. Errors (no key
        // saved yet, Chatterbox unreachable) just show inline — they don't
        // block the rest of the form.
        if (config.provider === 'elevenlabs' && config.elevenlabs.hasApiKey) {
          this.loadElevenlabsVoices();
        } else if (config.provider === 'chatterbox') {
          this.loadChatterboxVoices();
        }
      },
      error: () => {
        this.loading.set(false);
        this.saveFeedback.set({
          kind: 'error',
          message: 'Could not reach the dev-server (is "npm run dev" running?). Settings could not be loaded.',
        });
      },
    });
  }

  // Angular template expressions can't contain arrow functions (`=>`), so
  // the "is this saved voice id still in the freshly-loaded list" checks
  // used by both voice <mat-select>s live here instead of inline in the HTML.
  isKnownElevenlabsVoice(voiceId: string): boolean {
    return this.elevenlabsVoices().some((v) => v.voiceId === voiceId);
  }

  selectProvider(value: 'chatterbox' | 'elevenlabs'): void {
    this.provider.set(value);
    // Lazily load the now-relevant voice list if it hasn't been loaded yet.
    if (value === 'chatterbox' && this.chatterboxVoices().length === 0) {
      this.loadChatterboxVoices();
    } else if (value === 'elevenlabs' && this.elevenlabsVoices().length === 0 && this.elevenlabsHasApiKey()) {
      this.loadElevenlabsVoices();
    }
  }

  loadChatterboxVoices(): void {
    this.chatterboxVoicesLoading.set(true);
    this.chatterboxVoicesError.set(null);
    this.scriptRunner.getChatterboxVoices().subscribe((result) => {
      this.chatterboxVoicesLoading.set(false);
      if (result.ok) {
        this.chatterboxVoices.set(result.voices);
      } else {
        this.chatterboxVoicesError.set(result.error);
      }
    });
  }

  loadElevenlabsVoices(): void {
    this.elevenlabsVoicesLoading.set(true);
    this.elevenlabsVoicesError.set(null);
    this.scriptRunner.getElevenlabsVoices().subscribe((result) => {
      this.elevenlabsVoicesLoading.set(false);
      if (result.ok) {
        this.elevenlabsVoices.set(result.voices);
      } else {
        this.elevenlabsVoicesError.set(result.error);
      }
    });
  }

  onChatterboxTtsUrlInput(value: string): void {
    this.chatterboxTtsUrl.set(value);
  }

  onElevenlabsApiKeyInput(value: string): void {
    this.elevenlabsApiKeyInput.set(value);
  }

  onElevenlabsModelIdInput(value: string): void {
    this.elevenlabsModelId.set(value);
  }

  // Removes a previously-saved ElevenLabs key. Separate from just clearing
  // the input field, since a blank input on save means "leave unchanged" —
  // this explicitly tells dev-server to delete it (clearApiKey: true).
  clearSavedApiKey(): void {
    this.elevenlabsApiKeyInput.set('');
    this.saving.set(true);
    this.saveFeedback.set(null);
    this.scriptRunner.saveTtsConfig({ elevenlabs: { clearApiKey: true } }).subscribe({
      next: (config) => {
        this.saving.set(false);
        this.elevenlabsHasApiKey.set(config.elevenlabs.hasApiKey);
        this.saveFeedback.set({ kind: 'success', message: 'Saved ElevenLabs API key removed.' });
      },
      error: (err) => {
        this.saving.set(false);
        this.saveFeedback.set({ kind: 'error', message: `Could not clear API key: ${err.message}` });
      },
    });
  }

  save(): void {
    this.saving.set(true);
    this.saveFeedback.set(null);

    const update: TtsConfigUpdate = {
      provider: this.provider(),
      chatterbox: {
        ttsUrl: this.chatterboxTtsUrl(),
        voiceId: this.chatterboxVoiceId(),
      },
      elevenlabs: {
        voiceId: this.elevenlabsVoiceId(),
        modelId: this.elevenlabsModelId(),
      },
    };
    // Only include the API key field at all if the user actually typed
    // something — an empty string would otherwise be indistinguishable
    // from "no change" server-side anyway, but keeping it out of the body
    // entirely makes that intent explicit here too.
    const typedKey = this.elevenlabsApiKeyInput().trim();
    if (typedKey) {
      update.elevenlabs = { ...update.elevenlabs, apiKey: typedKey };
    }

    this.scriptRunner.saveTtsConfig(update).subscribe({
      next: (config) => {
        this.saving.set(false);
        this.provider.set(config.provider);
        this.chatterboxTtsUrl.set(config.chatterbox.ttsUrl ?? '');
        this.chatterboxVoiceId.set(config.chatterbox.voiceId ?? '');
        this.elevenlabsHasApiKey.set(config.elevenlabs.hasApiKey);
        this.elevenlabsVoiceId.set(config.elevenlabs.voiceId ?? '');
        this.elevenlabsModelId.set(config.elevenlabs.modelId ?? '');
        // Never let the typed key value linger once it's been saved.
        this.elevenlabsApiKeyInput.set('');
        this.saveFeedback.set({ kind: 'success', message: 'TTS settings saved.' });
      },
      error: (err) => {
        this.saving.set(false);
        this.saveFeedback.set({ kind: 'error', message: `Save failed: ${err.error?.error ?? err.message}` });
      },
    });
  }
}
