import { Injectable, computed, signal } from '@angular/core';

// Ready/idle signal for the demo gallery, per the demo-readiness-check skill
// (docs/demo-readiness-checklist.md: "expose a ready/idle signal instead of
// relying on fixed sleeps"). A single in-flight counter, incremented around
// any simulated async work (form submit, etc.) and decremented when it
// settles. `busy()` is true while count > 0. The app root mirrors this onto
// a `data-busy` DOM attribute (see app.ts) so an external capture harness
// (Playwright, Chrome MCP) can poll a real DOM attribute instead of guessing
// a sleep duration.
@Injectable({ providedIn: 'root' })
export class BusyService {
  private readonly inFlight = signal(0);
  readonly busy = computed(() => this.inFlight() > 0);

  begin(): void {
    this.inFlight.update((n) => n + 1);
  }

  end(): void {
    this.inFlight.update((n) => Math.max(0, n - 1));
  }

  /** Wraps a unit of async work, tracking it on the in-flight counter for the duration. */
  async track<T>(work: () => Promise<T>): Promise<T> {
    this.begin();
    try {
      return await work();
    } finally {
      this.end();
    }
  }
}
