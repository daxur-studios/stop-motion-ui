import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const DEV_SERVER = 'http://localhost:3001';

export type ScriptResult = { ok: boolean; exitCode: number | null; output: string };

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
}
