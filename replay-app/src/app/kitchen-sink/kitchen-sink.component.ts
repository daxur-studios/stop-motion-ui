import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { BusyService } from '../shared/busy.service';
import { KitchenSinkDialogComponent } from './kitchen-sink-dialog.component';

// Kitchen Sink — deliberate stress-test page for the capture/replay
// tooling, NOT a product surface (same spirit as ../demo-gallery, see its
// header comment). Where Demo Gallery exercises what the tooling already
// handles well, this page deliberately exercises what it doesn't yet
// handle well, so a real capture of it shows today's rough edges and can
// anchor the design of the proposed `asyncWait` and `type` manifest actions
// (see docs/roadmap.md — both entries are "proposed, not built").
//
// Specifically on this page:
//   - A long (~30-50s) async action, paired with both a determinate
//     mat-progress-bar and a mat-progress-spinner — the asyncWait problem
//     case (dead air at real duration, or "fake" if skipped).
//   - A plain text input + textarea — captured today via Locator.fill(),
//     which jumps straight to the final value; no per-keystroke frames.
//     That's the `type` action's problem case.
//   - A mat-select and a mat-dialog, mostly to round out Material coverage
//     (overlay positioning, backdrop) rather than to probe a specific gap.
//   - Long filler sections between the interactive bits so reaching the
//     later ones requires real scrolling — capture/playwright now records
//     each scroll as a real 'scroll' manifest event (see
//     shared/manifest-types.ts's ScrollAction), specifically to fix a click-
//     misalignment bug this fixture originally surfaced: without it, the
//     click right after a scroll showed its cursor glide over the
//     *pre-scroll* screenshot while aiming at *post-scroll* coordinates.
const DEFAULT_ASYNC_DURATION_MS = 40_000; // realistic long wait, mid-range of the 30-50s target
const FAST_ASYNC_DURATION_MS = 4_000; // dev-iteration shortcut, see resolveAsyncDurationMs()
const PROGRESS_TICK_MS = 200; // determinate progress-bar update cadence

const SELECT_OPTIONS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' },
] as const;

// Fixed, deterministic filler copy — no Date.now()/Math.random() per the
// demo-readiness checklist's "deterministic demo data" item. Exists purely
// to add scroll height between interactive sections; the content itself is
// not meaningful.
const FILLER_PARAGRAPHS = [
  'This page is a deliberately long, deliberately boring test fixture. ' +
    'Every paragraph in this section exists only to add vertical scroll ' +
    'distance between the interactive elements above and below it.',
  'Stop-motion-ui captures a UI as a sequence of screenshots plus a cursor ' +
    'path, not as video. Scrolling has no first-class representation in ' +
    'that manifest format yet (see shared/manifest-types.ts), so this ' +
    'filler content is here specifically to force real scrolling during ' +
    'capture and surface how that gap looks today.',
  'The text is static and identical on every load — no live timestamps, ' +
    'no random word generators — so repeat captures of this page stay ' +
    'comparable run to run, per the demo-readiness checklist.',
];

/**
 * Resolves the async action's duration. Defaults to a realistic long wait;
 * shortened via a query param for fast local iteration without editing the
 * constant — e.g. `?fastAsync=1` or an explicit `?asyncDurationMs=2000`.
 * Read directly from `window.location.search` rather than `ActivatedRoute`
 * to keep this a plain function with no DI — works the same whether or not
 * a Router is present (the app now has one; see ADR-007), since query
 * params are preserved on the '' -> 'replay' redirect either way.
 */
function resolveAsyncDurationMs(): number {
  if (typeof window === 'undefined') return DEFAULT_ASYNC_DURATION_MS;
  const params = new URLSearchParams(window.location.search);
  const override = params.get('asyncDurationMs');
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (params.has('fastAsync')) return FAST_ASYNC_DURATION_MS;
  return DEFAULT_ASYNC_DURATION_MS;
}

@Component({
  selector: 'app-kitchen-sink',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule, MatProgressBarModule, MatProgressSpinnerModule],
  templateUrl: './kitchen-sink.component.html',
  styleUrl: './kitchen-sink.component.scss',
})
export class KitchenSinkComponent {
  private readonly busyService = inject(BusyService);
  private readonly dialog = inject(MatDialog);

  readonly fillerParagraphs = FILLER_PARAGRAPHS;
  readonly selectOptions = SELECT_OPTIONS;

  private readonly asyncDurationMs = resolveAsyncDurationMs();
  readonly asyncDurationLabel = `${Math.round(this.asyncDurationMs / 1000)}s`;

  // ---- text input / textarea ----
  readonly textValue = signal('');
  readonly notesValue = signal('');

  onTextInput(value: string): void {
    this.textValue.set(value);
  }

  onNotesInput(value: string): void {
    this.notesValue.set(value);
  }

  // ---- mat-select ----
  readonly selectedOption = signal<string>(SELECT_OPTIONS[0].value);

  // ---- long async action ----
  readonly asyncActive = signal(false);
  readonly asyncProgressPercent = signal(0);
  readonly asyncResult = signal<string | null>(null);

  async runAsyncAction(): Promise<void> {
    if (this.asyncActive()) return;
    this.asyncActive.set(true);
    this.asyncProgressPercent.set(0);
    this.asyncResult.set(null);

    const start = Date.now();
    // Tracked on the shared BusyService (same global idle signal the
    // capture harness already polls via `data-busy` on the app shell, see
    // shared/busy.service.ts) AND mirrored below onto a dedicated
    // `data-kitchen-sink-async-active` attribute on the section itself.
    //
    // Nuance flagged in docs/roadmap.md's asyncWait entry: the
    // demo-readiness-check skill's busy/idle signal is normally meant to
    // tell a capture harness it's *safe to skip* a wait. Here it's used for
    // the opposite purpose — marking the real start/end of the loading
    // window so a future asyncWait-aware capture knows exactly where to
    // sample frames *within* the wait, not to skip past it. Today's
    // capture script (capture/playwright/src/capture-demo.ts) just polls it
    // to know when the wait has ended, same as everywhere else.
    await this.busyService.track(
      () =>
        new Promise<void>((resolve) => {
          const tick = (): void => {
            const elapsed = Date.now() - start;
            const pct = Math.min(100, Math.round((elapsed / this.asyncDurationMs) * 100));
            this.asyncProgressPercent.set(pct);
            if (elapsed >= this.asyncDurationMs) {
              resolve();
            } else {
              setTimeout(tick, PROGRESS_TICK_MS);
            }
          };
          tick();
        })
    );

    this.asyncActive.set(false);
    // Fixed result text — deterministic, per the checklist.
    this.asyncResult.set('Done — processed 1,248 records.');
  }

  // ---- dialog ----
  openDialog(): void {
    this.dialog.open(KitchenSinkDialogComponent, { width: '360px' });
  }
}
