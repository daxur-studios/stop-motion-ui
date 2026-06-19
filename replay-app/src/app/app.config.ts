import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

// No router — this app is a single-page wrapper around the replay player,
// there's nothing else to navigate to.
//
// provideAnimationsAsync() is required by Angular Material (mat-select,
// mat-dialog, mat-progress-bar/-spinner all use it) — added for the
// kitchen-sink demo page; see replay-app/src/app/kitchen-sink/. Material is
// confirmed compatible with provideZonelessChangeDetection() as of v20.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
  ],
};
