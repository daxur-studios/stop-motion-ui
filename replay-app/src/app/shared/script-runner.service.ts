import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const DEV_SERVER = 'http://localhost:3001';

export type ScriptResult = { ok: boolean; exitCode: number | null; output: string };

@Injectable({ providedIn: 'root' })
export class ScriptRunnerService {
  private http = inject(HttpClient);

  generateNarration(scenario: string): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/narration`, { scenario });
  }

  exportVideo(scenario: string, narration: 'short' | 'long' | 'off' = 'short', fps = 30): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/video`, { scenario, narration, fps });
  }

  runCapture(scenario: string, headed: boolean): Observable<ScriptResult> {
    return this.http.post<ScriptResult>(`${DEV_SERVER}/api/capture`, { scenario, headed });
  }
}
