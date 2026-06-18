import { Component, computed, inject, signal } from '@angular/core';
import { BusyService } from '../shared/busy.service';

// Demo Gallery — minimal test-fixture UI for stop-motion-ui capture backends.
//
// This is NOT a product surface. It exists purely so capture/chrome-mcp and
// capture/playwright have a small, deliberately simple real UI to click
// through, built per skills/demo-readiness-check/SKILL.md:
//   - every interactive element carries a stable `data-testid`
//   - the simulated-async section (form submit) reports busy/idle via
//     BusyService instead of a fixed sleep
//   - all displayed data is deterministic/seeded — no Date.now(), no Math.random()
//   - no debounce/toast/auto-dismiss/virtualized-list pitfalls from the checklist
const SUBMIT_DELAY_MS = 500; // simulated network latency for the form section

type WizardStep = 1 | 2 | 3;

@Component({
  selector: 'app-demo-gallery',
  standalone: true,
  templateUrl: './demo-gallery.component.html',
  styleUrl: './demo-gallery.component.scss',
})
export class DemoGalleryComponent {
  private readonly busyService = inject(BusyService);

  // ---- Section 1: counter buttons ----
  readonly count = signal(0);

  increment(): void {
    this.count.update((n) => n + 1);
  }

  decrement(): void {
    this.count.update((n) => n - 1);
  }

  resetCount(): void {
    this.count.set(0);
  }

  // ---- Section 2: simple form with simulated async submit ----
  readonly name = signal('');
  readonly email = signal('');
  readonly submitting = signal(false);
  readonly submitted = signal(false);

  readonly formValid = computed(() => this.name().trim().length > 0 && this.email().trim().length > 0);

  onNameInput(value: string): void {
    this.name.set(value);
  }

  onEmailInput(value: string): void {
    this.email.set(value);
  }

  async submitForm(): Promise<void> {
    if (!this.formValid() || this.submitting()) return;
    this.submitting.set(true);
    this.submitted.set(false);
    await this.busyService.track(
      () => new Promise<void>((resolve) => setTimeout(resolve, SUBMIT_DELAY_MS))
    );
    this.submitting.set(false);
    this.submitted.set(true);
  }

  resetForm(): void {
    this.name.set('');
    this.email.set('');
    this.submitted.set(false);
  }

  // ---- Section 3: multi-step wizard ----
  readonly wizardStep = signal<WizardStep>(1);
  readonly wizardDone = signal(false);

  wizardNext(): void {
    if (this.wizardStep() < 3) {
      this.wizardStep.update((s) => (s + 1) as WizardStep);
    } else {
      this.wizardDone.set(true);
    }
  }

  wizardBack(): void {
    if (this.wizardStep() > 1) {
      this.wizardStep.update((s) => (s - 1) as WizardStep);
    }
  }

  wizardRestart(): void {
    this.wizardStep.set(1);
    this.wizardDone.set(false);
  }
}
